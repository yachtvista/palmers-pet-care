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

  const P = window.PPCPrices;
  const offerId=slot=>slot.svc==='walk'?(slot.weekly?'walkweek':'walk'+slot.len):slot.svc==='sit'?'sitting':slot.svc==='stay24'?'stay24_'+(slot.days||1):slot.svc==='daycare'?'daycare_'+slot.len:slot.svc;
  const offer=slot=>P.PRODUCTS.find(s=>s.id===offerId(slot))||P.CATALOG.find(s=>s.id===offerId(slot));
  const productId=offerId;
  const products=slot=>[slot.weekly?'walk30':offerId(slot)];
  const minutes=slot=>offer(slot)?.minutes||30;
  const svcLabel=slot=>offer(slot)?.name||'Pet care';
  const money=p=>'£'+(Number(p||0)/100).toFixed(2);
  const longDay=date=>new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'});
  function whenLabel(slot){
    if(slot.weekly)return (slot.slots||[]).map(s=>longDay(s.date)+' '+s.start+'–'+S.toHHMM(S.toMin(s.start)+30)).join('; ');
    if(!slot.date||!slot.start)return '';
    const end=S.absAt(slot.date,slot.start)+minutes(slot);
    return longDay(slot.date)+' · '+slot.start+'–'+S.timeOf(end)+(S.dateOf(end)!==slot.date?' '+longDay(S.dateOf(end)):'');
  }
  function priceFor(services,slot,species){
    const base=offer(slot);if(!base)return null;
    const service=slot.weekly?base:{...base,...((services||[]).find(s=>s.id===base.id)||{})};
    return P.catalogPrice(service,species);
  }
  function slotStarts(av,slot,date){
    if(!av||!date)return [];
    const closed=new Set((av.availability||[]).map(d=>d.date));
    const service=offer(slot);if(!service)return [];
    const duration=minutes(slot),out=[];
    for(let m=S.toMin(S.OPEN);m<=S.toMin(S.CLOSE);m+=30){
      const start=S.toHHMM(m);if(service.fixedStart&&service.fixedStart!==start)continue;
      const id=slot.weekly?'walk30':service.id;
      if(S.planError(date,start,[id]))continue;
      const a=S.absAt(date,start),z=a+duration;
      if(a<S.absAt(av.today.date,av.today.time))continue;
      let unavailable=false;for(let d=Math.floor(a/1440);d<=Math.floor((z-1)/1440);d++)if(closed.has(S.dateOf(d*1440)))unavailable=true;
      if(unavailable||(av.busy||[]).some(b=>a<b.endAt&&b.startAt<z))continue;
      out.push(start);
    }
    return out;
  }
  const isFree=(av,slot)=>slot.weekly?(slot.slots||[]).length===5&&(slot.slots||[]).every(s=>slotStarts(av,slot,s.date).includes(s.start)):slotStarts(av,slot,slot.date).includes(slot.start);

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
  const complete = slot => !!(slot&&(slot.weekly?(slot.slots||[]).length===5:slot.date&&slot.start));

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

  return { S, API, KEY, PET_OPTS, petCounts, speciesList, petsLabel, productId, products, offer, minutes, slotStarts, isFree, svcLabel, whenLabel, longDay, money, priceFor, blank, load, save, clear, complete, availability, dayInfo };
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
  if (!['walk','popdog','popcat','daycare','evening','sit','stay24'].includes(slot.svc)) slot = H.blank();
  if(!Number.isInteger(slot.len)||slot.len<30||slot.len>540||slot.len%30)slot.len=30;
  if(slot.svc==='walk'&&![30,60].includes(slot.len))slot.len=30;
  if (slot.svc === 'walk' && !/^d([1-9]|10)$/.test(slot.pets)) slot.pets = 'd1';
  let step = slot.wizardVersion === 1 ? Math.min(4, Math.max(1, Number(slot.wizardStep)||1)) : 1;
  let month = null;
  const cal = $('.hb-cal-wrap'), serviceNames = {walk:'Dog walking',popdog:'Dog pop-in',popcat:'Cat pop-in',daycare:'Daytime Stay & Play',evening:'Evening Stay & Play',sit:'Overnight care',stay24:'24-hour care packages'};
  const persist = () => { slot.wizardVersion=1; slot.wizardStep=step; H.save(slot); };
  const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const dayFree = date => H.slotStarts(av,slot,date).length>0 && (!slot.weekly || (!(slot.slots||[]).some(s=>s.date===date)&&(!(slot.slots||[]).length||Math.max(...slot.slots.map(s=>H.S.dayNum(s.date)),H.S.dayNum(date))-Math.min(...slot.slots.map(s=>H.S.dayNum(s.date)),H.S.dayNum(date))<=6)));
  function keepValid() {
    if (!av || !slot.date) return;
    if (slot.date<av.today.date || !dayFree(slot.date)) {slot.date=null;slot.start=null;return;}
    if(slot.start&&!H.slotStarts(av,slot,slot.date).includes(slot.start))slot.start=null;
    const fixed=H.offer(slot)?.fixedStart;if(fixed)slot.start=fixed;
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
    const lenSel=$('#hbLen');
    const lengths=slot.svc==='walk'?[['30','30 minutes · £15'],['60','60 minutes · £20'],['week','Weekly package · 5 × 30 minutes · £65']]:slot.svc==='daycare'?Array.from({length:18},(_,i)=>[String((i+1)*30),H.S.durationLabel((i+1)*30)+' · £85']):slot.svc==='stay24'?[100,190,270,340,400].map((p,i)=>[String(i+1),(i+1)+' day(s) & night(s) · £'+p+' for 1 dog / £'+(p+(i+1)*10)+' for 2 dogs']):[[String(H.minutes(slot)),H.S.durationLabel(H.minutes(slot))+' · '+H.money(H.offer(slot)?.rate)]];
    lenSel.innerHTML=lengths.map(([v,label])=>`<option value="${v}">${label}</option>`).join('');lenSel.value=slot.weekly?'week':String(slot.svc==='stay24'?(slot.days||1):H.minutes(slot));lenSel.disabled=lengths.length===1;
    $('#hbDurationHelp').textContent=H.offer(slot)?.description||'';
    const counts=H.petCounts(slot.pets),allowed=slot.svc==='popcat'?[['c','Cats']]:slot.svc==='sit'?[['d','Dogs'],['c','Cats'],['dc','Dogs and cats'],['s','Small pets']]:[['d','Dogs only']];
    const type=allowed.some(([v])=>v===(counts.dog&&counts.cat?'dc':counts.cat?'c':counts.small?'s':'d'))?(counts.dog&&counts.cat?'dc':counts.cat?'c':counts.small?'s':'d'):allowed[0][0];
    $('#hbSpecies').innerHTML=allowed.map(([v,label])=>`<option value="${v}">${label}</option>`).join('');$('#hbSpecies').value=type;
    $('#hbDogs').value=counts.dog||1;$('#hbCats').value=counts.cat||1;$('#hbSmall').value=counts.small||1;petFields();
    $('#hbPc').value=slot.pc||'';renderPc();
    $('#hbReviewService').textContent=serviceNames[slot.svc];$('#hbReviewDuration').textContent=slot.weekly?'5 × 30-minute walks':H.S.durationLabel(H.minutes(slot));$('#hbReviewPets').textContent=H.petsLabel(slot);
    $('#hbSumWhat').textContent=slot.start||slot.svc==='sit'&&slot.date?H.whenLabel(slot):'Choose a date and start time below';
    const price=H.priceFor(av?.services||[],slot,H.speciesList(slot.pets));$('#hbSumPrice').textContent=price==null?'Request a quote':H.money(price);
    $('#hbQuote').hidden=price!==null;$('#hbContinue').hidden=price===null;
    $('#hbWeekly').hidden=!slot.weekly;
    $('#hbWeeklyList').innerHTML=(slot.slots||[]).map((s,i)=>`<li>${H.longDay(s.date)} · ${s.start} <button type="button" data-remove-walk="${i}">Remove</button></li>`).join('');
    $$('[data-remove-walk]').forEach(b=>b.addEventListener('click',()=>{slot.slots.splice(Number(b.dataset.removeWalk),1);persist();render();}));
    $('#hbAddWeekly').disabled=!slot.date||!slot.start||(slot.slots||[]).length>=5;
    $('#hbAddWeekly').textContent='Add this walk ('+(slot.slots||[]).length+'/5 selected)';
    if(av){renderCal();renderTimes();}
    const missingDate=!!av&&!slot.date&&!H.complete(slot),missingTime=!!av&&!slot.start&&!H.complete(slot);
    for(const [selector,missing] of [['.hb-cal',missingDate],['.hb-times',missingTime]]){$(selector).classList.toggle('hb-required',missing);$(selector).setAttribute('aria-invalid',String(missing));}
    $('#hbContinue').disabled=step!==4||!av||!H.complete(slot)||price===null;
    const note=$('#hbRequired');note.classList.toggle('is-missing',missingDate||missingTime);
    note.textContent=failed?'Availability could not be loaded. Please refresh or contact us.':!av?'Loading available slots…':slot.weekly&&!H.complete(slot)?'Choose and add five walks on different dates within seven days.':missingDate?'Choose an available date in the red-bordered calendar.':missingTime?'Choose a start time. Coloured blocks will show the full visit.':'Your full visit is selected — you can continue.';
  }
  function renderCal() {
    $('#hbMonth').textContent=month.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const g=$('#hbCal');g.innerHTML=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span class="dow">${d}</span>`).join('');
    g.insertAdjacentHTML('beforeend','<span></span>'.repeat((month.getDay()+6)%7));
    const days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let d=1;d<=days;d++){
      const date=iso(new Date(month.getFullYear(),month.getMonth(),d)),free=date>=av.today.date&&dayFree(date),b=document.createElement('button');
      b.type='button';b.className='hb-day'+(date===slot.date?' on':'');b.textContent=d;b.disabled=!free;b.setAttribute('aria-label',H.longDay(date)+(free?'':', unavailable'));b.setAttribute('aria-pressed',String(date===slot.date));
      b.addEventListener('click',()=>{slot.date=date;slot.start=null;keepValid();persist();render();});g.appendChild(b);
    }
    const first=new Date(+av.today.date.slice(0,4),+av.today.date.slice(5,7)-1,1);$('#hbPrev').disabled=month<=first;$('#hbNext').disabled=month>=new Date(first.getFullYear(),first.getMonth()+5,1);
  }
  function renderTimes() {
    const t=$('#hbTimes'),coverage=$('#hbCoverage');t.innerHTML='';coverage.hidden=true;
    if(!slot.date){$('#hbDay').textContent='Choose a day';$('#hbHint').textContent='Then choose a start time';return;}
    $('#hbDay').textContent=H.longDay(slot.date);
    const service=H.offer(slot),fixed=service?.fixedStart,start=slot.start?H.S.toMin(slot.start):null,duration=H.minutes(slot),starts=H.slotStarts(av,slot,slot.date);
    $('#hbHint').textContent=fixed?'Fixed start · '+fixed:'Each block is 30 minutes. Select a start.';
    const display=fixed?[H.S.toMin(fixed)]:Array.from({length:26},(_,i)=>420+i*30);
    t.innerHTML=display.map(m=>{const time=H.S.toHHMM(m),covered=start!==null&&m>=start&&m<start+duration,valid=starts.includes(time);return `<button type="button" data-s="${time}" class="${covered?'hb-covered':''}" aria-pressed="${time===slot.start}" aria-label="${time}${covered?', included in your visit':''}${valid?', select start time':', unavailable for this visit'}"${valid?'':' disabled'}>${time}${covered?'<small>'+(time===slot.start?'Start':'Your visit')+'</small>':''}</button>`;}).join('');
    $$('button:not(:disabled)',t).forEach(b=>b.addEventListener('click',()=>{slot.start=b.dataset.s;persist();render();}));
    if(start!==null){
      const end=(start+duration)%1440,format=n=>H.S.toHHMM(n%1440);coverage.hidden=false;
      coverage.innerHTML=`<p><strong>${format(start)}–${format(end)}${duration+start>=1440?' · ends '+H.longDay(H.S.dateOf(H.S.absAt(slot.date,slot.start)+duration)):''}</strong> · ${H.S.durationLabel(duration)}</p><div class="hb-duration-blocks" role="list" aria-label="Selected half-hour blocks">${Array.from({length:duration/30},(_,i)=>`<span role="listitem" aria-label="${H.longDay(H.S.dateOf(H.S.absAt(slot.date,slot.start)+i*30))} ${format(start+i*30)}–${format(start+(i+1)*30)}">${format(start+i*30)}<small>–${format(start+(i+1)*30)}</small></span>`).join('')}</div>`;
    }
    const on=t.querySelector('[aria-pressed="true"]');if(on)t.scrollTop=Math.max(0,on.offsetTop-t.offsetTop-50);
  }
  $$('.hb-svc button').forEach(b=>b.addEventListener('click',()=>{const changed=slot.svc!==b.dataset.svc;slot.svc=b.dataset.svc;if(changed){slot.start=null;slot.date=null;slot.pets=slot.svc==='popcat'?'c1':'d1';slot.weekly=false;slot.slots=[];slot.len=slot.svc==='daycare'?540:30;slot.days=1;delete slot.flow;delete slot.view;}keepValid();go(2);}));
  $('#hbLen').addEventListener('change',e=>{slot.weekly=e.target.value==='week';if(slot.svc==='stay24')slot.days=Number(e.target.value);else if(!slot.weekly)slot.len=Number(e.target.value);slot.slots=[];slot.start=null;keepValid();persist();render();});
  $('#hbDurationNext').addEventListener('click',()=>go(3));
  $('#hbSpecies').addEventListener('change',petFields);
  $('#hbPetsNext').addEventListener('click',()=>{if(!readPets())return;slot.pc=$('#hbPc').value.slice(0,10);keepValid();go(4);});
  $('#hbPc').addEventListener('input',e=>{slot.pc=e.target.value.slice(0,10);persist();renderPc();});
  $$('[data-back],[data-edit]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back||b.dataset.edit))));
  $('#hbPrev').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCal();});$('#hbNext').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCal();});
  $('#hbAddWeekly').addEventListener('click',()=>{if(!slot.date||!slot.start)return;slot.slots||=[];if(slot.slots.length>=5||slot.slots.some(s=>s.date===slot.date))return;slot.slots.push({date:slot.date,start:slot.start});slot.date=null;slot.start=null;persist();render();});
  $('#hbContinue').addEventListener('click',()=>{if(step!==4||!H.complete(slot))return;persist();location.href='book.html';});
  render();cal.classList.add('loading');
  H.availability().then(data=>{av=data;keepValid();const ref=slot.date||av.today.date;month=new Date(+ref.slice(0,4),+ref.slice(5,7)-1,1);cal.classList.remove('loading');render();}).catch(()=>{failed=true;cal.classList.remove('loading');$('#hbErr').hidden=false;render();});
})();
