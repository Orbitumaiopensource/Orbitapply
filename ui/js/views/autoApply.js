// Auto-Apply view — autonomous job application for eligible SCOUT jobs.
// Default per job = dry run (fill + screenshot). Opt-in per job = auto-submit.

let _aaJobs = [];
let _aaPoll = null;

async function renderAutoApply() {
  const main = el('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Auto-Apply</h1>
          <p class="page-sub">Autonomous application for eligible jobs — Greenhouse / Lever / Ashby with docs ready. Default is fill + screenshot; tick "Auto-submit" to let it click Submit.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-secondary btn-sm" onclick="loadAutoApply()">↺ Refresh</button>
          <button class="btn btn-primary btn-sm" id="aa-run-btn" onclick="runAutoApply()">⚡ Apply to Selected</button>
        </div>
      </div>
    </div>
    <div id="aa-alert"></div>
    <div id="aa-status"></div>
    <div id="aa-content"><div class="empty-state"><div class="empty-state-title">Loading...</div></div></div>
  `;
  await loadAutoApply();
  pollAutoApplyStatus();
}

async function loadAutoApply() {
  try {
    const data = await API.get('/api/v1/autoapply/eligible');
    _aaJobs = data.jobs || [];
    const container = el('aa-content');
    const eligible = _aaJobs.filter(j => j.eligible);
    const ineligible = _aaJobs.filter(j => !j.eligible);

    if (!_aaJobs.length) {
      container.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-state-title">No SCOUT results.</div><div class="empty-state-sub">Run a search and generate docs first.</div></div></div>`;
      return;
    }

    const eligRows = eligible.map(j => `
      <tr style="border-bottom:1px solid var(--border)">
        <td style="padding:12px 12px;text-align:center">
          <input type="checkbox" class="aa-pick" data-id="${j.id}" checked />
        </td>
        <td style="padding:12px 16px">
          <div style="font-size:13px;font-weight:600">${escapeHtml(j.title)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(j.company)}</div>
        </td>
        <td style="padding:12px 8px;font-size:12px;text-transform:capitalize">${escapeHtml(j.platform)}</td>
        <td style="padding:12px 8px;text-align:center">${fitBadge(j.fitScore)}</td>
        <td style="padding:12px 8px;font-size:11px;color:var(--text-muted)">ATS ${j.doc ? (j.doc.atsScore || '?') : '?'}/100</td>
        <td style="padding:12px 8px;text-align:center">
          <label style="font-size:11px;display:inline-flex;align-items:center;gap:5px;cursor:pointer" title="If unticked, the form is filled and screenshotted but NOT submitted — you submit after reviewing.">
            <input type="checkbox" class="aa-autosubmit" data-id="${j.id}" ${j.autoSubmitDefault ? 'checked' : ''} />
            Auto-submit
          </label>
        </td>
        <td style="padding:12px 8px">
          <a href="${escapeHtml(j.url)}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--accent-dark);font-weight:600;text-decoration:none">View ↗</a>
        </td>
      </tr>`).join('');

    const ineligRows = ineligible.map(j => `
      <tr style="border-bottom:1px solid var(--border);opacity:.65">
        <td style="padding:10px 16px">
          <div style="font-size:12px;font-weight:600">${escapeHtml(j.title)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(j.company)} · ${escapeHtml(j.platform)}</div>
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#92400E">${escapeHtml((j.reasons || []).join(' · '))}</td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="card" style="padding:0;margin-bottom:var(--gap)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid var(--border)">
          <div style="font-size:13px;font-weight:600">${eligible.length} eligible for autonomous apply</div>
          <button class="btn btn-secondary btn-sm" onclick="toggleAllAuto(true)">Select all auto-submit</button>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:var(--bg-accent)">
              <th style="padding:10px 12px;font-size:11px;color:var(--text-muted);width:40px"></th>
              <th style="padding:10px 16px;font-size:11px;color:var(--text-muted);text-align:left">Role / Company</th>
              <th style="padding:10px 8px;font-size:11px;color:var(--text-muted);text-align:left">Platform</th>
              <th style="padding:10px 8px;font-size:11px;color:var(--text-muted);text-align:center">Fit</th>
              <th style="padding:10px 8px;font-size:11px;color:var(--text-muted);text-align:left">Docs</th>
              <th style="padding:10px 8px;font-size:11px;color:var(--text-muted);text-align:center">Mode</th>
              <th style="padding:10px 8px;font-size:11px;color:var(--text-muted);text-align:left">Link</th>
            </tr></thead>
            <tbody>${eligRows || `<tr><td colspan="7" style="padding:28px;text-align:center;font-size:13px;color:var(--text-muted)">No eligible jobs. Generate docs for a Greenhouse/Lever/Ashby job first.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
      ${ineligible.length ? `
      <div class="card" style="padding:0">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--text-muted)">Not eligible (${ineligible.length})</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><tbody>${ineligRows}</tbody></table></div>
      </div>` : ''}
    `;
  } catch (err) {
    showAlert('aa-alert', err.message, 'error');
  }
}

function toggleAllAuto(on) {
  document.querySelectorAll('.aa-autosubmit').forEach(c => { c.checked = on; });
}

async function runAutoApply() {
  const picks = [...document.querySelectorAll('.aa-pick:checked')].map(c => c.dataset.id);
  if (!picks.length) {
    showAlert('aa-alert', 'Select at least one eligible job.', 'warn');
    return;
  }
  const autoSubmitJobIds = [...document.querySelectorAll('.aa-autosubmit:checked')]
    .map(c => c.dataset.id)
    .filter(id => picks.includes(id));

  const autoCount = autoSubmitJobIds.length;
  const msg = autoCount > 0
    ? `Apply to ${picks.length} job(s)? ${autoCount} will be AUTO-SUBMITTED (real applications sent). The rest are filled + screenshotted for your review.`
    : `Fill ${picks.length} job form(s) and capture screenshots? Nothing will be submitted — you submit after reviewing.`;
  if (!confirm(msg)) return;

  const btn = el('aa-run-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Starting...'; }
  clearAlert('aa-alert');

  try {
    const out = await API.post('/api/v1/autoapply/run', { jobIds: picks, autoSubmitJobIds });
    if (out.error) { showAlert('aa-alert', out.error, 'error'); return; }
    showAlert('aa-alert', `Run started for ${out.total} job(s). GUARDIAN's 15/day cap and 45s rate limit still apply.`, 'success');
    pollAutoApplyStatus();
  } catch (err) {
    showAlert('aa-alert', err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Apply to Selected'; }
  }
}

function renderRunStatus(run) {
  if (!run) { const s = el('aa-status'); if (s) s.innerHTML = ''; return; }
  const statusEl = el('aa-status');
  if (!statusEl) return;

  const colorFor = s => ({
    submitted: '#065F46', 'form-filled': '#1E40AF', 'filled-dry-run': '#1E40AF',
    'human-queue': '#92400E', skipped: '#6B7280', failed: '#991B1B',
    running: '#1D4ED8', pending: '#9CA3AF',
  }[s] || '#6B7280');

  const steps = (run.steps || []).map(st => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:11px;font-weight:700;color:${colorFor(st.status)};min-width:110px;text-transform:uppercase">${st.status}</span>
      <span style="font-size:12px;flex:1">${escapeHtml(st.company || st.jobId || '')}${st.title ? ` — ${escapeHtml(st.title)}` : ''}</span>
      <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(st.message || st.mode || '')}</span>
    </div>`).join('');

  const head = run.status === 'running'
    ? `<span style="color:#1D4ED8">● Running ${run.processed}/${run.total}</span>`
    : run.status === 'stopped'
      ? `<span style="color:#991B1B">■ Stopped</span>`
      : `<span style="color:#065F46">✓ Done</span>`;

  statusEl.innerHTML = `
    <div class="card" style="margin-bottom:var(--gap)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:14px;font-weight:700">Run status — ${head}</div>
        <div style="font-size:12px;color:var(--text-muted)">${run.summary ? escapeHtml(run.summary) : timeAgo(run.startedAt)}</div>
      </div>
      ${steps}
    </div>`;
}

async function pollAutoApplyStatus() {
  if (_aaPoll) { clearInterval(_aaPoll); _aaPoll = null; }
  const tick = async () => {
    try {
      const { run } = await API.get('/api/v1/autoapply/status');
      renderRunStatus(run);
      if (!run || run.status !== 'running') {
        if (_aaPoll) { clearInterval(_aaPoll); _aaPoll = null; }
        if (run && run.status !== 'running') await loadAutoApply();
      }
    } catch { /* transient */ }
  };
  await tick();
  _aaPoll = setInterval(tick, 3000);
}
