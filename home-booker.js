/* Logged-out booking: the homepage hero booker (#hbBooker) and the shared "saved slot" used by
   book.html. The visitor's chosen slot is stored on this device (localStorage 'ppc-slot') from the
   first click until the request is sent; it is never a reservation. Times come from the public
   GET /public/availability (windows only) and the rules in booking-slots.js — the same rules the API
   enforces when the request is finally sent. Prices mirror the API's BOOKING_SERVICES + extraFor. */
window.HB = (() => {
  const S = window.BookingSlots;
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const KEY = 'ppc-slot';

  // Pet choices offered before sign-up. Walks are for dogs only.
  const PET_OPTS = {
    walk: [['d1', '1 dog'], ['d2', '2 dogs'], ['d3', '3 dogs']],
    other: [['d1', '1 dog'], ['d2', '2 dogs'], ['c1', '1 cat'], ['c2', '2 cats'], ['d1c1', '1 dog, 1 cat'], ['s1', '1 small pet']],
  };
  const petCounts = (k) => ({ dog: +((k || '').match(/d(\d)/) || [0, 0])[1], cat: +((k || '').match(/c(\d)/) || [0, 0])[1], small: +((k || '').match(/s(\d)/) || [0, 0])[1] });
  const speciesList = (k) => { const c = petCounts(k); return [...Array(c.dog).fill('Dog'), ...Array(c.cat).fill('Cat'), ...Array(c.small).fill('Other')]; };
  const petsLabel = (slot) => { const c = petCounts(slot.pets); return [[c.dog,'dog'],[c.cat,'cat'],[c.small,'small pet']].filter(([n])=>n).map(([n,label])=>`${n} ${label}${n===1?'':'s'}`).join(', '); };

  const productId = (slot) => slot.svc === 'sit' ? 'sitting' : (slot.svc === 'walk' ? 'walk' : 'visit') + slot.len;
  const products = (slot) => slot.svc === 'sit' ? ['sitting'] : [...Array(Math.floor(slot.len / 60)).fill(slot.svc === 'walk' ? 'walk60' : 'visit60'), ...(slot.len % 60 ? [slot.svc === 'walk' ? 'walk30' : 'visit30'] : [])];
  const svcLabel = (slot) => slot.svc === 'sit' ? 'Overnight house-sit' : S.durationLabel(slot.len) + ' ' + (slot.svc === 'walk' ? 'walk' : 'home visit');
  const money = (p) => '£' + (Number(p || 0) / 100).toFixed(2);
  const longDay = (date) => new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
  function whenLabel(slot) {
    if (!slot.date) return '';
    if (slot.svc === 'sit') return longDay(slot.date) + ' · 20:00–08:00';
    return slot.start ? longDay(slot.date) + ' · ' + slot.start + '–' + S.toHHMM(S.toMin(slot.start) + slot.len) : '';
  }

  // Price for one product and a list of species, dogs first — the order book.js sends petIds in, so the
  // estimate matches what the API charges (extraFor in src/index.js).
  function priceFor(services, slot, species) {
    let total = 0;
    for (const id of products(slot)) {
      const sv = (services || []).find((s) => s.id === id);
      if (!sv) return null;
      const pets = species.slice().sort((a, b) => (b === 'Dog') - (a === 'Dog'));
      let extra;
      if (sv.id === 'sitting') extra = pets.slice(1).reduce((n, sp) => n + (sp === 'Dog' ? 800 : sp === 'Cat' ? 400 : 0), 0);
      else if (sv.kind === 'visit') extra = sv.extra * pets.slice(1).filter((sp) => sp !== 'Dog').length;
      else extra = sv.extra * Math.max(0, pets.length - 1);
      total += sv.rate + extra;
    }
    return total;
  }

  const blank = () => ({ svc: 'walk', len: 30, pets: 'd1', pc: '', date: null, start: null });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && typeof s === 'object') return Object.assign(blank(), s);
    } catch (e) { /* storage blocked or empty */ }
    return null;
  }
  function save(slot) { try { localStorage.setItem(KEY, JSON.stringify({ ...slot, savedAt: Date.now() })); } catch (e) { /* storage blocked */ } }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  const complete = (slot) => !!(slot && slot.date && (slot.svc === 'sit' || slot.start));

  async function availability() {
    const r = await fetch(API + '/public/availability', { credentials: 'omit' });
    if (!r.ok) throw new Error('availability ' + r.status);
    return r.json();
  }

  // Free daytime starts for a chain of `len` minutes, and whether the overnight from `date` is free.
  function dayInfo(av, date) {
    const closed = new Set((av.availability || []).map((d) => d.date));
    const others = (av.busy || []).map((b) => ({ start: b.startAt, end: b.endAt, same: true }));
    const nowAt = S.absAt(av.today.date, av.today.time);
    return {
      closed: closed.has(date),
      starts: (len) => closed.has(date) ? [] : S.startOptions(date, len, { others, closed: false, nowAt }).filter((o) => !o.reason).map((o) => o.label),
      night: () => {
        const n = S.chain(date, S.OVERNIGHT_START, ['sitting']);
        return !closed.has(date) && !closed.has(S.dateOf(n.endAt - 1)) && n.startAt >= nowAt && !S.conflictWith(n.startAt, n.endAt, others);
      },
    };
  }

  return { S, API, KEY, PET_OPTS, petCounts, speciesList, petsLabel, productId, products, svcLabel, whenLabel, longDay, money, priceFor, blank, load, save, clear, complete, availability, dayInfo };
})();

/* ---------- homepage hero booker ---------- */
(() => {
  const root = document.getElementById('hbBooker');
  const H = window.HB;
  const $ = (s, r = root) => r && r.querySelector(s), $$ = (s, r = root) => r ? [...r.querySelectorAll(s)] : [];
  // Header: the saved-slot shortcut and the small-screen menu.
  const top = document.querySelector('.hb-top');
  if (top) {
    const btn = top.querySelector('.hb-menu');
    if (btn) btn.addEventListener('click', () => { const open = !top.classList.contains('open'); top.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); });
    top.addEventListener('click', (e) => { if (e.target.closest('.hb-nav a')) top.classList.remove('open'); });
    const chip = top.querySelector('.hb-saved');
    if (chip && H.complete(H.load())) chip.classList.add('show');
  }
  if (!root) return;

  let av = null, failed = false, slot = H.load() || H.blank();
  if (!['walk','visit','sit'].includes(slot.svc)) slot = H.blank();
  if (!Number.isInteger(slot.len) || slot.len < 30 || slot.len > 780 || slot.len % 30) slot.len = 30;
  if (slot.svc === 'walk' && !/^d([1-9]|10)$/.test(slot.pets)) slot.pets = 'd1';
  let step = slot.wizardVersion === 1 ? Math.min(4, Math.max(1, Number(slot.wizardStep)||1)) : 1;
  let month = null;
  const cal = $('.hb-cal-wrap'), serviceNames = {walk:'Dog walking',visit:'Home visits',sit:'House-sitting'};
  const persist = () => { slot.wizardVersion=1; slot.wizardStep=step; H.save(slot); };
  const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const dayFree = date => { const i=H.dayInfo(av,date); return slot.svc==='sit'?i.night():i.starts(slot.len).length>0; };
  function keepValid() {
    if (!av || !slot.date) return;
    if (slot.date<av.today.date || !dayFree(slot.date)) {slot.date=null;slot.start=null;return;}
    if (slot.svc==='sit') slot.start=null;
    else if(slot.start&&!H.dayInfo(av,slot.date).starts(slot.len).includes(slot.start))slot.start=null;
  }
  function go(n) {
    step=n;persist();render();
    const title=$(['#hbServiceTitle','#hbDurationTitle','#hbPetsTitle','.hb-slot-heading'][n-1]);
    title.setAttribute('tabindex','-1');title.focus({preventScroll:true});
  }
  function petFields() {
    const type=$('#hbSpecies').value;
    for(const [key,field,input] of [['d','hbDogField','hbDogs'],['c','hbCatField','hbCats'],['s','hbSmallField','hbSmall']]){
      $('#'+field).hidden=!type.includes(key);$('#'+input).disabled=!type.includes(key);
    }
  }
  function readPets() {
    const type=$('#hbSpecies').value; let key='';
    for(const [code,id] of [['d','hbDogs'],['c','hbCats'],['s','hbSmall']])if(type.includes(code)){
      const el=$('#'+id),n=Number(el.value);
      if(!Number.isInteger(n)||n<1||n>10){$('#hbPetError').hidden=false;$('#hbPetError').textContent='Enter between 1 and 10 for each selected pet species.';el.focus();return false;}
      key+=code+n;
    }
    if(slot.pets!==key){delete slot.flow;delete slot.view;}
    slot.pets=key;$('#hbPetError').hidden=true;return true;
  }
  function renderPc() {
    const v=(slot.pc||'').trim().toUpperCase(),n=$('#hbPcNote');n.hidden=!(v.length>=3&&!/^PO20/.test(v));
    n.textContent='We work on foot around Selsey. You can still continue — we’ll confirm we can reach you before approving.';
  }
  function render() {
    ['hbServiceStep','hbDurationStep','hbPetsStep','hbSlotStep'].forEach((id,i)=>$('#'+id).hidden=step!==i+1);
    $('#hbWizardStatus').textContent='Step '+step+' of 4 · '+['Choose your service','Choose the duration','Tell us about your pets','Choose a date and time'][step-1];
    $$('.hb-svc button').forEach(b=>b.setAttribute('aria-pressed',String(step!==1&&b.dataset.svc===slot.svc)));
    const lenSel=$('#hbLen');lenSel.innerHTML=slot.svc==='sit'?'<option value="720">Overnight · 20:00–08:00 (12 hours)</option>':Array.from({length:26},(_,i)=>{const n=(i+1)*30;return `<option value="${n}">${H.S.durationLabel(n)}</option>`;}).join('');
    lenSel.value=String(slot.svc==='sit'?720:slot.len);lenSel.disabled=slot.svc==='sit';
    $('#hbDurationHelp').textContent=slot.svc==='sit'?'A fixed overnight stay, from 20:00 until 08:00 the next day.':'Choose in half-hour steps. We’ll only show starts with enough time for the whole visit.';
    const counts=H.petCounts(slot.pets),type=slot.svc==='walk'?'d':counts.dog&&counts.cat?'dc':counts.cat?'c':counts.small?'s':'d';
    $('#hbSpecies').innerHTML=(slot.svc==='walk'?[['d','Dogs only']]:[['d','Dogs'],['c','Cats'],['dc','Dogs and cats'],['s','Small pets']]).map(([v,label])=>`<option value="${v}">${label}</option>`).join('');$('#hbSpecies').value=type;
    $('#hbDogs').value=counts.dog||1;$('#hbCats').value=counts.cat||1;$('#hbSmall').value=counts.small||1;petFields();
    $('#hbPc').value=slot.pc||'';renderPc();
    $('#hbReviewService').textContent=serviceNames[slot.svc];$('#hbReviewDuration').textContent=slot.svc==='sit'?'12 hours · 20:00–08:00':H.S.durationLabel(slot.len);$('#hbReviewPets').textContent=H.petsLabel(slot);
    $('#hbSumWhat').textContent=slot.start||slot.svc==='sit'&&slot.date?H.whenLabel(slot):'Choose a date and start time below';
    const price=av?H.priceFor(av.services,slot,H.speciesList(slot.pets)):null;$('#hbSumPrice').textContent=price==null?'—':H.money(price);
    if(av){renderCal();renderTimes();}
    const missingDate=!!av&&!slot.date,missingTime=!!av&&slot.svc!=='sit'&&!slot.start;
    for(const [selector,missing] of [['.hb-cal',missingDate],['.hb-times',missingTime]]){$(selector).classList.toggle('hb-required',missing);$(selector).setAttribute('aria-invalid',String(missing));}
    $('#hbContinue').disabled=step!==4||!av||!H.complete(slot);
    const note=$('#hbRequired');note.classList.toggle('is-missing',missingDate||missingTime);
    note.textContent=failed?'Availability could not be loaded. Please refresh or contact us.':!av?'Loading available slots…':missingDate?'Choose an available date in the red-bordered calendar.':missingTime?'Choose a start time. Coloured blocks will show the full visit.':'Your full visit is selected — you can continue.';
  }
  function renderCal() {
    $('#hbMonth').textContent=month.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const g=$('#hbCal');g.innerHTML=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span class="dow">${d}</span>`).join('');
    g.insertAdjacentHTML('beforeend','<span></span>'.repeat((month.getDay()+6)%7));
    const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let d=1;d<=days;d++){
      const date=iso(new Date(month.getFullYear(),month.getMonth(),d)),free=date>=av.today.date&&dayFree(date),b=document.createElement('button');
      b.type='button';b.className='hb-day'+(date===slot.date?' on':'');b.textContent=d;b.disabled=!free;b.setAttribute('aria-label',H.longDay(date)+(free?'':', unavailable'));b.setAttribute('aria-pressed',String(date===slot.date));
      b.addEventListener('click',()=>{slot.date=date;keepValid();persist();render();});g.appendChild(b);
    }
    const first=new Date(+av.today.date.slice(0,4),+av.today.date.slice(5,7)-1,1);$('#hbPrev').disabled=month<=first;$('#hbNext').disabled=month>=new Date(first.getFullYear(),first.getMonth()+5,1);
  }
  function renderTimes() {
    const t=$('#hbTimes'),coverage=$('#hbCoverage');t.innerHTML='';coverage.hidden=true;
    if(!slot.date){$('#hbDay').textContent='Choose a day';$('#hbHint').textContent='Then choose a start time';return;}
    $('#hbDay').textContent=H.longDay(slot.date);
    const overnight=slot.svc==='sit',start=overnight?H.S.toMin('20:00'):slot.start?H.S.toMin(slot.start):null,duration=overnight?720:slot.len;
    $('#hbHint').textContent=overnight?'Fixed overnight stay':'Each block is 30 minutes. Select a start.';
    if(overnight)t.innerHTML='<div class="hb-night"><b>20:00–08:00</b>Until the next morning</div>';
    else {
      const closed=H.dayInfo(av,slot.date).closed,others=(av.busy||[]).map(b=>({start:b.startAt,end:b.endAt,same:true}));
      const options=H.S.startOptions(slot.date,duration,{closed,others,nowAt:H.S.absAt(av.today.date,av.today.time)});
      t.innerHTML=options.map(o=>{const covered=start!==null&&o.min>=start&&o.min<start+duration;return `<button type="button" data-s="${o.label}" class="${covered?'hb-covered':''}" aria-pressed="${o.label===slot.start}" aria-label="${o.label}${covered?', included in your visit':''}${o.reason?', cannot start here: '+H.S.REASONS[o.reason]:', select start time'}"${o.reason?' disabled':''}>${o.label}${covered?'<small>'+(o.label===slot.start?'Start':'Your visit')+'</small>':''}</button>`;}).join('');
      $$('button:not(:disabled)',t).forEach(b=>b.addEventListener('click',()=>{slot.start=b.dataset.s;persist();render();}));
    }
    if(start!==null){
      const end=(start+duration)%1440,format=n=>H.S.toHHMM(n%1440);coverage.hidden=false;
      coverage.innerHTML=`<p><strong>${format(start)}–${format(end)}${overnight?' next day':''}</strong> · ${H.S.durationLabel(duration)}</p><div class="hb-duration-blocks" role="list" aria-label="Selected half-hour blocks">${Array.from({length:duration/30},(_,i)=>`<span role="listitem">${format(start+i*30)}<small>–${format(start+(i+1)*30)}</small></span>`).join('')}</div>`;
    }
    const on=t.querySelector('[aria-pressed="true"]');if(on)t.scrollTop=Math.max(0,on.offsetTop-t.offsetTop-50);
  }
  $$('.hb-svc button').forEach(b=>b.addEventListener('click',()=>{const changed=slot.svc!==b.dataset.svc;slot.svc=b.dataset.svc;if(changed){slot.start=null;slot.date=null;slot.pets='d1';delete slot.flow;delete slot.view;}keepValid();go(2);}));
  $('#hbLen').addEventListener('change',e=>{slot.len=Number(e.target.value);keepValid();persist();});
  $('#hbDurationNext').addEventListener('click',()=>go(3));
  $('#hbSpecies').addEventListener('change',petFields);
  $('#hbPetsNext').addEventListener('click',()=>{if(!readPets())return;slot.pc=$('#hbPc').value.slice(0,10);keepValid();go(4);});
  $('#hbPc').addEventListener('input',e=>{slot.pc=e.target.value.slice(0,10);persist();renderPc();});
  $$('[data-back],[data-edit]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back||b.dataset.edit))));
  $('#hbPrev').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCal();});$('#hbNext').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCal();});
  $('#hbContinue').addEventListener('click',()=>{if(step!==4||!H.complete(slot))return;persist();location.href='book.html';});
  render();cal.classList.add('loading');
  H.availability().then(data=>{av=data;keepValid();const ref=slot.date||av.today.date;month=new Date(+ref.slice(0,4),+ref.slice(5,7)-1,1);cal.classList.remove('loading');render();}).catch(()=>{failed=true;cal.classList.remove('loading');$('#hbErr').hidden=false;render();});
})();
