/* A drum ("rolodex") time picker. Touch, mouse wheel and drag scroll the drum (scroll-snap);
   the native <select> beside it is the keyboard and screen-reader control — arrow keys, Home/End and
   Page Up/Down move between selectable times, and its disabled options mirror the greyed rows.
   Greyed rows can never be chosen: the drum settles on the nearest selectable row instead. */
window.BookingWheel = (root, { label, onChange = () => {} }) => {
  const ROW = 44, id = 'wheel-' + Math.random().toString(36).slice(2, 8);
  root.classList.add('wheel');
  root.innerHTML = `<label class="wheel-label" for="${id}">${label}</label>
    <div class="wheel-window"><div class="wheel-track" aria-hidden="true"></div><div class="wheel-lens" aria-hidden="true"></div></div>
    <select class="wheel-native" id="${id}"></select>`;
  const track = root.querySelector('.wheel-track'), select = root.querySelector('select');
  let options = [], value = null, settleTimer = null, lastTop = 0, programmatic = false;

  const indexOf = v => options.findIndex(o => o.value === v);
  const enabled = i => options[i] && !options[i].disabled;
  function nearestEnabled(i, dir = 1) {
    for (let d = 0; d < options.length; d++) {
      for (const j of dir >= 0 ? [i + d, i - d] : [i - d, i + d]) if (enabled(j)) return j;
    }
    return -1;
  }
  function paint() {
    for (const [i, el] of [...track.children].entries()) {
      el.classList.toggle('is-selected', options[i]?.value === value);
    }
    select.value = value == null ? '' : String(value);
  }
  function scrollToIndex(i, smooth) {
    programmatic = true;
    track.scrollTo({ top: i * ROW, behavior: smooth ? 'smooth' : 'auto' });
    lastTop = i * ROW;
    setTimeout(() => { programmatic = false; }, smooth ? 350 : 0);
  }
  function choose(i, { smooth = true, silent = false } = {}) {
    if (i < 0) { value = null; paint(); if (!silent) onChange(null); return; }
    const changed = options[i].value !== value;
    value = options[i].value; paint(); scrollToIndex(i, smooth);
    if (changed && !silent) onChange(value);
  }
  // After the drum stops: snap to the row under the lens, or the nearest selectable one.
  function settle() {
    const raw = Math.round(track.scrollTop / ROW), dir = Math.sign(track.scrollTop - lastTop) || 1;
    const i = Math.max(0, Math.min(options.length - 1, raw));
    choose(enabled(i) ? i : nearestEnabled(i, dir));
  }
  track.addEventListener('scroll', () => {
    if (programmatic) return;
    clearTimeout(settleTimer); settleTimer = setTimeout(settle, 130);
  }, { passive: true });
  track.addEventListener('click', e => {
    const row = e.target.closest('[data-i]'); if (!row) return;
    const i = Number(row.dataset.i); if (enabled(i)) choose(i);
  });
  select.addEventListener('keydown', e => {
    const i = Math.max(0, indexOf(value)), moves = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 };
    let target = null;
    if (e.key in moves) {
      const step = Math.sign(moves[e.key]);
      let j = i + moves[e.key];
      j = Math.max(0, Math.min(options.length - 1, j));
      while (j >= 0 && j < options.length && !enabled(j)) j += step;
      target = enabled(j) ? j : null;
    } else if (e.key === 'Home') target = options.findIndex((_, j) => enabled(j));
    else if (e.key === 'End') target = options.map((_, j) => j).reverse().find(j => enabled(j)) ?? -1;
    else return;
    e.preventDefault();
    if (target != null && target >= 0) choose(target);
  });
  select.addEventListener('change', () => { const i = indexOf(Number(select.value)); if (enabled(i)) choose(i); });

  return {
    get value() { return value; },
    /** options: [{ value, label, disabled, title?, gap? }]. Keeps `want` if selectable, else the nearest. */
    set(next, want) {
      options = next;
      track.innerHTML = options.map((o, i) => `<div class="wheel-row${o.disabled ? ' is-disabled' : ''}${o.gap ? ' is-gap' : ''}" data-i="${i}"${o.title ? ` title="${o.title}"` : ''}>${o.label}</div>`).join('');
      select.innerHTML = options.map(o => `<option value="${o.value}"${o.disabled ? ' disabled' : ''}>${o.label}${o.disabled && o.title ? ` — ${o.title}` : ''}</option>`).join('');
      const at = indexOf(want ?? value);
      choose(enabled(at) ? at : nearestEnabled(Math.max(0, at), 1), { smooth: false, silent: true });
      return value;
    },
    disable(flag) { select.disabled = flag; root.classList.toggle('is-off', flag); },
    hide(flag) { root.hidden = flag; },
  };
};
