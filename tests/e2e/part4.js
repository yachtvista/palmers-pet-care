const { chromium, request } = require('playwright-core'); const fs = require('fs'); const seed = require('./seed.json');
const ok = (l, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  (' + x + ')' : ''}`);
const SITE = 'http://127.0.0.1:8788', API = 'http://127.0.0.1:8787', H = { Origin: SITE };
const closed = (p, n) => p.waitForFunction((n) => !document.querySelector('[data-modal="' + n + '"]').open, n, { timeout: 8000 });
const OWNER = { name: 'Sarah Mitchell', phone: '07700 900123', workPhone: '01243 123456', workExt: '204', address: '12 Coast Road\nSelsey\nPO20 0AA', emergencyName: 'Jane Smith', emergencyRelationship: 'Sister', emergencyPhone: '07700 900321' };
const PET = { breed: 'Domestic shorthair', diet: 'Wet food, twice daily', notes: 'Loves chirping at the birds. A little shy at first, but always ready for a chin scratch.', medication: 'Metacam 0.5ml', frequency: 'Once a day', likes: 'Window sills, feather wands', dislikes: 'The hoover' };
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true }); const errors = [];
  const mk = async (w, h) => { const c = await b.newContext({ viewport: { width: w, height: h }, timezoneId: 'Europe/London' }); await c.request.post(API + '/login', { data: { email: 'sarah@example.com', password: 'password-sarah-1' }, headers: H }); return c; };
  const c = await mk(1440, 900); const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(SITE + '/account.html', { waitUntil: 'networkidle' });

  // ---- PART 1: fill every owner field ----
  await p.click('[data-edit-owner]');
  const headings = await p.$$eval('[data-owner-form] .pp-form-heading', (els) => els.map((e) => e.textContent)); ok('owner form grouped', headings.join('|') === 'Your details|Photo|Emergency contact', headings.join('|'));
  ok('helper text under emergency contact', (await p.textContent('[data-owner-form]')).includes('Someone we can call if we can’t reach you. Please check they’re happy to be listed.'));
  for (const [k, v] of Object.entries(OWNER)) await p.fill(`[data-owner-form] [name="${k}"]`, v);
  await p.check('#of-whatsapp');
  await p.fill('#of-ext', '12a'); await p.click('[data-owner-form] [data-submit]'); await p.waitForTimeout(200);
  ok('extension digits-only validation', (await p.textContent('[data-owner-form] [data-error]')).includes('digits only'));
  await p.fill('#of-ext', '204');
  // owner photo: raw GPS-tagged JPEG through the modal
  await p.setInputFiles('[data-owner-upload]', 'imgtest/gps.jpg'); await p.waitForFunction(() => /updated/.test(document.querySelector('[data-owner-photo-status]').textContent), null, { timeout: 30000 });
  ok('owner photo uploaded; Replace + Remove offered', (await p.textContent('[data-owner-upload-label]')) === 'Replace photo' && !(await p.$eval('[data-owner-photo-remove]', (e) => e.hidden)));
  await p.click('[data-owner-form] [data-submit]'); await closed(p, 'owner');
  const card = () => p.textContent('.pp-about');
  const rows = await p.$$eval('[data-owner-details] > div', (els) => els.map((d) => d.querySelector('dt').textContent + ': ' + d.querySelector('dd').textContent.replace(/\s+/g, ' ').trim()));
  console.log('   owner rows →', JSON.stringify(rows));
  ok('row order + values', rows[0].startsWith('Email address: sarah@example.com') && rows[1] === 'Mobile number: 07700 900123WhatsApp' && rows[2] === 'Work number: 01243 123456 · ext. 204' && rows[3].startsWith('Home address: 12 Coast Road') && rows[4] === 'Emergency contact: Jane Smith · Sister07700 900321');
  ok('WhatsApp pill present', !!(await p.$('[data-owner-details] .pp-pill-wa')));
  ok('avatar shows the photo', !!(await p.$('[data-owner-avatar] img')));
  const ownerPhotoUrl = await p.$eval('[data-owner-avatar] img', (e) => e.src);

  // ---- PART 2: fill every pet field (Willow) ----
  await p.click('.pp-chip:has-text("Willow")'); await p.waitForTimeout(150); await p.click('[data-edit-pet]');
  const order = await p.$$eval('[data-pet-form] .pp-fields > label, [data-pet-form] .pp-fields > .pp-two-fields', (els) => els.map((e) => e.textContent.trim().split('\n')[0].slice(0, 12)));
  ok('breed input placed after species/age', order[1].startsWith('Species') && order[2].startsWith('Breed'), order.slice(0, 4).join(' > '));
  ok('breed maxlength 60', await p.$eval('#pf-breed', (e) => e.maxLength) === 60);
  // medication rule: frequency without a name → blocked
  await p.$eval('[data-pet-form] .pp-more', (d) => { d.open = true; }); await p.selectOption('#pf-frequency', 'Once a day'); await p.fill('#pf-medication', ''); await p.click('[data-pet-form] [data-submit]'); await p.waitForTimeout(200);
  ok('client: frequency without medication name is blocked', (await p.textContent('[data-pet-form] [data-error]')).includes('medication name') && await p.$eval('#pf-medication', (e) => e.getAttribute('aria-invalid')) === 'true');
  for (const [k, v] of Object.entries(PET)) { if (k === 'frequency') await p.selectOption('#pf-frequency', v); else await p.fill(`[data-pet-form] [name="${k}"]`, v); }
  await p.click('[data-pet-form] [data-submit]'); await closed(p, 'pet');
  const labels = await p.$$eval('#profile-panel .pp-label', (els) => els.map((e) => e.textContent.trim()));
  ok('pet display order', labels.join('|') === 'Breed|Feeding routine|Personality & care notes|More care details|Medication|Likes|Dislikes', labels.join('|'));
  const panel = (await p.textContent('#profile-panel')).replace(/\s+/g, ' ');
  ok('medication shown as entered "name · how often"', panel.includes('Metacam 0.5ml · Once a day'));
  ok('breed, likes, dislikes shown', panel.includes('Domestic shorthair') && panel.includes('Window sills, feather wands') && panel.includes('The hoover'));
  ok('likes|dislikes share the divider style', (await p.$$('#profile-panel .pp-two')).length === 2);
  // survives refresh
  await p.reload({ waitUntil: 'networkidle' });
  ok('owner + pet values survive refresh', (await card()).includes('ext. 204') && (await card()).includes('Jane Smith · Sister') && (await p.textContent('#profile-panel')).includes('Metacam 0.5ml · Once a day') && !!(await p.$('[data-owner-avatar] img')));
  await p.screenshot({ path: 'shots/p4-filled-1440.png', fullPage: true });
  const m = await mk(390, 844); const mp = await m.newPage(); await mp.goto(SITE + '/account.html', { waitUntil: 'networkidle' }); await mp.evaluate(async () => { document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; }); await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))); });
  await mp.screenshot({ path: 'shots/p4-filled-390.png', fullPage: true }); const sw = await mp.evaluate(() => document.documentElement.scrollWidth); ok('no horizontal scroll at 390', sw === 390, String(sw)); await m.close();

  // ---- EXIF: stored owner photo + pet profile photo ----
  const meNow = await (await c.request.get(API + '/me')).json();
  fs.writeFileSync('stored-owner.jpg', Buffer.from(await (await c.request.get(API + meNow.owner.photoUrl)).body()));
  const pr = await c.request.post(API + `/me/pets/${seed.sarah.willow}/profile-photo`, { data: fs.readFileSync('imgtest/gps.jpg'), headers: { ...H, 'Content-Type': 'image/jpeg' } }); ok('pet profile photo raw upload accepted', pr.ok(), String(pr.status()));
  const petNow = (await pr.json()).pet; fs.writeFileSync('stored-pet.jpg', Buffer.from(await (await c.request.get(API + petNow.profilePhotoUrl)).body()));
  // fake type: PNG header claimed as JPEG → sniffed; text claimed as image → refused
  const bad = await c.request.post(API + '/me/photo', { data: Buffer.from('hello, not an image'), headers: { ...H, 'Content-Type': 'image/jpeg' } }); ok('server rejects non-image bytes despite image/jpeg header', bad.status() === 415, String(bad.status()));
  const big = await c.request.post(API + '/me/photo', { data: Buffer.alloc(10 * 1024 * 1024 + 1, 1), headers: { ...H, 'Content-Type': 'image/jpeg' } }); ok('server rejects > 10 MB', big.status() === 413, String(big.status()));
  // server-side medication rule
  const sv = await c.request.patch(API + `/me/pets/${seed.sarah.willow}`, { data: { medication: '', medicationFrequency: 'Twice a day' }, headers: H }); ok('server: frequency without name → 400', sv.status() === 400, (await sv.json()).error);
  const sv2 = await c.request.patch(API + `/me/pets/${seed.sarah.willow}`, { data: { medication: 'Metacam 0.5ml', medicationFrequency: '' }, headers: H }); ok('server: name without frequency → OK', sv2.ok());
  const sv3 = await c.request.patch(API + `/me/pets/${seed.sarah.willow}`, { data: { medication: 'Metacam 0.5ml', medicationFrequency: 'Once a day' }, headers: H }); ok('server: both → OK (restored)', sv3.ok());

  // ---- ADMIN view ----
  const a = await b.newContext({ viewport: { width: 1440, height: 900 } }); await a.request.post(API + '/login', { data: { email: 'admin-tester@example.com', password: 'password-admin-1' }, headers: H });
  const ap = await a.newPage(); ap.on('pageerror', (e) => errors.push('admin: ' + e.message)); await ap.goto(SITE + '/admin.html', { waitUntil: 'networkidle' });
  const cust = await ap.$(`[data-customer="${meNow.owner.id}"]`); const ct = (await cust.textContent()).replace(/\s+/g, ' ');
  ok('admin: owner photo, WhatsApp, work/ext, address', !!(await cust.$('.pp-owner-head img')) && ct.includes('WhatsApp') && ct.includes('01243 123456 · ext. 204') && ct.includes('12 Coast Road'));
  ok('admin: emergency contact highlighted', !!(await cust.$('.pp-emergency')) && ct.includes('Jane Smith · Sister') && ct.includes('07700 900321'));
  ok('admin: breed, medication, likes, dislikes on the pet', ct.includes('Domestic shorthair') && ct.includes('Metacam 0.5ml · Once a day') && ct.includes('Window sills') && ct.includes('The hoover'));
  await cust.screenshot({ path: 'shots/p4-admin-card.png' });
  ok('admin can fetch the owner photo', (await a.request.get(API + meNow.owner.photoUrl)).status() === 200);

  // ---- second customer: refused ----
  const j = await request.newContext({ baseURL: API, extraHTTPHeaders: H }); await j.post('/login', { data: { email: 'jamie@example.com', password: 'password-jamie-1' } });
  ok('other customer: owner photo URL → 404', (await j.get(meNow.owner.photoUrl)).status() === 404);
  ok('other customer: pet edit → 404', (await j.patch(`/me/pets/${seed.sarah.willow}`, { data: { name: 'Hacked' } })).status() === 404);
  ok('other customer: pet photo upload → 404', (await j.post(`/me/pets/${seed.sarah.willow}/profile-photo`, { data: fs.readFileSync('imgtest/gps.jpg'), headers: { 'Content-Type': 'image/jpeg' } })).status() === 404);
  ok('other customer: pet profile photo file → 404', (await j.get(petNow.profilePhotoUrl)).status() === 404);
  ok('signed out: owner photo → 401', (await (await request.newContext({ baseURL: API, extraHTTPHeaders: H })).get(meNow.owner.photoUrl)).status() === 401);

  // ---- clear every field → "—" everywhere ----
  await p.click('[data-edit-owner]'); for (const k of ['phone', 'workPhone', 'workExt', 'address', 'emergencyName', 'emergencyRelationship', 'emergencyPhone']) await p.fill(`[data-owner-form] [name="${k}"]`, ''); await p.uncheck('#of-whatsapp');
  await p.click('[data-owner-photo-remove]'); await p.waitForFunction(() => /removed/.test(document.querySelector('[data-owner-photo-status]').textContent), null, { timeout: 8000 });
  await p.click('[data-owner-form] [data-submit]'); await closed(p, 'owner');
  const dashes = await p.$$eval('[data-owner-details] dd', (els) => els.map((e) => e.textContent.trim()));
  ok('owner: all optional rows show "—"', dashes.slice(1).every((v) => v === '—') && dashes[0] === 'sarah@example.com', JSON.stringify(dashes));
  ok('owner: person icon avatar back', !(await p.$('[data-owner-avatar] img')) && !!(await p.$('[data-owner-avatar] svg')));
  await p.click('[data-edit-pet]'); for (const k of ['breed', 'diet', 'notes', 'medication', 'likes', 'dislikes']) await p.fill(`[data-pet-form] [name="${k}"]`, ''); await p.selectOption('#pf-frequency', ''); await p.click('[data-pet-form] [data-submit]'); await closed(p, 'pet');
  const petVals = await p.$$eval('#profile-panel .pp-value, #profile-panel .pp-profile-notes', (els) => els.map((e) => e.textContent.trim()));
  ok('pet: every empty field shows "—"', petVals.length === 6 && petVals.every((v) => v === '—'), JSON.stringify(petVals));
  ok('no "Not added yet" anywhere in the customer area DOM', !(await p.content()).includes('Not added yet') && !(await p.content()).includes('Nothing added yet'));
  await p.screenshot({ path: 'shots/p4-empty-1440.png', fullPage: true });
  // restore the demo data for Sarah
  await p.click('[data-edit-owner]'); for (const [k, v] of Object.entries(OWNER)) await p.fill(`[data-owner-form] [name="${k}"]`, v); await p.check('#of-whatsapp'); await p.setInputFiles('[data-owner-upload]', 'img/jessie.jpg'); await p.waitForFunction(() => /updated/.test(document.querySelector('[data-owner-photo-status]').textContent), null, { timeout: 30000 }); await p.click('[data-owner-form] [data-submit]'); await closed(p, 'owner');
  await p.click('[data-edit-pet]'); for (const [k, v] of Object.entries(PET)) { if (k === 'frequency') await p.selectOption('#pf-frequency', v); else await p.fill(`[data-pet-form] [name="${k}"]`, v); } await p.click('[data-pet-form] [data-submit]'); await closed(p, 'pet');
  await b.close(); console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors');
})().catch((e) => { console.error('SCRIPT ERROR', e.message); process.exit(1); });
