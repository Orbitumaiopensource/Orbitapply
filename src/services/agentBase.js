const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { logger } = require('../utils/logger');

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const { readJSON, writeJSON } = require('../utils/fileStore');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');
const SESSIONS_PATH = path.join(__dirname, '..', '..', 'sessions', 'sessions.json');

const AGENT_TIMEOUTS_MS = {
  tailor: 120000,
  orbi: 120000,
  coach: 120000,
  default: 60000,
};

function loadConfig() {
  return readJSON(CONFIG_PATH, {});
}

function getSoulMd(agentId) {
  const soulPath = path.join(__dirname, '..', '..', 'agents', agentId, 'SOUL.md');
  if (!fs.existsSync(soulPath)) throw new Error(`SOUL.md not found for agent: ${agentId}`);
  return fs.readFileSync(soulPath, 'utf8');
}

function getModel(agentId) {
  const config = loadConfig();
  const overrides = config?.agents?.overrides || {};
  if (overrides[agentId]?.model) return overrides[agentId].model;
  return config?.agents?.defaults?.model || 'grok-4-fast';
}

function saveSession(agentId, messages, sessionId) {
  const sessions = readJSON(SESSIONS_PATH, { sessions: [], lastSessionId: null });
  const existingIdx = sessions.sessions.findIndex(s => s.sessionId === sessionId);
  const entry = {
    sessionId,
    agentId,
    startedAt: existingIdx >= 0 ? sessions.sessions[existingIdx].startedAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages,
  };
  if (existingIdx >= 0) {
    sessions.sessions[existingIdx] = entry;
  } else {
    sessions.sessions.unshift(entry);
    if (sessions.sessions.length > 200) sessions.sessions = sessions.sessions.slice(0, 200);
  }
  sessions.lastSessionId = sessionId;
  writeJSON(SESSIONS_PATH, sessions);
}

async function runAgent(agentId, userPrompt, sessionId = null, extraContext = '') {
  const soul = getSoulMd(agentId);
  const model = getModel(agentId);
  const apiKey = process.env.GROK_API_KEY;

  const sid = sessionId || `${agentId}-${Date.now()}`;
  const systemPrompt = extraContext ? `${soul}\n\n## Current Context\n${extraContext}` : soul;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
  const timeoutMs = AGENT_TIMEOUTS_MS[agentId] || AGENT_TIMEOUTS_MS.default;
  const timeoutSecs = timeoutMs / 1000;

  logger.info(`[${agentId.toUpperCase()}] Running with model ${model} | session ${sid}`);

  try {
    const response = await axios.post(
      GROK_API_URL,
      { model, max_tokens: 4096, messages },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
      }
    );

    const assistantContent = response.data.choices?.[0]?.message?.content || '';
    const usage = {
      input_tokens: response.data.usage?.prompt_tokens || 0,
      output_tokens: response.data.usage?.completion_tokens || 0,
    };

    messages.push({ role: 'assistant', content: assistantContent });
    saveSession(agentId, messages, sid);

    logger.info(`[${agentId.toUpperCase()}] Complete | tokens: ${usage.input_tokens}in + ${usage.output_tokens}out`);

    return {
      sessionId: sid,
      agentId,
      content: assistantContent,
      usage,
      model,
    };
  } catch (err) {
    const status = err.response?.status;
    const apiMsg = err.response?.data?.error?.message || err.message || '';
    logger.error(`[${agentId.toUpperCase()}] Failed: ${apiMsg}`, err);

    if (status === 429) {
      throw new Error(`Grok API usage limits reached. Please add credits or wait for reset.`);
    }
    if (status === 401 || status === 403) {
      throw new Error(`Grok API key is invalid or missing. Check your .env file.`);
    }
    if (err.code === 'ECONNABORTED' || apiMsg.includes('timeout')) {
      throw new Error(`Generation timed out — Grok API took too long after ${timeoutSecs}s. Wait a moment and try again.`);
    }
    throw new Error(`Agent ${agentId} failed. Check server logs.`);
  }
}

function parseJSONFromContent(content) {
  try {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                      content.match(/```\n([\s\S]*?)\n```/) ||
                      content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

module.exports = { runAgent, parseJSONFromContent, getSoulMd, getModel };
