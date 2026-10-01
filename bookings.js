/* Account bookings: persisted by the authenticated API, with server-calculated prices.
   Timed bookings are a from–to window on a 30-minute grid (07:00–20:00 UK time) with 30 minutes
   between bookings. booking-slots.js holds the same rules the server enforces; this page only uses
   them to grey out what would be refused. Other customers' bookings arrive as times only. */
(() => {
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const S = window.BookingSlots;
  const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP' }).format(p / 100);
  const iso = d => d.toISOString().slice(0,10), day = s => new Date(s + 'T00:00:00Z');
  const londonNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
  let today = londonNow().date;
  let month = day(today); month.setUTCDate(1);
  let pets = [], services = [], bookings = [], availability = [], busyTimes = [], editing = null, copyId = null, busy = false, dragging = false, editingVersion = null, sync;
  let dayDate = null, sheet = { half: null, base: null };
  const form = $('#booking-form'), dialog = $('#booking-dialog'), dayDialog = $('#day-dialog'), fields = form.elements;
  async function api(path, method = 'GET', body, signal) {
    const r = await fetch(API + path, {method, signal, cache:'no-store', credentials:'include', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Please sign in again.'); }
    const data = await r.json(); if (!r.ok) throw Object.assign(new Error(data.error || 'Could not save your appointment. Please try again.'), { data }); return data;
  }
  const serviceFor = b => services.find(s => s.id === b.serviceId) || { name: b.serviceId, step: 0.5, unit: b.unit };
  const isPast = date => date < today;
  function occurs(b, date) {
    if (b.unit === 'days') return +day(date) >= +day(b.date) && +day(date) < +day(b.date) + b.duration*86400000;
    return b.date === date;
  }
  const dayStatus = date => availability.find(d => d.date === date)?.status;
  const statusLabel = b => b.status === 'approved' ? 'Approved' : 'Awaiting approval';
  const when = b => b.unit === 'days' ? `from ${b.time} · ${b.duration} night${b.duration === 1 ? '' : 's'}` : `${b.start || b.time}–${b.end || ''}`;
  function render() {
    $('#month-title').textContent = month.toLocaleDateString('en-GB', {month:'long',year:'numeric',timeZone:'UTC'});
    const start = new Date(month); start.setUTCDate(1 - (month.getUTCDay()+6)%7);
    const cells = [];
    for (let i=0;i<42;i++) {
      const d = new Date(start); d.setUTCDate(d.getUTCDate()+i); const date = iso(d), closed = dayStatus(date), past = isPast(date);
      const add = past
        ? `<button class="calendar-add" type="button" disabled aria-label="${date} is in the past">Past</button>`
        : `<button class="calendar-add" type="button" data-add="${date}" aria-label="${copyId ? 'Copy booking to' : 'Book pet care on'} ${date}" ${pets.length && !closed ? '' : 'disabled'}>${closed ? (closed === 'full' ? 'Full' : 'Unavailable') : '+'}</button>`;
      cells.push(`<div class="calendar-day ${d.getUTCMonth() !== month.getUTCMonth() ? 'outside' : ''} ${date === today ? 'is-today' : ''} ${past ? 'is-past' : ''}" data-date="${date}"><time datetime="${date}">${d.getUTCDate()}</time>${bookings.filter(b => occurs(b,date)).map(b => `<button type="button" class="calendar-event" data-edit="${esc(b.id)}" aria-label="Edit ${esc(b.petNames.join(', '))}, ${date}">${esc(b.petNames.join(', '))}<small>${esc(when(b))} · ${esc(serviceFor(b).name)}</small><small class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${statusLabel(b)}</small></button>`).join('')}${add}</div>`);
    }
    $('#calendar-days').innerHTML = cells.join('');
    $('#cancel-copy').hidden = !copyId;
    $('#booking-cards').innerHTML = bookings.length ? [...bookings].sort((a,b) => (a.date + (a.start || a.time)).localeCompare(b.date + (b.start || b.time))).map(b => `<article class="repeat-card" draggable="true" data-drag="${esc(b.id)}"><h3>${esc(b.petNames.join(', '))}</h3><p>${esc(serviceFor(b).name)}</p><p>${esc(b.date)} · ${esc(when(b))}</p><p>${money(b.total)} estimated</p><p class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${statusLabel(b)}</p><button type="button" class="pp-secondary" data-copy="${esc(b.id)}">Copy to a day</button> <button type="button" class="pp-textlink" data-edit="${esc(b.id)}">Edit</button></article>`).join('') : '<p>Your saved appointments will appear here, ready to use again.</p>';
    if (dayDialog.open) renderDay();
  }

  // ---------- the rules, as this customer sees them for one date ----------
  // Every blocking window on the date except the one being edited: other people's (times only) and our own.
  function othersOn(date, exceptId) {
    const mine = bookings.filter(b => b.unit === 'hours' && b.date === date && b.id !== exceptId && b.start && b.end && ['pending','approved'].includes(b.status)).map(b => ({ start: S.toMin(b.start), end: S.toMin(b.end) }));
    const theirs = busyTimes.filter(b => b.date === date).map(b => ({ start: S.toMin(b.start), end: S.toMin(b.end) }));
    return mine.concat(theirs);
  }
  function ctxFor(date, exceptId, unitMin) {
    const now = londonNow();
    return { others: othersOn(date, exceptId), closed: !!dayStatus(date), nowMin: date === now.date ? S.toMin(now.time) : (date < now.date ? 24 * 60 : null), unit: unitMin || S.STEP };
  }

  // ---------- day view: AM and PM ----------
  function openDay(date) {
    if (busy || isPast(date)) return;
    dayDate = date; $('#day-error').textContent = '';
    $('#day-title').textContent = day(date).toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
    renderDay(); dayDialog.showModal();
  }
  function renderDay() {
    const date = dayDate, closed = dayStatus(date), starts = S.startOptions(ctxFor(date, null));
    for (const half of ['am', 'pm']) {
      const inHalf = m => half === 'am' ? m < 12 * 60 : m >= 12 * 60;
      const box = dayDialog.querySelector(`[data-half="${half}"]`);
      const mine = bookings.filter(b => b.unit === 'hours' && b.date === date && b.start && inHalf(S.toMin(b.start)));
      const taken = busyTimes.filter(b => b.date === date && inHalf(S.toMin(b.start)));
      const items = [...mine.map(b => ({ at: b.start, html: `<button type="button" class="half-item is-mine" data-edit="${esc(b.id)}"><strong>${esc(b.start)}–${esc(b.end)}</strong> ${esc(b.petNames.join(', '))} · ${esc(serviceFor(b).name)} <small class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${statusLabel(b)}</small></button>` })),
        ...taken.map(b => ({ at: b.start, html: `<p class="half-item is-taken"><strong>${esc(b.start)}–${esc(b.end)}</strong> Unavailable</p>` }))].sort((a, b) => a.at.localeCompare(b.at));
      const free = starts.some(o => inHalf(o.min) && !o.reason);
      box.innerHTML = closed
        ? `<p class="half-closed">Not available</p>`
        : `${items.map(i => i.html).join('') || '<p class="half-empty">Nothing booked yet.</p>'}${free
          ? `<button type="button" class="half-add" data-book-half="${half}" aria-label="Book a time in the ${half === 'am' ? 'morning' : 'afternoon'}">+</button>`
          : `<p class="half-closed">No times left</p>`}`;
    }
  }

  // ---------- the booking sheet ----------
  const fromWheel = window.BookingWheel($('#from-wheel'), { label: 'From', onChange: () => refreshTo() });
  const toWheel = window.BookingWheel($('#to-wheel'), { label: 'To', onChange: () => updateSummary() });
  const currentService = () => services.find(s => s.id === fields.serviceId.value);
  const unitMin = s => s && s.unit === 'hours' ? Math.round(s.step * 60) : S.STEP;
  function selectedPets() { return [...form.querySelectorAll('[name="petId"]:checked')].map(el => pets.find(p => p.id === el.value)); }
  const opt = (o, extra = {}) => ({ value: o.min, label: o.label, disabled: !!o.reason, title: o.reason ? S.REASONS[o.reason] : '', ...extra });
  function refreshFrom(want) {
    const s = currentService(), date = fields.date.value; if (!s || !date) return;
    const days = s.unit === 'days';
    $('#nights-field').hidden = !days; toWheel.hide(days);
    let starts = S.startOptions(ctxFor(date, editing, unitMin(s)));
    // Overnight stays don't sit on the day grid: only the day being open and not-in-the-past matter.
    if (days) starts = starts.map(o => ({ ...o, reason: o.reason === 'gap' || o.reason === 'overlap' ? null : o.reason }));
    if (sheet.half) starts = starts.filter(o => sheet.half === 'am' ? o.min < 12 * 60 : o.min >= 12 * 60);
    sheet.starts = starts;
    fromWheel.set(starts.map(o => opt(o)), want ?? fromWheel.value);
    refreshTo();
  }
  function refreshTo(want) {
    const s = currentService(), date = fields.date.value, from = fromWheel.value;
    if (!s || s.unit === 'days' || from == null) { sheet.ends = []; toWheel.set([], null); updateSummary(); return; }
    const ends = S.endOptions(from, ctxFor(date, editing, unitMin(s)));
    sheet.ends = ends;
    toWheel.set(ends.map(o => opt(o)), want ?? toWheel.value ?? from + unitMin(s));
    updateSummary();
  }
  function updateSummary() {
    const s = currentService(); if (!s) return;
    const ps = selectedPets(), from = fromWheel.value, to = toWheel.value, days = s.unit === 'days';
    // Why anything is greyed — one short line, never who or what.
    const greyed = [...(sheet.starts || []), ...(days ? [] : sheet.ends || [])].filter(o => o.reason).map(o => o.reason);
    const why = [...new Set(greyed)].map(r => S.REASONS[r]);
    $('#picker-reason').textContent = from == null ? (dayStatus(fields.date.value) ? 'Day unavailable' : 'No times left on this day — choose another date.') : why.length ? `Greyed times: ${why.join(' · ')}` : '';
    const minutes = days ? null : (from != null && to != null ? to - from : null);
    const units = days ? Number(fields.nights.value) : minutes != null ? minutes / 60 / s.step : null;
    const extra = s.id === 'sitting' ? ps.slice().sort((a,b) => (b.species === 'Dog') - (a.species === 'Dog')).slice(1).reduce((n,p) => n + (p.species === 'Dog' ? 800 : p.species === 'Cat' ? 400 : 0),0) : s.extra * (s.id.startsWith('visit') ? ps.slice(1).filter(p => p.species !== 'Dog').length : Math.max(0,ps.length-1));
    $('#picker-summary').textContent = days ? (from != null ? `From ${S.toHHMM(from)} · ${units} night${units === 1 ? '' : 's'}` : '') : (minutes ? `${S.toHHMM(from)}–${S.toHHMM(to)} · ${S.durationLabel(minutes)}` : '');
    const valid = units > 0 && Number.isInteger(units);
    $('#booking-cost').innerHTML = `<p>Service: ${money(s.rate)} per ${days ? 'night' : s.step === 0.5 ? '30 minutes' : 'hour'}</p><p>Extra pets: ${money(extra)} per ${days ? 'night' : s.step === 0.5 ? '30 minutes' : 'hour'}</p><strong>Estimated total ${valid && ps.length ? money((s.rate+extra)*units) : '—'}</strong>`;
    $('#save-booking').disabled = busy || from == null || (!days && to == null);
  }
  function openSheet(date, { half = null, b = null, copy = false } = {}) {
    if (busy) return;
    if ((!b || copy) && (dayStatus(date) || isPast(date))) { $('#calendar-status').textContent = 'That day can’t be booked. Choose another date.'; return; }
    editing = copy ? null : b?.id || null;
    editingVersion = editing ? b.version : null;
    sheet = { half: editing ? null : half, base: b };
    $('#booking-title').textContent = editing ? 'Edit appointment' : copy ? 'Repeat appointment' : `Book a time · ${half === 'pm' ? 'PM' : half === 'am' ? 'AM' : ''}`.replace(/ · $/, '');
    $('#save-booking').textContent = editing ? 'Save changes for approval' : 'Request booking';
    $('#remove-booking').hidden = !editing; $('#remove-booking').textContent = 'Remove'; $('#remove-booking').dataset.confirm = '';
    $('#booking-error').textContent = '';
    $('#pet-options').innerHTML = pets.map(p => `<label><input type="checkbox" name="petId" value="${esc(p.id)}" ${b?.petIds.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('');
    fields.serviceId.value = b?.serviceId || services[0].id; fields.date.value = date; fields.date.min = today;
    fields.nights.value = b?.unit === 'days' ? b.duration : 1;
    const want = b ? S.toMin(b.start || b.time) : undefined;
    // A copied booking keeps its times only if they fit this box's half.
    const fits = want != null && (!sheet.half || (sheet.half === 'am' ? want < 720 : want >= 720));
    fromWheel.set([], null); refreshFrom(fits ? want : undefined);
    if (b && b.end && fits) refreshTo(S.toMin(b.end));
    if (dayDialog.open) dayDialog.close();
    dialog.showModal();
  }
  function lock(value) { if (value) sync?.invalidate(); busy = value; for (const el of form.querySelectorAll('button,input,select')) el.disabled = value; if (!value) updateSummary(); }
  form.addEventListener('change', e => {
    if (e.target === fields.serviceId || e.target === fields.date) { if (fields.date.value && fields.date.value < today) fields.date.value = today; refreshFrom(); }
    else updateSummary();
  });
  fields.nights.addEventListener('input', () => updateSummary());
  document.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || busy) return;
    if (el.hasAttribute('data-dismiss')) dialog.close();
    if (el.hasAttribute('data-close-day')) dayDialog.close();
    if (el.dataset.edit) { const b = bookings.find(b => b.id === el.dataset.edit); if (b) openSheet(b.date, { b }); }
    if (el.dataset.copy) { copyId = el.dataset.copy; render(); $('#calendar-status').textContent = 'Choose + on a day, then a morning or afternoon, to review your copied appointment.'; }
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
    const petIds = selectedPets().map(p => p.id), s = currentService();
    if (!petIds.length) { $('#booking-error').textContent = 'Choose at least one pet.'; return; }
    const from = fromWheel.value, to = toWheel.value;
    const payload = s.unit === 'days'
      ? { petIds, serviceId: s.id, date: fields.date.value, start: S.toHHMM(from), duration: Number(fields.nights.value), version: editingVersion }
      : { petIds, serviceId: s.id, date: fields.date.value, start: S.toHHMM(from), end: S.toHHMM(to), version: editingVersion };
    lock(true); $('#booking-error').textContent = '';
    try {
      const {booking} = await api('/me/bookings' + (editing ? '/'+editing : ''),editing ? 'PATCH' : 'POST',payload);
      bookings = bookings.filter(b => b.id !== booking.id).concat(booking); if (copyId && !editing) copyId = null; render(); dialog.close();
      $('#calendar-status').textContent = 'Appointment saved to your account and awaiting admin approval.';
    } catch (err) {
      // Someone else just took it: refresh the day from the server's answer and let them choose again.
      if (err.data?.taken) { applyUpdates(err.data, true); refreshFrom(); }
      $('#booking-error').textContent = err.message;
    } finally { lock(false); }
  });
  $('#remove-booking').onclick = async () => {
    if (busy || !editing) return;
    const button = $('#remove-booking'); if (!button.dataset.confirm) { button.dataset.confirm = 'yes'; button.textContent = 'Confirm removal'; $('#booking-error').textContent = 'Remove this appointment? Other repeated appointments will stay.'; return; }
    lock(true);
    try { await api('/me/bookings/'+editing,'DELETE'); bookings = bookings.filter(b => b.id !== editing); if (copyId === editing) copyId = null; render(); dialog.close(); $('#calendar-status').textContent = 'Appointment removed.'; }
    catch(e) { $('#booking-error').textContent=e.message; } finally { lock(false); }
  };
  function applyUpdates(data, force = false) {
    today = data.today?.date || londonNow().date;
    const changed = JSON.stringify([bookings, availability, services, busyTimes]) !== JSON.stringify([data.bookings, data.availability || [], data.services, data.busy || []]);
    if (!changed && !force) return;
    bookings = data.bookings; availability = data.availability || []; services = data.services; busyTimes = data.busy || [];
    if (copyId && !bookings.some(b => b.id === copyId)) copyId = null;
    render();
    // Keep the open sheet's choice but re-grey the wheels against the latest bookings.
    if (dialog.open && !busy) { refreshFrom(); refreshTo(); }
    if (dialog.open && editing && bookings.find(b => b.id === editing)?.version !== editingVersion) {
      $('#booking-error').textContent = 'This appointment has changed. Your draft is kept here; close and reopen it to use the latest saved details.';
    }
  }
  (async function initialise() { try {
    const [account,data] = await Promise.all([api('/me'),api('/me/bookings')]); pets=account.pets; services=data.services; bookings=data.bookings; availability=data.availability || []; busyTimes = data.busy || []; today = data.today?.date || today;
    if (account.isAdmin) $('[data-admin-calendar-link]').hidden = false;
    fields.serviceId.innerHTML=services.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('#booking-content').hidden=false; $('#calendar-status').innerHTML=pets.length ? '' : 'Add a pet in <a href="account.html">your account</a> before booking.'; render();
    sync = window.calendarSync({read: signal => api('/me/bookings', 'GET', undefined, signal), apply: applyUpdates, paused: () => busy || dragging});
  } catch(e) { $('#calendar-status').textContent = 'Unable to load your calendar. '+e.message+' Retrying automatically…'; setTimeout(initialise, 5000); } })();
})();
