// ─────────────────────────────────────────────────────────────────────────────
// Original GenAI / AI-role interview question bank.
//
// Authored for orbitapply — original wording, owned by this project. It covers
// the canonical topics every modern AI/GenAI interview probes (facts/topics are
// not copyrightable); no third-party content is reproduced here.
//
// Used by services/coach.js to ground the "Technical / Domain Questions" section
// of an interview prep pack with real, vetted questions instead of
// model-improvised ones.
//
// Each entry:
//   id        unique slug
//   category  topic bucket (see CATEGORIES)
//   level     'fundamental' | 'intermediate' | 'advanced' | 'leadership'
//   roleTag   'ic'          (architect / hands-on builder)
//             'leadership'  (director / head / VP / strategy)
//             'both'
//   question  the prompt asked
//   keyPoints what a strong answer should hit (the model expands these,
//             grounded in the candidate's real experience)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'LLM Fundamentals',
  'RAG',
  'Agents & Orchestration',
  'Fine-tuning & Adaptation',
  'Prompt & Context Engineering',
  'Evaluation & Observability',
  'Responsible AI & Governance',
  'Production & Cost',
  'AI Strategy & Leadership',
];

const BANK = [
  // ── LLM Fundamentals ──────────────────────────────────────────────────────
  {
    id: 'llm-transformer-intuition', category: 'LLM Fundamentals',
    level: 'fundamental', roleTag: 'ic',
    question: 'Explain self-attention to a non-technical executive in 60 seconds, then to an engineer.',
    keyPoints: ['Tokens attend to relevant tokens regardless of distance', 'Q/K/V projections, scaled dot-product, softmax weights', 'Why it replaced RNNs: parallelism + long-range context', 'Tie back to a business outcome the exec cares about'],
  },
  {
    id: 'llm-context-window', category: 'LLM Fundamentals',
    level: 'intermediate', roleTag: 'both',
    question: 'A model has a 200K context window — why might stuffing it full still hurt answer quality and cost?',
    keyPoints: ['Lost-in-the-middle / positional degradation', 'Quadratic-ish attention cost and latency', 'Relevance dilution vs. retrieval', 'Token cost economics at scale'],
  },
  {
    id: 'llm-hallucination-cause', category: 'LLM Fundamentals',
    level: 'intermediate', roleTag: 'both',
    question: 'Why do LLMs hallucinate, and what is the difference between a factuality error and a faithfulness error?',
    keyPoints: ['Next-token objective ≠ truth objective', 'Faithfulness = grounded in provided context; factuality = true in the world', 'Mitigations: grounding, constrained decoding, abstention', 'When each error type matters for the business'],
  },
  {
    id: 'llm-temp-decoding', category: 'LLM Fundamentals',
    level: 'fundamental', roleTag: 'ic',
    question: 'Walk through temperature, top-p, and when you would set temperature to 0.',
    keyPoints: ['Distribution sharpening vs. nucleus truncation', 'Determinism for extraction/classification/tools', 'Creativity vs. reliability trade-off', 'Eval implications of non-determinism'],
  },

  // ── RAG ───────────────────────────────────────────────────────────────────
  {
    id: 'rag-vs-finetune', category: 'RAG',
    level: 'intermediate', roleTag: 'both',
    question: 'A client asks for a chatbot over their 50K internal documents. Make the RAG-vs-fine-tune-vs-long-context decision and justify it.',
    keyPoints: ['Knowledge freshness & churn → RAG', 'Behavior/format/style → fine-tune', 'Cost, latency, auditability, citation needs', 'Hybrid is often the real answer'],
  },
  {
    id: 'rag-chunking', category: 'RAG',
    level: 'advanced', roleTag: 'ic',
    question: 'Retrieval quality is poor on a technical knowledge base. How do you debug the pipeline end to end?',
    keyPoints: ['Chunking strategy & overlap, semantic vs. fixed', 'Embedding model fit to domain', 'Query rewriting / HyDE / multi-query', 'Re-ranking, recall@k vs precision, eval set'],
  },
  {
    id: 'rag-eval', category: 'RAG',
    level: 'advanced', roleTag: 'both',
    question: 'How do you measure whether a RAG system is actually good — beyond "it looks fine"?',
    keyPoints: ['Retrieval metrics (recall@k, MRR) vs. generation metrics', 'Faithfulness/groundedness + answer relevance', 'Golden eval set, LLM-as-judge with guardrails', 'Production feedback loop'],
  },
  {
    id: 'rag-security', category: 'RAG',
    level: 'advanced', roleTag: 'both',
    question: 'How do you enforce per-user document permissions in a RAG system without leaking content via the model?',
    keyPoints: ['Filter at retrieval (ACL-aware index), not post-hoc', 'Metadata/tenant scoping in the vector store', 'Prompt-injection from retrieved docs', 'Audit trail for regulated environments'],
  },

  // ── Agents & Orchestration ────────────────────────────────────────────────
  {
    id: 'agent-when', category: 'Agents & Orchestration',
    level: 'intermediate', roleTag: 'both',
    question: 'When is an agent the wrong tool, and you should use a fixed workflow instead?',
    keyPoints: ['Determinism, auditability, cost ceilings', 'Bounded vs. open-ended task space', 'Failure-mode blast radius', 'Agentic only where adaptivity earns its keep'],
  },
  {
    id: 'agent-reliability', category: 'Agents & Orchestration',
    level: 'advanced', roleTag: 'ic',
    question: 'A multi-agent pipeline works in demos but fails 1-in-5 in production. How do you harden it?',
    keyPoints: ['Tool-call validation & typed outputs', 'Retry/repair loops, circuit breakers, timeouts', 'Human-in-the-loop approval gates', 'Observability per step + replay'],
  },
  {
    id: 'agent-memory', category: 'Agents & Orchestration',
    level: 'advanced', roleTag: 'ic',
    question: 'Design the memory architecture for an agent that must remember user preferences across months.',
    keyPoints: ['Short-term scratchpad vs. long-term store', 'Summarization/compaction strategy', 'Retrieval of memory vs. context bloat', 'Forgetting, correction, and privacy/right-to-delete'],
  },
  {
    id: 'agent-mcp', category: 'Agents & Orchestration',
    level: 'intermediate', roleTag: 'both',
    question: 'What problem does a tool/connector standard (e.g. MCP-style integration) solve for enterprise AI, and what risk does it add?',
    keyPoints: ['Decoupled tools, reusable connectors, governance surface', 'Standardized auth & capability scoping', 'Expanded attack surface / over-permissioned tools', 'Versioning and change management'],
  },

  // ── Fine-tuning & Adaptation ──────────────────────────────────────────────
  {
    id: 'ft-lora', category: 'Fine-tuning & Adaptation',
    level: 'advanced', roleTag: 'ic',
    question: 'Explain LoRA/PEFT and why you would choose it over full fine-tuning in an enterprise budget.',
    keyPoints: ['Low-rank adapters, frozen base weights', 'Cost/VRAM, faster iteration, swappable adapters', 'Quality ceiling vs. full FT', 'Serving multiple adapters per base'],
  },
  {
    id: 'ft-rlhf', category: 'Fine-tuning & Adaptation',
    level: 'advanced', roleTag: 'both',
    question: 'At a high level, how does preference tuning (RLHF/DPO) change model behavior, and what can go wrong?',
    keyPoints: ['Reward model from human preferences / direct optimization', 'Alignment vs. capability', 'Reward hacking, sycophancy, mode collapse', 'Eval before/after on real tasks'],
  },
  {
    id: 'ft-data', category: 'Fine-tuning & Adaptation',
    level: 'intermediate', roleTag: 'both',
    question: 'A stakeholder wants to fine-tune on 200 examples. What do you tell them?',
    keyPoints: ['Data quality/coverage > quantity, but 200 is thin', 'Prompt/RAG first, fine-tune to lock behavior', 'Eval set carved out before training', 'Drift and maintenance cost over time'],
  },

  // ── Prompt & Context Engineering ──────────────────────────────────────────
  {
    id: 'pe-structured', category: 'Prompt & Context Engineering',
    level: 'intermediate', roleTag: 'ic',
    question: 'How do you get reliable structured (JSON/schema) output from an LLM in production?',
    keyPoints: ['Schema-constrained / tool-call output, not regex hope', 'Validation + repair loop', 'Few-shot for edge cases', 'Versioned prompts as code, eval-gated'],
  },
  {
    id: 'pe-injection', category: 'Prompt & Context Engineering',
    level: 'advanced', roleTag: 'both',
    question: 'Explain prompt injection and a layered defense for an agent that browses untrusted web content.',
    keyPoints: ['Direct vs. indirect injection', 'Trust boundaries, content quarantine, no blind tool exec', 'Least-privilege tools, allowlists, human approval', 'Detection + monitoring, not a single silver bullet'],
  },
  {
    id: 'pe-context-budget', category: 'Prompt & Context Engineering',
    level: 'advanced', roleTag: 'ic',
    question: 'A prompt is accurate but too slow and expensive. How do you cut tokens without losing quality?',
    keyPoints: ['Context curation/retrieval over stuffing', 'Prompt caching of stable prefixes', 'Distill instructions, drop redundant examples', 'Measure quality delta on an eval set'],
  },

  // ── Evaluation & Observability ────────────────────────────────────────────
  {
    id: 'eval-harness', category: 'Evaluation & Observability',
    level: 'advanced', roleTag: 'both',
    question: 'You inherit an LLM feature with zero evals. What is the first week of work?',
    keyPoints: ['Define success metrics tied to business outcome', 'Build a golden set from real traffic/edge cases', 'Offline eval harness + regression gate in CI', 'Production tracing and feedback capture'],
  },
  {
    id: 'eval-llm-judge', category: 'Evaluation & Observability',
    level: 'advanced', roleTag: 'ic',
    question: 'When is LLM-as-judge trustworthy, and how do you keep it honest?',
    keyPoints: ['Good for relative/rubric scoring, weak as ground truth', 'Position/verbosity/self bias', 'Calibrate against human labels, hold out', 'Pairwise > absolute; ensemble/criteria decomposition'],
  },
  {
    id: 'eval-drift', category: 'Evaluation & Observability',
    level: 'intermediate', roleTag: 'both',
    question: 'A model provider silently updates the model. How do you detect and contain regressions?',
    keyPoints: ['Pinned versions where possible', 'Continuous eval / canary on golden set', 'Alerting on metric + cost/latency drift', 'Rollback and change-control process'],
  },

  // ── Responsible AI & Governance ───────────────────────────────────────────
  {
    id: 'gov-framework', category: 'Responsible AI & Governance',
    level: 'leadership', roleTag: 'leadership',
    question: 'Stand up an AI governance framework for a regulated company that wants to move fast. What are the first five controls?',
    keyPoints: ['Use-case intake & risk tiering', 'Data classification + DLP at the boundary', 'Human oversight for high-risk decisions', 'Audit logging, model/version inventory, incident path'],
  },
  {
    id: 'gov-dlp', category: 'Responsible AI & Governance',
    level: 'advanced', roleTag: 'both',
    question: 'Employees are pasting confidential data into public AI tools. Design the response without killing productivity.',
    keyPoints: ['Sanctioned enterprise tier + clear policy', 'Browser/network DLP and visibility', 'Education + safe defaults over blanket bans', 'Measure adoption and leakage reduction'],
  },
  {
    id: 'gov-bias', category: 'Responsible AI & Governance',
    level: 'advanced', roleTag: 'both',
    question: 'How would you assess and document an LLM feature for fairness/safety before launch?',
    keyPoints: ['Harms analysis per use case & population', 'Red-teaming + adversarial test sets', 'Mitigations, residual risk acceptance, sign-off', 'Monitoring + escalation post-launch'],
  },

  // ── Production & Cost ─────────────────────────────────────────────────────
  {
    id: 'prod-latency', category: 'Production & Cost',
    level: 'advanced', roleTag: 'ic',
    question: 'A GenAI feature must respond in under 2 seconds p95. What levers do you pull?',
    keyPoints: ['Model tiering / smaller model + fallback', 'Streaming, prompt caching, speculative/parallel calls', 'Retrieval and prompt trimming', 'Async work off the critical path'],
  },
  {
    id: 'prod-cost', category: 'Production & Cost',
    level: 'leadership', roleTag: 'both',
    question: 'Inference spend is growing faster than usage. How do you diagnose and bend the cost curve?',
    keyPoints: ['Per-feature cost attribution & token accounting', 'Caching, batching, right-sizing the model', 'RAG over long-context stuffing', 'Guardrails: budgets, rate limits, kill switches'],
  },
  {
    id: 'prod-buildbuy', category: 'Production & Cost',
    level: 'leadership', roleTag: 'leadership',
    question: 'Build vs. buy for a core AI capability — how do you actually make and defend this call?',
    keyPoints: ['Differentiation vs. commodity', 'TCO incl. talent, eval, maintenance, lock-in', 'Speed-to-value and switching cost', 'Reversibility of the decision'],
  },

  // ── AI Strategy & Leadership ──────────────────────────────────────────────
  {
    id: 'strat-roadmap', category: 'AI Strategy & Leadership',
    level: 'leadership', roleTag: 'leadership',
    question: 'A CEO says "we need an AI strategy." Walk me through how you go from that sentence to a funded 90-day plan.',
    keyPoints: ['Tie to revenue lever / measurable outcome, not hype', 'Identify the one bottleneck AI should attack first', 'Prove fast with a scoped pilot + metrics', 'Governance and change management baked in'],
  },
  {
    id: 'strat-roi', category: 'AI Strategy & Leadership',
    level: 'leadership', roleTag: 'leadership',
    question: 'How do you measure ROI on an AI initiative when benefits are partly soft (time saved, quality)?',
    keyPoints: ['Baseline before, instrument the workflow', 'Hard + proxy metrics, attribute conservatively', '3 metrics / 90-day targets discipline', 'Kill criteria, not just success criteria'],
  },
  {
    id: 'strat-adoption', category: 'AI Strategy & Leadership',
    level: 'leadership', roleTag: 'leadership',
    question: 'A technically sound AI rollout is failing on adoption. How do you turn it around?',
    keyPoints: ['Change management: WIIFM, champions, training', 'Workflow integration over standalone tools', 'Trust: explainability, human override, quick wins', 'Feedback loop and iteration cadence'],
  },
  {
    id: 'strat-team', category: 'AI Strategy & Leadership',
    level: 'leadership', roleTag: 'leadership',
    question: 'How do you structure and hire an AI delivery team when talent is scarce and expensive?',
    keyPoints: ['Thin specialist core + upskilled domain people', 'Build vs. partner for non-differentiating work', 'Eval/ops discipline as a first-class role', 'Avoid hero dependence; document and standardize'],
  },
  {
    id: 'strat-risk-comms', category: 'AI Strategy & Leadership',
    level: 'leadership', roleTag: 'leadership',
    question: 'The board is worried AI is "too risky." How do you keep momentum without being reckless?',
    keyPoints: ['Risk-tiered portfolio (low-risk wins first)', 'Governance as an enabler, not a blocker', 'Transparent metrics and incident readiness', 'Frame inaction as a competitive risk too'],
  },
];

// Quick sanity: every entry has a known category.
for (const q of BANK) {
  if (!CATEGORIES.includes(q.category)) {
    throw new Error(`genaiInterviewBank: unknown category "${q.category}" on ${q.id}`);
  }
}

const LEADERSHIP_TITLE_RE = /\b(director|head|vp|vice president|chief|principal|lead|manager|partner|founder)\b/i;

/**
 * Select a balanced, role-appropriate subset of questions to seed the prep pack.
 *
 * @param {object} job      { title, company, snippet }
 * @param {object} profile  { title, skills }
 * @param {object} opts     { count = 12 }
 * @returns {Array} selected question objects
 */
function selectQuestions(job = {}, profile = {}, opts = {}) {
  const count = opts.count || 12;
  const isLeadership =
    LEADERSHIP_TITLE_RE.test(job.title || '') || LEADERSHIP_TITLE_RE.test(profile.title || '');

  const haystack = [
    job.title, job.snippet, profile.title, (profile.skills || []).join(' '),
  ].join(' ').toLowerCase();

  const scored = BANK.map(q => {
    let score = 0;
    // Role fit
    if (q.roleTag === 'both') score += 2;
    if (isLeadership && q.roleTag === 'leadership') score += 5;
    if (!isLeadership && q.roleTag === 'ic') score += 4;
    if (isLeadership && q.level === 'leadership') score += 3;
    // Keyword relevance to this specific job / profile
    const terms = `${q.question} ${q.keyPoints.join(' ')} ${q.category}`.toLowerCase();
    for (const word of new Set(haystack.split(/[^a-z0-9]+/).filter(w => w.length > 4))) {
      if (terms.includes(word)) score += 1;
    }
    return { q, score };
  }).sort((a, b) => b.score - a.score);

  // Ensure category spread: take the best per category first, then fill by score.
  const picked = [];
  const usedCats = new Set();
  for (const { q } of scored) {
    if (picked.length >= count) break;
    if (!usedCats.has(q.category)) { picked.push(q); usedCats.add(q.category); }
  }
  for (const { q } of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return picked;
}

module.exports = { BANK, CATEGORIES, selectQuestions };
