// Palmer's Pet Care — customer portal (register, sign in, your pet, admin).
// Talks to the accounts API with the session cookie; nothing is stored in the browser.
(function () {
  const API = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8787' : 'https://api.palmerspetcare.co.uk';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  async function api(path, opts) {
    const o = opts || {};
    const res = await fetch(API + path, { method: o.method || 'GET', credentials: 'include', headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined });
    let body = null; try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) { const err = new Error((body && body.error) || 'Something went wrong. Please try again.'); err.status = res.status; throw err; }
    return body;
  }
  const turnstileToken = (form) => { const i = form.querySelector('input[name="cf-turnstile-response"]'); return i ? i.value : ''; };
  function status(form, text, kind) { const s = $('.form-status', form); if (s) { s.textContent = text; s.className = 'form-status' + (kind ? ' ' + kind : ''); } }
  function fillSelects(form) {
    const species = ['Dog', 'Cat', 'Rabbit', 'Guinea pig', 'Hamster', 'Bird', 'Reptile', 'Other'];
    const ages = ['Under 1 year', '1–2 years', '3–5 years', '6–8 years', '9–12 years', '13 years or older'];
    const fill = (sel, list, placeholder) => { if (!sel) return; sel.innerHTML = '<option value="" disabled selected>' + placeholder + '</option>' + list.map((v) => '<option>' + esc(v) + '</option>').join(''); };
    fill($('[name="species"]', form), species, 'Choose…');
    fill($('[name="age"]', form), ages, 'Choose…');
    const freq = $('[name="medicationFrequency"]', form);
    if (freq) freq.innerHTML = ['Once a day', 'Twice a day', 'Three times a day', 'Every other day', 'Weekly', 'As needed'].reduce((h, v) => h + '<option>' + esc(v) + '</option>', '<option value="">Not on medication</option>');
  }
  const medicationText = (p) => (p.medication ? p.medication + (p.medicationFrequency ? ' · ' + p.medicationFrequency : '') : (p.medicationFrequency || ''));
  const workText = (o) => (o.workPhone ? o.workPhone + (o.workExt ? ' · ext. ' + o.workExt : '') : '');
  const emergencyLine = (o) => [o.emergencyName, o.emergencyRelationship].filter(Boolean).join(' · ');
  // Raw upload: the server sniffs the real type, resizes and strips metadata. HEIC is converted in the
  // browser first where the device can decode it (iPhone/Safari); elsewhere the server explains.
  async function uploadPhoto(path, file) {
    if (file.size > 10 * 1024 * 1024) throw new Error('That photo is over 10 MB. Please choose a smaller one.');
    let body = file;
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) { try { body = await (await fetch(await shrink(file, 1600))).blob(); } catch (e) { body = file; } }
    const res = await fetch(API + path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': body.type || 'application/octet-stream' }, body });
    let j = null; try { j = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error((j && j.error) || 'Something went wrong. Please try again.');
    return j;
  }
  const careRows = (p) => {
    const rows = [['Breed', p.breed], ['Dietary requirements', p.diet], ['Medication', medicationText(p)], ['Likes', p.likes], ['Dislikes', p.dislikes]].filter((r) => r[1]);
    return rows.length ? `<dl class="pp-care">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
  };

  // ----- Register your pet -----
  const reg = $('[data-account-form="registration"]');
  if (reg) {
    fillSelects(reg);
    reg.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (reg.password.value !== reg.confirm.value) return status(reg, 'Those passwords do not match.', 'error');
      status(reg, 'Registering…');
      const btn = $('button[type="submit"]', reg); btn.disabled = true;
      try {
        await api('/register', { method: 'POST', body: {
          name: reg.name.value, email: reg.email.value, phone: reg.phone ? reg.phone.value : '', password: reg.password.value,
          pet: { name: reg.petName.value, species: reg.species.value, age: reg.age.value, notes: reg.notes ? reg.notes.value : '' },
          turnstile: turnstileToken(reg),
        } });
        location.href = 'account.html';
      } catch (err) { status(reg, err.message, 'error'); btn.disabled = false; if (window.turnstile) try { window.turnstile.reset(); } catch (x) { /* no widget */ } }
    });
  }

  // ----- Sign in -----
  const login = $('[data-account-form="login"]');
  if (login) {
    login.addEventListener('submit', async (e) => {
      e.preventDefault();
      status(login, 'Signing in…');
      const btn = $('button[type="submit"]', login); btn.disabled = true;
      try {
        const r = await api('/login', { method: 'POST', body: { email: login.email.value, password: login.password.value, turnstile: turnstileToken(login) } });
        location.href = r.isAdmin ? 'admin.html' : 'account.html';
      } catch (err) { status(login, err.message, 'error'); btn.disabled = false; if (window.turnstile) try { window.turnstile.reset(); } catch (x) { /* no widget */ } }
    });
  }

  // ----- Shared portal chrome -----
  async function signOut() { try { await api('/logout', { method: 'POST' }); } catch (e) { /* already out */ } location.href = 'login.html'; }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-signout]'); if (b) { e.preventDefault(); signOut(); } });

  const petCard = (p, editable) => `
    <article class="pp-card pp-pet" data-pet="${esc(p.id)}">
      <div class="pp-card-head"><span class="pp-avatar" aria-hidden="true">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>
        <div><h3>${esc(p.name)}</h3><p class="pp-sub">${esc(p.species)} · ${esc(p.age)}</p></div></div>
      ${p.notes ? `<p class="pp-notes">${esc(p.notes)}</p>` : ''}
      ${careRows(p)}
      <dl class="pp-facts"><div><dt>Registered</dt><dd>${when(p.createdAt)}</dd></div><div><dt>Updated</dt><dd>${when(p.updatedAt)}</dd></div></dl>
      ${editable ? `<button class="pp-btn ghost" type="button" data-edit-pet="${esc(p.id)}">Edit details</button>` : ''}
    </article>`;
  const telHref = (v) => 'tel:' + esc(String(v).replace(/[^\d+]/g, ''));
  const ownerCard = (o) => `
    <article class="pp-card pp-owner">
      <p class="pp-eyebrow">Owner</p>
      <div class="pp-owner-head">${o.photoUrl ? `<img src="${imgUrl(o.photoUrl)}" alt="">` : ''}<h3>${esc(o.name)}</h3></div>
      <dl class="pp-facts"><div><dt>Email</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd></div>${o.phone ? `<div><dt>Mobile</dt><dd><a href="${telHref(o.phone)}">${esc(o.phone)}</a>${o.whatsapp ? '<span class="pp-pill-wa">WhatsApp</span>' : ''}</dd></div>` : ''}${o.workPhone ? `<div><dt>Work number</dt><dd><a href="${telHref(o.workPhone)}">${esc(o.workPhone)}</a>${o.workExt ? ' · ext. ' + esc(o.workExt) : ''}</dd></div>` : ''}${o.address ? `<div><dt>Home address</dt><dd>${esc(o.address)}</dd></div>` : ''}<div><dt>Member since</dt><dd>${when(o.memberSince)}</dd></div>${o.lastLoginAt ? `<div><dt>Last sign-in</dt><dd>${when(o.lastLoginAt)}</dd></div>` : ''}</dl>
      ${(o.emergencyName || o.emergencyPhone || o.emergencyRelationship) ? `<dl class="pp-emergency"><dt>Emergency contact</dt><dd>${esc(emergencyLine(o) || '—')}${o.emergencyPhone ? `<small><a href="${telHref(o.emergencyPhone)}">${esc(o.emergencyPhone)}</a></small>` : ''}</dd></dl>` : ''}
    </article>`;

  // ----- Photos and the diary (shared) -----
  const stamp = (ms) => new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const imgUrl = (u) => API + u;
  async function loadPetExtras(petId) {
    const [ph, di] = await Promise.all([api('/pets/' + petId + '/photos'), api('/pets/' + petId + '/diary')]);
    return { photos: ph.photos, entries: di.entries };
  }
  const photoStrip = (photos, admin) => photos.length ? `<div class="pp-photos">${photos.map((p) => `<figure class="pp-photo"><img src="${imgUrl(p.url)}" alt="${esc(p.caption || 'Photo')}" loading="lazy">${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ''}${admin ? `<button type="button" class="pp-x" data-del-photo="${esc(p.id)}" aria-label="Remove photo">×</button>` : ''}</figure>`).join('')}</div>` : (admin ? '' : '<p class="pp-empty">No photos yet — they appear here after a visit.</p>');
  const diaryList = (entries, admin) => entries.length ? `<ol class="pp-timeline">${entries.map((e) => `<li><time datetime="${new Date(e.createdAt).toISOString()}">${stamp(e.createdAt)}</time><p>${esc(e.text)}</p>${e.photoUrl ? `<img src="${imgUrl(e.photoUrl)}" alt="" loading="lazy">` : ''}<small>${esc(e.by)}${admin ? ` · <button type="button" class="pp-link" data-del-entry="${esc(e.id)}">Remove</button>` : ''}</small></li>`).join('')}</ol>` : '<p class="pp-empty">No diary entries yet.</p>';
  // Downsize in the browser so a phone photo lands as a ~150 KB JPEG, not a 6 MB one.
  function shrink(file, max = 1200) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read.')); };
      img.src = url;
    });
  }

  // ----- Your pets (customer dashboard) -----
  const account = $('[data-portal="account"]');
  if (account) {
    (async () => {
      let d;
      try { d = await api('/me'); } catch (err) { location.href = 'login.html'; return; }
      if (d.isAdmin) $('[data-admin-link]').hidden = false;
      const opts = d.options || {};
      const PAGE = 6;
      const photosByPet = new Map(); // petId → [{id,url,caption,createdAt}] newest first
      const state = { selected: null, showAll: false };
      const firstName = (o) => o.firstName || String(o.name || '').trim().split(/\s+/)[0] || 'there';
      const initial = (s) => esc((s || '?').trim().slice(0, 1).toUpperCase());
      // "24 Sept 2026 · 10:42" in UK time, whatever the viewer's device is set to.
      const ukDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
      const ukTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });
      const ukStamp = (ms) => ukDate.format(new Date(ms)) + ' · ' + ukTime.format(new Date(ms));
      const possessive = (n) => n + (/s$/i.test(n) ? '’' : '’s');
      const petPhotos = (id) => photosByPet.get(id) || [];
      const heroPhoto = (p) => p.profilePhotoUrl ? { url: p.profilePhotoUrl, caption: '' } : (petPhotos(p.id)[0] || null);
      async function loadPhotos(petId) {
        try { const r = await api('/pets/' + encodeURIComponent(petId) + '/photos'); photosByPet.set(petId, (r.photos || []).slice().sort((a, b) => b.createdAt - a.createdAt)); }
        catch (e) { photosByPet.set(petId, []); }
      }

      // --- selection + URL ---
      const petFromUrl = () => new URLSearchParams(location.search).get('pet');
      function select(id, { push = true } = {}) {
        const p = d.pets.find((x) => x.id === id) || d.pets[0] || null;
        state.selected = p ? p.id : null; state.showAll = false;
        const u = new URL(location.href);
        if (p) u.searchParams.set('pet', p.id); else u.searchParams.delete('pet');
        if (u.href !== location.href) history[push ? 'pushState' : 'replaceState']({ pet: state.selected }, '', u);
        renderPets(); renderDiary();
      }
      window.addEventListener('popstate', () => { const p = d.pets.find((x) => x.id === petFromUrl()); state.selected = p ? p.id : (d.pets[0] ? d.pets[0].id : null); state.showAll = false; renderPets(); renderDiary(); });

      // --- owner ---
      const setText = (sel, v) => { const el = $(sel, account); if (el) el.textContent = v; };
      const setValue = (sel, v, empty) => { const el = $(sel, account); if (!el) return; el.textContent = v || empty; el.classList.toggle('is-empty', !v); };
      const personIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
      const avatarHtml = (o) => (o.photoUrl ? `<img src="${imgUrl(o.photoUrl)}?v=${esc(o.photoId)}" alt="${esc(o.name)}">` : personIcon);
      const dash = (v) => (v ? esc(v) : '<span class="is-empty">—</span>');
      function renderOwner() {
        const o = d.owner;
        setText('[data-owner-first]', firstName(o)); setText('[data-owner-fullname]', o.name);
        $('[data-owner-avatar]', account).innerHTML = avatarHtml(o);
        const em = emergencyLine(o);
        $('[data-owner-details]', account).innerHTML = `
          <div><dt>Email address</dt><dd>${dash(o.email)}</dd></div>
          <div><dt>Mobile number</dt><dd>${dash(o.phone)}${o.phone && o.whatsapp ? '<span class="pp-pill-wa">WhatsApp</span>' : ''}</dd></div>
          <div><dt>Work number</dt><dd>${dash(workText(o))}</dd></div>
          <div><dt>Home address</dt><dd>${dash(o.address)}</dd></div>
          <div><dt>Emergency contact</dt><dd>${em || o.emergencyPhone ? `${em ? esc(em) : ''}${o.emergencyPhone ? `<span class="pp-line2">${esc(o.emergencyPhone)}</span>` : ''}` : '<span class="is-empty">—</span>'}</dd></div>`;
        document.title = 'Your pets | Palmer’s Pet Care';
      }

      // --- pets card ---
      const chevron = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const pencil = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.5 6.5l3 3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
      const chip = (p) => { const h = heroPhoto(p); return `
        <button type="button" role="tab" class="pp-chip" data-select-pet="${esc(p.id)}" aria-selected="${p.id === state.selected}" id="chip-${esc(p.id)}" aria-controls="profile-panel">
          ${h ? `<img class="pp-chip-thumb" src="${imgUrl(h.url)}" alt="">` : `<span class="pp-chip-thumb" aria-hidden="true">${initial(p.name)}</span>`}
          <span class="pp-chip-text"><strong>${esc(p.name)}</strong><span>${esc(p.species)}</span></span>${chevron}
        </button>`; };
      const value = (v) => v ? `<p class="pp-value">${esc(v)}</p>` : '<p class="pp-value is-empty">—</p>';
      const profile = (p) => { const h = heroPhoto(p); return `
        <div class="pp-profile" id="profile-panel" role="tabpanel" aria-labelledby="chip-${esc(p.id)}">
          <div class="pp-photo-block">
            ${h ? `<img class="pp-profile-photo" src="${imgUrl(h.url)}" alt="${esc(p.profilePhotoUrl ? p.name + '’s profile photo' : (h.caption ? h.caption + ' — ' + p.name : 'Photo of ' + p.name))}">` : `<div class="pp-profile-photo is-placeholder" aria-hidden="true">${initial(p.name)}</div>`}
            <div class="pp-photo-tools">
              <label class="pp-photo-change"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>${p.profilePhotoUrl ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*,.heic,.heif" data-profile-upload="${esc(p.id)}" hidden></label>
              ${p.profilePhotoUrl ? `<button type="button" class="pp-textlink pp-photo-remove" data-profile-remove="${esc(p.id)}">Remove photo</button>` : ''}
            </div>
            <p class="pp-photo-status" role="status" aria-live="polite" data-profile-status></p>
          </div>
          <div>
            <p class="pp-kicker">Pet profile</p>
            <h3>${esc(p.name)}</h3>
            <p class="pp-profile-meta">${esc(p.species)} · ${esc(p.age)}</p>
            <div class="pp-two">
              <div><p class="pp-label">Breed</p>${value(p.breed)}</div>
              <div><p class="pp-label">Feeding routine</p>${value(p.diet)}</div>
            </div>
            <p class="pp-label">Personality &amp; care notes</p>
            ${p.notes ? `<p class="pp-profile-notes">${esc(p.notes)}</p>` : '<p class="pp-profile-notes pp-value is-empty">—</p>'}
            <p class="pp-label pp-care-head">More care details</p>
            <div class="pp-care-row"><p class="pp-label">Medication</p>${value(medicationText(p))}</div>
            <div class="pp-two">
              <div><p class="pp-label">Likes</p>${value(p.likes)}</div>
              <div><p class="pp-label">Dislikes</p>${value(p.dislikes)}</div>
            </div>
            <div class="pp-profile-actions">
              <button type="button" class="pp-primary" data-edit-pet="${esc(p.id)}">${pencil}Edit ${esc(possessive(p.name))} details</button>
              <button type="button" class="pp-textlink" data-remove-pet="${esc(p.id)}">Remove pet</button>
            </div>
          </div>
        </div>`; };
      function renderPets() {
        const count = $('[data-pet-count]', account); count.textContent = d.pets.length; count.setAttribute('aria-label', d.pets.length + (d.pets.length === 1 ? ' pet' : ' pets'));
        $('[data-chips]', account).innerHTML = d.pets.map(chip).join('');
        const sel = d.pets.find((x) => x.id === state.selected);
        $('[data-profile]', account).innerHTML = sel ? profile(sel) : `
          <div class="pp-empty-state"><h3>No pets yet</h3><p>Add your first pet and we’ll keep their details, feeding routine and photo diary here.</p><button type="button" class="pp-primary" data-add-pet>Add a pet</button></div>`;
      }

      // --- photo diary ---
      const photoCard = (ph, petName) => `
        <figure class="pp-photo-card">
          <button type="button" class="pp-photo-btn" data-open-photo="${esc(ph.id)}"><img src="${imgUrl(ph.url)}" alt="${esc(ph.caption || 'Photo of ' + petName)}" loading="lazy"></button>
          <figcaption><time datetime="${new Date(ph.createdAt).toISOString()}">${ukStamp(ph.createdAt)}</time>${ph.caption ? `<strong>${esc(ph.caption)}</strong>` : ''}</figcaption>
        </figure>`;
      function renderDiary() {
        const card = $('[data-diary-card]', account); const body = $('[data-diary-body]', account); const title = $('[data-diary-title]', account);
        const sel = d.pets.find((x) => x.id === state.selected);
        if (!sel) { card.hidden = true; return; }
        card.hidden = false; title.textContent = possessive(sel.name) + ' photo diary';
        const all = petPhotos(sel.id); const shown = state.showAll ? all : all.slice(0, PAGE);
        body.innerHTML = all.length
          ? `<div class="pp-diary-grid">${shown.map((ph) => photoCard(ph, sel.name)).join('')}</div>${all.length > PAGE && !state.showAll ? `<div class="pp-diary-more"><button type="button" class="pp-secondary" data-show-more>Show more (${all.length - PAGE} more)</button></div>` : ''}`
          : '<p class="pp-diary-empty">No photos yet — they’ll appear here during visits.</p>';
      }

      // --- modals ---
      const dlg = (name) => $(`[data-modal="${name}"]`, account);
      let opener = null;
      function openDialog(name, from) { opener = from || document.activeElement; const el = dlg(name); const err = $('[data-error]', el); if (err) err.textContent = ''; el.showModal(); }
      function closeDialog(el) { el.close(); if (opener && opener.isConnected) opener.focus(); opener = null; }
      account.addEventListener('click', (e) => {
        const c = e.target.closest('[data-close]'); if (c) { closeDialog(c.closest('dialog')); return; }
        const dialog = e.target.closest('dialog'); if (dialog && e.target === dialog) closeDialog(dialog); // backdrop click
      });
      account.querySelectorAll('dialog').forEach((el) => el.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(el); }));
      const fail = (form, msg) => { $('[data-error]', form).textContent = msg; };
      const busy = (form, on) => { const b = $('[data-submit]', form); b.disabled = on; };
      function validate(form) {
        let first = null;
        form.querySelectorAll('[required]').forEach((el) => { const bad = !el.value.trim(); el.setAttribute('aria-invalid', bad ? 'true' : 'false'); if (bad && !first) first = el; });
        if (first) { first.focus(); fail(form, 'Please fill in the highlighted fields.'); return false; }
        return true;
      }

      // Pet add / edit
      const petForm = $('[data-pet-form]', account); fillSelects(petForm);
      function openPetModal(p, from) {
        petForm.reset(); petForm.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
        petForm.dataset.petId = p ? p.id : '';
        $('[data-pet-modal-title]', account).textContent = p ? `Edit ${possessive(p.name)} details` : 'Add a pet';
        $('[data-submit]', petForm).textContent = p ? 'Save changes' : 'Add pet';
        if (p) { petForm.name.value = p.name; petForm.species.value = p.species; petForm.age.value = p.age; petForm.breed.value = p.breed || ''; petForm.diet.value = p.diet || ''; petForm.notes.value = p.notes || ''; petForm.medication.value = p.medication || ''; petForm.medicationFrequency.value = p.medicationFrequency || ''; petForm.likes.value = p.likes || ''; petForm.dislikes.value = p.dislikes || ''; }
        $('.pp-more', petForm).open = !!(p && (p.medication || p.likes || p.dislikes));
        openDialog('pet', from); petForm.name.focus();
      }
      petForm.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!validate(petForm)) return;
        petForm.medication.removeAttribute('aria-invalid');
        if (petForm.medicationFrequency.value && !petForm.medication.value.trim()) { $('.pp-more', petForm).open = true; petForm.medication.setAttribute('aria-invalid', 'true'); petForm.medication.focus(); fail(petForm, 'Please enter the medication name, or set how often to “Not on medication”.'); return; }
        const body = { name: petForm.name.value, species: petForm.species.value, age: petForm.age.value, breed: petForm.breed.value, notes: petForm.notes.value, diet: petForm.diet.value, medication: petForm.medication.value, medicationFrequency: petForm.medicationFrequency.value, likes: petForm.likes.value, dislikes: petForm.dislikes.value };
        busy(petForm, true); fail(petForm, '');
        try {
          const id = petForm.dataset.petId;
          if (id) { const r = await api('/me/pets/' + encodeURIComponent(id), { method: 'PATCH', body }); const i = d.pets.findIndex((x) => x.id === id); d.pets[i] = { ...d.pets[i], ...r.pet }; closeDialog(dlg('pet')); renderPets(); renderDiary(); }
          else { const r = await api('/me/pets', { method: 'POST', body }); d.pets.push(r.pet); photosByPet.set(r.pet.id, []); closeDialog(dlg('pet')); select(r.pet.id); }
        } catch (err) { fail(petForm, err.message); }
        finally { busy(petForm, false); }
      });

      // Remove pet
      const confirmForm = $('[data-confirm-form]', account);
      confirmForm.addEventListener('submit', async (e) => {
        e.preventDefault(); const id = confirmForm.dataset.petId; if (!id) return;
        busy(confirmForm, true); fail(confirmForm, '');
        try { await api('/me/pets/' + encodeURIComponent(id), { method: 'DELETE' }); d.pets = d.pets.filter((x) => x.id !== id); photosByPet.delete(id); closeDialog(dlg('confirm')); select(d.pets[0] ? d.pets[0].id : null); }
        catch (err) { fail(confirmForm, err.message); }
        finally { busy(confirmForm, false); }
      });

      // Owner edit
      const ownerForm = $('[data-owner-form]', account);
      ownerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); if (!validate(ownerForm)) return;
        ownerForm.workExt.removeAttribute('aria-invalid');
        if (ownerForm.workExt.value && !/^\d{1,6}$/.test(ownerForm.workExt.value)) { ownerForm.workExt.setAttribute('aria-invalid', 'true'); ownerForm.workExt.focus(); fail(ownerForm, 'The extension should be digits only, up to 6.'); return; }
        const body = { name: ownerForm.name.value, phone: ownerForm.phone.value, whatsapp: ownerForm.whatsapp.checked, workPhone: ownerForm.workPhone.value, workExt: ownerForm.workExt.value, address: ownerForm.address.value, emergencyName: ownerForm.emergencyName.value, emergencyRelationship: ownerForm.emergencyRelationship.value, emergencyPhone: ownerForm.emergencyPhone.value };
        busy(ownerForm, true); fail(ownerForm, '');
        try { const r = await api('/me', { method: 'PATCH', body }); d.owner = { ...d.owner, ...r.owner }; closeDialog(dlg('owner')); renderOwner(); }
        catch (err) { fail(ownerForm, err.message); }
        finally { busy(ownerForm, false); }
      });

      // Lightbox
      function openLightbox(photoId, from) {
        const sel = d.pets.find((x) => x.id === state.selected); const ph = petPhotos(state.selected).find((x) => x.id === photoId); if (!ph) return;
        const el = dlg('lightbox'); const img = $('[data-lightbox-img]', el);
        img.src = imgUrl(ph.url); img.alt = ph.caption || ('Photo of ' + (sel ? sel.name : 'your pet'));
        $('[data-lightbox-time]', el).textContent = ukStamp(ph.createdAt); $('[data-lightbox-caption]', el).textContent = ph.caption || '';
        openDialog('lightbox', from);
      }

      // Profile photos: the browser sends the original file; the server sniffs the type, square-crops to 800px and strips metadata.
      const photoStatus = (text, kind) => { const el = $('[data-profile-status]', account); if (el) { el.textContent = text; el.className = 'pp-photo-status' + (kind ? ' ' + kind : ''); } };
      const applyPet = (pet) => { const i = d.pets.findIndex((x) => x.id === pet.id); if (i >= 0) d.pets[i] = { ...d.pets[i], ...pet }; };
      const ownerPhotoStatus = (text, kind) => { const el = $('[data-owner-photo-status]', account); if (el) { el.textContent = text; el.className = 'pp-photo-status' + (kind ? ' ' + kind : ''); } };
      function renderOwnerPhotoField() { const o = d.owner; $('[data-owner-photo-preview]', account).innerHTML = avatarHtml(o); $('[data-owner-upload-label]', account).textContent = o.photoUrl ? 'Replace photo' : 'Upload a photo'; $('[data-owner-photo-remove]', account).hidden = !o.photoUrl; }
      account.addEventListener('change', async (e) => {
        const ownerInput = e.target.closest('[data-owner-upload]');
        if (ownerInput && ownerInput.files && ownerInput.files[0]) {
          const file = ownerInput.files[0]; ownerInput.value = '';
          try { ownerPhotoStatus('Uploading photo…'); const r = await uploadPhoto('/me/photo', file); d.owner = { ...d.owner, ...r.owner }; renderOwner(); renderOwnerPhotoField(); ownerPhotoStatus('Photo updated', 'ok'); }
          catch (err) { ownerPhotoStatus(err.message, 'error'); }
          return;
        }
        const input = e.target.closest('[data-profile-upload]'); if (!input || !input.files || !input.files[0]) return;
        const petId = input.dataset.profileUpload; const file = input.files[0]; input.value = '';
        try {
          photoStatus('Uploading photo…');
          const r = await uploadPhoto('/me/pets/' + encodeURIComponent(petId) + '/profile-photo', file);
          applyPet(r.pet); renderPets(); photoStatus('Photo updated', 'ok');
        } catch (err) { photoStatus(err.message, 'error'); }
      });

      // One click handler for the dashboard's controls.
      account.addEventListener('click', (e) => {
        const t = e.target;
        const sp = t.closest('[data-select-pet]'); if (sp) { if (sp.dataset.selectPet !== state.selected) select(sp.dataset.selectPet); return; }
        const add = t.closest('[data-add-pet]'); if (add) { openPetModal(null, add); return; }
        const ed = t.closest('[data-edit-pet]'); if (ed) { openPetModal(d.pets.find((x) => x.id === ed.dataset.editPet), ed); return; }
        const rm = t.closest('[data-remove-pet]'); if (rm) { const p = d.pets.find((x) => x.id === rm.dataset.removePet); if (!p) return; confirmForm.dataset.petId = p.id; account.querySelectorAll('[data-confirm-name]').forEach((n) => { n.textContent = p.name; }); openDialog('confirm', rm); return; }
        const eo = t.closest('[data-edit-owner]'); if (eo) { const o = d.owner; ownerForm.reset(); ownerForm.name.value = o.name; ownerForm.email.value = o.email; ownerForm.phone.value = o.phone || ''; ownerForm.whatsapp.checked = !!o.whatsapp; ownerForm.workPhone.value = o.workPhone || ''; ownerForm.workExt.value = o.workExt || ''; ownerForm.address.value = o.address || ''; ownerForm.emergencyName.value = o.emergencyName || ''; ownerForm.emergencyRelationship.value = o.emergencyRelationship || ''; ownerForm.emergencyPhone.value = o.emergencyPhone || ''; renderOwnerPhotoField(); ownerPhotoStatus(''); openDialog('owner', eo); ownerForm.name.focus(); return; }
        const opr = t.closest('[data-owner-photo-remove]'); if (opr) { (async () => { try { ownerPhotoStatus('Removing…'); const r = await api('/me/photo', { method: 'DELETE' }); d.owner = { ...d.owner, ...r.owner }; renderOwner(); renderOwnerPhotoField(); ownerPhotoStatus('Photo removed', 'ok'); } catch (err) { ownerPhotoStatus(err.message, 'error'); } })(); return; }
        const more = t.closest('[data-show-more]'); if (more) { state.showAll = true; renderDiary(); const grid = $('.pp-diary-grid', account); const cards = grid ? grid.children : []; if (cards[PAGE]) cards[PAGE].querySelector('button').focus(); return; }
        const rp = t.closest('[data-profile-remove]'); if (rp) { (async () => { try { photoStatus('Removing…'); const r = await api('/me/pets/' + encodeURIComponent(rp.dataset.profileRemove) + '/profile-photo', { method: 'DELETE' }); applyPet(r.pet); renderPets(); photoStatus('Photo removed', 'ok'); } catch (err) { photoStatus(err.message, 'error'); } })(); return; }
        const op = t.closest('[data-open-photo]'); if (op) { openLightbox(op.dataset.openPhoto, op); }
      });

      // First paint: owner + pets straight away, photos as soon as they arrive.
      renderOwner();
      const wanted = petFromUrl(); const initialPet = d.pets.find((x) => x.id === wanted) || d.pets[0] || null;
      state.selected = initialPet ? initialPet.id : null;
      select(state.selected, { push: false }); // also writes ?pet= into the URL so a refresh keeps the selection
      await Promise.all(d.pets.map((p) => loadPhotos(p.id)));
      renderPets(); renderDiary();
    })();
  }

  // ----- Admin: every customer's card -----
  const admin = $('[data-portal="admin"]');
  if (admin) {
    (async () => {
      let d;
      try { d = await api('/admin/customers'); }
      catch (err) { location.href = err.status === 403 ? 'account.html' : 'login.html'; return; }
      const extras = new Map(); // petId → { photos, entries }
      $('[data-count]').textContent = d.count + (d.count === 1 ? ' customer' : ' customers');
      const petBlock = (p) => {
        const x = extras.get(p.id);
        return `
        <article class="pp-card pp-pet" data-pet="${esc(p.id)}">
          <div class="pp-card-head">${p.profilePhotoUrl ? `<img class="pp-avatar" src="${imgUrl(p.profilePhotoUrl)}" alt="">` : `<span class="pp-avatar" aria-hidden="true">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>`}<div><h3>${esc(p.name)}</h3><p class="pp-sub">${esc(p.species)} · ${esc(p.age)}</p></div></div>
          ${p.notes ? `<p class="pp-notes">${esc(p.notes)}</p>` : ''}
          ${careRows(p)}
          <div class="pp-tools">
            <label class="pp-btn ghost pp-upload">Add photos<input type="file" accept="image/*" multiple data-upload="${esc(p.id)}" hidden></label>
            <button type="button" class="pp-btn ghost" data-diary-for="${esc(p.id)}">Diary entry</button>
            <span class="pp-status" data-status="${esc(p.id)}"></span>
          </div>
          <form class="pp-diary-form" data-diary-form="${esc(p.id)}" hidden>
            <textarea name="text" rows="3" maxlength="2000" placeholder="What happened today? The customer will see this with the time it was written." required></textarea>
            <label class="pp-attach">Attach photo <select name="photoId"><option value="">None</option>${(x ? x.photos : []).map((ph) => `<option value="${esc(ph.id)}">${esc(ph.caption || when(ph.createdAt))}</option>`).join('')}</select></label>
            <div class="pp-actions"><button class="pp-btn" type="submit">Add to diary</button><button class="pp-btn ghost" type="button" data-cancel-diary>Cancel</button></div>
          </form>
          ${x ? photoStrip(x.photos, true) : '<p class="pp-empty">Loading…</p>'}
          ${x ? diaryList(x.entries, true) : ''}
        </article>`;
      };
      const customerCard = (c) => `
        <section class="pp-customer" data-customer="${esc(c.id)}">
          ${ownerCard(c)}
          ${c.pets.map(petBlock).join('') || '<p class="pp-empty">No pet on record.</p>'}
        </section>`;
      const host = $('[data-customers]');
      let query = '';
      const render = () => {
        const needle = query.trim().toLowerCase();
        const rows = d.customers.filter((c) => !needle || [c.name, c.email, c.phone, ...c.pets.map((p) => p.name + ' ' + p.species)].join(' ').toLowerCase().includes(needle));
        host.innerHTML = rows.map(customerCard).join('') || '<p class="pp-empty">No customers match.</p>';
      };
      render();
      // Photos and diary for every pet, loaded after the first paint.
      await Promise.all(d.customers.flatMap((c) => c.pets).map(async (p) => { try { extras.set(p.id, await loadPetExtras(p.id)); } catch (e) { extras.set(p.id, { photos: [], entries: [] }); } }));
      render();
      $('[data-search]').addEventListener('input', (e) => { query = e.target.value; render(); });
      const setStatus = (petId, text, kind) => { const el = host.querySelector(`[data-status="${petId}"]`); if (el) { el.textContent = text; el.className = 'pp-status' + (kind ? ' ' + kind : ''); } };
      const refreshPet = async (petId) => { extras.set(petId, await loadPetExtras(petId)); render(); };
      host.addEventListener('change', async (e) => {
        const input = e.target.closest('[data-upload]'); if (!input) return;
        const petId = input.dataset.upload; const files = [...input.files]; if (!files.length) return;
        let done = 0;
        for (const f of files) {
          try { setStatus(petId, `Uploading ${done + 1} of ${files.length}…`); const dataUrl = await shrink(f); await api('/pets/' + petId + '/photos', { method: 'POST', body: { dataUrl, caption: '' } }); done++; }
          catch (err) { setStatus(petId, err.message, 'error'); return; }
        }
        setStatus(petId, `${done} photo${done === 1 ? '' : 's'} added`, 'ok'); await refreshPet(petId);
      });
      host.addEventListener('click', async (e) => {
        const open = e.target.closest('[data-diary-for]'); if (open) { const f = host.querySelector(`[data-diary-form="${open.dataset.diaryFor}"]`); f.hidden = !f.hidden; if (!f.hidden) f.text.focus(); return; }
        const cancel = e.target.closest('[data-cancel-diary]'); if (cancel) { cancel.closest('form').hidden = true; return; }
        const dp = e.target.closest('[data-del-photo]'); if (dp && window.confirm('Remove this photo? The customer will no longer see it.')) { const petId = dp.closest('[data-pet]').dataset.pet; await api('/photos/' + dp.dataset.delPhoto, { method: 'DELETE' }); await refreshPet(petId); return; }
        const de = e.target.closest('[data-del-entry]'); if (de && window.confirm('Remove this diary entry?')) { const petId = de.closest('[data-pet]').dataset.pet; await api('/diary/' + de.dataset.delEntry, { method: 'DELETE' }); await refreshPet(petId); }
      });
      host.addEventListener('submit', async (e) => {
        const f = e.target.closest('[data-diary-form]'); if (!f) return;
        e.preventDefault(); const petId = f.dataset.diaryForm;
        try { setStatus(petId, 'Saving…'); await api('/pets/' + petId + '/diary', { method: 'POST', body: { text: f.text.value, photoId: f.photoId.value || null } }); setStatus(petId, 'Added to the diary', 'ok'); await refreshPet(petId); }
        catch (err) { setStatus(petId, err.message, 'error'); }
      });
    })();
  }
})();
