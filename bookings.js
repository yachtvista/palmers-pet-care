/* Account bookings: persisted by the authenticated API, with server-calculated prices. */
(() => {
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', { style:'currency', currency:'GBP' }).format(p / 100);
  const iso = d => d.toISOString().slice(0,10), day = s => new Date(s + 'T00:00:00Z');
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let month = day(today); month.setUTCDate(1);
  let pets = [], services = [], bookings = [], editing = null, copyId = null, busy = false;
  const form = $('#booking-form'), dialog = $('#booking-dialog'), fields = form.elements;
  async function api(path, method = 'GET', body) {
    const r = await fetch(API + path, {method, credentials:'include', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Please sign in again.'); }
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not save your appointment. Please try again.'); return data;
  }
  const serviceFor = b => services.find(s => s.id === b.serviceId);
  function occurs(b, date) {
    const start = +day(b.date) + Number(b.time.slice(0,2))*3600000 + Number(b.time.slice(3))*60000;
    // Day-based bookings cover exactly the chosen number of calendar dates; hourly bookings may cross midnight.
    const end = b.unit === 'days' ? +day(b.date) + b.duration*86400000 : start + b.duration*3600000;
    return +day(date) < end && +day(date) + 86400000 > start;
  }
  function render() {
    $('#month-title').textContent = month.toLocaleDateString('en-GB', {month:'long',year:'numeric',timeZone:'UTC'});
    const start = new Date(month); start.setUTCDate(1 - (month.getUTCDay()+6)%7);
    const cells = [];
    for (let i=0;i<42;i++) {
      const d = new Date(start); d.setUTCDate(d.getUTCDate()+i); const date = iso(d);
      cells.push(`<div class="calendar-day ${d.getUTCMonth() !== month.getUTCMonth() ? 'outside' : ''} ${date === today ? 'is-today' : ''}" data-date="${date}"><time datetime="${date}">${d.getUTCDate()}</time>${bookings.filter(b => occurs(b,date)).map(b => `<button type="button" class="calendar-event" data-edit="${esc(b.id)}" aria-label="Edit ${esc(b.petNames.join(', '))}, ${date}">${esc(b.petNames.join(', '))}<small>${esc(b.time)} · ${esc(serviceFor(b).name)}</small></button>`).join('')}<button class="calendar-add" type="button" data-add="${date}" aria-label="${copyId ? 'Copy booking to' : 'Book pet care on'} ${date}" ${pets.length ? '' : 'disabled'}>+</button></div>`);
    }
    $('#calendar-days').innerHTML = cells.join('');
    $('#cancel-copy').hidden = !copyId;
    $('#booking-cards').innerHTML = bookings.length ? [...bookings].sort((a,b) => a.date.localeCompare(b.date)).map(b => `<article class="repeat-card" draggable="true" data-drag="${esc(b.id)}"><h3>${esc(b.petNames.join(', '))}</h3><p>${esc(serviceFor(b).name)}</p><p>${esc(b.date)} · ${esc(b.time)} · ${b.duration} ${b.unit}</p><p>${money(b.total)} estimated</p><button type="button" class="pp-secondary" data-copy="${esc(b.id)}">Copy to a day</button> <button type="button" class="pp-textlink" data-edit="${esc(b.id)}">Edit</button></article>`).join('') : '<p>Your saved appointments will appear here, ready to use again.</p>';
  }
  function selectedPets() { return [...form.querySelectorAll('[name="petId"]:checked')].map(el => pets.find(p => p.id === el.value)); }
  function updateCost(reset = false) {
    const s = services.find(s => s.id === fields.serviceId.value); if (!s) return;
    fields.duration.step = s.step; fields.duration.min = s.step; fields.duration.max = s.unit === 'days' ? 90 : 24;
    if (reset) fields.duration.value = s.step;
    $('#duration-unit').textContent = `(${s.unit})`;
    const ps = selectedPets(), duration = Number(fields.duration.value);
    const extra = s.id === 'sitting' ? ps.slice().sort((a,b) => (b.species === 'Dog') - (a.species === 'Dog')).slice(1).reduce((n,p) => n + (p.species === 'Dog' ? 800 : p.species === 'Cat' ? 400 : 0),0) : s.extra * (s.id.startsWith('visit') ? ps.slice(1).filter(p => p.species !== 'Dog').length : Math.max(0,ps.length-1));
    const valid = duration > 0 && Number.isInteger(duration/s.step) && duration <= Number(fields.duration.max);
    $('#booking-cost').innerHTML = `<p>Service: ${money(s.rate)} per ${s.step} ${s.unit}</p><p>Extra pets: ${money(extra)} per ${s.step} ${s.unit}</p><p>${money(s.rate + extra)} × ${valid ? duration/s.step : '—'} ${s.unit === 'days' ? 'days' : 'service blocks'}</p><strong>Estimated total ${valid && ps.length ? money((s.rate+extra)*duration/s.step) : '—'}</strong>`;
  }
  function open(date, b, copy = false) {
    if (busy) return;
    editing = copy ? null : b?.id || null;
    $('#booking-title').textContent = editing ? 'Edit appointment' : copy ? 'Repeat appointment' : 'Book pet care';
    $('#save-booking').textContent = editing ? 'Save changes' : 'Confirm booking';
    $('#remove-booking').hidden = !editing; $('#remove-booking').textContent = 'Remove'; $('#remove-booking').dataset.confirm = '';
    $('#booking-error').textContent = '';
    $('#pet-options').innerHTML = pets.map(p => `<label><input type="checkbox" name="petId" value="${esc(p.id)}" ${b?.petIds.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('');
    fields.serviceId.value = b?.serviceId || services[0].id; fields.date.value = date; fields.time.value = b?.time || '09:00'; fields.duration.value = b?.duration || services[0].step;
    updateCost(); dialog.showModal();
  }
  function lock(value) { busy = value; for (const el of form.querySelectorAll('button,input,select')) el.disabled = value; }
  form.addEventListener('change', e => updateCost(e.target === fields.serviceId));
  fields.duration.addEventListener('input', () => updateCost());
  document.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || busy) return;
    if (el.hasAttribute('data-dismiss')) dialog.close();
    if (el.dataset.edit) { const b = bookings.find(b => b.id === el.dataset.edit); open(b.date,b); }
    if (el.dataset.copy) { copyId = el.dataset.copy; render(); $('#calendar-status').textContent = 'Choose + on a day to review your copied appointment.'; }
    if (el.dataset.add) open(el.dataset.add, bookings.find(b => b.id === copyId), !!copyId);
  });
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  $('#cancel-copy').onclick = () => { copyId = null; render(); $('#calendar-status').textContent = ''; };
  for (const [id, delta] of [['previous',-1],['next',1]]) $('#'+id).onclick = () => { month.setUTCMonth(month.getUTCMonth()+delta); render(); };
  $('#today').onclick = () => { month = day(today); month.setUTCDate(1); render(); };
  $('#calendar-days').addEventListener('dragover', e => { if (e.dataTransfer.types.includes('application/x-palmers-booking')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; e.target.closest('[data-date]')?.classList.add('drag-over'); } });
  $('#calendar-days').addEventListener('dragleave', e => e.target.closest('[data-date]')?.classList.remove('drag-over'));
  document.addEventListener('dragend', () => document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')));
  $('#booking-cards').addEventListener('dragstart', e => { const card = e.target.closest('[data-drag]'); if (card) { e.dataTransfer.setData('application/x-palmers-booking',card.dataset.drag); e.dataTransfer.effectAllowed = 'copy'; } });
  $('#calendar-days').addEventListener('drop', e => { e.preventDefault(); document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); const cell=e.target.closest('[data-date]'), b=bookings.find(b => b.id === e.dataTransfer.getData('application/x-palmers-booking')); if (cell && b) open(cell.dataset.date,b,true); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const petIds = selectedPets().map(p => p.id);
    if (!petIds.length) { $('#booking-error').textContent = 'Choose at least one pet.'; return; }
    const payload = {petIds,serviceId:fields.serviceId.value,date:fields.date.value,time:fields.time.value,duration:Number(fields.duration.value)};
    lock(true); $('#booking-error').textContent = '';
    try { const {booking} = await api('/me/bookings' + (editing ? '/'+editing : ''),editing ? 'PATCH' : 'POST',payload); bookings = bookings.filter(b => b.id !== booking.id).concat(booking); render(); dialog.close(); $('#calendar-status').textContent = 'Appointment saved to your account.'; }
    catch (e) { $('#booking-error').textContent = e.message; } finally { lock(false); }
  });
  $('#remove-booking').onclick = async () => {
    if (busy || !editing) return;
    const button = $('#remove-booking'); if (!button.dataset.confirm) { button.dataset.confirm = 'yes'; button.textContent = 'Confirm removal'; $('#booking-error').textContent = 'Remove this appointment? Other repeated appointments will stay.'; return; }
    lock(true);
    try { await api('/me/bookings/'+editing,'DELETE'); bookings = bookings.filter(b => b.id !== editing); if (copyId === editing) copyId = null; render(); dialog.close(); $('#calendar-status').textContent = 'Appointment removed.'; }
    catch(e) { $('#booking-error').textContent=e.message; } finally { lock(false); }
  };
  (async () => { try {
    const [account,data] = await Promise.all([api('/me'),api('/me/bookings')]); pets=account.pets; services=data.services; bookings=data.bookings;
    fields.serviceId.innerHTML=services.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('#booking-content').hidden=false; $('#calendar-status').innerHTML=pets.length ? '' : 'Add a pet in <a href="account.html">your account</a> before booking.'; render();
  } catch(e) { $('#calendar-status').textContent = 'Unable to load your calendar. '+e.message+' Refresh to try again.'; } })();
})();
