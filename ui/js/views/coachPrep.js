// Interview Prep (COACH) — modal helpers used by the Pipeline view.
// Kept in its own file because pipeline.js has duplicate function blocks;
// these are global so the modal's inline onclick handlers can reach them.

function renderPrepMarkdown(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(md)
    .replace(/^### (.*)$/gm, '<div style="font-weight:600;margin:10px 0 4px">$1</div>')
    .replace(/^## (.*)$/gm, '<div style="font-weight:700;font-size:13.5px;color:var(--text-1);margin:14px 0 6px">$1</div>')
    .replace(/^# (.*)$/gm, '<div style="font-weight:700;font-size:15px;margin:14px 0 6px">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.*)$/gm, '<div style="margin:2px 0 2px 14px">• $1</div>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

async function loadPrep(id) {
  const box = el('modal-prep');
  if (box) box.innerHTML = '<span style="color:var(--text-muted)">Loading…</span>';
  try {
    const { content } = await API.get(`/api/v1/documents/${id}/prep`);
    if (!content) {
      box.innerHTML = '<span style="color:var(--text-muted)">No prep pack yet. Click “Generate / Refresh”.</span>';
      return;
    }
    box.innerHTML = renderPrepMarkdown(content);
  } catch (err) {
    showAlert('modal-alert', err.message, 'error');
  }
}

async function generatePrep(id) {
  const box = el('modal-prep');
  if (box) box.innerHTML = '<span style="color:var(--text-muted)">Generating prep pack… this can take ~30–60s.</span>';
  try {
    const { content } = await API.post(`/api/v1/documents/${id}/prep`);
    box.innerHTML = content
      ? renderPrepMarkdown(content)
      : '<span style="color:var(--text-muted)">Generated, but no content returned.</span>';
    showAlert('modal-alert', 'Interview prep pack generated.', 'success');
  } catch (err) {
    if (box) box.innerHTML = '';
    showAlert('modal-alert', err.message, 'error');
  }
}
