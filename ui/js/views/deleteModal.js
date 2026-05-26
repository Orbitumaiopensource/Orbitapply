// Delete Content Modal — allows users to selectively remove data by section and date

async function openDeleteModal() {
  // Remove any existing modal
  const existing = document.getElementById('delete-modal-overlay');
  if (existing) existing.remove();

  // Show loading overlay while fetching summary
  const loadingOverlay = document.createElement('div');
  loadingOverlay.id = 'delete-modal-overlay';
  loadingOverlay.className = 'dm-overlay';
  loadingOverlay.innerHTML = `
    <div class="dm-modal">
      <div style="padding:48px;text-align:center;color:var(--text-muted)">
        <span class="spinner"></span>
        <div style="margin-top:12px;font-size:13px">Loading data summary...</div>
      </div>
    </div>`;
  document.body.appendChild(loadingOverlay);

  let summary;
  try {
    summary = await API.get('/api/v1/data/summary');
  } catch (err) {
    loadingOverlay.remove();
    alert('Could not load data summary: ' + err.message);
    return;
  }

  loadingOverlay.remove();
  _renderDeleteModal(summary);
}

function _renderDeleteModal(summary) {
  const overlay = document.createElement('div');
  overlay.id = 'delete-modal-overlay';
  overlay.className = 'dm-overlay';

  const scoutDateChips = summary.scoutDates.map(d => `
    <label class="dm-date-chip" id="dm-chip-label-${d}">
      <input type="checkbox" class="dm-scout-date" value="${d}" />
      ${d}
    </label>`).join('');

  const pipelineDateOpts = summary.pipelineDates.length > 0
    ? summary.pipelineDates.map(d => `<option value="${d}">${d}</option>`).join('')
    : '';

  const sessionDateOpts = summary.sessionDates.length > 0
    ? summary.sessionDates.map(d => `<option value="${d}">${d}</option>`).join('')
    : '';

  overlay.innerHTML = `
    <div class="dm-modal" role="dialog" aria-modal="true" aria-labelledby="dm-title">
      <div class="dm-header">
        <div>
          <div class="dm-title" id="dm-title">Delete Content</div>
          <div class="dm-subtitle">Select sections and date ranges to permanently remove. This cannot be undone.</div>
        </div>
        <button class="dm-close" onclick="_closeDeleteModal()" aria-label="Close">&times;</button>
      </div>

      <div class="dm-body">
        <div id="dm-alert"></div>

        <!-- SCOUT Run History -->
        <div class="dm-section" id="dm-section-scout">
          <label class="dm-section-header">
            <input type="checkbox" class="dm-section-check" id="dm-check-scout" onchange="_dmToggleSection('scout')" />
            <div class="dm-section-info">
              <span class="dm-section-name">SCOUT Run History</span>
              <span class="dm-section-meta">${summary.scoutDates.length} run${summary.scoutDates.length !== 1 ? 's' : ''} — affects Dashboard &amp; SCOUT Results</span>
            </div>
          </label>
          <div class="dm-section-options" id="dm-opts-scout" style="display:none">
            ${summary.scoutDates.length === 0 ? '<div class="dm-empty">No scout results found.</div>' : `
            <div class="dm-radio-row">
              <label class="dm-radio-label">
                <input type="radio" name="scout-scope" value="all" checked onchange="_dmScoutScope(this.value)" />
                All dates
              </label>
              <label class="dm-radio-label">
                <input type="radio" name="scout-scope" value="select" onchange="_dmScoutScope(this.value)" />
                Select dates
              </label>
            </div>
            <div id="dm-scout-dates" style="display:none" class="dm-date-grid">
              <div style="display:flex;gap:6px;margin-bottom:6px">
                <button class="btn btn-secondary btn-sm" type="button" onclick="_dmScoutSelectAll(true)">Select All</button>
                <button class="btn btn-secondary btn-sm" type="button" onclick="_dmScoutSelectAll(false)">Deselect All</button>
              </div>
              ${scoutDateChips}
            </div>`}
          </div>
        </div>

        <!-- Pipeline Applications -->
        <div class="dm-section" id="dm-section-pipeline">
          <label class="dm-section-header">
            <input type="checkbox" class="dm-section-check" id="dm-check-pipeline" onchange="_dmToggleSection('pipeline')" />
            <div class="dm-section-info">
              <span class="dm-section-name">Pipeline Applications</span>
              <span class="dm-section-meta">${summary.pipelineCount} application${summary.pipelineCount !== 1 ? 's' : ''} tracked</span>
            </div>
          </label>
          <div class="dm-section-options" id="dm-opts-pipeline" style="display:none">
            ${summary.pipelineCount === 0 ? '<div class="dm-empty">No pipeline applications found.</div>' : `
            <div class="dm-radio-row">
              <label class="dm-radio-label">
                <input type="radio" name="pipeline-scope" value="all" checked onchange="_dmPipelineScope(this.value)" />
                All applications
              </label>
              <label class="dm-radio-label">
                <input type="radio" name="pipeline-scope" value="before" onchange="_dmPipelineScope(this.value)" />
                Applied before date
              </label>
            </div>
            <div id="dm-pipeline-date" style="display:none" class="dm-date-picker-row">
              <label class="dm-date-label">Delete applications applied before:</label>
              ${pipelineDateOpts
                ? `<select class="form-input dm-date-select" id="dm-pipeline-before" style="width:auto">
                    <option value="">— pick a date —</option>
                    ${pipelineDateOpts}
                   </select>`
                : `<input type="date" class="form-input" id="dm-pipeline-before" style="width:160px" />`}
            </div>`}
          </div>
        </div>

        <!-- Session Logs -->
        <div class="dm-section" id="dm-section-sessions">
          <label class="dm-section-header">
            <input type="checkbox" class="dm-section-check" id="dm-check-sessions" onchange="_dmToggleSection('sessions')" />
            <div class="dm-section-info">
              <span class="dm-section-name">Session Logs</span>
              <span class="dm-section-meta">${summary.sessionCount} session${summary.sessionCount !== 1 ? 's' : ''} stored</span>
            </div>
          </label>
          <div class="dm-section-options" id="dm-opts-sessions" style="display:none">
            ${summary.sessionCount === 0 ? '<div class="dm-empty">No session logs found.</div>' : `
            <div class="dm-radio-row">
              <label class="dm-radio-label">
                <input type="radio" name="sessions-scope" value="all" checked onchange="_dmSessionsScope(this.value)" />
                All sessions
              </label>
              <label class="dm-radio-label">
                <input type="radio" name="sessions-scope" value="before" onchange="_dmSessionsScope(this.value)" />
                Sessions before date
              </label>
            </div>
            <div id="dm-sessions-date" style="display:none" class="dm-date-picker-row">
              <label class="dm-date-label">Delete sessions started before:</label>
              ${sessionDateOpts
                ? `<select class="form-input dm-date-select" id="dm-sessions-before" style="width:auto">
                    <option value="">— pick a date —</option>
                    ${sessionDateOpts}
                   </select>`
                : `<input type="date" class="form-input" id="dm-sessions-before" style="width:160px" />`}
            </div>`}
          </div>
        </div>

        <!-- Profile Data -->
        <div class="dm-section" id="dm-section-profile">
          <label class="dm-section-header">
            <input type="checkbox" class="dm-section-check" id="dm-check-profile" onchange="_dmToggleSection('profile')" />
            <div class="dm-section-info">
              <span class="dm-section-name">Profile Data</span>
              <span class="dm-section-meta">Clears profile.json and resume.md — you will need to re-enter your profile</span>
            </div>
          </label>
          <div class="dm-section-options" id="dm-opts-profile" style="display:none">
            <div class="dm-warn-box">
              Warning: This clears your entire profile and resume. The agents will not be able to generate documents until you re-configure Profile Setup.
            </div>
          </div>
        </div>

        <!-- Config -->
        <div class="dm-section" id="dm-section-config">
          <label class="dm-section-header">
            <input type="checkbox" class="dm-section-check" id="dm-check-config" onchange="_dmToggleSection('config')" />
            <div class="dm-section-info">
              <span class="dm-section-name">Config</span>
              <span class="dm-section-meta">Resets budget, guardian limits, and output folder to defaults</span>
            </div>
          </label>
          <div class="dm-section-options" id="dm-opts-config" style="display:none">
            <div class="dm-info-box">
              Resets: daily budget ($5), max applies/day (15), rate limit (45s). Your API keys and agent model settings are preserved.
            </div>
          </div>
        </div>
      </div>

      <div class="dm-footer">
        <button class="btn btn-secondary" onclick="_closeDeleteModal()">Cancel</button>
        <button class="btn btn-danger" id="dm-delete-btn" onclick="_dmConfirmDelete()">Delete Selected</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) _closeDeleteModal();
  });
}

function _closeDeleteModal() {
  const overlay = document.getElementById('delete-modal-overlay');
  if (overlay) overlay.remove();
}

function _dmToggleSection(section) {
  const checked = document.getElementById(`dm-check-${section}`)?.checked;
  const opts = document.getElementById(`dm-opts-${section}`);
  if (opts) opts.style.display = checked ? 'block' : 'none';
}

function _dmScoutScope(value) {
  const datesEl = document.getElementById('dm-scout-dates');
  if (datesEl) datesEl.style.display = value === 'select' ? 'block' : 'none';
}

function _dmScoutSelectAll(select) {
  document.querySelectorAll('.dm-scout-date').forEach(cb => { cb.checked = select; });
}

function _dmPipelineScope(value) {
  const dateEl = document.getElementById('dm-pipeline-date');
  if (dateEl) dateEl.style.display = value === 'before' ? 'block' : 'none';
}

function _dmSessionsScope(value) {
  const dateEl = document.getElementById('dm-sessions-date');
  if (dateEl) dateEl.style.display = value === 'before' ? 'block' : 'none';
}

async function _dmConfirmDelete() {
  const payload = {};
  let noneSelected = true;

  // Scout
  if (document.getElementById('dm-check-scout')?.checked) {
    const scopeEl = document.querySelector('input[name="scout-scope"]:checked');
    const scope = scopeEl?.value || 'all';
    if (scope === 'all') {
      payload.scoutResults = { all: true };
    } else {
      const dates = [...document.querySelectorAll('.dm-scout-date:checked')].map(cb => cb.value);
      if (dates.length === 0) {
        _dmShowAlert('Please select at least one date to delete from SCOUT Run History.');
        return;
      }
      payload.scoutResults = { dates };
    }
    noneSelected = false;
  }

  // Pipeline
  if (document.getElementById('dm-check-pipeline')?.checked) {
    const scopeEl = document.querySelector('input[name="pipeline-scope"]:checked');
    const scope = scopeEl?.value || 'all';
    if (scope === 'all') {
      payload.pipeline = { all: true };
    } else {
      const before = document.getElementById('dm-pipeline-before')?.value;
      if (!before) {
        _dmShowAlert('Please select a cutoff date for Pipeline Applications.');
        return;
      }
      payload.pipeline = { before };
    }
    noneSelected = false;
  }

  // Sessions
  if (document.getElementById('dm-check-sessions')?.checked) {
    const scopeEl = document.querySelector('input[name="sessions-scope"]:checked');
    const scope = scopeEl?.value || 'all';
    if (scope === 'all') {
      payload.sessions = { all: true };
    } else {
      const before = document.getElementById('dm-sessions-before')?.value;
      if (!before) {
        _dmShowAlert('Please select a cutoff date for Session Logs.');
        return;
      }
      payload.sessions = { before };
    }
    noneSelected = false;
  }

  // Profile
  if (document.getElementById('dm-check-profile')?.checked) {
    payload.profile = true;
    noneSelected = false;
  }

  // Config
  if (document.getElementById('dm-check-config')?.checked) {
    payload.config = true;
    noneSelected = false;
  }

  if (noneSelected) {
    _dmShowAlert('No sections selected. Check at least one section to delete.');
    return;
  }

  // Build confirmation message
  const lines = [];
  if (payload.scoutResults) {
    lines.push(payload.scoutResults.all
      ? 'All SCOUT run history'
      : `SCOUT results for ${payload.scoutResults.dates.length} date(s): ${payload.scoutResults.dates.join(', ')}`);
  }
  if (payload.pipeline) {
    lines.push(payload.pipeline.all ? 'All pipeline applications' : `Pipeline applications applied before ${payload.pipeline.before}`);
  }
  if (payload.sessions) {
    lines.push(payload.sessions.all ? 'All session logs' : `Session logs before ${payload.sessions.before}`);
  }
  if (payload.profile) lines.push('Profile data (profile.json + resume.md)');
  if (payload.config) lines.push('Config (reset to defaults)');

  const confirmed = confirm(
    `Permanently delete the following?\n\n• ${lines.join('\n• ')}\n\nThis cannot be undone.`
  );
  if (!confirmed) return;

  const btn = document.getElementById('dm-delete-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }

  try {
    const result = await API.delete('/api/v1/data', payload);
    _closeDeleteModal();

    const summary = _buildDeleteSummary(result.deleted);
    // Refresh current view after deletion
    const viewName = typeof currentView !== 'undefined' ? currentView : null;
    if (viewName && typeof VIEWS !== 'undefined' && VIEWS[viewName]) {
      VIEWS[viewName]();
    }

    // Show a brief success toast
    _dmShowToast(`Deleted: ${summary}`);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete Selected'; }
    _dmShowAlert('Delete failed: ' + err.message);
  }
}

function _buildDeleteSummary(deleted) {
  const parts = [];
  if (deleted.scoutResults != null) parts.push(`${deleted.scoutResults} scout run(s)`);
  if (deleted.pipeline != null) parts.push(`${deleted.pipeline} pipeline app(s)`);
  if (deleted.sessions != null) parts.push(`${deleted.sessions} session(s)`);
  if (deleted.profile) parts.push('profile');
  if (deleted.config) parts.push('config reset');
  return parts.join(', ') || 'nothing';
}

function _dmShowAlert(msg) {
  const alertEl = document.getElementById('dm-alert');
  if (alertEl) {
    alertEl.innerHTML = `<div class="alert alert-error" style="margin-bottom:12px">${msg}</div>`;
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function _dmShowToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'dm-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('dm-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('dm-toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
