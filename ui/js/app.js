const VIEWS = {
  dashboard: renderDashboard,
  profile: renderProfile,
  scout: renderScout,
  pipeline: renderPipeline,
  autoApply: renderAutoApply,
  humanQueue: renderHumanQueue,
  sessions: renderSessions,
  config: renderConfig,
};

let currentView = 'dashboard';
let pollTimer = null;

function navigate(view) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }

  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });

  currentView = view;
  const fn = VIEWS[view];
  if (fn) fn();
}

document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    navigate(a.dataset.view);
  });
});

navigate('dashboard');
