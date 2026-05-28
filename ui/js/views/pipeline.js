const STAGES = ['applied','viewed','phone_screen','interview_1','interview_2','offer','rejected','withdrawn'];
const STAGE_LABELS = { applied:'Applied', viewed:'Viewed', phone_screen:'Phone Screen', interview_1:'Interview I', interview_2:'Interview II', offer:'Offer', rejected:'Rejected', withdrawn:'Withdrawn' };

let _dragAppId = null;
let _dragOriginStage = null;
let _isDragging = false;

async function renderPipeline() {
  const main = el('main-content');
  main.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Pipeline</h1>
          <p class="page-sub">All applications tracked by LEDGER — drag or select to update stage</p>
        </div>
      </div>
    </div>
    <div id="pipeline-alert"></div>
    <div id="pipeline-stats" class="stat-row" style="margin-bottom:var(--gap)"></div>
    <div class="kanban-scroll-top" id="kanban-scroll-top"><div class="kanban-scroll-top-inner" id="kanban-scroll-top-inner"></div></div>
    <div class="kanban-scroll-wrapper" id="kanban-scroll-wrapper">
      <div class="kanban" id="kanban-board"></div>
    </div>
    <div id="app-detail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:999;align-items:center;justify-content:center"></div>
  `;
  await loadPipeline();
}

async function loadPipeline() {
  try {
    const data = await API.get('/api/v1/pipeline');
    const stats = data.stats || {};
    const apps = data.applications || [];

    el('pipeline-stats').innerHTML = `
      <div class="stat-card accent"><div class="stat-label">Total Applied</div><div class="stat-value">${stats.total_applied || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Response Rate</div><div class="stat-value">${stats.response_rate || 0}%</div></div>
      <div class="stat-card"><div class="stat-label">Budget Used</div><div class="stat-value">$${(stats.budget_used_usd || 0).toFixed(2)}</div><div class="stat-sub">of $5.00 daily cap</div></div>
      <div class="stat-card"><div class="stat-label">Applied Today</div><div class="stat-value">${stats.today_count || 0}</div><div class="stat-sub">of 15 max</div></div>
    `;

    if (!apps.length) {
      el('kanban-board').innerHTML = `
        <div class="card" style="width:100%;padding:0">
          <div class="empty-state">
            <div class="empty-state-title">No applications yet</div>
            <div class="empty-state-sub">The pipeline tracks every job you apply to and where it stands. To get your first card here:</div>
            <ol class="empty-state-steps">
              <li>Open <b>SCOUT Results</b> and run a search (or import a job by URL).</li>
              <li>Click <b>Generate Docs</b> on a job — TAILOR builds the resume + cover letter.</li>
              <li>That job appears here in <b>Applied</b>. Drag the card across stages as you progress.</li>
            </ol>
            <div class="empty-state-actions">
              <button class="btn btn-primary btn-sm" onclick="navigate('scout')">Go to SCOUT</button>
              <button class="btn btn-secondary btn-sm" onclick="navigate('dashboard')">Open Dashboard</button>
            </div>
          </div>
        </div>`;
      return;
    }

    const byStage = {};
    STAGES.forEach(s => { byStage[s] = []; });
    apps.forEach(a => { if (byStage[a.status]) byStage[a.status].push(a); });

    el('kanban-board').innerHTML = STAGES.map(stage => `
      <div class="kanban-col">
        <div class="kanban-col-header">
          ${STAGE_LABELS[stage]}
          <span class="kanban-col-count" id="col-count-${stage}">${byStage[stage].length}</span>
        </div>
        <div class="kanban-col-body" id="col-${stage}" data-stage="${stage}">
          ${byStage[stage].map(app => kanbanCard(app)).join('')}
          <div class="kanban-drop-hint">Drop here</div>
        </div>
      </div>`).join('');

    attachDragHandlers();

  } catch (err) {
    showAlert('pipeline-alert', err.message, 'error');
  }

  // Sync top ↔ bottom scrollbars
  const wrapper = el('kanban-scroll-wrapper');
  const topBar = el('kanban-scroll-top');
  const topInner = el('kanban-scroll-top-inner');
  if (wrapper && topBar && topInner) {
    topInner.style.width = wrapper.scrollWidth + 'px';
    let syncing = false;
    wrapper.addEventListener('scroll', () => {
      if (syncing) return; syncing = true;
      topBar.scrollLeft = wrapper.scrollLeft;
      syncing = false;
    });
    topBar.addEventListener('scroll', () => {
      if (syncing) return; syncing = true;
      wrapper.scrollLeft = topBar.scrollLeft;
      syncing = false;
    });
  }
}

function kanbanCard(app) {
  return `
    <div class="kanban-card" draggable="true" data-id="${app.id}" data-stage="${app.status}"
         onclick="handleCardClick(event, '${app.id}')">
      <div class="kanban-card-title">${app.title}</div>
      <div class="kanban-card-company">${app.company}</div>
      <div class="kanban-card-meta">
        ${fitBadge(app.fitScore)}
        <span style="font-size:11px;color:var(--text-muted)">${timeAgo(app.appliedAt)}</span>
      </div>
    </div>`;
}

function handleCardClick(e, id) {
  if (_isDragging) return;
  openAppDetail(id);
}

function attachDragHandlers() {
  // Cards — dragstart / dragend
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      _isDragging = true;
      _dragAppId = card.dataset.id;
      _dragOriginStage = card.dataset.stage;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('kanban-card--dragging'), 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('kanban-card--dragging');
      document.querySelectorAll('.kanban-col-body').forEach(col => col.classList.remove('kanban-col--over'));
      setTimeout(() => { _isDragging = false; }, 50);
    });
  });

  // Columns — dragover / dragleave / drop
  document.querySelectorAll('.kanban-col-body').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('kanban-col--over');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('kanban-col--over');
    });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('kanban-col--over');
      const newStage = col.dataset.stage;
      if (!_dragAppId || newStage === _dragOriginStage) return;
      try {
        await API.patch(`/api/v1/pipeline/${_dragAppId}/status`, { status: newStage });
        await loadPipeline();
      } catch (err) {
        showAlert('pipeline-alert', err.message, 'error');
      } finally {
        _dragAppId = null;
        _dragOriginStage = null;
      }
    });
  });
}

async function openAppDetail(id) {
  try {
    const data = await API.get('/api/v1/pipeline');
    const app = (data.applications || []).find(a => a.id === id);
    if (!app) return;

    const alreadySubmitted = !!app.submittedAt;

    const modal = el('app-detail-modal');
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--r-card);padding:28px;width:min(820px,92vw);max-height:90vh;overflow-y:auto;position:relative">
        <button onclick="closeModal()" style="position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;color:var(--text-2);line-height:1">✕</button>
        <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">${app.title}</h2>
        <p style="font-size:14px;color:var(--text-2);margin-bottom:16px">${app.company}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
          ${badge(STAGE_LABELS[app.status], stageColor(app.status))}
          ${fitBadge(app.fitScore)}
          ${badge(app.platform || 'direct', 'blue')}
          ${alreadySubmitted ? '<span class="badge badge-green">SUBMITTED</span>' : ''}
        </div>
        <div style="margin-bottom:16px">
          <div class="form-label" style="margin-bottom:8px">Update Status</div>
          <select id="modal-status" class="form-input" style="max-width:220px">
            ${STAGES.map(s => `<option value="${s}" ${s === app.status ? 'selected' : ''}>${STAGE_LABELS[s]}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="updateAppStatus('${app.id}')">Update</button>
        </div>
        <div style="margin-bottom:16px">
          <div class="form-label" style="margin-bottom:8px">Notes</div>
          <textarea id="modal-notes" class="form-input form-textarea" rows="3">${app.notes || ''}</textarea>
          <button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="saveNotes('${app.id}')">Save Notes</button>
        </div>
        <div style="margin-bottom:16px">
          <div class="form-label" style="margin-bottom:8px">Documents · TAILOR</div>
          <button class="btn btn-secondary btn-sm" onclick="openDocEditor('${app.id}','resume')">Edit Resume</button>
          <button class="btn btn-secondary btn-sm" style="margin-left:8px" onclick="openDocEditor('${app.id}','cover')">Edit Cover Letter</button>
          <div id="modal-doc-editor" style="margin-top:12px"></div>
        </div>
        <div style="margin-bottom:16px">
          <div class="form-label" style="margin-bottom:8px">Interview Prep · COACH</div>
          <button class="btn btn-secondary btn-sm" onclick="loadPrep('${app.id}')">View Prep Pack</button>
          <button class="btn btn-primary btn-sm" style="margin-left:8px" onclick="generatePrep('${app.id}')">Generate / Refresh</button>
          <div id="modal-prep" style="margin-top:12px;font-size:12.5px;line-height:1.55;color:var(--text-2);max-height:320px;overflow-y:auto"></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted)">
          Added to pipeline: ${new Date(app.appliedAt).toLocaleDateString()} · Follow-up due: ${app.followUpDue ? new Date(app.followUpDue).toLocaleDateString() : '—'}
          ${app.url ? `<br><a href="${app.url}" target="_blank" style="color:var(--accent-dark);font-weight:600">View Job Posting ↗</a>` : ''}
        </div>
        <div id="modal-alert" style="margin-top:10px"></div>
      </div>`;
  } catch (err) {
    showAlert('pipeline-alert', 'Failed to load application details.', 'error');
  }
}

function closeModal() {
  const m = el('app-detail-modal');
  if (m) m.style.display = 'none';
}

async function openDocEditor(jobId, type) {
  const editorDiv = el('modal-doc-editor');
  if (!editorDiv) return;
  editorDiv.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">Loading...</div>`;
  try {
    const data = await API.get(`/api/v1/documents/${jobId}/text`);
    const text = type === 'resume' ? data.resume : data.cover;
    const label = type === 'resume' ? 'Resume' : 'Cover Letter';
    const safeText = (text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    editorDiv.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
        <div style="font-size:12px;font-weight:600">${label} — full content (Save regenerates the PDF)</div>
        <div style="font-size:11px;color:var(--text-muted)">Tip: edit freely, then click Save</div>
      </div>
      <textarea id="doc-editor-textarea" class="form-input form-textarea" wrap="soft"
        style="width:100%;height:60vh;min-height:420px;font-family:'Consolas','Menlo',monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-wrap:break-word;resize:vertical">${safeText}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="saveDocEdit('${jobId}','${type}')">Save &amp; Regenerate PDF</button>
        <button class="btn btn-secondary btn-sm" onclick="toggleRegenPanel()">↻ Regenerate with AI</button>
        <button class="btn btn-secondary btn-sm" onclick="el('modal-doc-editor').innerHTML=''">Cancel</button>
      </div>
      <div id="doc-regen-panel" style="display:none;margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-2)">
        <div style="font-size:12px;font-weight:600;margin-bottom:4px">Re-run TAILOR for this ${label.toLowerCase()}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Leave blank to regenerate with the default prompt, or add instructions (e.g. "shorter summary", "emphasize Python", "more concise"). Costs Sonnet tokens.</div>
        <textarea id="doc-regen-prompt" class="form-input form-textarea" rows="3"
          style="font-size:12px" placeholder="Optional instructions..."></textarea>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="doc-regen-btn" class="btn btn-primary btn-sm" onclick="regenerateDoc('${jobId}','${type}')">Run Regenerate</button>
          <button class="btn btn-secondary btn-sm" onclick="toggleRegenPanel()">Close</button>
        </div>
      </div>
      <div id="doc-editor-alert" style="margin-top:6px"></div>`;
  } catch (err) {
    editorDiv.innerHTML = `<div style="font-size:12px;color:var(--danger)">Failed to load document text.</div>`;
  }
}

function toggleRegenPanel() {
  const panel = el('doc-regen-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function saveDocEdit(jobId, type) {
  const textarea = el('doc-editor-textarea');
  if (!textarea) return;
  const content = textarea.value;
  try {
    await API.patch(`/api/v1/documents/${jobId}`, { type, content });
    showAlert('doc-editor-alert', 'Saved — PDF regenerated.', 'success');
  } catch (err) {
    showAlert('doc-editor-alert', 'Save failed: ' + err.message, 'error');
  }
}

async function regenerateDoc(jobId, type) {
  const promptEl = el('doc-regen-prompt');
  const btn = el('doc-regen-btn');
  const textarea = el('doc-editor-textarea');
  const prompt = promptEl ? promptEl.value : '';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Regenerating...'; }
  clearAlert('doc-editor-alert');
  try {
    const r = await API.post(`/api/v1/documents/${jobId}/regenerate`, { type, prompt });
    if (textarea && r.content) textarea.value = r.content;
    const ats = r.atsScore ? ` (ATS ${r.atsScore}/100)` : '';
    showAlert('doc-editor-alert', `Regenerated${ats} — PDF rebuilt.`, 'success');
    if (promptEl) promptEl.value = '';
  } catch (err) {
    showAlert('doc-editor-alert', 'Regenerate failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Run Regenerate'; }
  }
}

async function updateAppStatus(id) {
  try {
    const status = el('modal-status')?.value;
    await API.patch(`/api/v1/pipeline/${id}/status`, { status });
    closeModal();
    await loadPipeline();
  } catch (err) {
    showAlert('modal-alert', err.message, 'error');
  }
}

async function saveNotes(id) {
  try {
    const notes = el('modal-notes')?.value;
    await API.patch(`/api/v1/pipeline/${id}/notes`, { notes });
    showAlert('modal-alert', 'Notes saved.', 'success');
  } catch (err) {
    showAlert('modal-alert', err.message, 'error');
  }
}
