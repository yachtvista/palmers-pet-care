/* Account bookings: persisted by the authenticated API, with server-calculated prices.
   A booking is a chain of activities (activity-booker.js): daytime walks and visits from a start
   time, or an overnight 20:00 → 08:00 that can be extended. booking-slots.js holds the same rules the
   server enforces; this page only uses them to grey out what would be refused. Other customers'
   bookings arrive as windows only — never who or what. */
(() => {
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const S = window.BookingSlots;
  const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP' }).format(p / 100);
  const iso = d => d.toISOString().slice(0,10), day = s => new Date(s + 'T00:00:00Z');
  const londonNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
  const shortDay = date => day(date).toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
  let today = londonNow().date;
  let month = day(today); month.setUTCDate(1);
  let pets = [], services = [], bookings = [], availability = [], busyTimes = [], editing = null, copyId = null, busy = false, dragging = false, editingVersion = null, sync;
  let dayDate = null;
  const form = $('#booking-form'), dialog = $('#booking-dialog'), dayDialog = $('#day-dialog'), fields = form.elements;
  async function api(path, method = 'GET', body, signal) {
    const r = await fetch(API + path, {method, signal, cache:'no-store', credentials:'include', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Please sign in again.'); }
    const data = await r.json(); if (!r.ok) throw Object.assign(new Error(data.error || 'Could not save your appointment. Please try again.'), { data }); return data;
  }
  const isPast = date => date < today;
  const dayStatus = date => availability.find(d => d.date === date)?.status;
  const statusLabel = b => b.status === 'approved' ? 'Approved' : 'Awaiting approval';
  const blocking = b => ['pending', 'approved'].includes(b.status);
  // A booking's products in order (older bookings had one service and a length instead).
  const productsOf = b => Array.isArray(b.activities) ? b.activities.map(a => a.serviceId)
    : b.serviceId === 'sitting' || b.unit === 'days' ? ['sitting']
    : Array(Math.max(1, Math.round((b.duration || 0.5) * 60 / (S.PRODUCT_MIN[b.serviceId] || 30)))).fill(b.serviceId);
  const windowOf = b => b.startAt != null ? { start: b.startAt, end: b.endAt } : { start: S.absAt(b.date, b.start || b.time), end: S.absAt(b.date, b.start || b.time) + Math.round((b.duration || 0) * (b.unit === 'days' ? 1440 : 60)) };
  const KIND_NAME = { walk: 'Dog walk', visit: 'Home visit', overnight: 'Overnight house-sit' };
  function titleOf(b) {
    const groups = [];
    for (const id of productsOf(b)) { const k = S.KIND[id], last = groups[groups.length - 1]; if (last && last.k === k && k !== 'overnight') last.m += S.PRODUCT_MIN[id]; else groups.push({ k, m: S.PRODUCT_MIN[id] }); }
    return groups.map(g => g.k === 'overnight' ? KIND_NAME.overnight : `${KIND_NAME[g.k]} ${S.durationLabel(g.m)}`).join(' + ');
  }
  function when(b) {
    const w = windowOf(b), endDate = S.dateOf(w.end);
    return endDate !== b.date ? `${S.timeOf(w.start)} → ${S.timeOf(w.end)} ${shortDay(endDate)}` : `${S.timeOf(w.start)}–${S.timeOf(w.end)}`;
  }
  // A booking shows on every date its window touches.
  function occurs(b, date) { const w = windowOf(b), d0 = S.dayNum(date) * S.DAY; return w.start < d0 + S.DAY && w.end > d0; }
  function render() {
    $('#month-title').textContent = month.toLocaleDateString('en-GB', {month:'long',year:'numeric',timeZone:'UTC'});
    const start = new Date(month); start.setUTCDate(1 - (month.getUTCDay()+6)%7);
    const cells = [];
    for (let i=0;i<42;i++) {
      const d = new Date(start); d.setUTCDate(d.getUTCDate()+i); const date = iso(d), closed = dayStatus(date), past = isPast(date);
      const add = past
        ? `<button class="calendar-add" type="button" disabled aria-label="${date} is in the past">Past</button>`
        : `<button class="calendar-add" type="button" data-add="${date}" aria-label="${copyId ? 'Copy booking to' : 'Book pet care on'} ${date}" ${pets.length && !closed ? '' : 'disabled'}>${closed ? (closed === 'full' ? 'Full' : 'Unavailable') : '+'}</button>`;
      cells.push(`<div class="calendar-day ${d.getUTCMonth() !== month.getUTCMonth() ? 'outside' : ''} ${date === today ? 'is-today' : ''} ${past ? 'is-past' : ''}" data-date="${date}"><time datetime="${date}">${d.getUTCDate()}</time>${bookings.filter(b => occurs(b,date)).map(b => `<button type="button" class="calendar-event" data-edit="${esc(b.id)}" aria-label="Edit ${esc(b.petNames.join(', '))}, ${date}">${esc(b.petNames.join(', '))}<small>${esc(when(b))} · ${esc(titleOf(b))}</small><small class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${statusLabel(b)}</small></button>`).join('')}${add}</div>`);
    }
    $('#calendar-days').innerHTML = cells.join('');
    $('#cancel-copy').hidden = !copyId;
    $('#booking-cards').innerHTML = bookings.length ? [...bookings].sort((a,b) => windowOf(a).start - windowOf(b).start).map(b => `<article class="repeat-card" draggable="true" data-drag="${esc(b.id)}"><h3>${esc(b.petNames.join(', '))}</h3><p>${esc(titleOf(b))}</p><p>${esc(b.date)} · ${esc(when(b))}</p><p>${money(b.total)} estimated</p><p class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${statusLabel(b)}</p><button type="button" class="pp-secondary" data-copy="${esc(b.id)}">Copy to a day</button> <button type="button" class="pp-textlink" data-edit="${esc(b.id)}">Edit</button></article>`).join('') : '<p>Your saved appointments will appear here, ready to use again.</p>';
    if (dayDialog.open) renderDay();
  }

  // ---------- the rules, as this customer sees them ----------
  // Every blocking window except the one being edited: ours (same household — no travel gap) and
  // everyone else's (times only).
  function othersFor(_date, exceptId) {
    const mine = bookings.filter(b => b.id !== exceptId && blocking(b)).map(b => ({ ...windowOf(b), same: true }));
    const theirs = busyTimes.map(b => ({ start: b.startAt, end: b.endAt, same: false }));
    return mine.concat(theirs);
  }
  const booker = window.ActivityBooker($('#booker'), {
    services: () => services, others: othersFor, isClosed: date => !!dayStatus(date), now: londonNow,
    onChange: () => { $('#save-booking').disabled = busy || !booker.value(); },
  });

  // ---------- day view: AM, PM and overnight ----------
  function openDay(date) {
    if (busy || isPast(date)) return;
    dayDate = date; $('#day-error').textContent = '';
    $('#day-title').textContent = day(date).toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
    renderDay(); dayDialog.showModal();
  }
  function renderDay() {
    const date = dayDate, d0 = S.dayNum(date) * S.DAY, closed = dayStatus(date), now = londonNow(), nowAt = S.absAt(now.date, now.time);
    const others = othersFor(date, null), starts = S.startOptions(date, S.STEP, { others, closed: !!closed, nowAt });
    const night = S.chain(date, S.OVERNIGHT_START, ['sitting']);
    const nightBlocked = closed || dayStatus(S.dateOf(night.endAt)) || night.startAt < nowAt || S.conflictWith(night.startAt, night.endAt, others);
    const inBox = (half, w) => half === 'night' ? w.start < night.endAt && w.end > night.startAt
      : (half === 'am' ? w.start < d0 + 720 && w.end > d0 : w.start < d0 + 20 * 60 && w.end > d0 + 720);
    for (const half of ['am', 'pm', 'night']) {
      const box = dayDialog.querySelector(`[data-half="${half}"]`);
      const mine = bookings.filter(b => inBox(half, windowOf(b)));
      const taken = busyTimes.filter(b => inBox(half, { start: b.startAt, end: b.endAt }));
      const items = [...mine.map(b => ({ at: windowOf(b).start, html: `<button type="button" class="half-item is-mine" data-edit="${esc(b.id)}"><strong>${esc(when(b))}</strong> ${esc(b.petNames.join(', '))} · ${esc(titleOf(b))} <small class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${statusLabel(b)}</small></button>` })),
        ...taken.map(b => ({ at: b.startAt, html: `<p class="half-item is-taken"><strong>${esc(when({ date: S.dateOf(b.startAt), startAt: b.startAt, endAt: b.endAt }))}</strong> Unavailable</p>` }))].sort((a, b) => a.at - b.at);
      const free = half === 'night' ? !nightBlocked : starts.some(o => (half === 'am' ? o.min < 720 : o.min >= 720) && !o.reason);
      const copying = copyId && bookings.find(b => b.id === copyId);
      // A copied overnight goes in the overnight box; a copied daytime booking in AM or PM.
      const fitsCopy = !copying || (half === 'night') === (productsOf(copying)[0] === 'sitting');
      box.innerHTML = closed
        ? `<p class="half-closed">Not available</p>`
        : `${items.map(i => i.html).join('') || '<p class="half-empty">Nothing booked yet.</p>'}${free && fitsCopy
          ? `<button type="button" class="half-add" data-book-half="${half}" aria-label="${half === 'night' ? 'Book an overnight' : `Book a time in the ${half === 'am' ? 'morning' : 'afternoon'}`}">+</button>`
          : `<p class="half-closed">${half === 'night' ? 'Overnight not available' : 'No times left'}</p>`}`;
    }
  }

  // ---------- the booking sheet ----------
  function selectedPets() { return [...form.querySelectorAll('[name="petId"]:checked')].map(el => pets.find(p => p.id === el.value)); }
  function openSheet(date, { half = null, b = null, copy = false } = {}) {
    if (busy) return;
    if ((!b || copy) && (dayStatus(date) || isPast(date))) { $('#calendar-status').textContent = 'That day can’t be booked. Choose another date.'; return; }
    editing = copy ? null : b?.id || null;
    editingVersion = editing ? b.version : null;
    const products = b ? productsOf(b) : [], overnight = half === 'night' || products[0] === 'sitting';
    $('#booking-title').textContent = editing ? 'Edit booking' : copy ? 'Repeat booking' : overnight ? 'Book an overnight' : `Book a time · ${half === 'pm' ? 'PM' : 'AM'}`;
    $('#save-booking').textContent = editing ? 'Save changes for approval' : 'Request booking';
    $('#remove-booking').hidden = !editing; $('#remove-booking').textContent = 'Remove'; $('#remove-booking').dataset.confirm = '';
    $('#booking-error').textContent = '';
    $('#pet-options').innerHTML = pets.map(p => `<label><input type="checkbox" name="petId" value="${esc(p.id)}" ${b?.petIds.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)} <small>(${esc(p.species)})</small></span></label>`).join('');
    fields.date.value = date; fields.date.min = today;
    // A copied daytime booking keeps its start if it fits the chosen half.
    const start = b && !overnight ? b.start || b.time : null;
    const keepStart = start && (!half || half === 'night' || (half === 'am' ? S.toMin(start) < 720 : S.toMin(start) >= 720)) ? start : null;
    booker.setPets(selectedPets());
    booker.open({ date, overnight, half: editing ? null : (overnight ? null : half), products, start: keepStart, excludeId: editing });
    if (dayDialog.open) dayDialog.close();
    dialog.showModal();
  }
  function lock(value) { if (value) sync?.invalidate(); busy = value; for (const el of form.querySelectorAll('button,input,select')) el.disabled = value; if (!value) booker.refresh(); }
  form.addEventListener('change', e => {
    if (e.target.name === 'petId') booker.setPets(selectedPets());
    if (e.target === fields.date) {
      if (fields.date.value && fields.date.value < today) fields.date.value = today;
      const st = booker.state;
      booker.open({ date: fields.date.value, overnight: st.overnight, half: null, products: st.products, excludeId: editing });
    }
  });
  document.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || busy) return;
    if (el.hasAttribute('data-dismiss')) dialog.close();
    if (el.hasAttribute('data-close-day')) dayDialog.close();
    if (el.dataset.edit) { const b = bookings.find(b => b.id === el.dataset.edit); if (b) openSheet(b.date, { b }); }
    if (el.dataset.copy) { copyId = el.dataset.copy; render(); $('#calendar-status').textContent = 'Choose + on a day, then a time of day, to review your copied booking.'; }
    if (el.dataset.add) openDay(el.dataset.add);
    if (el.dataset.bookHalf) openSheet(dayDate, { half: el.dataset.bookHalf, b: copyId ? bookings.find(b => b.id === copyId) : null, copy: !!copyId });
  });
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  $('#cancel-copy').onclick = () => { copyId = null; render(); $('#calendar-status').textContent = ''; };
  for (const [id, delta] of [['previous',-1],['next',1]]) $('#'+id).onclick = () => { month.setUTCMonth(month.getUTCMonth()+delta); render(); };
  $('#today').onclick = () => { month = day(today); month.setUTCDate(1); render(); };
  $('#calendar-days').addEventListener('dragover', e => { const cell = e.target.closest('[data-date]'); if (cell && !cell.classList.contains('is-past') && e.dataTransfer.types.includes('application/x-palmers-booking')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; cell.classList.add('drag-over'); } });
  $('#calendar-days').addEventListener('dragleave', e => e.target.closest('[data-date]')?.classList.remove('drag-over'));
  document.addEventListener('dragend', () => { dragging = false; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
  $('#booking-cards').addEventListener('dragstart', e => { const card = e.target.closest('[data-drag]'); if (card) { dragging = true; e.dataTransfer.setData('application/x-palmers-booking',card.dataset.drag); e.dataTransfer.effectAllowed = 'copy'; } });
  $('#calendar-days').addEventListener('drop', e => { dragging = false; e.preventDefault(); document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); const cell=e.target.closest('[data-date]'); if (!cell || isPast(cell.dataset.date)) return; copyId = e.dataTransfer.getData('application/x-palmers-booking'); render(); openDay(cell.dataset.date); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const petIds = selectedPets().map(p => p.id);
    if (!petIds.length) { $('#booking-error').textContent = 'Choose at least one pet.'; return; }
    const v = booker.value(), problem = booker.problem();
    if (!v || problem) { $('#booking-error').textContent = problem || 'Finish choosing your activities.'; return; }
    lock(true); $('#booking-error').textContent = '';
    try {
      const {booking} = await api('/me/bookings' + (editing ? '/'+editing : ''), editing ? 'PATCH' : 'POST', { petIds, ...v, version: editingVersion });
      bookings = bookings.filter(b => b.id !== booking.id).concat(booking); if (copyId && !editing) copyId = null; render(); dialog.close();
      $('#calendar-status').textContent = 'Booking saved to your account and awaiting admin approval.';
    } catch (err) {
      // Someone else just took it: refresh from the server's answer and let them choose again.
      if (err.data?.taken) applyUpdates(err.data, true);
      $('#booking-error').textContent = err.message;
    } finally { lock(false); }
  });
  $('#remove-booking').onclick = async () => {
    if (busy || !editing) return;
    const button = $('#remove-booking'); if (!button.dataset.confirm) { button.dataset.confirm = 'yes'; button.textContent = 'Confirm removal'; $('#booking-error').textContent = 'Remove this booking? Other repeated bookings will stay.'; return; }
    lock(true);
    try { await api('/me/bookings/'+editing,'DELETE'); bookings = bookings.filter(b => b.id !== editing); if (copyId === editing) copyId = null; render(); dialog.close(); $('#calendar-status').textContent = 'Booking removed.'; }
    catch(e) { $('#booking-error').textContent=e.message; } finally { lock(false); }
  };
  function applyUpdates(data, force = false) {
    today = data.today?.date || londonNow().date;
    const changed = JSON.stringify([bookings, availability, services, busyTimes]) !== JSON.stringify([data.bookings, data.availability || [], data.services, data.busy || []]);
    if (!changed && !force) return;
    bookings = data.bookings; availability = data.availability || []; services = data.services; busyTimes = data.busy || [];
    if (copyId && !bookings.some(b => b.id === copyId)) copyId = null;
    render();
    // Keep the open sheet's choices but re-grey against the latest bookings.
    if (dialog.open && !busy) booker.refresh();
    if (dialog.open && editing && bookings.find(b => b.id === editing)?.version !== editingVersion) {
      $('#booking-error').textContent = 'This booking has changed. Your draft is kept here; close and reopen it to use the latest saved details.';
    }
  }
  (async function initialise() { try {
    const [account,data] = await Promise.all([api('/me'),api('/me/bookings')]); pets=account.pets; services=data.services; bookings=data.bookings; availability=data.availability || []; busyTimes = data.busy || []; today = data.today?.date || today;
    if (account.isAdmin) $('[data-admin-calendar-link]').hidden = false;
    $('#booking-content').hidden=false; $('#calendar-status').innerHTML=pets.length ? '' : 'Add a pet in <a href="account.html">your account</a> before booking.'; render();
    sync = window.calendarSync({read: signal => api('/me/bookings', 'GET', undefined, signal), apply: applyUpdates, paused: () => busy || dragging});
  } catch(e) { $('#calendar-status').textContent = 'Unable to load your calendar. '+e.message+' Retrying automatically…'; setTimeout(initialise, 5000); } })();
})();
