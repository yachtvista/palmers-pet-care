/* Admin calendar. Every read and write is authorised by the API.
   A day opens on the 30-minute grid (07:00–20:00 UK time): bookings drawn as blocks, the 30-minute
   gaps around them shaded. She can add or move a booking; a time inside a gap needs an explicit
   "Override gap", and an overlap is never allowed (the server enforces both). */
(() => {
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const S = window.BookingSlots;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'}).format(p / 100);
  const day = s => new Date(s + 'T00:00:00Z'), iso = d => d.toISOString().slice(0,10);
  const londonNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
  let today = londonNow().date;
  let month=day(today), bookings=[], services=[], availability=[], customers=null, selected=null, busy=false, sync, availabilityDirty=false;
  let sheetMode = null; // { kind: 'add' } | { kind: 'move', booking }
  month.setUTCDate(1);
  const dialog=$('#day-dialog'), form=$('#availability-form'), sheet=$('#admin-booking-dialog'), sheetForm=$('#admin-booking-form');
  const state = b => b.status === 'approved' ? 'Approved' : 'Awaiting approval';
  const closed = date => availability.find(d => d.date === date)?.status || 'open';
  const service = b => services.find(s => s.id === b.serviceId)?.name || b.serviceId;
  const blocking = b => ['pending', 'approved'].includes(b.status);
  const isPast = date => date < today;
  const when = b => b.unit === 'days' ? `from ${b.time} · ${b.duration} night${b.duration === 1 ? '' : 's'}` : `${b.start || b.time}–${b.end || ''}`;
  function occurs(b,date) {
    if (b.unit === 'days') return +day(date) >= +day(b.date) && +day(date) < +day(b.date) + b.duration*86400000;
    return b.date === date;
  }
  async function api(path, method='GET', body, signal) {
    const r=await fetch(API+path,{method,signal,cache:'no-store',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    if(r.status===401){location.href='login.html';throw new Error('Please sign in.');}
    if(r.status===403) throw Object.assign(new Error('Only admin accounts can manage bookings.'), {status:403});
    const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error || 'Could not save. Please try again.'), {data});return data;
  }
  async function load() {
    const data=await api('/admin/bookings'); bookings=data.bookings;services=data.services;availability=data.availability; today = data.today?.date || today;
    $('#booking-content').hidden=false;render();
  }
  function render() {
    $('#month-title').textContent=month.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
    const first=new Date(month);first.setUTCDate(1-(month.getUTCDay()+6)%7);
    $('#calendar-days').innerHTML=Array.from({length:42},(_,i)=>{
      const d=new Date(first);d.setUTCDate(d.getUTCDate()+i);const date=iso(d),appointments=bookings.filter(b=>occurs(b,date)).sort((a,b)=>(a.start||a.time).localeCompare(b.start||b.time)),status=closed(date),past=isPast(date);
      return `<button type="button" class="calendar-day admin-calendar-day ${d.getUTCMonth()!==month.getUTCMonth()?'outside':''} ${date===today?'is-today':''} ${past?'is-past':''}" data-day="${date}" aria-label="${date}${past?' (past)':''}, ${appointments.length} appointments, ${status}"><time datetime="${date}">${d.getUTCDate()}</time>${appointments.map(b=>`<span class="calendar-event">${esc(b.petNames.join(', '))}<small>${esc(when(b))} · ${esc(b.owner.name)}</small><small class="booking-state ${b.status === 'approved' ? 'is-approved' : 'is-pending'}">${state(b)}</small></span>`).join('')}<span class="day-availability ${status}">${past ? 'Past' : status==='open' ? (appointments.length?'Open':'＋ Open') : status==='full'?'Full':'Unavailable'}</span></button>`;
    }).join('');
    $('#admin-summary').textContent=`${bookings.filter(b=>b.status==='pending').length} appointments awaiting approval.`;
  }

  // ---------- the day: grid + list ----------
  const ROW = 28, OPEN = S.toMin(S.OPEN), CLOSE = S.toMin(S.CLOSE);
  const y = m => (m - OPEN) / S.STEP * ROW;
  function renderGrid(list) {
    const timed = list.filter(b => b.unit === 'hours' && b.start && b.end);
    const rows = []; for (let m = OPEN; m < CLOSE; m += S.STEP) rows.push(`<div class="slot ${m % 60 ? '' : 'on-hour'}"><span>${S.toHHMM(m)}</span></div>`);
    // Gap bands: 30 minutes either side of every blocking booking, clipped to the day.
    const bands = timed.filter(blocking).flatMap(b => [[S.toMin(b.start) - S.GAP, S.toMin(b.start)], [S.toMin(b.end), S.toMin(b.end) + S.GAP]])
      .map(([a, z]) => [Math.max(OPEN, a), Math.min(CLOSE, z)]).filter(([a, z]) => z > a)
      .map(([a, z]) => `<div class="gap-band" style="top:${y(a)}px;height:${y(z) - y(a)}px" aria-hidden="true">gap</div>`);
    const blocks = timed.map(b => `<button type="button" class="block ${b.status === 'approved' ? 'is-approved' : 'is-pending'}" data-focus="${esc(b.id)}" style="top:${y(S.toMin(b.start)) + 1}px;height:${Math.max(ROW - 2, y(S.toMin(b.end)) - y(S.toMin(b.start)) - 2)}px" aria-label="${esc(b.start)} to ${esc(b.end)}, ${esc(b.owner.name)}, ${esc(b.petNames.join(', '))}, ${state(b)}"><strong>${esc(b.start)}–${esc(b.end)} · ${esc(b.owner.name)}</strong>${esc(b.petNames.join(', '))} · ${esc(service(b))} · ${state(b)}${b.gapOverride ? ' · gap overridden' : ''}</button>`);
    const grid = $('#day-grid');
    grid.classList.toggle('is-closed', closed(selected) !== 'open');
    grid.style.height = (CLOSE - OPEN) / S.STEP * ROW + 'px';
    grid.innerHTML = rows.join('') + bands.join('') + blocks.join('');
    const stays = list.filter(b => b.unit === 'days');
    $('#day-stays').innerHTML = stays.map(b => `<p class="day-banner">🌙 House-sitting ${esc(when(b))} — ${esc(b.owner.name)}, ${esc(b.petNames.join(', '))} (${state(b)})</p>`).join('');
  }
  function renderDay(preserveDraft = false) {
    $('#day-title').textContent=day(selected).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    const past = isPast(selected);
    $('#day-past').hidden = !past;
    form.hidden = past; $('#add-booking').hidden = past || closed(selected) !== 'open';
    if (!preserveDraft || !availabilityDirty) form.elements.status.value=closed(selected);
    const list=bookings.filter(b=>occurs(b,selected)).sort((a,b)=>(a.start||a.time).localeCompare(b.start||b.time));
    renderGrid(list);
    $('#day-appointments').innerHTML=list.length ? list.map(b=>`<article class="admin-appointment" id="appt-${esc(b.id)}"><h3>${esc(b.petNames.join(', '))}</h3><p><strong>${esc(b.owner.name)}</strong> · <a href="mailto:${esc(b.owner.email)}">${esc(b.owner.email)}</a>${b.owner.phone?` · ${esc(b.owner.phone)}`:''}</p><dl><div><dt>Service</dt><dd>${esc(service(b))}</dd></div><div><dt>When</dt><dd>${esc(b.date)}, ${esc(when(b))} (UK)</dd></div><div><dt>Estimated total</dt><dd>${money(b.total)}</dd></div><div><dt>Status</dt><dd>${state(b)}${b.gapOverride?' · 30-minute gap overridden':''}</dd></div></dl>${b.status==='approved'?'<p class="booking-state is-approved">✓ Approved</p>':`<button class="pp-primary" type="button" data-approve="${esc(b.id)}">Approve appointment</button>`} ${b.unit==='hours' && !past ? `<button class="pp-secondary" type="button" data-move="${esc(b.id)}">Change time</button>` : ''}</article>`).join('') : '<p class="pp-empty">No appointments for this day.</p>';
  }
  function lock(value) {if(value)sync?.invalidate();busy=value;dialog.querySelectorAll('button,select').forEach(el=>el.disabled=value);sheetForm.querySelectorAll('button,select,input').forEach(el=>el.disabled=value);$('#refresh-calendar').disabled=value;if(!value)updateSheet();}
  async function openDay(date) {
    if(busy)return;availabilityDirty=false;selected=date;$('#availability-warning').hidden=true;$('#day-status').textContent='Loading latest appointments…';$('#day-appointments').innerHTML='';dialog.showModal();lock(true);
    try{await load();renderDay();$('#day-status').textContent='';}catch(e){$('#day-status').textContent=e.message;form.querySelector('button').dataset.failed='true';}finally{lock(false);if(form.querySelector('button').dataset.failed){form.querySelector('button').disabled=true;delete form.querySelector('button').dataset.failed;}}
  }
  $('#calendar-days').onclick=e=>{const target=e.target.closest('[data-day]');if(target)openDay(target.dataset.day);};
  $('#close-day').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.elements.status.addEventListener('change', () => { availabilityDirty=true; $('#availability-warning').hidden=true; });
  async function saveAvailability(confirm) {
    lock(true);$('#day-status').textContent='Saving…';
    try{
      const result=await api('/admin/booking-days/'+selected,'PATCH',{status:form.elements.status.value, ...(confirm ? {confirm:true} : {})});
      availabilityDirty=false;availability=availability.filter(d=>d.date!==selected);if(result.status!=='open')availability.push(result);render();renderDay();
      $('#availability-warning').hidden=true;$('#day-status').textContent='Availability saved. Existing appointments are unchanged.';
    }catch(e){
      // Bookings already on this day: list them and ask before closing it. Nothing is cancelled.
      if (e.data?.needsConfirm) {
        const box=$('#availability-warning'); box.hidden=false;
        box.innerHTML=`<strong>${esc(e.message)}</strong><ul class="warn-list">${e.data.bookings.map(b=>`<li>${esc(when(b))} — ${esc(b.owner.name)}, ${esc(b.petNames.join(', '))} (${state(b)})</li>`).join('')}</ul><p>Contact these customers if their appointments need to move.</p><div class="pp-modal-actions"><button type="button" class="pp-secondary" data-warn-cancel>Keep the day open</button><button type="button" class="pp-primary" data-warn-confirm>Mark ${form.elements.status.value === 'full' ? 'full' : 'unavailable'} anyway</button></div>`;
        $('#day-status').textContent='';
      } else $('#day-status').textContent=e.message;
    }finally{lock(false);}
  }
  form.onsubmit=e=>{e.preventDefault();if(!busy)saveAvailability(false);};
  $('#availability-warning').onclick=e=>{ if(busy) return; if(e.target.closest('[data-warn-confirm]')) saveAvailability(true); if(e.target.closest('[data-warn-cancel]')){ $('#availability-warning').hidden=true; form.elements.status.value=closed(selected); availabilityDirty=false; } };
  $('#day-grid').onclick=e=>{const t=e.target.closest('[data-focus]'); if(t) document.getElementById('appt-'+t.dataset.focus)?.scrollIntoView({behavior:'smooth',block:'center'});};
  $('#day-appointments').onclick=async e=>{
    const move=e.target.closest('[data-move]'); if(move&&!busy){ openSheet({kind:'move', booking: bookings.find(b=>b.id===move.dataset.move)}); return; }
    const target=e.target.closest('[data-approve]');if(!target||busy)return;const b=bookings.find(b=>b.id===target.dataset.approve);lock(true);$('#day-status').textContent='Approving…';try{
    await api('/admin/bookings/'+b.id,'PATCH',{status:'approved',version:b.version});await load();renderDay(true);$('#day-status').textContent='Appointment approved.';
  }catch(e){$('#day-status').textContent=e.message+' Close and reopen this day to refresh.';}finally{lock(false);}};

  // ---------- add / move a booking ----------
  const sf = sheetForm.elements;
  const fromWheel = window.BookingWheel($('#admin-from-wheel'), { label: 'From', onChange: () => refreshTo() });
  const toWheel = window.BookingWheel($('#admin-to-wheel'), { label: 'To', onChange: () => updateSheet() });
  let sheetStarts = [], sheetEnds = [];
  const timedServices = () => services.filter(s => s.unit === 'hours');
  const sheetService = () => sheetMode?.kind === 'move' ? services.find(s => s.id === sheetMode.booking.serviceId) : services.find(s => s.id === sf.serviceId.value);
  const unitMin = s => Math.round((s?.step || 0.5) * 60);
  function sheetCtx() {
    const exceptId = sheetMode?.kind === 'move' ? sheetMode.booking.id : null, now = londonNow();
    const others = bookings.filter(b => b.unit === 'hours' && b.date === selected && b.id !== exceptId && blocking(b) && b.start && b.end).map(b => ({ start: S.toMin(b.start), end: S.toMin(b.end) }));
    return { others, closed: closed(selected) !== 'open', nowMin: selected === now.date ? S.toMin(now.time) : null, unit: unitMin(sheetService()) };
  }
  // Gap times stay choosable for her (striped); overlaps, the past and closed days do not.
  const opt = o => ({ value: o.min, label: o.label, disabled: !!o.reason && o.reason !== 'gap', gap: o.reason === 'gap', title: o.reason ? S.REASONS[o.reason] : '' });
  function refreshFrom(want) { sheetStarts = S.startOptions(sheetCtx()); fromWheel.set(sheetStarts.map(opt), want ?? fromWheel.value); refreshTo(); }
  function refreshTo(want) {
    const from = fromWheel.value;
    sheetEnds = from == null ? [] : S.endOptions(from, sheetCtx());
    toWheel.set(sheetEnds.map(opt), want ?? toWheel.value ?? (from != null ? from + unitMin(sheetService()) : null));
    $('#override-box').hidden = true; updateSheet();
  }
  function updateSheet() {
    if (!sheet.open) return;
    const from = fromWheel.value, to = toWheel.value;
    const why = [...new Set([...sheetStarts, ...sheetEnds].filter(o => o.reason).map(o => S.REASONS[o.reason]))];
    $('#admin-picker-reason').textContent = from == null ? 'No times left on this day.' : why.length ? `Greyed or striped: ${why.join(' · ')}` : '';
    const inGap = from != null && to != null && S.conflictWith(from, to, sheetCtx().others) === 'gap';
    $('#admin-picker-summary').textContent = from != null && to != null ? `${S.toHHMM(from)}–${S.toHHMM(to)} · ${S.durationLabel(to - from)}${inGap ? ' · inside a 30-minute gap' : ''}` : '';
    $('#admin-save').disabled = busy || from == null || to == null;
  }
  function renderPets(keep = []) {
    const c = (customers || []).find(c => c.id === sf.userId.value), s = services.find(s => s.id === sf.serviceId.value);
    const pets = (c?.pets || []).filter(p => !s?.species || s.species.includes(p.species));
    $('#admin-pet-options').innerHTML = pets.length ? pets.map(p => `<label><input type="checkbox" name="petId" value="${esc(p.id)}" ${keep.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)} <small>(${esc(p.species)})</small></span></label>`).join('') : '<p class="pp-hint">This customer has no pets for this service.</p>';
  }
  async function openSheet(mode) {
    if (busy || isPast(selected)) return;
    sheetMode = mode; $('#admin-booking-error').textContent = ''; $('#override-box').hidden = true;
    const moving = mode.kind === 'move';
    $('#admin-booking-title').textContent = moving ? 'Change time' : 'Add a booking';
    $('#who-fields').hidden = moving; $('#moving-what').hidden = !moving;
    if (moving) $('#moving-what').textContent = `${mode.booking.owner.name} · ${mode.booking.petNames.join(', ')} · ${service(mode.booking)} · ${selected}`;
    else {
      if (!customers) { try { customers = (await api('/admin/customers')).customers.filter(c => c.pets.length); } catch (e) { $('#day-status').textContent = e.message; return; } }
      sf.userId.innerHTML = customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(c.email)}</option>`).join('');
      sf.serviceId.innerHTML = timedServices().map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      renderPets();
    }
    sheet.showModal();
    fromWheel.set([], null);
    refreshFrom(moving ? S.toMin(mode.booking.start) : undefined);
    if (moving) refreshTo(S.toMin(mode.booking.end));
  }
  $('#add-booking').onclick = () => openSheet({ kind: 'add' });
  sf.userId.addEventListener('change', () => renderPets());
  sf.serviceId.addEventListener('change', () => { renderPets([...sheetForm.querySelectorAll('[name="petId"]:checked')].map(i => i.value)); refreshFrom(); });
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close-sheet]') && !busy) sheet.close(); });
  sheet.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  async function saveBooking(gapOverride) {
    const from = fromWheel.value, to = toWheel.value, moving = sheetMode.kind === 'move';
    const body = moving
      ? { start: S.toHHMM(from), end: S.toHHMM(to), version: sheetMode.booking.version, ...(gapOverride ? { gapOverride: true } : {}) }
      : { userId: sf.userId.value, petIds: [...sheetForm.querySelectorAll('[name="petId"]:checked')].map(i => i.value), serviceId: sf.serviceId.value, date: selected, start: S.toHHMM(from), end: S.toHHMM(to), ...(gapOverride ? { gapOverride: true } : {}) };
    if (!moving && !body.petIds.length) { $('#admin-booking-error').textContent = 'Choose at least one pet.'; return; }
    lock(true); $('#admin-booking-error').textContent = '';
    try {
      await api(moving ? '/admin/bookings/' + sheetMode.booking.id : '/admin/bookings', moving ? 'PATCH' : 'POST', body);
      sheet.close(); await load(); renderDay(true);
      $('#day-status').textContent = moving ? 'Booking moved.' : 'Booking added and approved.';
    } catch (e) {
      if (e.data?.needsOverride) $('#override-box').hidden = false;
      else { $('#admin-booking-error').textContent = e.message; try { await load(); renderDay(true); refreshFrom(); } catch {} }
    } finally { lock(false); }
  }
  sheetForm.onsubmit = e => {
    e.preventDefault(); if (busy) return;
    // Inside a gap: ask first. The server asks too (needsOverride) if the day changed meanwhile.
    const from = fromWheel.value, to = toWheel.value;
    if (S.conflictWith(from, to, sheetCtx().others) === 'gap') { $('#override-box').hidden = false; $('#override-confirm').focus(); return; }
    saveBooking(false);
  };
  $('#override-confirm').onclick = () => { if (!busy) saveBooking(true); };
  $('#override-cancel').onclick = () => { $('#override-box').hidden = true; };

  for(const [id,delta] of [['previous',-1],['next',1]])$('#'+id).onclick=()=>{month.setUTCMonth(month.getUTCMonth()+delta);render();};
  $('#today').onclick=()=>{month=day(today);month.setUTCDate(1);render();};
  $('#refresh-calendar').onclick=async()=>{if(busy)return;lock(true);try{await load();$('#calendar-status').textContent='Calendar refreshed.';}catch(e){$('#calendar-status').textContent=e.message;}finally{lock(false);}};
  sync = window.calendarSync({
    read: signal => api('/admin/bookings', 'GET', undefined, signal),
    paused: () => busy || sheet.open,
    onError: error => { if ($('#booking-content').hidden) $('#calendar-status').textContent = error.message; },
    apply(data) {
      const changed = JSON.stringify([bookings, services, availability]) !== JSON.stringify([data.bookings, data.services, data.availability]);
      bookings=data.bookings; services=data.services; availability=data.availability; today = data.today?.date || today;
      const firstLoad = $('#booking-content').hidden;
      $('#booking-content').hidden=false;
      if (firstLoad) $('#calendar-status').textContent='';
      if (changed || firstLoad) { render(); if (dialog.open) renderDay(true); }
    }
  });
  sync.refresh();
})();
