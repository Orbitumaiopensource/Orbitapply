const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('../utils/fileStore');
const { logger } = require('../utils/logger');

const SESSIONS_PATH = path.join(__dirname, '..', '..', 'sessions', 'sessions.json');
const PIPELINE_PATH = path.join(__dirname, '..', '..', 'workspace-ledger', 'pipeline.json');
const PROFILE_PATH = path.join(__dirname, '..', '..', 'memory', 'profile.json');
const RESUME_PATH = path.join(__dirname, '..', '..', 'memory', 'resume.md');
const CONFIG_PATH = path.join(__dirname, '..', '..', 'orbitapply.json');

function getScoutWorkspace() {
  const config = readJSON(CONFIG_PATH, {});
  const defaultWs = path.join(__dirname, '..', '..', 'workspace-scout');
  if (config.outputFolder && fs.existsSync(config.outputFolder)) {
    return path.join(config.outputFolder, 'scout');
  }
  return defaultWs;
}

function recalcPipelineStats(pipeline) {
  const apps = pipeline.applications || [];
  const responded = apps.filter(a =>
    ['phone_screen', 'interview_1', 'interview_2', 'offer'].includes(a.status)
  ).length;
  pipeline.stats = {
    ...pipeline.stats,
    total_applied: apps.length,
    response_rate: apps.length > 0 ? Math.round((responded / apps.length) * 100) : 0,
    budget_used_usd: apps.reduce((s, a) => s + (a.budgetUSD || 0), 0),
  };
}

// GET /api/v1/data/summary — info about what data exists
router.get('/summary', (req, res) => {
  try {
    const ws = getScoutWorkspace();
    const scoutDates = fs.existsSync(ws)
      ? fs.readdirSync(ws)
          .filter(f => f.startsWith('results-') && f.endsWith('.json'))
          .map(f => f.replace('results-', '').replace('.json', ''))
          .sort()
          .reverse()
      : [];

    const pipelineData = readJSON(PIPELINE_PATH, { applications: [] });
    const pipelineApps = pipelineData.applications || [];
    const pipelineCount = pipelineApps.length;
    const pipelineDates = [...new Set(
      pipelineApps.map(a => (a.appliedAt || '').split('T')[0]).filter(Boolean)
    )].sort().reverse();

    const sessionsData = readJSON(SESSIONS_PATH, { sessions: [] });
    const sessionList = sessionsData.sessions || [];
    const sessionCount = sessionList.length;
    const sessionDates = [...new Set(
      sessionList.map(s => (s.startedAt || '').split('T')[0]).filter(Boolean)
    )].sort().reverse();

    const profileExists = fs.existsSync(PROFILE_PATH);

    res.json({ scoutDates, pipelineCount, pipelineDates, sessionCount, sessionDates, profileExists });
  } catch (err) {
    logger.error(`GET /data/summary failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to load data summary.' });
  }
});

// DELETE /api/v1/data — delete selected sections / date ranges
router.delete('/', (req, res) => {
  try {
    const { scoutResults, pipeline, sessions, profile, config } = req.body || {};
    const deleted = {};

    // --- SCOUT Results ---
    if (scoutResults) {
      const ws = getScoutWorkspace();
      if (scoutResults.all) {
        let count = 0;
        if (fs.existsSync(ws)) {
          const files = fs.readdirSync(ws).filter(f => f.startsWith('results-') && f.endsWith('.json'));
          files.forEach(f => { fs.unlinkSync(path.join(ws, f)); count++; });
        }
        deleted.scoutResults = count;
        logger.info(`[DATA] Deleted all ${count} scout result files`);
      } else if (Array.isArray(scoutResults.dates) && scoutResults.dates.length > 0) {
        let count = 0;
        for (const date of scoutResults.dates) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          const fp = path.join(ws, `results-${date}.json`);
          if (fs.existsSync(fp)) { fs.unlinkSync(fp); count++; }
        }
        deleted.scoutResults = count;
        logger.info(`[DATA] Deleted ${count} scout result files by date selection`);
      }
    }

    // --- Pipeline ---
    if (pipeline) {
      const data = readJSON(PIPELINE_PATH, { applications: [], stats: {} });
      if (pipeline.all) {
        const count = (data.applications || []).length;
        data.applications = [];
        data.stats = { total_applied: 0, response_rate: 0, today_count: 0, budget_used_usd: 0, last_reset_date: '' };
        writeJSON(PIPELINE_PATH, data);
        deleted.pipeline = count;
        logger.info(`[DATA] Deleted all ${count} pipeline applications`);
      } else if (pipeline.before) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(pipeline.before)) {
          return res.status(400).json({ error: 'Invalid pipeline.before date. Use YYYY-MM-DD.' });
        }
        const cutoff = new Date(pipeline.before + 'T00:00:00.000Z');
        const before = (data.applications || []).length;
        data.applications = (data.applications || []).filter(a => new Date(a.appliedAt) >= cutoff);
        const count = before - data.applications.length;
        recalcPipelineStats(data);
        writeJSON(PIPELINE_PATH, data);
        deleted.pipeline = count;
        logger.info(`[DATA] Deleted ${count} pipeline applications applied before ${pipeline.before}`);
      }
    }

    // --- Sessions ---
    if (sessions) {
      const data = readJSON(SESSIONS_PATH, { sessions: [] });
      if (sessions.all) {
        const count = (data.sessions || []).length;
        data.sessions = [];
        writeJSON(SESSIONS_PATH, data);
        deleted.sessions = count;
        logger.info(`[DATA] Deleted all ${count} sessions`);
      } else if (sessions.before) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sessions.before)) {
          return res.status(400).json({ error: 'Invalid sessions.before date. Use YYYY-MM-DD.' });
        }
        const cutoff = new Date(sessions.before + 'T00:00:00.000Z');
        const before = (data.sessions || []).length;
        data.sessions = (data.sessions || []).filter(s => new Date(s.startedAt || 0) >= cutoff);
        const count = before - data.sessions.length;
        writeJSON(SESSIONS_PATH, data);
        deleted.sessions = count;
        logger.info(`[DATA] Deleted ${count} sessions started before ${sessions.before}`);
      }
    }

    // --- Profile ---
    if (profile) {
      if (fs.existsSync(PROFILE_PATH)) { writeJSON(PROFILE_PATH, {}); }
      if (fs.existsSync(RESUME_PATH)) { fs.writeFileSync(RESUME_PATH, '', 'utf8'); }
      deleted.profile = true;
      logger.info(`[DATA] Cleared profile.json and resume.md`);
    }

    // --- Config ---
    if (config) {
      const current = readJSON(CONFIG_PATH, {});
      const reset = {
        budget: { dailyLimitUSD: 5, alertAtUSD: 4, hardStop: true },
        guardian: {
          maxAppliesPerDay: 15,
          rateLimitMs: 45000,
          humanPauseFields: current.guardian?.humanPauseFields || [],
        },
        outputFolder: current.outputFolder || '',
        agents: current.agents || {},
        scout: current.scout || {},
      };
      writeJSON(CONFIG_PATH, reset);
      deleted.config = true;
      logger.info(`[DATA] Reset config to defaults`);
    }

    res.json({ deleted });
  } catch (err) {
    logger.error(`DELETE /data failed: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to delete data.' });
  }
});

module.exports = router;
