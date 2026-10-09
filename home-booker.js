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
  const petsLabel = (slot) => ((slot.svc === 'walk' ? PET_OPTS.walk : PET_OPTS.other).find((o) => o[0] === slot.pets) || ['', ''])[1];

  const productId = (slot) => slot.svc === 'sit' ? 'sitting' : (slot.svc === 'walk' ? 'walk' : 'visit') + slot.len;
  const svcLabel = (slot) => slot.svc === 'sit' ? 'Overnight house-sit' : (slot.len === 60 ? '60-minute ' : '30-minute ') + (slot.svc === 'walk' ? 'walk' : 'home visit');
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
    const sv = (services || []).find((s) => s.id === productId(slot));
    if (!sv) return null;
    const pets = species.slice().sort((a, b) => (b === 'Dog') - (a === 'Dog'));
    let extra;
    if (sv.id === 'sitting') extra = pets.slice(1).reduce((n, sp) => n + (sp === 'Dog' ? 800 : sp === 'Cat' ? 400 : 0), 0);
    else if (sv.kind === 'visit') extra = sv.extra * pets.slice(1).filter((sp) => sp !== 'Dog').length;
    else extra = sv.extra * Math.max(0, pets.length - 1);
    return sv.rate + extra;
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
    const others = (av.busy || []).map((b) => ({ start: b.startAt, end: b.endAt, same: false }));
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

  return { S, API, KEY, PET_OPTS, petCounts, speciesList, petsLabel, productId, svcLabel, whenLabel, longDay, money, priceFor, blank, load, save, clear, complete, availability, dayInfo };
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

  let av = null, slot = H.load() || H.blank();
  let month = null;
  const cal = $('.hb-cal-wrap');

  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const len = () => slot.svc === 'sit' ? 0 : slot.len;
  const dayFree = (date) => { const i = H.dayInfo(av, date); return slot.svc === 'sit' ? i.night() : i.starts(len()).length > 0; };
  function keepValid() {
    if (!av || !slot.date) return;
    if (slot.date < av.today.date) { slot.date = null; slot.start = null; return; }
    const i = H.dayInfo(av, slot.date);
    if (slot.svc === 'sit') { slot.start = null; if (!i.night()) slot.date = null; }
    else if (slot.start && !i.starts(len()).includes(slot.start)) slot.start = null;
  }

  function render() {
    $$('.hb-svc button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.svc === slot.svc)));
    const lenSel = $('#hbLen');
    lenSel.innerHTML = slot.svc === 'sit' ? '<option>Overnight · 20:00–08:00</option>' : '<option value="30">30 minutes</option><option value="60">60 minutes</option>';
    lenSel.disabled = slot.svc === 'sit';
    if (slot.svc !== 'sit') lenSel.value = String(slot.len);
    const opts = slot.svc === 'walk' ? H.PET_OPTS.walk : H.PET_OPTS.other;
    if (!opts.some((o) => o[0] === slot.pets)) slot.pets = 'd1';
    $('#hbPets').innerHTML = opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    $('#hbPets').value = slot.pets;
    if (document.activeElement !== $('#hbPc')) $('#hbPc').value = slot.pc || '';
    renderPc();
    if (av) { renderCal(); renderTimes(); }
    $('#hbSumWhat').textContent = H.svcLabel(slot) + ' · ' + H.petsLabel(slot);
    const price = av ? H.priceFor(av.services, slot, H.speciesList(slot.pets)) : null;
    $('#hbSumPrice').textContent = price == null ? '—' : H.money(price);
    $('#hbContinue').disabled = !av || !H.complete(slot);
  }
  function renderPc() {
    const v = (slot.pc || '').trim().toUpperCase(), n = $('#hbPcNote');
    n.hidden = !(v.length >= 3 && !/^PO20/.test(v));
    n.textContent = 'We work on foot around Selsey. You can still continue — we’ll confirm we can reach you before approving.';
  }
  function renderCal() {
    $('#hbMonth').textContent = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const g = $('#hbCal');
    g.innerHTML = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="dow">${d}</span>`).join('');
    const first = (month.getDay() + 6) % 7, days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    g.insertAdjacentHTML('beforeend', '<span></span>'.repeat(first));
    for (let d = 1; d <= days; d++) {
      const date = iso(new Date(month.getFullYear(), month.getMonth(), d));
      const free = date >= av.today.date && dayFree(date);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hb-day' + (date === slot.date ? ' on' : ''); b.textContent = d; b.disabled = !free;
      b.setAttribute('aria-label', H.longDay(date) + (free ? '' : ', unavailable'));
      if (date === slot.date) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => { slot.date = date; keepValid(); H.save(slot); render(); });
      g.appendChild(b);
    }
    const thisMonth = new Date(+av.today.date.slice(0, 4), +av.today.date.slice(5, 7) - 1, 1);
    $('#hbPrev').disabled = month <= thisMonth;
    $('#hbNext').disabled = month >= new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 5, 1);
  }
  function renderTimes() {
    const t = $('#hbTimes');
    t.innerHTML = '';
    if (!slot.date) { $('#hbDay').textContent = slot.svc === 'sit' ? 'Choose a night' : 'Choose a day'; $('#hbHint').textContent = 'Available times'; return; }
    $('#hbDay').textContent = H.longDay(slot.date);
    if (slot.svc === 'sit') { $('#hbHint').textContent = 'Overnight stay'; t.innerHTML = '<div class="hb-night"><b>20:00–08:00</b>In your home, overnight</div>'; return; }
    const starts = H.dayInfo(av, slot.date).starts(len());
    $('#hbHint').textContent = starts.length ? 'Available times' : 'No times left this day';
    t.innerHTML = starts.map((s) => `<button type="button" data-s="${s}" aria-pressed="${s === slot.start}">${s}</button>`).join('');
    $$('button', t).forEach((b) => b.addEventListener('click', () => { slot.start = b.dataset.s; H.save(slot); render(); }));
    const on = t.querySelector('[aria-pressed="true"]');
    if (on) t.scrollTop = Math.max(0, on.offsetTop - t.offsetTop - 50);
  }

  $$('.hb-svc button').forEach((b) => b.addEventListener('click', () => { slot.svc = b.dataset.svc; keepValid(); H.save(slot); render(); }));
  $('#hbLen').addEventListener('change', (e) => { slot.len = +e.target.value; keepValid(); H.save(slot); render(); });
  $('#hbPets').addEventListener('change', (e) => { slot.pets = e.target.value; H.save(slot); render(); });
  $('#hbPc').addEventListener('input', (e) => { slot.pc = e.target.value.slice(0, 10); H.save(slot); renderPc(); });
  $('#hbPrev').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); renderCal(); });
  $('#hbNext').addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); renderCal(); });
  $('#hbContinue').addEventListener('click', () => { if (!H.complete(slot)) return; H.save(slot); location.href = 'book.html'; });

  render();
  cal.classList.add('loading');
  H.availability().then((data) => {
    av = data;
    keepValid();
    // First visit: pre-select the first free day so the times column is never empty.
    if (!slot.date) {
      const d0 = new Date(av.today.date + 'T12:00:00');
      for (let i = 0; i < 60 && !slot.date; i++) { const d = new Date(d0); d.setDate(d0.getDate() + i); if (dayFree(iso(d))) slot.date = iso(d); }
    }
    const ref = slot.date || av.today.date;
    month = new Date(+ref.slice(0, 4), +ref.slice(5, 7) - 1, 1);
    cal.classList.remove('loading');
    render();
  }).catch(() => {
    cal.classList.remove('loading');
    $('#hbErr').hidden = false;
  });
})();
