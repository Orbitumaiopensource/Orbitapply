let dashboardPollInterval = null;
let _runWasRunning = false;
let _historyLoaded = false;

async function renderDashboard() {
  const main = el('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-sub">OrbitApply Control Centre — ORBIT Framework powered</p>
        </div>
      </div>
    </div>
    <div class="stat-row" id="dash-stats">
      <div class="stat-card accent">
        <div class="stat-label">Pipeline Total</div>
        <div class="stat-value" id="stat-total">—</div>
        <div class="stat-sub">Applications tracked</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Response Rate</div>
        <div class="stat-value" id="stat-response">—</div>
        <div class="stat-sub">Phone screen or higher</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Budget</div>
        <div class="stat-value" id="stat-budget">—</div>
        <div class="stat-sub">of $5.00 daily cap</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Applied Today</div>
        <div class="stat-value" id="stat-today">—</div>
        <div class="stat-sub">of 15 daily max</div>
      </div>
    </div>
    <div class="grid-2">
      <div class="run-card">
        <div class="stat-label">ORBI ORCHESTRATOR</div>
        <h2 style="font-size:20px;font-weight:700;color:var(--text-on-dark);margin:8px 0 4px">Run Job Search</h2>
        <p style="font-size:13px;color:#9CA3AF;margin-bottom:16px">ORBI delegates to SCOUT → RECON → TAILOR → LEDGER automatically.</p>
        <div id="run-alert"></div>
        <div id="run-progress" style="display:none">
          <div class="progress-steps" id="run-steps"></div>
          <p style="margin-top:12px;font-size:12px;color:#9CA3AF;text-align:center" id="run-step-label"></p>
          <div style="text-align:center;margin-top:14px">
            <button class="btn btn-secondary btn-sm" id="run-stop-btn" onclick="handleRunStop()">■ Stop Run</button>
          </div>
        </div>
        <div id="run-idle">
          <input type="text" id="run-goal" class="form-input" placeholder="Goal: e.g. AI Product Manager roles in NYC, $120k+" style="margin-bottom:12px;background:#2D2D3A;border-color:#3D3D4A;color:#fff;" />
          <button class="btn btn-primary btn-lg" onclick="handleRunStart()">▶ Start Job Search Run</button>
          <p style="margin-top:10px;font-size:12px;color:#6B7280;text-align:center">~2-4 minutes per run</p>
        </div>
        <div id="run-result" style="display:none;margin-top:16px"></div>
      </div>
      <div class="card">
        <div class="section-label">ORBIT Agent Status</div>
        <div id="agent-status-list"></div>
      </div>
    </div>
    <div id="run-history-section" style="margin-top:24px"></div>
  `;

  await loadDashboardData();
  _historyLoaded = false;
  _runWasRunning = false;
  await loadRunHistory();
  _historyLoaded = true;
  startDashboardPoll();
}

async function loadDashboardData() {
  try {
    const [budgetData, runStatus] = await Promise.all([
      API.get('/api/v1/budget'),
      API.get('/api/v1/run/status'),
    ]);

    const stats = budgetData.stats || {};
    const budget = budgetData.budget || {};
    const daily = budgetData.daily || {};

    if (el('stat-total')) el('stat-total').textContent = stats.total_applied ?? '0';
    if (el('stat-response')) el('stat-response').textContent = `${stats.response_rate ?? 0}%`;
    if (el('stat-budget')) el('stat-budget').textContent = `$${(budget.used || 0).toFixed(2)}`;
    if (el('stat-today')) el('stat-today').textContent = daily.todayCount ?? '0';

    renderAgentStatus(runStatus);
    renderRunProgress(runStatus);
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

async function loadRunHistory() {
  const section = el('run-history-section');
  if (!section) return;
  try {
    const history = await API.get('/api/v1/scout/history');
    if (!history || history.length === 0) {
      section.innerHTML = `
        <div class="card" style="text-align:center;padding:32px 16px;color:var(--text-muted)">
          <div style="font-size:13px">No job search runs yet. Start a run above to see results here.</div>
        </div>`;
      return;
    }
    section.innerHTML = `
      <div class="card" style="padding:0">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">
          <div>
            <div class="section-label" style="margin-bottom:2px">Job Search Results</div>
            <div style="font-size:12px;color:var(--text-muted)">${history.length} run${history.length !== 1 ? 's' : ''} — click a run to view jobs</div>
          </div>
        </div>
        <div id="run-history-list">
          ${history.map((run, i) => renderRunHistoryRow(run, i)).join('')}
        </div>
      </div>`;

    if (history.length > 0) {
      expandRunRow(history[0].runDate);
    }
  } catch (err) {
    console.error('Run history load error:', err);
  }
}

function formatRunTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function renderRunHistoryRow(run, idx) {
  const timeLabel = formatRunTime(run.runTime) || run.runDate;
  return `
    <div class="run-history-row" id="run-row-${run.runDate}" style="border-bottom:1px solid var(--border)">
      <div onclick="toggleRunRow('${run.runDate}')" style="display:flex;align-items:center;gap:16px;padding:14px 20px;cursor:pointer;user-select:none;transition:background 0.15s" onmouseover="this.style.background='var(--bg-accent)'" onmouseout="this.style.background=''">
        <div style="width:36px;height:36px;background:var(--bg-accent);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent-dark);flex-shrink:0">#${idx + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${timeLabel}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${run.totalFound} found · <strong style="color:var(--accent-dark)">${run.qualified} qualified</strong> · ${run.jobCount} listed</div>
        </div>
        <a href="/api/v1/scout/export?date=${run.runDate}" download="scout-results-${run.runDate}.csv" onclick="event.stopPropagation()" class="btn btn-secondary" style="font-size:12px;padding:6px 14px;white-space:nowrap">⬇ CSV</a>
        <div style="font-size:18px;color:var(--text-muted);margin-left:4px" id="run-chevron-${run.runDate}">›</div>
      </div>
      <div id="run-jobs-${run.runDate}" style="display:none;padding:0 20px 16px"></div>
    </div>`;
}

const _expandedRuns = {};

async function toggleRunRow(date) {
  if (_expandedRuns[date]) {
    collapseRunRow(date);
  } else {
    await expandRunRow(date);
  }
}

function collapseRunRow(date) {
  const jobsEl = el(`run-jobs-${date}`);
  const chevron = el(`run-chevron-${date}`);
  if (jobsEl) jobsEl.style.display = 'none';
  if (chevron) chevron.textContent = '›';
  _expandedRuns[date] = false;
}

async function expandRunRow(date) {
  const jobsEl = el(`run-jobs-${date}`);
  const chevron = el(`run-chevron-${date}`);
  if (!jobsEl) return;

  jobsEl.style.display = 'block';
  if (chevron) chevron.textContent = '⌄';
  _expandedRuns[date] = true;

  if (jobsEl.dataset.loaded) return;
  jobsEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Loading...</div>`;

  try {
    const data = await API.get(`/api/v1/scout/results?date=${encodeURIComponent(date)}`);
    const jobs = (data?.results || []);
    if (jobs.length === 0) {
      jobsEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No jobs in this run.</div>`;
      return;
    }
    jobsEl.dataset.allJobs = JSON.stringify(jobs);
    jobsEl.innerHTML = renderDashJobFilter(date) + renderJobTable(jobs, date);
    jobsEl.dataset.loaded = '1';
  } catch (err) {
    jobsEl.innerHTML = `<div style="font-size:12px;color:#EF4444;padding:8px 0">Failed to load jobs.</div>`;
  }
}

function renderDashJobFilter(date) {
  return `
    <div style="display:flex;align-items:center;gap:6px;margin:10px 0 8px;flex-wrap:wrap">
      <span style="font-size:11px;color:var(--text-muted);font-weight:600">MIN FIT:</span>
      ${[0, 60, 70, 80, 90].map(v => `
        <button id="dash-filter-${date}-${v}" onclick="dashFilter('${date}',${v})"
          style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;border:1px solid var(--border);cursor:pointer;transition:all 0.15s;background:${v===0?'var(--accent)':'transparent'};color:${v===0?'#111':'var(--text-muted)'}">
          ${v === 0 ? 'All' : v + '+'}
        </button>`).join('')}
    </div>`;
}

function dashFilter(date, min) {
  [0, 60, 70, 80, 90].forEach(v => {
    const btn = el(`dash-filter-${date}-${v}`);
    if (!btn) return;
    btn.style.background = v === min ? 'var(--accent)' : 'transparent';
    btn.style.color = v === min ? '#111' : 'var(--text-muted)';
    btn.style.borderColor = v === min ? 'var(--accent)' : 'var(--border)';
  });
  const jobsEl = el(`run-jobs-${date}`);
  if (!jobsEl) return;
  const all = JSON.parse(jobsEl.dataset.allJobs || '[]');
  const filtered = min > 0 ? all.filter(j => j.fitScore >= min) : all;
  const tableEl = jobsEl.querySelector('.dash-job-table');
  if (tableEl) tableEl.outerHTML = renderJobTable(filtered, date);
  else {
    const filterEl = jobsEl.querySelector('.dash-filter-bar');
    if (filterEl) filterEl.insertAdjacentHTML('afterend', renderJobTable(filtered, date));
  }
}

function renderJobTable(jobs, date) {
  const rows = jobs.map((j, i) => {
    const statusBadge = j.approved
      ? `<span style="font-size:11px;padding:2px 8px;background:#D1FAE5;color:#065F46;border-radius:20px;font-weight:600">Approved</span>`
      : j.rejected
      ? `<span style="font-size:11px;padding:2px 8px;background:#FEE2E2;color:#991B1B;border-radius:20px;font-weight:600">Rejected</span>`
      : `<span style="font-size:11px;padding:2px 8px;background:#F3F4F6;color:#6B7280;border-radius:20px;font-weight:600">Pending</span>`;

    const scoreColor = j.fitScore >= 80 ? '#065F46' : j.fitScore >= 70 ? '#92400E' : '#6B7280';
    const scoreBg = j.fitScore >= 80 ? '#D1FAE5' : j.fitScore >= 70 ? '#FEF3C7' : '#F3F4F6';

    const canGenerate = j.fitScore >= 60;
    const docsCell = canGenerate
      ? `<button onclick="window._goScout && window._goScout('${j.id}')" style="font-size:11px;color:var(--accent-dark);background:none;border:none;cursor:pointer;padding:0;font-weight:600">Docs ↗</button>`
      : `<span style="font-size:11px;color:var(--text-muted)">—</span>`;

    return `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:10px 8px;font-size:12px;color:var(--text-muted);width:32px">${i + 1}</td>
        <td style="padding:10px 8px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(j.title || '—')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${escapeHtml(j.company || '—')}</div>
        </td>
        <td style="padding:10px 8px;font-size:12px;color:var(--text-muted)">${escapeHtml(j.location || '—')}</td>
        <td style="padding:10px 8px;font-size:12px;color:var(--text-muted)">${escapeHtml(j.salary || 'Unspecified')}</td>
        <td style="padding:10px 8px">
          <span style="font-size:12px;font-weight:700;padding:3px 8px;border-radius:20px;background:${scoreBg};color:${scoreColor}">${j.fitScore || 0}</span>
        </td>
        <td style="padding:10px 8px">${statusBadge}</td>
        <td style="padding:10px 8px">${docsCell}</td>
        <td style="padding:10px 8px">
          <a href="${escapeHtml(j.url || '#')}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--accent-dark);font-weight:500;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">View ↗</a>
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="dash-job-table" style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;margin-top:4px">
      <table style="width:100%;border-collapse:collapse;font-family:var(--font-sans)">
        <thead>
          <tr style="background:var(--bg-accent)">
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">#</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Role / Company</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Location</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Comp</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Fit</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Status</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Docs</th>
            <th style="padding:8px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">URL</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const AGENTS = [
  { id: 'orbi', label: 'ORBI', role: 'Master Orchestrator', model: 'Sonnet 4' },
  { id: 'scout', label: 'SCOUT', role: 'Job Discovery', model: 'Haiku 4.5' },
  { id: 'recon', label: 'RECON', role: 'Company Intel', model: 'Haiku 4.5' },
  { id: 'tailor', label: 'TAILOR', role: 'Document Generator', model: 'Sonnet 4' },
  { id: 'ledger', label: 'LEDGER', role: 'Pipeline Tracker', model: 'Haiku 4.5' },
  { id: 'coach', label: 'COACH', role: 'Interview Prep', model: 'Sonnet 4' },
  { id: 'guardian', label: 'GUARDIAN', role: 'Safety Layer', model: 'Haiku 4.5' },
];

function renderAgentStatus(runStatus) {
  const list = el('agent-status-list');
  if (!list) return;

  const activeStep = runStatus?.step || '';
  const isRunning = runStatus?.running;

  // Build the full list only once; after that just swap badge text in-place
  if (!list.dataset.built) {
    list.innerHTML = AGENTS.map(agent => `
      <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)" id="agent-row-${agent.id}">
        <div style="width:36px;height:36px;background:var(--bg-accent);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--accent-dark);flex-shrink:0">${agent.label}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${agent.label}</div>
          <div style="font-size:11px;color:var(--text-muted)">${agent.role} · ${agent.model}</div>
        </div>
        <span id="agent-badge-${agent.id}" class="badge badge-gray badge-dot">Idle</span>
      </div>`).join('');
    list.dataset.built = '1';
  }

  AGENTS.forEach(agent => {
    const badge = el(`agent-badge-${agent.id}`);
    if (!badge) return;
    const isActive = isRunning && activeStep.toLowerCase().includes(agent.id);
    if (isActive) {
      badge.className = 'badge badge-yellow badge-dot yellow';
      badge.textContent = 'Active';
    } else {
      badge.className = 'badge badge-gray badge-dot';
      badge.textContent = 'Idle';
    }
  });
}

function renderRunProgress(runStatus) {
  if (!runStatus) return;
  const idle = el('run-idle');
  const progress = el('run-progress');
  const result = el('run-result');

  if (runStatus.running) {
    if (idle) idle.style.display = 'none';
    if (progress) {
      progress.style.display = 'block';
      const steps = runStatus.steps || [];
      el('run-steps').innerHTML = steps.map((s, i) => `
        <div class="progress-step">
          <div class="step-icon ${s.status}">
            ${s.status === 'done' ? '<svg width="12" height="12" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="#111" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : s.status === 'error' ? '✗' : s.status === 'active' ? '<span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>' : ''}
          </div>
          <span class="step-label ${s.status}">${s.label.split(':')[0]}</span>
        </div>
        ${i < steps.length - 1 ? `<div class="step-connector ${s.status === 'done' ? 'done' : ''}"></div>` : ''}
      `).join('');
      el('run-step-label').textContent = runStatus.step + '...';
    }
  } else {
    if (idle) idle.style.display = 'block';
    if (progress) progress.style.display = 'none';

    if (runStatus.result && result) {
      result.style.display = 'block';
      const r = runStatus.result;
      result.innerHTML = `
        <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:12px 14px;color:#86EFAC;font-size:13px">
          ✓ Last run complete —
          ${r.jobsFound} found · ${r.jobsQualified} qualified · ${r.documentsGenerated} docs generated · ${r.addedToPipeline} added to pipeline
        </div>`;
    }
    if (runStatus.error && result) {
      result.style.display = 'block';
      result.innerHTML = `<div class="alert alert-error">${escapeHtml(runStatus.error)}</div>`;
    }
  }
}

async function handleRunStart() {
  clearAlert('run-alert');
  const goal = el('run-goal')?.value?.trim() || '';
  try {
    const r = await API.post('/api/v1/run', { goal });
    if (r.error) { showAlert('run-alert', r.error, 'error'); return; }
    await loadDashboardData();
  } catch (err) {
    showAlert('run-alert', err.message, 'error');
  }
}

async function handleRunStop() {
  const btn = el('run-stop-btn');
  if (!confirm('Stop the current run? It halts after the current step/job — work already done is kept.')) return;
  if (btn) { btn.disabled = true; btn.textContent = '■ Stopping…'; }
  try {
    const r = await API.post('/api/v1/run/stop', {});
    if (r.error) { showAlert('run-alert', r.error, 'error'); }
    else { showAlert('run-alert', 'Stop requested — the run will halt at the next step boundary.', 'warn'); }
  } catch (err) {
    showAlert('run-alert', err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '■ Stop Run'; }
  }
}

function startDashboardPoll() {
  if (dashboardPollInterval) clearInterval(dashboardPollInterval);
  dashboardPollInterval = setInterval(async () => {
    try {
      const runStatus = await API.get('/api/v1/run/status');
      renderRunProgress(runStatus);
      renderAgentStatus(runStatus);

      const justFinished = _runWasRunning && !runStatus.running;
      _runWasRunning = runStatus.running;

      if (!runStatus.running) {
        const budgetData = await API.get('/api/v1/budget');
        const stats = budgetData.stats || {};
        const budget = budgetData.budget || {};
        const daily = budgetData.daily || {};
        if (el('stat-total')) el('stat-total').textContent = stats.total_applied ?? '0';
        if (el('stat-response')) el('stat-response').textContent = `${stats.response_rate ?? 0}%`;
        if (el('stat-budget')) el('stat-budget').textContent = `$${(budget.used || 0).toFixed(2)}`;
        if (el('stat-today')) el('stat-today').textContent = daily.todayCount ?? '0';

        if (justFinished) {
          _historyLoaded = false;
          await loadRunHistory();
          _historyLoaded = true;
        }
      } else {
        _runWasRunning = true;
      }
    } catch {}
  }, 2500);
}
