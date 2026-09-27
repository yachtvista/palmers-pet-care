/* Refresh visible calendars without overlapping requests or replaying stale reads over writes. */
window.calendarSync = ({ read, apply, paused = () => false, onError = () => {} }) => {
  let timer, controller, running = false, revision = 0, stopped = false;
  const note = document.querySelector('[data-calendar-sync]');
  const schedule = () => { clearTimeout(timer); if (!stopped && !document.hidden) timer = setTimeout(refresh, 5000); };
  async function refresh() {
    clearTimeout(timer);
    if (stopped || document.hidden) return;
    if (running) return;
    if (paused()) { schedule(); return; }
    running = true;
    const started = revision;
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const data = await read(controller.signal);
      if (!stopped && started === revision && !paused()) {
        apply(data);
        if (note) note.textContent = 'Updates automatically every few seconds.';
      }
    } catch (error) {
      if (!stopped && started === revision) {
        onError(error);
        if (error.status === 403) stopped = true;
        if (note) note.textContent = stopped ? error.message : 'Connection interrupted. Retrying automatically…';
      }
    } finally { clearTimeout(timeout); controller = null; running = false; schedule(); }
  }
  const wake = () => { if (!document.hidden) refresh(); else clearTimeout(timer); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); controller?.abort(); });
  window.addEventListener('pageshow', () => { stopped = false; refresh(); });
  schedule();
  return { refresh, invalidate() { revision++; controller?.abort(); } };
};
