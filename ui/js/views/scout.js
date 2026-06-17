async function renderScout() {
  const main = el('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">SCOUT Results</h1>
          <p class="page-sub">Today's job listings — approve or generate application docs per job</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;gap:4px;align-items:center;background:var(--bg-accent);border:1px solid var(--border);border-radius:8px;padding:4px">
            <span style="font-size:11px;color:var(--text-muted);padding:0 6px;font-weight:600">MIN FIT</span>
            ${[0, 60, 70, 80, 90].map(v => `
              <button id="filter-btn-${v}" onclick="setScoreFilter(${v})"
                style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;border:none;cursor:pointer;transition:all 0.15s;background:${v===0?'var(--accent)':'transparent'};color:${v===0?'#111':'var(--text-muted)'}">
                ${v === 0 ? 'All' : v + '+'}
              </button>`).join('')}
          </div>
          <button class="btn btn-secondary btn-sm" onclick="openApplicationsFolder()" title="Open applications folder">📁 Open Folder</button>
          <button class="btn btn-secondary btn-sm" onclick="purgeExpiredJobs()" title="Remove expired or closed job postings from today's list" id="btn-purge-expired">⊘ Clean Stale</button>
          <button class="btn btn-secondary btn-sm" onclick="loadScoutResults()">↺ Refresh</button>
          <button class="btn btn-primary btn-sm" onclick="showImportModal()" title="Manually add a job by URL">+ Import Job</button>
        </div>
      </div>
    </div>
    <div id="scout-alert"></div>
    <div id="scout-content"><div class="empty-state"><div class="empty-state-title">Loading...</div></div></div>

    <!-- Manual import modal -->
    <div id="import-modal-overlay" onclick="hideImportModal()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000"></div>
    <div id="import-modal" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1001;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);width:480px;max-width:96vw;padding:28px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="font-size:15px;font-weight:700;color:var(--text-primary);margin:0">Import Job Manually</h3>
        <button onclick="hideImportModal()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-muted);line-height:1">✕</button>
      </div>
      <div id="import-modal-alert" style="margin-bottom:12px"></div>
      <div style="display:flex;gap:0;margin-bottom:18px;border-bottom:2px solid var(--border)">
        <button id="import-tab-btn-url" onclick="switchImportTab('url')" style="flex:1;padding:8px 0;font-size:12px;font-weight:700;border:none;border-bottom:2px solid var(--accent);margin-bottom:-2px;background:transparent;cursor:pointer;color:var(--text-primary)">By URL</button>
        <button id="import-tab-btn-doc" onclick="switchImportTab('doc')" style="flex:1;padding:8px 0;font-size:12px;font-weight:600;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;background:transparent;cursor:pointer;color:var(--text-muted)">Upload Word Doc</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div id="import-panel-url">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px">Job URL <span style="color:#EF4444">*</span></label>
          <input id="import-url" type="url" placeholder="https://jobs.lever.co/company/..." style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);outline:none" />
        </div>
        <div id="import-panel-doc" style="display:none">
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px">Word Document (.docx) <span style="color:#EF4444">*</span></label>
          <input id="import-docx-file" type="file" accept=".docx" style="width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);background:#fff;cursor:pointer" />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px">Job Title <span style="font-weight:400">(optional)</span></label>
            <input id="import-title" type="text" placeholder="e.g. Director of AI" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);outline:none" />
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px">Company <span style="font-weight:400">(optional)</span></label>
            <input id="import-company" type="text" placeholder="e.g. OpenAI" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);outline:none" />
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:5px">Compensation <span style="font-weight:400">(optional)</span></label>
          <input id="import-salary" type="text" placeholder="e.g. $280K–$325K" style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-primary);outline:none" />
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:22px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="hideImportModal()" style="padding:8px 18px">Cancel</button>
        <button class="btn btn-primary btn-sm" id="import-submit-btn" onclick="submitImportJob()" style="padding:8px 20px">Import &amp; Score</button>
      </div>
      <p id="import-modal-hint" style="font-size:11px;color:var(--text-muted);margin:14px 0 0">Title and company are auto-extracted from the URL if left blank. Fit score is computed against your profile.</p>
    </div>
  `;
  await loadScoutResults();
}

let _docStatus = {};
let _allResults = [];
let _activeFilter = 0;
let _autoEligible = {};

function setScoreFilter(min) {
  _activeFilter = min;
  [0, 60, 70, 80, 90].forEach(v => {
    const btn = el(`filter-btn-${v}`);
    if (!btn) return;
    btn.style.background = v === min ? 'var(--accent)' : 'transparent';
    btn.style.color = v === min ? '#111' : 'var(--text-muted)';
  });
  const filtered = min > 0 ? _allResults.filter(j => j.fitScore >= min) : _allResults;
  const label = el('scout-count-label');
  if (label) label.textContent = `${filtered.length} job${filtered.length !== 1 ? 's' : ''} listed${min > 0 ? ` (fit ≥ ${min})` : ''}`;
  renderScoutTable();
}

function renderScoutTable() {
  const tbody = el('scout-tbody');
  if (!tbody) return;
  const filtered = _activeFilter > 0
    ? _allResults.filter(j => j.fitScore >= _activeFilter)
    : _allResults;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;font-size:13px;color:var(--text-muted)">No jobs with fit score ≥ ${_activeFilter}.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map((job, idx) => renderScoutRow(job, idx + 1)).join('');
}
async function loadScoutResults() {
  try {
    const [data, apps, autoElig] = await Promise.all([
      API.get('/api/v1/scout/results'),
      API.get('/api/v1/tailor/applications').catch(() => []),
      API.get('/api/v1/autoapply/eligible').catch(() => ({ jobs: [] })),
    ]);
    _autoEligible = {};
    for (const j of (autoElig.jobs || [])) {
      if (j.eligible) _autoEligible[j.id] = true;
    }
    const results = data.results || [];
    const container = el('scout-content');

    _allResults = results;

    // Build a map: jobId → doc exists
    _docStatus = {};
    for (const app of apps) {
      if (app.jobId) _docStatus[app.jobId] = app;
    }

    if (!results.length) {
      container.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <div class="empty-state-title">No SCOUT results yet</div>
            <div class="empty-state-sub">SCOUT searches 7 providers (Tavily, Brave, SerpAPI, etc.) for jobs matching your profile, then scores each against your target roles, location, and seniority. No AI calls — it's free.</div>
            <ol class="empty-state-steps">
              <li>Set <b>Target Roles</b>, <b>Target Locations</b>, and <b>Skills</b> on your <b>Profile</b> page.</li>
              <li>Start a run from the <b>Dashboard</b> ("Run" button) — or click <b>+ Import Job</b> above to add one by URL.</li>
              <li>Results appear here. Fit ≥ 60 lets you generate tailored docs; ≥ 70 auto-qualifies for TAILOR.</li>
            </ol>
            <div class="empty-state-actions">
              <button class="btn btn-primary btn-sm" onclick="navigate('dashboard')">Open Dashboard</button>
              <button class="btn btn-secondary btn-sm" onclick="navigate('profile')">Edit Profile</button>
              <button class="btn btn-secondary btn-sm" onclick="showImportModal()">+ Import Job by URL</button>
            </div>
          </div>
        </div>`;
      return;
    }

    const docsCount = results.filter(j => _docStatus[j.id]).length;
    const eligibleCount = results.filter(j => j.fitScore >= 60).length;
    const above80 = results.filter(j => j.fitScore >= 80).length;

    const runDt = data.runTime ? new Date(data.runTime) : null;
    const runDateStr = runDt ? runDt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : (data.runDate || '—');
    const runTimeStr = runDt ? runDt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

    const statsHtml = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 14px;background:#FEF9EC;border:1px solid #EAB308;border-radius:8px;width:fit-content">
        <span style="font-size:13px;font-weight:700;color:#92400E">🕐 Search run:</span>
        <span style="font-size:13px;font-weight:600;color:#111827">${runDateStr}</span>
        <span style="font-size:13px;color:#6B7280">at</span>
        <span style="font-size:13px;font-weight:700;color:#111827">${runTimeStr}</span>
      </div>
      <div class="stat-row" style="margin-bottom:var(--gap)">
        <div class="stat-card accent">
          <div class="stat-label">Total Found</div>
          <div class="stat-value">${data.totalFound || 0}</div>
          <div class="stat-sub">From Tavily search</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Score 80+</div>
          <div class="stat-value" style="color:var(--accent-dark)">${above80}</div>
          <div class="stat-sub">High-confidence matches</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Docs Generated</div>
          <div class="stat-value" style="color:var(--accent-dark)">${docsCount}</div>
          <div class="stat-sub">of ${eligibleCount} eligible (≥60 fit)</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Listed</div>
          <div class="stat-value" style="font-size:22px">${results.length}</div>
          <div class="stat-sub">${results.filter(j => j.manuallyImported).length} manually added</div>
        </div>
      </div>`;

    container.innerHTML = `
      ${statsHtml}
      <div class="card" style="padding:0">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border)">
          <div style="font-size:13px;font-weight:600" id="scout-count-label">${results.length} jobs listed</div>
          <button class="btn btn-primary btn-sm" onclick="generateAllDocs()" id="btn-gen-all">
            ⚡ Generate All Missing Docs
          </button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--bg-accent)">
                <th style="padding:10px 12px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:center;width:36px">#</th>
                <th style="padding:10px 16px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Role / Company</th>
                <th style="padding:10px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Location</th>
                <th style="padding:10px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Comp</th>
                <th style="padding:10px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:center">Fit</th>
                <th style="padding:10px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Docs</th>
                <th style="padding:10px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Action</th>
                <th style="padding:10px 8px;font-size:11px;font-weight:600;color:var(--text-muted);text-align:left">Link</th>
              </tr>
            </thead>
            <tbody id="scout-tbody"></tbody>
          </table>
        </div>
      </div>`;

    renderScoutTable();
  } catch (err) {
    showAlert('scout-alert', err.message, 'error');
  }
}

function renderScoutRow(job, rowNum) {
  const approved = job.approved;
  const rejected = job.rejected;
  const docApp = _docStatus[job.id];
  const hasDoc = !!docApp;
  // Manually imported jobs are user-chosen — allow docs regardless of fit.
  const canGenerate = job.fitScore >= 60 || job.manuallyImported;

  const rowBg = approved ? '#F0FDF4' : rejected ? '#FFF1F2' : '';
  const rowOpacity = rejected ? '0.55' : '1';

  const fitColor = job.fitScore >= 80 ? '#065F46' : job.fitScore >= 70 ? '#92400E' : job.fitScore >= 60 ? '#1D4ED8' : '#6B7280';
  const fitBg = job.fitScore >= 80 ? '#D1FAE5' : job.fitScore >= 70 ? '#FEF3C7' : job.fitScore >= 60 ? '#DBEAFE' : '#F3F4F6';

  const docCell = hasDoc
    ? readyDocCell(job.id, docApp.atsScore)
    : canGenerate
      ? `<button class="btn btn-secondary btn-sm" id="genbtn-${job.id}" onclick="generateDocs('${job.id}')" style="font-size:11px;padding:4px 10px;white-space:nowrap">📄 Generate</button>`
      : `<span style="font-size:11px;color:var(--text-muted)">Score too low</span>`;

  const actionCell = `
    <div style="display:flex;gap:4px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="markJobAction('${job.id}','applied')"
        title="Mark as applied — won't appear in future SCOUT results"
        style="font-size:11px;padding:4px 9px;background:#D1FAE5;color:#065F46;border:none;font-weight:600;border-radius:6px;cursor:pointer">✓ Applied</button>
      <button class="btn btn-sm" onclick="markJobAction('${job.id}','not_interested')"
        title="Not interested — hide and never show again"
        style="font-size:11px;padding:4px 9px;background:#FEF3C7;color:#92400E;border:none;font-weight:600;border-radius:6px;cursor:pointer">Not Interested</button>
      <button class="btn btn-sm" onclick="markJobAction('${job.id}','deleted')"
        title="Delete this job — remove from list and never show again"
        style="font-size:11px;padding:4px 9px;background:#FEE2E2;color:#991B1B;border:none;font-weight:600;border-radius:6px;cursor:pointer">🗑 Delete</button>
    </div>`;

  return `
    <tr id="scout-row-${job.id}" style="background:${rowBg};opacity:${rowOpacity};border-bottom:1px solid var(--border)">
      <td style="padding:12px 12px;text-align:center;font-size:11px;font-weight:600;color:var(--text-muted)">${rowNum}</td>
      <td style="padding:12px 16px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHtml(job.title)}</span>
          ${job.manuallyImported ? `<span style="font-size:10px;font-weight:600;padding:1px 6px;background:#EEF2FF;color:#4338CA;border-radius:20px;white-space:nowrap">Manual</span>` : ''}
          ${_autoEligible[job.id] ? `<span title="Eligible for autonomous apply — see the Auto-Apply page" style="font-size:10px;font-weight:600;padding:1px 6px;background:#D1FAE5;color:#065F46;border-radius:20px;white-space:nowrap">⚡ Auto</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(job.company)}</span>
          ${freshnessLabel(job.postedAt)}
        </div>
      </td>
      <td style="padding:12px 8px;font-size:12px;color:var(--text-muted)">${escapeHtml(job.location || '—')}</td>
      <td style="padding:12px 8px;font-size:12px;color:var(--text-muted)">${escapeHtml(job.salary || '—')}</td>
      <td style="padding:12px 8px;text-align:center">
        <span style="font-size:12px;font-weight:700;padding:3px 9px;border-radius:20px;background:${fitBg};color:${fitColor}">${job.fitScore}</span>
      </td>
      <td style="padding:12px 8px" id="doc-cell-${job.id}">${docCell}</td>
      <td style="padding:12px 8px">${actionCell}</td>
      <td style="padding:12px 8px">
        <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer"
          style="font-size:12px;color:var(--accent-dark);font-weight:600;text-decoration:none"
          onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">View ↗</a>
      </td>
    </tr>`;
}

// Markup for the "docs ready" state — shows the Ready badge, ATS score, and a
// Regenerate button. Shared by the initial render and the post-generate update
// so the Regenerate button is always present once docs exist.
function readyDocCell(jobId, atsScore) {
  return `<div style="display:flex;flex-direction:column;gap:4px">
      <span style="font-size:11px;padding:2px 8px;background:#D1FAE5;color:#065F46;border-radius:20px;font-weight:600;width:fit-content">✓ Ready</span>
      <span style="font-size:10px;color:var(--text-muted)">ATS ${atsScore || '?'}/100</span>
      <button class="btn btn-sm" id="genbtn-${jobId}" onclick="regenerateDocs('${jobId}')" title="Rebuild the resume + cover letter from scratch (makes a new AI call)" style="font-size:10px;padding:2px 8px;background:#EEF2FF;color:#4338CA;border:none;font-weight:600;border-radius:6px;cursor:pointer;width:fit-content">↻ Regenerate</button>
    </div>`;
}

// Regenerate overwrites existing docs and costs an AI call, so confirm first.
async function regenerateDocs(jobId) {
  if (!confirm('Regenerate documents? This overwrites the current resume and cover letter and makes a new AI call.')) return;
  return generateDocs(jobId);
}

async function generateDocs(jobId) {
  const btn = el(`genbtn-${jobId}`);
  const cell = el(`doc-cell-${jobId}`);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

  const today = new Date().toISOString().split('T')[0];
  try {
    const r = await API.post('/api/v1/tailor/generate', { jobId, date: today });
    if (r.error) {
      if (cell) cell.innerHTML = `<span style="font-size:11px;color:#EF4444" title="${escapeHtml(r.error)}">⚠ Failed</span>`;
      showAlert('scout-alert', r.error, 'error');
      return;
    }
    _docStatus[jobId] = { jobId, atsScore: r.atsScore };
    if (cell) cell.innerHTML = readyDocCell(jobId, r.atsScore);
  } catch (err) {
    if (cell) cell.innerHTML = `<span style="font-size:11px;color:#EF4444" title="${escapeHtml(err.message)}">⚠ Failed</span>`;
    showAlert('scout-alert', err.message, 'error');
  }
}

async function generateAllDocs() {
  const btn = el('btn-gen-all');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }
  clearAlert('scout-alert');

  try {
    const pool = _activeFilter > 0
      ? _allResults.filter(j => j.fitScore >= _activeFilter)
      : _allResults;
    const eligible = pool.filter(j => (j.fitScore >= 60 || j.manuallyImported) && !_docStatus[j.id]);

    if (!eligible.length) {
      showAlert('scout-alert', 'All visible jobs already have documents.', 'success');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate All Missing Docs'; }
      return;
    }

    let done = 0;
    let failed = 0;
    for (const job of eligible) {
      if (btn) btn.textContent = `⏳ ${done + failed + 1} / ${eligible.length}...`;
      try {
        await generateDocs(job.id);
        done++;
      } catch {
        failed++;
      }
    }

    const msg = `Generated ${done} document${done !== 1 ? 's' : ''}${failed ? ` · ${failed} failed (API limit?)` : ''}.`;
    showAlert('scout-alert', msg, done > 0 ? 'success' : 'error');
  } catch (err) {
    showAlert('scout-alert', err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate All Missing Docs'; }
  }
}

async function openApplicationsFolder() {
  try {
    await API.post('/api/v1/tailor/applications/open-folder', {});
  } catch (err) {
    showAlert('scout-alert', 'Could not open folder: ' + err.message, 'warn');
  }
}

async function markJobAction(id, action) {
  const row = el(`scout-row-${id}`);
  // Optimistic fade — feels snappier than waiting for the round-trip
  if (row) {
    row.style.transition = 'opacity 0.25s, background 0.25s';
    row.style.opacity = '0.35';
    row.style.background = action === 'applied' ? '#F0FDF4'
      : action === 'deleted' ? '#FEF2F2'
      : '#FFFBEB';
  }
  try {
    await API.post(`/api/v1/scout/results/${id}/action`, { action });
    // Re-fetch so the in-memory list (_allResults) drops the hidden job and
    // counts / filters re-compute correctly.
    await loadScoutResults();
  } catch (err) {
    if (row) { row.style.opacity = '1'; row.style.background = ''; }
    showAlert('scout-alert', 'Action failed: ' + err.message, 'error');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Render a small freshness badge from a job's postedAt date.
// Returns '' when there is no real date (e.g. the 'recent' placeholder).
function freshnessLabel(postedAt) {
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  const text = days <= 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`;
  // Green ≤1 day, amber ≤3 days, gray otherwise.
  const [bg, fg] = days <= 1 ? ['#D1FAE5', '#065F46'] : days <= 3 ? ['#FEF3C7', '#92400E'] : ['#F3F4F6', '#6B7280'];
  return `<span title="Posted/updated ${escapeHtml(postedAt)}" style="font-size:10px;font-weight:600;padding:1px 6px;background:${bg};color:${fg};border-radius:20px;white-space:nowrap">${text}</span>`;
}

async function purgeExpiredJobs() {
  const btn = el('btn-purge-expired');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Cleaning...'; }
  try {
    const result = await API.post('/api/v1/scout/purge-expired', {});
    if (result.removed > 0) {
      showAlert('scout-alert', `Removed ${result.removed} expired job${result.removed !== 1 ? 's' : ''} — ${result.remaining} remaining.`, 'success');
      await loadScoutResults();
    } else {
      showAlert('scout-alert', 'No expired jobs found — list is already clean.', 'success');
    }
  } catch (err) {
    showAlert('scout-alert', `Failed to clean stale jobs: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⊘ Clean Stale'; }
  }
}

function showImportModal() {
  const overlay = el('import-modal-overlay');
  const modal = el('import-modal');
  if (overlay) overlay.style.display = 'block';
  if (modal) modal.style.display = 'block';
  switchImportTab('url');
  const urlInput = el('import-url');
  if (urlInput) { urlInput.value = ''; urlInput.focus(); }
  ['import-title', 'import-company', 'import-salary'].forEach(id => {
    const f = el(id); if (f) f.value = '';
  });
  const fileInput = el('import-docx-file');
  if (fileInput) fileInput.value = '';
  const alertDiv = el('import-modal-alert');
  if (alertDiv) alertDiv.innerHTML = '';
}

function switchImportTab(tab) {
  const isUrl = tab === 'url';
  const panelUrl = el('import-panel-url');
  const panelDoc = el('import-panel-doc');
  const btnUrl = el('import-tab-btn-url');
  const btnDoc = el('import-tab-btn-doc');
  const hint = el('import-modal-hint');
  if (panelUrl) panelUrl.style.display = isUrl ? 'block' : 'none';
  if (panelDoc) panelDoc.style.display = isUrl ? 'none' : 'block';
  if (btnUrl) {
    btnUrl.style.borderBottomColor = isUrl ? 'var(--accent)' : 'transparent';
    btnUrl.style.color = isUrl ? 'var(--text-primary)' : 'var(--text-muted)';
    btnUrl.style.fontWeight = isUrl ? '700' : '600';
  }
  if (btnDoc) {
    btnDoc.style.borderBottomColor = isUrl ? 'transparent' : 'var(--accent)';
    btnDoc.style.color = isUrl ? 'var(--text-muted)' : 'var(--text-primary)';
    btnDoc.style.fontWeight = isUrl ? '600' : '700';
  }
  if (hint) hint.textContent = isUrl
    ? 'Title and company are auto-extracted from the URL if left blank. Fit score is computed against your profile.'
    : 'Text is extracted from the .docx file. Add title and company if not in the document.';
}

function hideImportModal() {
  const overlay = el('import-modal-overlay');
  const modal = el('import-modal');
  if (overlay) overlay.style.display = 'none';
  if (modal) modal.style.display = 'none';
}

async function submitImportJob() {
  const alertDiv = el('import-modal-alert');
  const btn = el('import-submit-btn');
  const isDocMode = el('import-panel-doc')?.style.display !== 'none';

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Importing...'; }
  if (alertDiv) alertDiv.innerHTML = '';

  try {
    let result;

    if (isDocMode) {
      const fileInput = el('import-docx-file');
      const file = fileInput?.files?.[0];
      if (!file) {
        if (alertDiv) alertDiv.innerHTML = `<div style="font-size:12px;color:#EF4444;padding:8px 12px;background:#FEF2F2;border-radius:6px">Please select a .docx file.</div>`;
        return;
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', el('import-title')?.value?.trim() || '');
      fd.append('company', el('import-company')?.value?.trim() || '');
      fd.append('salary', el('import-salary')?.value?.trim() || '');
      const r = await fetch('/api/v1/scout/import-docx', { method: 'POST', body: fd });
      result = await r.json();
      if (!r.ok) throw new Error(result.error || `Request failed (${r.status})`);
    } else {
      const url = (el('import-url')?.value || '').trim();
      if (!url) {
        if (alertDiv) alertDiv.innerHTML = `<div style="font-size:12px;color:#EF4444;padding:8px 12px;background:#FEF2F2;border-radius:6px">Please enter a job URL.</div>`;
        return;
      }
      result = await API.post('/api/v1/scout/import', {
        url,
        title: el('import-title')?.value?.trim() || '',
        company: el('import-company')?.value?.trim() || '',
        salary: el('import-salary')?.value?.trim() || '',
      });
    }

    if (result.error) {
      if (alertDiv) alertDiv.innerHTML = `<div style="font-size:12px;color:#EF4444;padding:8px 12px;background:#FEF2F2;border-radius:6px">${escapeHtml(result.error)}</div>`;
      return;
    }

    hideImportModal();
    showAlert('scout-alert', `Imported "${escapeHtml(result.title)}" @ ${escapeHtml(result.company)} — fit score ${result.fitScore}`, 'success');
    await loadScoutResults();
  } catch (err) {
    if (alertDiv) alertDiv.innerHTML = `<div style="font-size:12px;color:#EF4444;padding:8px 12px;background:#FEF2F2;border-radius:6px">${escapeHtml(err.message)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Import & Score'; }
  }
}
