/* The activity booker — one booking = a chain of activities from one start time.
   Daytime: choose a start, add a dog walk or home visit, extend it (+30 min / +1 hr adds that
   product: 1 hr + 30 min = 1 hr 30 min), add more activities; the end time is where the chain ends.
   Overnight: fixed 20:00 → 08:00 (no dog walks during it); the customer may push the end time later
   and must fill exactly that extra time with walks or visits of their choice.
   Rules come from booking-slots.js (the server's own rule set); prices from the API's service list.
   Used by bookings.html (customer) and admin-calendar.html (admin: gap times allowed, flagged). */
window.ActivityBooker = (root, opts) => {
  const S = window.BookingSlots;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(p / 100);
  const KIND_NAME = { walk: 'Dog walk', visit: 'Home visit', overnight: 'Overnight house-sit' };
  const ADDABLE = [['walk30', 'Dog walk', '30 min'], ['walk60', 'Dog walk', '1 hr'], ['visit30', 'Home visit', '30 min'], ['visit60', 'Home visit', '1 hr']];
  const shortDay = date => new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const admin = !!opts.admin;
  let st = { date: null, overnight: false, products: [], until: null, excludeId: null, half: null, pets: [] };

  root.classList.add('booker');
  root.innerHTML = `
    <div class="booker-when" data-daytime><div data-from></div></div>
    <div class="booker-when booker-night" data-night hidden>
      <p class="night-base" data-night-base></p>
      <label>Stay until<select data-until></select></label>
      <p class="night-fill" data-night-fill aria-live="polite"></p>
    </div>
    <h3 class="booker-h">Activities</h3>
    <ol class="booker-list" data-list></ol>
    <div class="booker-add" data-add-wrap><p class="booker-add-label" data-add-label>Add an activity</p><div class="booker-add-buttons" data-add></div></div>
    <p class="picker-reason" data-reason aria-live="polite"></p>
    <p class="picker-summary" data-summary aria-live="polite"></p>
    <div class="booking-cost" data-cost aria-live="polite"></div>`;
  const $ = s => root.querySelector(s);
  const fromWheel = window.BookingWheel($('[data-from]'), { label: 'Start time', onChange: () => render() });

  const service = id => opts.services().find(s => s.id === id);
  // Mirrors the API's extra-pet rule (the API is the price authority; this is the estimate).
  function priceOf(id) {
    const s = service(id), ps = st.pets; if (!s) return 0;
    const extra = id === 'sitting'
      ? ps.slice().sort((a, b) => (b.species === 'Dog') - (a.species === 'Dog')).slice(1).reduce((n, p) => n + (p.species === 'Dog' ? 800 : p.species === 'Cat' ? 400 : 0), 0)
      : (s.extra || 0) * (S.KIND[id] === 'visit' ? ps.slice(1).filter(p => p.species !== 'Dog').length : Math.max(0, ps.length - 1));
    return s.rate + extra;
  }
  const lengthOf = products => products.reduce((n, id) => n + S.PRODUCT_MIN[id], 0);
  const startHHMM = () => st.overnight ? S.OVERNIGHT_START : (fromWheel.value == null ? null : S.toHHMM(fromWheel.value));
  const others = () => opts.others(st.date, st.excludeId);
  const nowAt = () => { const n = opts.now(); return S.absAt(n.date, n.time); };
  const closedOn = (startAt, endAt) => { for (let d = Math.floor(startAt / S.DAY); d * S.DAY < endAt; d++) if (opts.isClosed(S.dateOf(d * S.DAY))) return true; return false; };
  // Why [startAt, endAt) can't be booked, or null. For the admin, 'gap' is allowed (flagged).
  function blockReason(startAt, endAt) {
    if (closedOn(startAt, endAt)) return 'closed';
    if (startAt < nowAt()) return 'past';
    const c = S.conflictWith(startAt, endAt, others());
    return c === 'gap' && admin ? null : c;
  }
  const isGap = (startAt, endAt) => S.conflictWith(startAt, endAt, others()) === 'gap';

  // Consecutive products of one kind form a line ("Dog walk 1 hr 30 min"); the overnight is its own line.
  function lines() {
    const out = [];
    st.products.forEach((id, i) => {
      const kind = S.KIND[id], last = out[out.length - 1];
      if (last && last.kind === kind && kind !== 'overnight') last.idx.push(i); else out.push({ kind, idx: [i] });
    });
    return out;
  }
  const dogsOnly = () => st.pets.length > 0 && st.pets.every(p => p.species === 'Dog');
  // Would the chain with `products` be bookable? → null or a reason key.
  function chainReason(products) {
    const start = startHHMM(); if (!start || !products.length) return null;
    const shape = S.planError(st.date, start, products);
    if (shape) return 'hours';
    const c = S.chain(st.date, start, products);
    return blockReason(c.startAt, c.endAt);
  }

  function render() {
    if (!st.date) return; // nothing to show until open()
    const daytime = !st.overnight;
    root.querySelector('[data-daytime]').hidden = !daytime;
    root.querySelector('[data-night]').hidden = daytime;
    const len = lengthOf(st.products);
    // Daytime start: grey every start the current chain can't use.
    if (daytime) {
      const ctx = { others: others(), closed: opts.isClosed(st.date), nowAt: nowAt() };
      let starts = S.startOptions(st.date, len, ctx);
      if (st.half) starts = starts.filter(o => st.half === 'am' ? o.min < 720 : o.min >= 720);
      const keep = fromWheel.value;
      fromWheel.set(starts.map(o => ({ value: o.min, label: o.label, disabled: !!o.reason && !(admin && o.reason === 'gap'), gap: o.reason === 'gap', title: o.reason ? S.REASONS[o.reason] : '' })), keep);
      st.starts = starts;
    } else renderNight();
    const start = startHHMM(), c = start && st.products.length ? S.chain(st.date, start, st.products) : null;
    // Lines with their times, price and extend/shorten/remove controls.
    $('[data-list]').innerHTML = lines().map((ln, li) => {
      const segs = ln.idx.map(i => c?.segments[i]).filter(Boolean), mins = ln.idx.reduce((n, i) => n + S.PRODUCT_MIN[st.products[i]], 0);
      const price = ln.idx.reduce((n, i) => n + priceOf(st.products[i]), 0);
      const when = segs.length ? `${S.timeOf(segs[0].startAt)}–${S.timeOf(segs[segs.length - 1].endAt)}${S.dateOf(segs[segs.length - 1].endAt) !== st.date ? ` ${shortDay(S.dateOf(segs[segs.length - 1].endAt))}` : ''}` : '';
      const parts = ln.idx.map(i => S.PRODUCT_MIN[st.products[i]] === 60 ? '1 hr' : '30 min').join(' + ');
      if (ln.kind === 'overnight') return `<li class="booker-line is-night"><div class="line-head"><strong>${KIND_NAME.overnight}</strong> · 12 hr · ${esc(when)}<span class="line-price">${money(price)}</span></div><p class="line-note">Dog walks are not part of the overnight. Daytime attendance is not included unless you extend the end time below.</p></li>`;
      const ext = [['30', ln.kind + '30'], ['60', ln.kind + '60']].map(([m, id]) => {
        const next = st.products.slice(); next.splice(ln.idx[ln.idx.length - 1] + 1, 0, id);
        const why = addReason(next, id);
        return `<button type="button" class="pp-secondary line-btn" data-extend="${li}" data-id="${id}" ${why && !(admin && why === 'gap') ? 'disabled' : ''} title="${why ? esc(S.REASONS[why] || why) : `Extend by ${m === '60' ? '1 hr' : '30 min'}`}">+${m === '60' ? '1 hr' : '30 min'}</button>`;
      }).join('');
      return `<li class="booker-line"><div class="line-head"><strong>${KIND_NAME[ln.kind]}</strong> · ${S.durationLabel(mins)} <small>(${parts})</small> · ${esc(when)}<span class="line-price">${money(price)}</span></div>
        <div class="line-actions"><span class="line-label">Extend</span>${ext}${ln.idx.length > 1 ? `<button type="button" class="pp-textlink" data-shorten="${li}">Undo last extension</button>` : ''}<button type="button" class="pp-textlink line-remove" data-remove="${li}">Remove</button></div></li>`;
    }).join('') || '<li class="booker-empty">No activities yet — add one below.</li>';
    // Add buttons.
    $('[data-add-label]').textContent = st.overnight ? 'Fill the extra time with' : (st.products.length ? 'Add another activity' : 'Add an activity');
    $('[data-add]').innerHTML = ADDABLE.map(([id, name, dur]) => {
      const why = addReason(st.products.concat(id), id);
      return `<button type="button" class="add-btn${why === 'gap' && admin ? ' is-gap' : ''}" data-add-id="${id}" ${why && !(admin && why === 'gap') ? 'disabled' : ''} title="${why ? esc(S.REASONS[why] || why) : ''}"><span>${name}</span><small>${dur}</small></button>`;
    }).join('');
    $('[data-add-wrap]').hidden = st.overnight && fillLeft() <= 0;
    // Reason, summary, cost.
    const greyed = [...new Set([...(st.starts || []).filter(o => o.reason).map(o => S.REASONS[o.reason]), ...ADDABLE.map(([id]) => addReason(st.products.concat(id), id)).filter(r => r && S.REASONS[r]).map(r => S.REASONS[r])])];
    $('[data-reason]').textContent = daytime && fromWheel.value == null ? (opts.isClosed(st.date) ? 'Day unavailable' : 'No start times left on this day.') : greyed.length ? `Greyed: ${greyed.join(' · ')}` : '';
    $('[data-summary]').textContent = c ? (st.overnight
      ? `Arrive ${shortDay(st.date)} 20:00 · leave ${shortDay(S.dateOf(c.endAt))} ${S.timeOf(c.endAt)} · ${S.durationLabel(c.endAt - c.startAt)}`
      : `${S.timeOf(c.startAt)}–${S.timeOf(c.endAt)} · ${S.durationLabel(c.endAt - c.startAt)}`) : '';
    const total = st.products.reduce((n, id) => n + priceOf(id), 0);
    $('[data-cost]').innerHTML = st.products.length ? `<strong>Estimated total ${st.pets.length ? money(total) : '—'}</strong>${st.pets.length ? '' : '<p>Choose your pets to see the price.</p>'}` : '';
    opts.onChange?.(api);
  }
  // Why adding product `id` (giving `products`) is not possible, or null.
  function addReason(products, id) {
    if (S.KIND[id] === 'walk' && st.pets.length && !dogsOnly()) return 'Dog walks are for dogs only';
    if (st.overnight) { if (lengthOf(products) - S.OVERNIGHT_MIN > (st.until ?? 0)) return 'More than the extra time you chose'; return null; }
    const start = startHHMM(); if (start == null) return 'Choose a start time first';
    return chainReason(products);
  }
  const fillLeft = () => (st.until ?? 0) - (lengthOf(st.products) - S.OVERNIGHT_MIN);
  function renderNight() {
    const base = S.chain(st.date, S.OVERNIGHT_START, ['sitting']), next = S.dateOf(base.endAt);
    $('[data-night-base]').innerHTML = `<strong>Arrive ${esc(shortDay(st.date))} at 20:00</strong> · stays 12 hours · <strong>until 08:00 ${esc(shortDay(next))}</strong>`;
    // Extension choices: 08:00 (none) … 20:00 next day, greyed where the longer stay can't be booked.
    const sel = $('[data-until]'), opts2 = [];
    for (let ext = 0; base.endAt + ext <= S.absAt(next, S.CLOSE); ext += S.STEP) {
      const why = ext ? blockReason(base.startAt, base.endAt + ext) : null;
      opts2.push(`<option value="${ext}" ${why ? 'disabled' : ''}>${S.timeOf(base.endAt + ext)} ${ext ? `(+${S.durationLabel(ext)})` : '(no extension)'}${why ? ` — ${S.REASONS[why]}` : ''}${admin && ext && isGap(base.startAt, base.endAt + ext) ? ' — inside a 30-min gap' : ''}</option>`);
    }
    sel.innerHTML = opts2.join('');
    sel.value = String(st.until ?? 0);
    const left = fillLeft();
    $('[data-night-fill]').textContent = !st.until ? 'Want them to stay longer? Choose a later end time, then fill the extra time with walks or visits.'
      : left > 0 ? `${S.durationLabel(left)} still to fill (of ${S.durationLabel(st.until)} extra)` : left < 0 ? `${S.durationLabel(-left)} over — remove some time` : `Extra ${S.durationLabel(st.until)} filled ✓`;
    $('[data-night-fill]').className = 'night-fill' + (left === 0 && st.until ? ' is-done' : left ? ' is-todo' : '');
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const ls = lines();
    if (b.dataset.addId) st.products.push(b.dataset.addId);
    else if (b.dataset.extend != null) { const ln = ls[+b.dataset.extend]; st.products.splice(ln.idx[ln.idx.length - 1] + 1, 0, b.dataset.id); }
    else if (b.dataset.shorten != null) { const ln = ls[+b.dataset.shorten]; st.products.splice(ln.idx[ln.idx.length - 1], 1); }
    else if (b.dataset.remove != null) { const ln = ls[+b.dataset.remove]; st.products.splice(ln.idx[0], ln.idx.length); }
    else return;
    render();
  });
  $('[data-until]').addEventListener('change', e => {
    st.until = Number(e.target.value);
    // Shortening the stay drops extension activities from the end until they fit.
    while (fillLeft() < 0 && st.products.length > 1) st.products.pop();
    render();
  });

  const api = {
    /** Open for a date. mode 'day' (half 'am'|'pm'|null) or 'overnight'; products to start from. */
    open({ date, overnight = false, half = null, products = [], start = null, excludeId = null }) {
      st = { ...st, date, overnight, half, excludeId, products: overnight ? ['sitting', ...products.filter(id => id !== 'sitting')] : products.filter(id => id !== 'sitting') };
      st.until = overnight ? lengthOf(st.products) - S.OVERNIGHT_MIN : null;
      fromWheel.set([], null);
      if (!overnight) {
        const ctx = { others: others(), closed: opts.isClosed(date), nowAt: nowAt() };
        let starts = S.startOptions(date, Math.max(lengthOf(st.products), S.STEP), ctx);
        if (half) starts = starts.filter(o => half === 'am' ? o.min < 720 : o.min >= 720);
        fromWheel.set(starts.map(o => ({ value: o.min, label: o.label, disabled: !!o.reason && !(admin && o.reason === 'gap') })), start != null ? S.toMin(start) : undefined);
      }
      render();
    },
    setPets(pets) { st.pets = pets; render(); },
    /** Moving a booking: only the start time changes; activities can't be edited. */
    lockActivities(flag) { root.classList.toggle('is-locked', flag); },
    refresh() { if (st.date) render(); },
    /** The request body's booking part, or null with a reason in .problem(). */
    value() {
      const start = startHHMM();
      if (!st.products.length || start == null) return null;
      if (st.overnight && fillLeft() !== 0) return null;
      return { date: st.date, start, activities: st.products.slice() };
    },
    problem() {
      if (!st.products.length) return 'Add at least one activity.';
      if (startHHMM() == null) return 'Choose a start time.';
      if (st.overnight && fillLeft() > 0) return `Fill the extra ${S.durationLabel(fillLeft())} with walks or visits, or choose an earlier end time.`;
      if (st.overnight && fillLeft() < 0) return 'The activities run past the end time you chose.';
      const r = chainReason(st.products); if (r && !(admin && r === 'gap')) return S.REASONS[r] || r;
      return null;
    },
    /** True when the whole booking sits inside another household's 30-minute gap (admin override). */
    inGap() { const v = api.value(); if (!v) return false; const c = S.chain(v.date, v.start, v.activities); return isGap(c.startAt, c.endAt); },
    get state() { return st; },
  };
  return api;
};
