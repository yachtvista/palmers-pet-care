/* Admin calendar. Every read and write is authorised by the API. */
(() => {
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = p => new Intl.NumberFormat('en-GB', {style:'currency',currency:'GBP'}).format(p / 100);
  const day = s => new Date(s + 'T00:00:00Z'), iso = d => d.toISOString().slice(0,10);
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let month=day(today), bookings=[], services=[], availability=[], selected=null, busy=false;
  month.setUTCDate(1);
  const dialog=$('#day-dialog'), form=$('#availability-form');
  const state = b => b.status === 'approved' ? 'Approved' : 'Awaiting approval';
  const closed = date => availability.find(d => d.date === date)?.status || 'open';
  const service = b => services.find(s => s.id === b.serviceId)?.name || b.serviceId;
  function occurs(b,date) {
    const start=+day(b.date)+Number(b.time.slice(0,2))*3600000+Number(b.time.slice(3))*60000;
    const end=b.unit==='days' ? +day(b.date)+b.duration*86400000 : start+b.duration*3600000;
    return +day(date)<end && +day(date)+86400000>start;
  }
  async function api(path, method='GET', body) {
    const r=await fetch(API+path,{method,credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    if(r.status===401){location.href='login.html';throw new Error('Please sign in.');}
    if(r.status===403) throw new Error('Only admin accounts can manage bookings.');
    const data=await r.json();if(!r.ok)throw new Error(data.error || 'Could not save. Please try again.');return data;
  }
  async function load() {
    const data=await api('/admin/bookings'); bookings=data.bookings;services=data.services;availability=data.availability;
    $('#booking-content').hidden=false;render();
  }
  function render() {
    $('#month-title').textContent=month.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
    const first=new Date(month);first.setUTCDate(1-(month.getUTCDay()+6)%7);
    $('#calendar-days').innerHTML=Array.from({length:42},(_,i)=>{
      const d=new Date(first);d.setUTCDate(d.getUTCDate()+i);const date=iso(d),appointments=bookings.filter(b=>occurs(b,date)),status=closed(date);
      return `<button type="button" class="calendar-day admin-calendar-day ${d.getUTCMonth()!==month.getUTCMonth()?'outside':''} ${date===today?'is-today':''}" data-day="${date}" aria-label="${date}, ${appointments.length} appointments, ${status}"><time datetime="${date}">${d.getUTCDate()}</time>${appointments.map(b=>`<span class="calendar-event">${esc(b.petNames.join(', '))}<small>${esc(b.time)} · ${esc(b.owner.name)}</small><small class="booking-state">${state(b)}</small></span>`).join('')}<span class="day-availability ${status}">${status==='open' ? (appointments.length?'Open':'＋ Open') : status==='full'?'Full':'Unavailable'}</span></button>`;
    }).join('');
    $('#admin-summary').textContent=`${bookings.filter(b=>b.status==='pending').length} appointments awaiting approval.`;
  }
  function renderDay() {
    $('#day-title').textContent=day(selected).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    form.elements.status.value=closed(selected);
    const list=bookings.filter(b=>occurs(b,selected)).sort((a,b)=>a.time.localeCompare(b.time));
    $('#day-appointments').innerHTML=list.length ? list.map(b=>`<article class="admin-appointment"><h3>${esc(b.petNames.join(', '))}</h3><p><strong>${esc(b.owner.name)}</strong> · <a href="mailto:${esc(b.owner.email)}">${esc(b.owner.email)}</a>${b.owner.phone?` · ${esc(b.owner.phone)}`:''}</p><dl><div><dt>Service</dt><dd>${esc(service(b))}</dd></div><div><dt>Start</dt><dd>${esc(b.date)} at ${esc(b.time)} (UK)</dd></div><div><dt>Duration</dt><dd>${b.duration} ${esc(b.unit)}</dd></div><div><dt>Estimated total</dt><dd>${money(b.total)}</dd></div><div><dt>Status</dt><dd>${state(b)}</dd></div></dl>${b.status==='approved'?'<p class="booking-state">✓ Approved</p>':`<button class="pp-primary" type="button" data-approve="${esc(b.id)}">Approve appointment</button>`}</article>`).join('') : '<p class="pp-empty">No appointments for this day. You can mark it unavailable using the form above.</p>';
  }
  function lock(value) {busy=value;dialog.querySelectorAll('button,select').forEach(el=>el.disabled=value);$('#refresh-calendar').disabled=value;}
  async function openDay(date) {
    if(busy)return;selected=date;$('#day-status').textContent='Loading latest appointments…';$('#day-appointments').innerHTML='';dialog.showModal();lock(true);
    try{await load();renderDay();$('#day-status').textContent='';}catch(e){$('#day-status').textContent=e.message;form.querySelector('button').dataset.failed='true';}finally{lock(false);if(form.querySelector('button').dataset.failed){form.querySelector('button').disabled=true;delete form.querySelector('button').dataset.failed;}}
  }
  $('#calendar-days').onclick=e=>{const target=e.target.closest('[data-day]');if(target)openDay(target.dataset.day);};
  $('#close-day').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  form.onsubmit=async e=>{e.preventDefault();if(busy)return;lock(true);$('#day-status').textContent='Saving…';try{
    const result=await api('/admin/booking-days/'+selected,'PATCH',{status:form.elements.status.value});
    availability=availability.filter(d=>d.date!==selected);if(result.status!=='open')availability.push(result);render();$('#day-status').textContent='Availability saved. Existing appointments are unchanged.';
  }catch(e){$('#day-status').textContent=e.message;}finally{lock(false);}};
  $('#day-appointments').onclick=async e=>{const target=e.target.closest('[data-approve]');if(!target||busy)return;const b=bookings.find(b=>b.id===target.dataset.approve);lock(true);$('#day-status').textContent='Approving…';try{
    await api('/admin/bookings/'+b.id,'PATCH',{status:'approved',version:b.version});await load();renderDay();$('#day-status').textContent='Appointment approved.';
  }catch(e){$('#day-status').textContent=e.message+' Close and reopen this day to refresh.';}finally{lock(false);}};
  for(const [id,delta] of [['previous',-1],['next',1]])$('#'+id).onclick=()=>{month.setUTCMonth(month.getUTCMonth()+delta);render();};
  $('#today').onclick=()=>{month=day(today);month.setUTCDate(1);render();};
  $('#refresh-calendar').onclick=async()=>{if(busy)return;busy=true;try{await load();$('#calendar-status').textContent='Calendar refreshed.';}catch(e){$('#calendar-status').textContent=e.message;}finally{busy=false;}};
  load().then(()=>$('#calendar-status').textContent='').catch(e=>$('#calendar-status').textContent=e.message);
})();
