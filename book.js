/* book.html — the onboarding after the homepage booker: account → pets → review → request.
   The slot chosen on the homepage (HB.load()) is shown at every step and kept on this device until the
   request is sent. Nothing is requested until the owner's contact details and at least one pet exist.
   Uses the existing API: POST /register (no pet), PATCH /me, POST /me/pets, POST /me/bookings. */
(() => {
  const H = window.HB, S = H.S, API = H.API;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SPECIES = ['Dog', 'Cat', 'Rabbit', 'Guinea pig', 'Hamster', 'Bird', 'Reptile', 'Other'];

  async function api(path, method = 'GET', body) {
    const res = await fetch(API + path, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) { const err = new Error((j && j.error) || 'Something went wrong. Please try again.'); err.status = res.status; err.body = j; throw err; }
    return j;
  }
  const status = (view, text) => { const s = $(`[data-view="${view}"] [data-status]`); if (!s) return; s.textContent = text || ''; s.hidden = !text; };

  let slot = H.load(), av = null, me = null; // me = { owner, pets }
  const flow = () => (slot.flow ||= { cards: null, petIds: [] });
  const persist = () => H.save(slot);

  function stepsHtml(n) {
    return ['Choose a visit', 'You & your pets', 'Review'].map((t, i) =>
      `<span class="s ${i + 1 < n ? 'done' : i + 1 === n ? 'on' : ''}"${i + 1 === n ? ' aria-current="step"' : ''}><span class="n">${i + 1 < n ? '✓' : i + 1}</span><span>${esc(t)}</span></span>`).join('<span class="bar"></span>');
  }
  function show(view) {
    $$('[data-view]').forEach((v) => { v.hidden = v.dataset.view !== view; });
    $$('[data-view="' + view + '"] .hb-steps').forEach((s) => { s.innerHTML = stepsHtml(+s.dataset.step); });
    $('#bkSlot').hidden = view === 'done' || view === 'empty';
    if (view !== 'done' && view !== 'empty') { slot.view = view; persist(); }
    window.scrollTo({ top: 0 });
  }

  // The pets this booking will be for: chosen existing pets, in dogs-first order (the API prices in petIds order).
  const chosenPets = () => {
    const ids = flow().petIds || [], pets = (me && me.pets) || [];
    return ids.map((id) => pets.find((p) => p.id === id)).filter(Boolean).sort((a, b) => (b.species === 'Dog') - (a.species === 'Dog'));
  };
  function renderSlot() {
    const named = chosenPets();
    const petText = named.length ? named.map((p) => p.name).join(', ') : H.petsLabel(slot);
    $('#bkSlotDl').innerHTML = `<dt>Service</dt><dd>${esc(H.svcLabel(slot))}</dd><dt>When</dt><dd>${esc(H.whenLabel(slot))}</dd><dt>Pets</dt><dd>${esc(petText)}</dd>${slot.pc ? `<dt>Postcode</dt><dd>${esc(slot.pc.toUpperCase())}</dd>` : ''}`;
    const species = named.length ? named.map((p) => p.species) : H.speciesList(slot.pets);
    const price = av ? H.priceFor(av.services, slot, species) : null;
    $('#bkSlotPrice').textContent = price == null ? '—' : H.money(price);
  }

  /* ---------- account ---------- */
  const accountForm = $('#bkAccount');
  const turnstileToken = () => { const i = accountForm.querySelector('input[name="cf-turnstile-response"]'); return i ? i.value : ''; };
  async function turnstileReady(ms = 20000) {
    const until = Date.now() + ms;
    while (Date.now() < until) { const t = turnstileToken(); if (t) return t; await new Promise((r) => setTimeout(r, 250)); }
    return turnstileToken();
  }
  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = accountForm.elements, v = (n) => f[n].value.trim();
    const missing = ['first', 'last', 'email', 'phone', 'address', 'postcode'].find((n) => !v(n));
    if (missing) { status('account', 'Please fill in every field — we need them to plan the visit.'); f[missing].focus(); return; }
    if (f.password.value.length < 8) { status('account', 'Choose a password of at least 8 characters.'); f.password.focus(); return; }
    if (f.password.value !== f.confirm.value) { status('account', 'The two passwords don’t match.'); f.confirm.focus(); return; }
    const btn = accountForm.querySelector('button[type="submit"]');
    btn.disabled = true; status('account', '');
    try {
      let token = turnstileToken();
      if (!token && accountForm.querySelector('.cf-turnstile')) { status('account', 'Just checking you’re human…'); token = await turnstileReady(); status('account', ''); }
      const address = v('address') + ', ' + v('postcode').toUpperCase();
      await api('/register', 'POST', { name: v('first') + ' ' + v('last'), email: v('email'), phone: v('phone'), address, password: f.password.value, turnstile: token });
      slot.pc = v('postcode'); persist();
      await loadMe();
      goPets();
    } catch (err) {
      status('account', err.status === 409 ? 'There’s already an account for that email — please log in instead; your slot stays saved.' : err.message);
      if (window.turnstile) try { window.turnstile.reset(); } catch (x) { /* no widget */ }
    } finally { btn.disabled = false; }
  });

  /* ---------- pets ---------- */
  const petsForm = $('#bkPets');
  const isWalk = () => slot.svc === 'walk';
  const needsDetails = () => me && (!me.owner.phone || !me.owner.address);
  function blankCard(species) { return { species, name: '', breed: '', dob: '', age: '', notes: '' }; }
  function goPets() {
    const fl = flow(), pets = me.pets || [];
    if (!fl.cards) {
      // New customers get a card per pet picked on the homepage; existing customers pick from their pets.
      fl.cards = pets.length ? [] : H.speciesList(slot.pets).map((sp) => blankCard(sp === 'Other' ? 'Rabbit' : sp));
      const eligible = pets.filter((p) => !isWalk() || p.species === 'Dog');
      if (!fl.petIds.length && eligible.length === 1) fl.petIds = [eligible[0].id];
      persist();
    }
    renderPets(); show('pets'); renderSlot();
  }
  function renderPets() {
    const fl = flow(), pets = me.pets || [];
    $('#bkDetails').hidden = !needsDetails();
    if (needsDetails()) {
      $('#bkDPhone').value ||= me.owner.phone || '';
      $('#bkDAddr').value ||= me.owner.address || '';
      $('#bkDPc').value ||= slot.pc || '';
    }
    $('#bkPetsSub').textContent = pets.length ? 'Choose who this visit is for, or add another pet.' : 'We’ve added a card for each pet you chose. The more we know, the better the care.';
    $('#bkExisting').innerHTML = pets.map((p) => {
      const off = isWalk() && p.species !== 'Dog';
      return `<label class="hb-pick${off ? ' off' : ''}"><input type="checkbox" value="${esc(p.id)}" ${fl.petIds.includes(p.id) ? 'checked' : ''} ${off ? 'disabled' : ''}> ${esc(p.name)} <small>${esc(p.species)}${off ? ' · walks are for dogs only' : ''}</small></label>`;
    }).join('');
    $$('#bkExisting input').forEach((i) => i.addEventListener('change', () => {
      fl.petIds = $$('#bkExisting input:checked').map((x) => x.value); persist(); renderSlot();
    }));
    $('#bkNewPets').innerHTML = fl.cards.map((c, i) => `
      <div class="hb-pet" data-card="${i}">
        <div class="hb-pet-head">New pet<span>${esc(c.species)}</span></div>
        <div class="hb-form">
          <div class="hb-f"><label for="pn${i}">Name</label><input id="pn${i}" data-k="name" value="${esc(c.name)}" maxlength="80" required></div>
          <div class="hb-f"><label for="ps${i}">Type of pet</label><select id="ps${i}" data-k="species" ${isWalk() ? 'disabled' : ''}>${SPECIES.map((s) => `<option ${s === c.species ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="hb-f"><label for="pb${i}">Breed <small>(optional)</small></label><input id="pb${i}" data-k="breed" value="${esc(c.breed)}" maxlength="60"></div>
          <div class="hb-f"><label for="pd${i}">Date of birth</label><input id="pd${i}" data-k="dob" type="date" value="${esc(c.dob)}"><small>Or give an approximate age below</small></div>
          <div class="hb-f"><label for="pa${i}">Approximate age</label><input id="pa${i}" data-k="age" value="${esc(c.age)}" maxlength="40" placeholder="e.g. 4 years"></div>
          <div class="hb-f"></div>
          <div class="hb-f full"><label for="pt${i}">Routine &amp; care notes <small>(optional — you can add more later)</small></label><textarea id="pt${i}" data-k="notes" rows="2" maxlength="1000" placeholder="Feeding, lead manners, medication, likes and dislikes…">${esc(c.notes)}</textarea></div>
        </div>
        ${fl.cards.length > 1 || (me.pets || []).length ? `<button class="hb-link" type="button" data-remove="${i}" style="margin-top:.6rem;font-size:.88rem">Remove this pet</button>` : ''}
      </div>`).join('');
    $$('#bkNewPets [data-k]').forEach((el) => el.addEventListener('input', () => {
      const c = fl.cards[+el.closest('[data-card]').dataset.card]; c[el.dataset.k] = el.value; persist();
      if (el.dataset.k === 'species') el.closest('[data-card]').querySelector('.hb-pet-head span').textContent = el.value;
    }));
    $$('#bkNewPets [data-remove]').forEach((b) => b.addEventListener('click', () => { fl.cards.splice(+b.dataset.remove, 1); persist(); renderPets(); }));
  }
  $('#bkAddPet').addEventListener('click', () => { flow().cards.push(blankCard('Dog')); persist(); renderPets(); });
  petsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fl = flow();
    for (const [i, c] of fl.cards.entries()) {
      if (!c.name.trim()) { status('pets', 'Please give each new pet a name.'); $('#pn' + i).focus(); return; }
      if (!c.dob && !c.age.trim()) { status('pets', `Please add ${c.name.trim()}’s date of birth or approximate age.`); $('#pa' + i).focus(); return; }
      if (isWalk() && c.species !== 'Dog') { status('pets', 'Walks are for dogs only.'); return; }
    }
    if (!fl.cards.length && !fl.petIds.length) { status('pets', 'Choose at least one pet for this visit.'); return; }
    if (needsDetails() && (!$('#bkDPhone').value.trim() || !$('#bkDAddr').value.trim() || !$('#bkDPc').value.trim())) { status('pets', 'Please add your mobile number and home address.'); return; }
    const btn = petsForm.querySelector('button[type="submit"]');
    btn.disabled = true; status('pets', '');
    try {
      if (needsDetails()) {
        const pc = $('#bkDPc').value.trim().toUpperCase(), addr = $('#bkDAddr').value.trim();
        await api('/me', 'PATCH', { phone: $('#bkDPhone').value.trim(), address: addr.toUpperCase().includes(pc) ? addr : addr + ', ' + pc });
        slot.pc = pc;
      }
      // Each new pet is saved as soon as it is accepted, so a retry never creates it twice.
      while (fl.cards.length) {
        const c = fl.cards[0];
        const r = await api('/me/pets', 'POST', { name: c.name.trim(), species: c.species, breed: c.breed.trim(), dateOfBirth: c.dob || '', age: c.age.trim(), notes: c.notes.trim() });
        fl.cards.shift(); fl.petIds.push(r.pet.id); persist();
      }
      await loadMe();
      fl.petIds = fl.petIds.filter((id) => me.pets.some((p) => p.id === id)); persist();
      goReview();
    } catch (err) {
      status('pets', err.message);
      if (me) { await loadMe().catch(() => {}); renderPets(); }
    } finally { btn.disabled = false; }
  });

  /* ---------- review ---------- */
  async function goReview() {
    show('review'); renderSlot();
    $('#bkAgree').checked = false; $('#bkSend').disabled = true; $('#bkTaken').hidden = true; status('review', '');
    const pets = chosenPets(), o = me.owner;
    const price = H.priceFor(av.services, slot, pets.map((p) => p.species));
    $('#bkReview').innerHTML = [['Service', H.svcLabel(slot)], ['When', H.whenLabel(slot)], ['Pets', pets.map((p) => p.name).join(', ')], ['Name', o.name], ['Address', o.address || ''], ['Price', H.money(price)], ['After sending', 'Pending until approved']]
      .map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    try { av = await H.availability(); } catch (e) { /* keep the copy we have; the request re-checks anyway */ }
    if (stillFree()) $('#bkFresh').textContent = 'We’ve just checked the diary — your slot is still free.';
    else offerAlternatives();
  }
  function stillFree() {
    const i = H.dayInfo(av, slot.date);
    return slot.svc === 'sit' ? i.night() : i.starts(slot.len).includes(slot.start);
  }
  function offerAlternatives(message) {
    $('#bkFresh').textContent = 'Someone else has booked close to your time since you chose it.';
    $('#bkTaken').hidden = false;
    $('#bkSend').disabled = true;
    const alts = slot.svc === 'sit' || !slot.date ? [] : H.dayInfo(av, slot.date).starts(slot.len)
      .sort((a, b) => Math.abs(S.toMin(a) - S.toMin(slot.start)) - Math.abs(S.toMin(b) - S.toMin(slot.start))).slice(0, 3).sort();
    $('#bkTakenText').textContent = message || (alts.length ? 'Nearest free times the same day:' : 'There’s nothing else free that day.');
    $('#bkAlts').innerHTML = alts.map((t) => `<button type="button" data-alt="${t}">${t}</button>`).join('') + '<a href="index.html">Pick another day</a>';
    $$('#bkAlts [data-alt]').forEach((b) => b.addEventListener('click', () => { slot.start = b.dataset.alt; persist(); goReview(); }));
  }
  $('#bkAgree').addEventListener('change', (e) => { $('#bkSend').disabled = !e.target.checked || !$('#bkTaken').hidden; });
  $('#bkBack').addEventListener('click', () => goPets());
  $('#bkSend').addEventListener('click', async () => {
    const btn = $('#bkSend'); btn.disabled = true; status('review', '');
    const pets = chosenPets();
    try {
      await api('/me/bookings', 'POST', { date: slot.date, start: slot.svc === 'sit' ? S.OVERNIGHT_START : slot.start, activities: [H.productId(slot)], petIds: pets.map((p) => p.id) });
      $('#bkDoneLine').textContent = `${H.svcLabel(slot)} for ${pets.map((p) => p.name).join(', ')}, ${H.whenLabel(slot)}. We’ll email you a copy.`;
      H.clear(); slot = null;
      show('done');
    } catch (err) {
      if (err.body && err.body.taken) { try { av = await H.availability(); } catch (e) { /* use what we have */ } offerAlternatives(); }
      else { status('review', err.message); btn.disabled = !$('#bkAgree').checked; }
    }
  });

  /* ---------- start ---------- */
  async function loadMe() {
    me = await api('/me');
    const top = $('#bkLoginTop'); top.textContent = 'My account'; top.href = 'account.html';
    return me;
  }
  (async () => {
    if (!H.complete(slot)) { show('empty'); return; }
    try { av = await H.availability(); } catch (e) { /* prices show once it loads */ }
    // A saved slot whose day has gone: back to the homepage to pick again.
    if (av && slot.date < av.today.date) { slot.date = null; slot.start = null; persist(); show('empty'); return; }
    renderSlot();
    try { await loadMe(); } catch (e) { me = null; }
    if (me && me.isAdmin) { $('[data-view="empty"] h2').textContent = 'You’re signed in as the admin'; $('[data-view="empty"] .hb-sub').textContent = 'Book for a customer from the admin calendar instead.'; show('empty'); return; }
    if (!me) {
      $('#bkPc').value = slot.pc || '';
      show('account'); return;
    }
    if (slot.view === 'review' && flow().petIds.length && !flow().cards.length && !needsDetails()) { await goReview(); return; }
    goPets();
  })();
})();
