const API = {
  async get(path) {
    const r = await fetch(path);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  },
  async post(path, body = {}) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  },
  async put(path, body = {}) {
    const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  },
  async patch(path, body = {}) {
    const r = await fetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  },
  async delete(path, body = {}) {
    const r = await fetch(path, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  },
};

function el(id) { return document.getElementById(id); }

function tip(text) {
  const safe = String(text).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<span class="tip" data-tip="${safe}" aria-label="${safe}" tabindex="0">?</span>`;
}

function badge(text, type = 'gray') {
  return `<span class="badge badge-${type}">${text}</span>`;
}

function fitBadge(score) {
  const n = Number(score);
  const cls = n >= 80 ? 'fit-high' : n >= 60 ? 'fit-mid' : 'fit-low';
  return `<span class="fit-score ${cls}">${n}</span>`;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function showAlert(containerId, msg, type = 'error') {
  const el_ = el(containerId);
  if (!el_) return;
  el_.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
}

function clearAlert(containerId) {
  const el_ = el(containerId);
  if (el_) el_.innerHTML = '';
}

function stageColor(stage) {
  const map = { applied: 'blue', viewed: 'yellow', phone_screen: 'orange', interview_1: 'orange', interview_2: 'orange', offer: 'green', rejected: 'red', withdrawn: 'gray' };
  return map[stage] || 'gray';
}
