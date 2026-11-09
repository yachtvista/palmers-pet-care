/* Admin calendar. Every read and write is authorised by the API.
   A day opens on the 30-minute grid (07:00–20:00 UK time): bookings drawn as blocks, the 30-minute
   travel gaps around them shaded, overnights listed above. She can add a booking (the same activity
   booker customers use) or move a daytime one; a time inside another household's gap needs an
   explicit "Override gap", and an overlap is never allowed (the server enforces both). */
(() => {
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const S = window.BookingSlots;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'}).format(p / 100);
  const day = s => new Date(s + 'T00:00:00Z'), iso = d => d.toISOString().slice(0,10);
  const shortDay = date => day(date).toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
  const londonNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
  let today = londonNow().date;
  let month=day(today), bookings=[], services=[], availability=[], customers=null, selected=null, busy=false, sync, availabilityDirty=false;
  let privateBlocks=[], staff=[], scheduling={buffer_minutes:30}, plannerRange=1, schedulingDirty=false;
  let sheetMode = null; // { kind: 'add' } | { kind: 'move', booking }
  month.setUTCDate(1);
  const priceDialog=$('#price-dialog'),priceForm=$('#price-form');let priceBooking=null;
  const dialog=$('#day-dialog'), form=$('#availability-form'), sheet=$('#admin-booking-dialog'), sheetForm=$('#admin-booking-form');
  const state = b => b.status==='cancelled'?'Cancelled':b.status === 'approved' ? 'Approved' : 'Awaiting approval';
  const closed = date => availability.find(d => d.date === date)?.status || 'open';
  const blocking = b => ['pending', 'approved'].includes(b.status);
  const isPast = date => date < today;
  const productsOf = b => Array.isArray(b.activities) ? b.activities.map(a => a.serviceId)
    : b.serviceId === 'sitting' || b.unit === 'days' ? ['sitting']
    : Array(Math.max(1, Math.round((b.duration || 0.5) * 60 / (S.PRODUCT_MIN[b.serviceId] || 30)))).fill(b.serviceId);
  const windowOf = b => b.startAt != null ? { start: b.startAt, end: b.endAt } : { start: S.absAt(b.date, b.start || b.time), end: S.absAt(b.date, b.start || b.time) + Math.round((b.duration || 0) * (b.unit === 'days' ? 1440 : 60)) };
  function windowsFor(b){
    const w=windowOf(b);if(b.careMode!=='ordinary')return[w];
    const d0=Math.floor(w.start/1440),out=[{start:w.start,end:Math.min(w.end,(d0+1)*1440+480)}];
    for(let d=d0+1;d*1440+1200<w.end;d++)out.push({start:d*1440+1200,end:Math.min(w.end,(d+1)*1440+480)});
    return out;
  }
  const KIND_NAME = { walk: 'Dog walk', visit: 'Home visit', overnight: 'Overnight house-sit' };
  function titleOf(b) {
    if(b.packageName)return b.packageName;
    if(b.activities?.length===1){const service=services.find(s=>s.id===b.activities[0].serviceId);if(service && !['walk30','walk60','visit30','visit60'].includes(service.id))return service.name;}
    const groups = [];
    for (const id of productsOf(b)) { const k = S.KIND[id], last = groups[groups.length - 1]; if (last && last.k === k && k !== 'overnight') last.m += S.PRODUCT_MIN[id]; else groups.push({ k, m: S.PRODUCT_MIN[id] }); }
    return groups.map(g => g.k === 'overnight' ? KIND_NAME.overnight : `${KIND_NAME[g.k]} ${S.durationLabel(g.m)}`).join(' + ');
  }
  function when(b) { const w = windowOf(b), endDate = S.dateOf(w.end); return endDate !== S.dateOf(w.start) ? `${S.timeOf(w.start)} ${shortDay(S.dateOf(w.start))} → ${S.timeOf(w.end)} ${shortDay(endDate)}` : `${S.timeOf(w.start)}–${S.timeOf(w.end)}`; }
  function occurs(b, date) { if(!blocking(b))return false; const w = windowOf(b), d0 = S.dayNum(date) * S.DAY; return w.start < d0 + S.DAY && w.end > d0; }
  async function api(path, method='GET', body, signal) {
    const r=await fetch(API+path,{method,signal,cache:'no-store',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    if(r.status===401){location.href='login.html';throw new Error('Please sign in.');}
    if(r.status===403) throw Object.assign(new Error('Only admin accounts can manage bookings.'), {status:403});
    const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error || 'Could not save. Please try again.'), {data});return data;
  }
  function personalSnapshot(personal){
    privateBlocks=personal.blocks;staff=personal.staff;scheduling=personal.config;
    for(const [selector,placeholder] of [['#booking-staff','Allocate available carer'],['#block-staff',null]]){
      const select=$(selector),keep=select.value||(selector==='#block-staff'?personal.currentStaffId:'');
      select.innerHTML=(placeholder?'<option value="">'+placeholder+'</option>':'')+staff.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
      if([...select.options].some(o=>o.value===keep))select.value=keep;
    }
  }
  async function load() {
    const [data,personal]=await Promise.all([api('/admin/bookings'),api('/admin/personal-availability')]);
    personalSnapshot(personal);bookings=data.bookings;services=data.services;availability=data.availability;today=data.today?.date||today;
    $('#booking-content').hidden=false;render();
  }
  function monthWhen(b,date){
    const w=windowOf(b),first=S.dateOf(w.start),last=S.dateOf(w.end);
    if(first===last)return `${S.timeOf(w.start)}–${S.timeOf(w.end)}`;
    return date===first?`${S.timeOf(w.start)} → continues`:date===last?`Until ${S.timeOf(w.end)}`:'All day · continues';
  }
  function render() {
    $('#month-title').textContent=month.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
    const first=new Date(month);first.setUTCDate(1-(month.getUTCDay()+6)%7);
    $('#calendar-days').innerHTML=Array.from({length:Math.ceil(((month.getUTCDay()+6)%7+new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate())/7)*7},(_,i)=>{
      const d=new Date(first);d.setUTCDate(d.getUTCDate()+i);const date=iso(d),appointments=bookings.filter(b=>occurs(b,date)).sort((a,b)=>windowOf(a).start-windowOf(b).start),status=closed(date),past=isPast(date);
      const dayBlocks=privateBlocks.filter(p=>p.start_at<S.absAt(date,'00:00')+1440&&p.end_at>S.absAt(date,'00:00'));
      const count=appointments.length,stays=appointments.filter(b=>b.serviceId==='sitting').length;
      return `<button type="button" class="calendar-day admin-calendar-day ${appointments.some(blocking)?'has-booking':''} ${d.getUTCMonth()!==month.getUTCMonth()?'outside':''} ${date===today?'is-today':''} ${past?'is-past':''}" data-day="${date}" aria-label="${date}, ${count} appointments${stays?`, ${stays} house-sitting`:''}, ${status}${dayBlocks.length?', internal time blocked':''}"><time datetime="${date}">${d.getUTCDate()}</time>${appointments.slice(0,2).map(b=>`<span class="calendar-event ${b.careMode==='continuous'?'is-continuous':b.status==='approved'?'is-confirmed':b.status==='cancelled'?'is-cancelled':'is-provisional'}" title="${esc(when(b))}"><strong>${esc(b.petNames.join(', '))}</strong><small>${esc(monthWhen(b,date))}</small><small>${esc(b.owner.name)} · ${esc((b.petSpecies||[]).join(', '))}</small><small>${esc(b.careMode==='continuous'?'Continuous care':b.serviceId==='sitting'?'House-sitting':titleOf(b))}</small><small class="booking-state ${b.status==='approved'?'is-approved':'is-pending'}">${state(b)}</small></span>`).join('')}${count>2?`<span class="calendar-more">+${count-2} more — open day</span>`:''}<span class="calendar-mobile-count">${count?`${count} ${stays===count?(count===1?'stay':'stays'):(count===1?'visit':'visits')}`:''}</span><span class="day-availability ${status}"><span class="calendar-status-wide">${past?'Past':status==='open'?'Open':status==='full'?'Full':'Unavailable'}</span><span class="calendar-status-compact">${past?'Past':status==='open'?'Open':status==='full'?'Full':'Closed'}</span>${dayBlocks.length?' · Blocked':''}</span></button>`;

    }).join('');
    $('#admin-summary').textContent=`${bookings.filter(b=>b.status==='pending').length} appointments awaiting approval.`;
  }

  // ---------- the day: grid + list ----------
  const ROW = 44, OPEN = 0, CLOSE = 1440;
  const y = m => (m - OPEN) / S.STEP * ROW;
  const lane = staffId => staff.length>1 && staffId ? `left:calc(58px + (100% - 70px) * ${Math.max(0,staff.findIndex(s=>s.id===staffId))/staff.length});right:auto;width:calc((100% - 70px) / ${staff.length} - 4px);` : '';
  function renderGrid(list,date=selected,target=$('#day-grid')) {
    const d0 = S.dayNum(date) * S.DAY, g0 = d0 + OPEN, g1 = d0 + CLOSE;
    // Slots start a daytime visit. Skip closed/occupied controls in keyboard order;
    // longer house-sits remain available through Add booking. The API rechecks on save.
    const rows = [], carers=staff.length?staff:[{id:null}];
    for(let m=OPEN;m<CLOSE;m+=S.STEP){
      const start=d0+m,end=start+S.STEP;
      const occupied=carers.every(carer=>list.filter(blocking).some(b=>(!b.staffId||!carer.id||b.staffId===carer.id)&&windowsFor(b).some(w=>w.start<end&&start<w.end))||privateBlocks.some(p=>(!carer.id||p.staff_id===carer.id)&&p.start_at<end&&start<p.end_at));
      const disabled=closed(date)!=='open'||isPast(date)||m<S.toMin(S.OPEN)||m+S.STEP>S.toMin(S.CLOSE)||occupied;
      rows.push(`<button type="button" class="slot ${m%60?'':'on-hour'}" data-slot="${S.toHHMM(m)}" ${disabled?'disabled':''} aria-label="${disabled?'Unavailable for a daytime visit at':'Request booking at'} ${S.toHHMM(m)}"><span>${S.toHHMM(m)}</span></button>`);
    }
    const travel=[];
    for(const b of list.filter(blocking))for(const w of windowsFor(b)){
      if(b.gapOverride)continue;
      for(const [a,z]of [[w.start-scheduling.buffer_minutes,w.start],[w.end,w.end+scheduling.buffer_minutes]]){
        let pieces=[[Math.max(g0,a),Math.min(g1,z)]];
        for(const other of list.filter(blocking).filter(o=>!b.staffId||!o.staffId||o.staffId===b.staffId))for(const ow of windowsFor(other))pieces=pieces.flatMap(([a,z])=>ow.start>=z||ow.end<=a?[[a,z]]:[[a,Math.min(z,ow.start)],[Math.max(a,ow.end),z]]).filter(([a,z])=>z>a);
        for(const [start,end]of pieces)if(end>start)travel.push({start,end,staffId:b.staffId});
      }
    }
    const merged=[];for(const w of travel.sort((a,b)=>(a.staffId||'').localeCompare(b.staffId||'')||a.start-b.start)){const last=merged.at(-1);if(last&&last.staffId===w.staffId&&w.start<=last.end)last.end=Math.max(last.end,w.end);else merged.push({...w});}
    const bands=merged.map(w=>`<div class="gap-band" style="${lane(w.staffId)}top:${y(w.start-d0)}px;height:${y(w.end-d0)-y(w.start-d0)}px">Travel buffer</div>`);
    const blocks = list.filter(blocking).flatMap(b=>windowsFor(b).map(w=>({b,w}))).filter(({ w }) => w.start < g1 && w.end > g0).map(({ b, w }) => {
      const a = Math.max(w.start, g0), z = Math.min(w.end, g1);
      return `<button type="button" class="block ${z-a<=30?'is-short':''} ${b.careMode==='continuous'?'is-continuous':''} ${b.status === 'approved' ? 'is-approved' : 'is-pending'}" data-focus="${esc(b.id)}" style="${lane(b.staffId)}top:${y(a - d0) + 1}px;height:${Math.max(ROW - 2, y(z - d0) - y(a - d0) - 2)}px" aria-label="${esc(when(b))}, ${esc(b.owner.name)}, ${esc(b.petNames.join(', '))}, ${state(b)}"><strong>${esc(b.petNames.join(', '))} · ${a===g0?'00:00':esc(S.timeOf(a))}–${z===g1?'24:00':esc(S.timeOf(z))}</strong><span>${esc(b.owner.name)} · ${esc(b.careMode==='continuous'?'Continuous care':titleOf(b))} · ${state(b)}</span>${b.gapOverride ? ' · gap overridden' : ''}</button>`;
    });
    const grid = target;
    grid.classList.toggle('is-closed', closed(date) !== 'open');grid.dataset.date=date;grid.setAttribute('role','group');grid.setAttribute('aria-label','Bookings for '+shortDay(date));
    grid.style.height = (CLOSE - OPEN) / S.STEP * ROW + 'px';
    const personal=privateBlocks.filter(p=>p.start_at<g1&&p.end_at>g0).map(p=>{const a=Math.max(g0,p.start_at),z=Math.min(g1,p.end_at);return `<div class="block personal-block" style="${lane(p.staff_id)}top:${y(a-d0)}px;height:${Math.max(20,y(z-d0)-y(a-d0))}px">Internal unavailable · ${esc(staff.find(s=>s.id===p.staff_id)?.name)} · ${esc(p.reason)}</div>`;});
    grid.innerHTML = `<div class="staff-lane-headings">${staff.map(s=>`<span>${esc(s.name)}</span>`).join('')}</div>`+rows.join('') + bands.join('') + blocks.join('')+personal.join('');
    // Overnight time (before 07:00 / after 20:00) isn't on the grid: say it above.
    const nights = list.filter(blocking).filter(b => { const w = windowOf(b); return w.start < g0 || w.end > g1; });
    if(target===$('#day-grid'))$('#day-stays').innerHTML = nights.map(b => `<p class="day-banner">🌙 ${esc(when(b))} — ${esc(b.owner.name)}, ${esc(b.petNames.join(', '))} · ${esc(titleOf(b))} (${state(b)})</p>`).join('');
  }
  function appointmentPets(booking){
    const pets=booking.petProfiles||(booking.petIds||[]).map((id,i)=>({id,name:booking.petNames?.[i]||'Pet',species:booking.petSpecies?.[i]||'Not recorded'}));
    return `<div class="appointment-pets" aria-label="Pets included in this appointment">${pets.map(p=>{
      const photo=typeof p.profilePhotoUrl==='string'&&/^\/photos\/[A-Za-z0-9_-]+$/.test(p.profilePhotoUrl)?API+p.profilePhotoUrl:null;
      return `<div class="appointment-pet" data-pet-id="${esc(p.id)}" data-species="${esc(p.species)}"><div class="appointment-pet-photo">${photo?`<img src="${esc(photo)}" alt="${esc(p.name)}" width="88" height="88" loading="lazy">`:''}<span class="appointment-pet-placeholder" ${photo?'hidden':''} role="img" aria-label="No profile photo available for ${esc(p.name)}">${esc(p.name.slice(0,1))}</span></div><div><strong>${esc(p.name)}</strong><span>${esc(p.species)}</span><small class="appointment-photo-note" ${photo?'hidden':''}>No profile photo available</small></div></div>`;
    }).join('')}</div>`;
  }
  function renderDay(preserveDraft = false) {
    $('#day-title').textContent=day(selected).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    const past = isPast(selected);
    $('#day-past').hidden = !past;
    form.hidden = past; $('#add-booking').hidden = past || closed(selected) !== 'open';
    if (!preserveDraft || !availabilityDirty) form.elements.status.value=closed(selected);
    const oldScroll=$('#planner-scroll').scrollTop;
    const list=bookings.filter(b=>occurs(b,selected)).sort((a,b)=>windowOf(a).start-windowOf(b).start);
    $('#planner-first-title').textContent=shortDay(selected);$('#buffer-legend').textContent=`${scheduling.buffer_minutes}-minute travel buffer`;
    renderGrid(list);
    $('#extra-planner-days').innerHTML=Array.from({length:plannerRange-1},(_,i)=>`<section><h3>${shortDay(S.dateOf(S.absAt(selected,'00:00')+(i+1)*1440))}</h3><div class="day-grid" data-extra-day="${i+1}"></div></section>`).join('');
    for(const target of document.querySelectorAll('[data-extra-day]')){const date=S.dateOf(S.absAt(selected,'00:00')+Number(target.dataset.extraDay)*1440);renderGrid(bookings.filter(b=>occurs(b,date)),date,target);}
    $('#personal-list').innerHTML=privateBlocks.filter(p=>p.start_at<S.absAt(selected,'00:00')+1440&&p.end_at>S.absAt(selected,'00:00')).map(p=>`<article class="personal-entry"><strong>${esc(staff.find(s=>s.id===p.staff_id)?.name)} · ${esc(S.timeOf(p.start_at))}–${esc(S.timeOf(p.end_at))}</strong><p>${esc(p.reason||'Internal unavailable time')}</p><div><button class="pp-secondary" type="button" data-edit-block="${esc(p.id)}">Edit</button><button class="pp-secondary" type="button" data-delete-block="${esc(p.id)}">Delete occurrence</button></div></article>`).join('');
    if(!schedulingDirty)for(const el of $('#scheduling-form').elements){if(el.name)el.value=el.name==='buffer_minutes'?scheduling[el.name]??30:scheduling[el.name]==null?'':scheduling[el.name]/100;}

    $('#planner-scroll').scrollTop=preserveDraft?oldScroll:Math.max(0,y(Math.min(420,...list.flatMap(b=>windowsFor(b).filter(w=>w.start<S.absAt(selected,'00:00')+1440&&w.end>S.absAt(selected,'00:00')).map(w=>Math.max(0,w.start-S.absAt(selected,'00:00')))))));
    $('#day-appointments').innerHTML=list.length ? list.map(b=>`<article class="admin-appointment" id="appt-${esc(b.id)}"><h3>${esc(b.petNames.join(', '))}</h3>${appointmentPets(b)}<button type="button" class="pp-secondary" data-care-details="${esc(b.userId)}">Customer and pet profiles / care instructions</button><div data-details-for="${esc(b.userId)}"></div><p><strong>${esc(b.owner.name)}</strong> · <a href="mailto:${esc(b.owner.email)}">${esc(b.owner.email)}</a>${b.owner.phone?` · ${esc(b.owner.phone)}`:''}</p><dl><div><dt>Activities</dt><dd>${esc(titleOf(b))}</dd></div><div><dt>When</dt><dd>${esc(when(b))} (UK)</dd></div><div><dt>Booking charge</dt><dd>${money(b.total)}</dd></div><div><dt>Status</dt><dd>${state(b)}${b.gapOverride?' · 30-minute gap overridden':''}</dd></div></dl>${b.status!=='cancelled'&&!isPast(b.date)?`<button class="pp-secondary" type="button" data-price-edit="${esc(b.id)}">Change agreed price</button>`:''}${b.status==='cancelled'?'<p>Cancelled. Any refund must be reconciled separately.</p>':b.status==='approved'?'<p class="booking-state is-approved">✓ Approved</p>':`<button class="pp-primary" type="button" data-approve="${esc(b.id)}">Approve appointment</button>`} ${b.status!=='cancelled' && (b.unit === 'hours' || b.serviceId==='sitting') && Array.isArray(b.activities) && !past ? `<button class="pp-secondary" type="button" data-move="${esc(b.id)}">Edit booking</button>` : ''} ${b.status!=='cancelled'?`<button class="pp-secondary" type="button" data-cancel="${esc(b.id)}">Cancel appointment</button>`:''}</article>`).join('') : '<p class="pp-empty">No appointments for this day.</p>';
  }
  let disabledBeforeLock=new WeakMap();
  function lock(value){
    if(value&&!busy){sync?.invalidate();disabledBeforeLock=new WeakMap();}
    busy=value;
    const controls=[...dialog.querySelectorAll('button,select'),...sheetForm.querySelectorAll('button,select,input'),...priceForm.querySelectorAll('button,input'),$('#refresh-calendar')];
    for(const el of controls){
      if(value){if(!disabledBeforeLock.has(el))disabledBeforeLock.set(el,el.disabled);el.disabled=true;}
      else if(disabledBeforeLock.has(el)){el.disabled=disabledBeforeLock.get(el);disabledBeforeLock.delete(el);}
      // Newly rendered controls retain their own availability/validation state.
    }
    if(!value)booker.refresh();
  }

  async function openDay(date) {
    if(busy)return;availabilityDirty=false;selected=date;$('#personal-form').reset();$('#repeat-count-label').hidden=true;$('#personal-form').elements.date.value=date;$('#personal-form').elements.endDate.value=date;$('#availability-warning').hidden=true;$('#day-status').textContent='Loading latest appointments…';$('#day-appointments').innerHTML='';if(!dialog.open)dialog.showModal();lock(true);
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
  $('#planner-columns').onclick=async e=>{const grid=e.target.closest('.day-grid');if(!grid)return;const clickedDate=grid.dataset.date;const slot=e.target.closest('[data-slot]');if(slot&&!isPast(clickedDate)&&closed(clickedDate)==='open'){selected=clickedDate;await openSheet({kind:'add'});booker.open({date:clickedDate,start:slot.dataset.slot,products:['visit30']});return;}const t=e.target.closest('[data-focus]'); if(t){if(clickedDate!==selected)await openDay(clickedDate);document.getElementById('appt-'+t.dataset.focus)?.scrollIntoView({behavior:'smooth',block:'center'});}};
  $('#day-appointments').addEventListener('error',e=>{if(!e.target.matches('.appointment-pet img'))return;const card=e.target.closest('.appointment-pet');e.target.hidden=true;card.querySelector('.appointment-pet-placeholder').hidden=false;card.querySelector('.appointment-photo-note').hidden=false;},true);
  $('#day-appointments').onclick=async e=>{
    const price=e.target.closest('[data-price-edit]');if(price&&!busy){openPrice(bookings.find(b=>b.id===price.dataset.priceEdit));return;}
    const cancel=e.target.closest('[data-cancel]');
    if(cancel&&!busy){
      const b=bookings.find(b=>b.id===cancel.dataset.cancel);
      if(!window.confirm('Cancel this appointment and notify the customer? Receipts are retained. This does not issue a refund.'))return;
      lock(true);try{await api('/admin/bookings/'+b.id,'PATCH',{status:'cancelled',version:b.version});await load();renderDay(true);$('#day-status').textContent='Appointment cancelled. Reconcile any refund separately.';}catch(error){$('#day-status').textContent=error.message;}finally{lock(false);}return;
    }

    const move=e.target.closest('[data-move]'); if(move&&!busy){ openSheet({kind:'move', booking: bookings.find(b=>b.id===move.dataset.move)}); return; }
    const target=e.target.closest('[data-approve]');if(!target||busy)return;const b=bookings.find(b=>b.id===target.dataset.approve);lock(true);$('#day-status').textContent='Approving…';try{
    await api('/admin/bookings/'+b.id,'PATCH',{status:'approved',version:b.version});await load();renderDay(true);$('#day-status').textContent='Appointment approved.';
  }catch(e){$('#day-status').textContent=e.message+' Close and reopen this day to refresh.';}finally{lock(false);}};

  function priceDifference(){
    const amount=Math.round(Number(priceForm.elements.agreedPrice.value)*100);
    $('#price-difference').textContent=priceForm.elements.agreedPrice.value!==''&&Number.isSafeInteger(amount)?`Change from current charge: ${money(amount-priceBooking.total)}. Difference from ${priceBooking.standardEstimate==null||priceBooking.pricingVersion==='legacy-agreed-price-v1'?'original booking charge':'saved standard estimate'}: ${money(amount-(priceBooking.standardEstimate??priceBooking.total))}.`:'';
  }
  function openPrice(booking){
    priceBooking=booking;priceForm.reset();priceForm.elements.agreedPrice.value=(booking.total/100).toFixed(2);
    $('#price-booking').textContent=`${booking.owner.name} · ${booking.petNames.join(', ')} · ${when(booking)}`;
    $('#price-baseline').textContent=`${booking.standardEstimate==null||booking.pricingVersion==='legacy-agreed-price-v1'?'Original booking charge':'Saved standard estimate'}: ${money(booking.standardEstimate??booking.total)}${booking.provisionalEstimate?' (provisional)':''}. Current booking charge: ${money(booking.total)}.`;
    $('#price-error').textContent='';priceDifference();priceDialog.showModal();
  }
  priceForm.addEventListener('input',priceDifference);
  priceDialog.addEventListener('click',e=>{if(e.target.closest('[data-close-price]')&&!busy)priceDialog.close();});
  priceDialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  priceForm.onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    const fields=priceForm.elements,body={priceOnly:true,version:priceBooking.version,agreedPrice:Math.round(Number(fields.agreedPrice.value)*100),priceReason:fields.priceReason.value,priceConfirmed:fields.priceConfirmed.checked};
    lock(true);$('#price-error').textContent='';
    try{await api('/admin/bookings/'+priceBooking.id,'PATCH',body);priceDialog.close();await load();renderDay(true);$('#day-status').textContent='Agreed booking price updated. Appointment details and recorded payments are unchanged.';}
    catch(error){$('#price-error').textContent=error.message;}finally{lock(false);}
  };

  // ---------- add / move a booking (the shared activity booker, admin mode) ----------
  const sf = sheetForm.elements;
  const customerOf = () => sheetMode?.kind === 'move' ? sheetMode.booking.userId : sf.userId.value;
  // Every blocking booking but the one being moved; "same" = the chosen customer's household (no travel gap).
  const othersFor = (_date, exceptId) => bookings.filter(b => b.id !== exceptId && blocking(b) && (!sf.staffId.value || !b.staffId || b.staffId===sf.staffId.value)).flatMap(b => windowsFor(b).map(w=>({...w,same:b.userId===customerOf(),buffer:scheduling.buffer_minutes})));
  const booker = window.ActivityBooker($('#admin-booker'), {
    admin: true, services: () => services, others: othersFor, isClosed: date => closed(date) !== 'open', now: londonNow,
    onChange: () => { $('#admin-save').disabled = busy || (!night() && !booker.value()); $('#override-box').hidden = true; },
  });
  function chosenPets() {
    const c = (customers || []).find(c => c.id === sf.userId.value);
    return [...sheetForm.querySelectorAll('[name="petId"]:checked')].map(i => c?.pets.find(p => p.id === i.value)).filter(Boolean);
  }
  function renderPets() {
    const c = (customers || []).find(c => c.id === sf.userId.value);
    $('#admin-pet-options').innerHTML = (c?.pets || []).map(p => `<label><input type="checkbox" name="petId" value="${esc(p.id)}"><span>${esc(p.name)} <small>(${esc(p.species)})</small></span></label>`).join('') || '<p class="pp-hint">This customer has no pets yet.</p>';
    booker.setPets(chosenPets());
  }
  const night = () => sheetMode?.kind==='move'?sheetMode.booking.serviceId==='sitting':sheetForm.querySelector('[name="mode"]:checked')?.value==='night';
  function stayFields(b={}){
    $('#stay-fields').hidden=!night();$('#admin-booker').hidden=night();$('#precise-start-label').hidden=night();$('#travel-help').hidden=night();sf.preciseStart.value=b.start&&S.toMin(b.start)%30?b.start:'';
    if(night()){
      sf.arrivalDate.value=b.date||selected;sf.arrivalTime.value=b.start||'20:00';sf.departureDate.value=b.endDate||S.dateOf(S.absAt(selected,'00:00')+1440);sf.departureTime.value=b.end||'08:00';sf.careMode.value=b.careMode||'ordinary';sf.useCustomPrice.checked=!!b.useCustomPrice;sf.agreedPrice.value=b.total==null?'':b.total/100;sf.priceReason.value=b.priceReason||'';sf.priceConfirmed.checked=false;sf.staffId.value=b.staffId||sf.staffId.value;
    }
    stayEstimate();
  }
  function stayEstimate(){
    if(!night())return;
    const localMs=(date,time)=>{const seed=Date.parse(date+'T'+time+'Z');if(!Number.isFinite(seed))return NaN;const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:scheduling.timezone||'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const matches=[];for(const o of [-60,0,60]){const ms=seed+o*60000;if(fmt.format(new Date(ms)).replace(' ','T')===date+'T'+time)matches.push(ms);}return matches.length===1?matches[0]:NaN;};
    const minutes=(localMs(sf.departureDate.value,sf.departureTime.value)-localMs(sf.arrivalDate.value,sf.arrivalTime.value))/60000;
    let base=services.find(s=>s.id==='sitting')?.rate||4000;
    const pets=sheetMode?.kind==='move'?[]:chosenPets();
    base+=pets.slice().sort((a,b)=>(b.species==='Dog')-(a.species==='Dog')).slice(1).reduce((n,p)=>n+(p.species==='Dog'?800:p.species==='Cat'?400:0),0);
    const standard=sf.arrivalTime.value==='20:00'&&sf.departureTime.value==='08:00'&&S.absAt(sf.departureDate.value,sf.departureTime.value)-S.absAt(sf.arrivalDate.value,sf.arrivalTime.value)===720;
    let estimate=base,provisional=false;
    if(!standard){if(sf.careMode.value==='continuous'){if(scheduling.continuous_day_pence==null||scheduling.partial_hour_pence==null)provisional=true;else estimate=Math.floor(minutes/1440)*scheduling.continuous_day_pence+Math.ceil(minutes%1440/60)*scheduling.partial_hour_pence;}else if(scheduling.additional_hour_pence==null)provisional=true;else estimate=base+Math.ceil(Math.max(0,minutes-720)/60)*scheduling.additional_hour_pence;}
    $('#custom-price-fields').hidden=!sf.useCustomPrice.checked;
    const final=sf.useCustomPrice.checked?Math.round(Number(sf.agreedPrice.value)*100):estimate;
    $('#stay-estimate').textContent=Number.isFinite(minutes)&&minutes>0?`Duration: ${Math.floor(minutes/1440)} days ${minutes%1440?S.durationLabel(minutes%1440):''}. Standard estimate: ${money(estimate)}${provisional?' (provisional base only — no approved multi-day policy; confirm final charge)':''}. Agreed booking charge: ${money(final)}. Difference: ${money(final-estimate)}.`:'Choose valid, unambiguous arrival and departure times.';
    $('#admin-save').disabled=false;
  }

  async function openSheet(mode) {
    if (busy || isPast(selected)) return;
    sheetMode = mode; $('#admin-booking-error').textContent = ''; $('#override-box').hidden = true;
    const moving = mode.kind === 'move';
    $('#admin-booking-title').textContent = moving ? (mode.booking.serviceId==='sitting'?'Edit house-sitting':'Change start time') : 'Add a booking';
    $('#who-fields').hidden = moving; sf.userId.required=!moving; $('#moving-what').hidden = !moving;
    booker.lockActivities(moving);
    if (moving) {
      const b = mode.booking;
      $('#moving-what').textContent = `${b.owner.name} · ${b.petNames.join(', ')} · ${titleOf(b)} · ${selected}. ${b.serviceId==='sitting'?'Change arrival, departure or the agreed charge; review pricing before saving.':'The activities stay the same; only the start time changes.'}`;
      booker.setPets([]);
      sheet.showModal();stayFields(b);
      booker.open({ date: b.date, products: productsOf(b), start: b.start || b.time, excludeId: b.id });
      return;
    }
    if (!customers) { try { customers = (await api('/admin/customers')).customers.filter(c => c.pets.length); } catch (e) { $('#day-status').textContent = e.message; return; } }
    sf.staffId.value='';
    sf.userId.innerHTML = customers.map(c => `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(c.email)}</option>`).join('');
    sheetForm.querySelector('[name="mode"][value="day"]').checked = true;
    renderPets();
    sheet.showModal();
    booker.open({ date: selected, overnight: false });stayFields();
  }
  $('#add-booking').onclick = () => openSheet({ kind: 'add' });
  sheetForm.addEventListener('change', e => {
    if(e.target===sf.staffId)booker.refresh();
    if (e.target === sf.userId) { renderPets(); booker.refresh(); }
    if (e.target.name === 'petId') booker.setPets(chosenPets());
    if (e.target.name === 'mode') {booker.open({ date: selected, overnight: night() });stayFields();}if(night())stayEstimate();
  });
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close-sheet]') && !busy) sheet.close(); });
  sheet.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  async function saveBooking(gapOverride) {
    const v = night()?{date:sf.arrivalDate.value,start:sf.arrivalTime.value,endDate:sf.departureDate.value,end:sf.departureTime.value,activities:['sitting'],careMode:sf.careMode.value,useCustomPrice:sf.useCustomPrice.checked,agreedPrice:Math.round(Number(sf.agreedPrice.value)*100),priceReason:sf.priceReason.value,priceConfirmed:sf.priceConfirmed.checked,priceReviewed:sf.priceConfirmed.checked}:booker.value(), moving = sheetMode.kind === 'move';
    if(!night()&&v&&sf.preciseStart.value)v.start=sf.preciseStart.value;
    const body = moving
      ? { ...v, staffId:sf.staffId.value||undefined, version: sheetMode.booking.version, ...(gapOverride ? { gapOverride: true } : {}) }
      : { staffId:sf.staffId.value||undefined, userId: sf.userId.value, petIds: chosenPets().map(p => p.id), ...v, ...(gapOverride ? { gapOverride: true } : {}) };
    if (!moving && !body.petIds.length) { $('#admin-booking-error').textContent = 'Choose at least one pet.'; return; }
    lock(true); $('#admin-booking-error').textContent = '';
    try {
      await api(moving ? '/admin/bookings/' + sheetMode.booking.id : '/admin/bookings', moving ? 'PATCH' : 'POST', body);
      sheet.close(); await load(); renderDay(true);
      $('#day-status').textContent = moving ? 'Booking moved.' : 'Booking added and approved.';
    } catch (e) {
      if (e.data?.needsOverride) $('#override-box').hidden = false;
      else { $('#admin-booking-error').textContent = e.message; try { await load(); renderDay(true); } catch {} }
    } finally { lock(false); }
  }
  sheetForm.onsubmit = e => {
    e.preventDefault(); if (busy) return;
    if(night()){saveBooking(false);return;}
    const problem = booker.problem();
    if (problem) { $('#admin-booking-error').textContent = problem; return; }
    // Inside another household's travel gap: ask first. The server asks too (needsOverride) if the day changed meanwhile.
    if (booker.inGap()) { $('#override-box').hidden = false; $('#override-confirm').focus(); return; }
    saveBooking(false);
  };
  $('#override-confirm').onclick = () => { if (!busy) saveBooking(true); };
  $('#override-cancel').onclick = () => { $('#override-box').hidden = true; };

  // Keep all vertical scrolling inside the planner: timeline first, then its dialog.
  const timeline=$('#planner-scroll');let pan=null,momentum=0;
  function scrollPlanner(distance){
    const before=timeline.scrollTop,outerBefore=dialog.scrollTop;
    timeline.scrollTop=Math.max(0,Math.min(timeline.scrollHeight-timeline.clientHeight,before+distance));
    dialog.scrollTop+=distance-(timeline.scrollTop-before);
    return timeline.scrollTop-before+dialog.scrollTop-outerBefore;
  }
  function stopMomentum(){cancelAnimationFrame(momentum);momentum=0;}
  timeline.addEventListener('wheel',e=>{
    if(!dialog.open||e.ctrlKey||e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||!e.cancelable)return;
    stopMomentum();const scale=e.deltaMode===1?16:e.deltaMode===2?timeline.clientHeight:1;
    const distance=e.deltaY*scale,before=timeline.scrollTop,max=timeline.scrollHeight-timeline.clientHeight;
    const remainder=distance-(Math.max(0,Math.min(max,before+distance))-before);
    if(Math.abs(remainder)<.5)return;
    e.preventDefault();scrollPlanner(distance);
  },{passive:false});
  // Native touch latching can refuse to leave a nested scroller. Handle vertical
  // pans in this region, retaining horizontal day navigation and pinch zoom.
  timeline.addEventListener('touchstart',e=>{stopMomentum();if(e.touches.length!==1){pan=null;return;}const t=e.touches[0];pan={x:t.clientX,y:t.clientY,lastY:t.clientY,time:performance.now(),velocity:0,axis:null};},{passive:true});
  timeline.addEventListener('touchmove',e=>{
    if(!pan||e.touches.length!==1){pan=null;return;}
    const t=e.touches[0],now=performance.now(),dx=t.clientX-pan.x,dy=t.clientY-pan.y;
    if(!pan.axis){if(Math.max(Math.abs(dx),Math.abs(dy))<4)return;pan.axis=Math.abs(dy)>Math.abs(dx)?'vertical':'horizontal';}
    if(pan.axis!=='vertical')return;
    if(e.cancelable)e.preventDefault();const distance=pan.lastY-t.clientY;
    pan.velocity=Math.max(-3,Math.min(3,distance/Math.max(8,now-pan.time)));scrollPlanner(distance);pan.lastY=t.clientY;pan.time=now;
  },{passive:false});
  timeline.addEventListener('touchend',()=>{
    const ended=pan;pan=null;if(!ended||ended.axis!=='vertical'||performance.now()-ended.time>100)return;
    let velocity=ended.velocity,last=performance.now();
    const frame=now=>{if(!dialog.open)return;const elapsed=Math.min(40,now-last);last=now;velocity*=Math.exp(-elapsed/230);if(Math.abs(velocity)<.02||Math.abs(scrollPlanner(velocity*elapsed))<.1){momentum=0;return;}momentum=requestAnimationFrame(frame);};
    momentum=requestAnimationFrame(frame);
  },{passive:true});
  timeline.addEventListener('touchcancel',()=>{pan=null;stopMomentum();},{passive:true});

  $('#planner-range').onchange=e=>{plannerRange=Number(e.target.value);renderDay();};
  for(const [id,delta] of [['day-prev',-1],['day-next',1]])$('#'+id).onclick=()=>openDay(S.dateOf(S.absAt(selected,'00:00')+delta*1440));
  $('#personal-form').addEventListener('change',e=>{if(e.target.name==='repeat')$('#repeat-count-label').hidden=!e.target.value;});
  $('#personal-form').onsubmit=async e=>{e.preventDefault();const f=e.target.elements,b=Object.fromEntries(new FormData(e.target));b.count=Number(b.count);try{await api('/admin/personal-availability'+(b.blockId?'/'+b.blockId:''),b.blockId?'PATCH':'POST',b);f.blockId.value='';await load();renderDay();$('#day-status').textContent='Internal availability saved. Customer bookings are unchanged.';}catch(e){$('#day-status').textContent=e.message;}};
  $('#personal-list').onclick=async e=>{const edit=e.target.closest('[data-edit-block]'),del=e.target.closest('[data-delete-block]');if(edit){const p=privateBlocks.find(p=>p.id===edit.dataset.editBlock),f=$('#personal-form').elements;f.blockId.value=p.id;f.staffId.value=p.staff_id;f.date.value=S.dateOf(p.start_at);f.start.value=S.timeOf(p.start_at);f.endDate.value=S.dateOf(p.end_at);f.end.value=S.timeOf(p.end_at);f.reason.value=p.reason;f.repeat.value='';f.count.value=1;}if(del&&confirm('Delete this future internal availability occurrence?')){try{await api('/admin/personal-availability/'+del.dataset.deleteBlock,'DELETE');await load();renderDay();}catch(e){$('#day-status').textContent=e.message;}}};
  $('#scheduling-form').addEventListener('input',()=>schedulingDirty=true);
  $('#scheduling-form').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));for(const k in b)b[k]=b[k]===''?null:Math.round(Number(b[k])*(k==='buffer_minutes'?1:100));try{await api('/admin/scheduling-config','PATCH',b);schedulingDirty=false;await load();renderDay();}catch(e){$('#day-status').textContent=e.message;}};
  $('#day-appointments').addEventListener('click',async e=>{const t=e.target.closest('[data-care-details]');if(!t)return;try{customers=(await api('/admin/customers')).customers;const c=customers.find(c=>c.id===t.dataset.careDetails);const box=t.nextElementSibling;box.innerHTML=c?`<details open><summary>${esc(c.name)} — contact and pet care</summary><p>${esc(c.phone)} · ${esc(c.email)}</p><p>${esc(c.address||'')}</p><p>Emergency contact: ${esc(c.emergencyName||'')} ${esc(c.emergencyRelationship||'')} ${esc(c.emergencyPhone||'')}</p>${c.pets.map(p=>`<details><summary>${esc(p.name)} (${esc(p.species)})</summary>${Object.entries(p).filter(([k,v])=>v&&['notes','diet','medication','medicationFrequency','likes','dislikes','emergencyContact'].includes(k)).map(([k,v])=>`<p><strong>${esc(k)}</strong>: ${esc(v)}</p>`).join('')}</details>`).join('')}</details>`:'';}catch(e){$('#day-status').textContent=e.message;}});
  for(const [id,delta] of [['previous',-1],['next',1]])$('#'+id).onclick=()=>{month.setUTCMonth(month.getUTCMonth()+delta);render();};
  $('#today').onclick=()=>{month=day(today);month.setUTCDate(1);render();};
  $('#refresh-calendar').onclick=async()=>{if(busy)return;lock(true);try{await load();$('#calendar-status').textContent='Calendar refreshed.';}catch(e){$('#calendar-status').textContent=e.message;}finally{lock(false);}};
  sync = window.calendarSync({
    read: async signal => {const [data,personal]=await Promise.all([api('/admin/bookings','GET',undefined,signal),api('/admin/personal-availability','GET',undefined,signal)]);return{...data,personal};},
    paused: () => busy || sheet.open || priceDialog.open,
    onError: error => { if ($('#booking-content').hidden) $('#calendar-status').textContent = error.message; },
    apply(data) {
      const changed = JSON.stringify([bookings, services, availability,privateBlocks,scheduling]) !== JSON.stringify([data.bookings, data.services, data.availability,data.personal.blocks,data.personal.config]);
      personalSnapshot(data.personal);bookings=data.bookings; services=data.services; availability=data.availability; today = data.today?.date || today;
      const firstLoad = $('#booking-content').hidden;
      $('#booking-content').hidden=false;
      if (firstLoad) $('#calendar-status').textContent='';
      if (changed || firstLoad) { render(); if (dialog.open) renderDay(true); }
    }
  });
  sync.refresh();
})();
