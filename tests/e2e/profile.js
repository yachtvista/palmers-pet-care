const { chromium, request } = require('playwright-core'); const seed = require('./seed.json');
const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  (' + extra + ')' : ''}`);
const H = { Origin: 'http://127.0.0.1:8788' };
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true }); const errors = [];
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.request.post('http://127.0.0.1:8787/login', { data: { email: 'sarah@example.com', password: 'password-sarah-1' }, headers: H });
  const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://127.0.0.1:8788/account.html', { waitUntil: 'networkidle' });
  const heroBefore = await p.$eval('.pp-profile-photo', (e) => e.src); const diaryBefore = (await p.$$('.pp-photo-card')).length;
  ok('starts with fallback photo + "Add a photo"', (await p.textContent('.pp-photo-change')).includes('Add a photo') && !(await p.$('[data-profile-remove]')));
  await p.setInputFiles('[data-profile-upload]', 'img/cat-sit.jpg'); await p.waitForFunction(() => /updated/.test(document.querySelector('[data-profile-status]').textContent), null, { timeout: 15000 });
  const heroAfter = await p.$eval('.pp-profile-photo', (e) => e.src); const chipSrc = await p.$eval('.pp-chip[aria-selected="true"] img', (e) => e.src);
  ok('profile photo replaced the fallback', heroAfter !== heroBefore && /\/photos\//.test(heroAfter));
  ok('chip thumbnail uses the same photo', chipSrc === heroAfter);
  ok('label now "Change photo" + Remove offered', (await p.textContent('.pp-photo-change')).includes('Change photo') && !!(await p.$('[data-profile-remove]')));
  ok('diary unchanged (profile photo not listed)', (await p.$$('.pp-photo-card')).length === diaryBefore, `${diaryBefore}`);
  ok('alt text names the pet', (await p.$eval('.pp-profile-photo', (e) => e.alt)).includes('Willow'));
  await p.reload({ waitUntil: 'networkidle' }); ok('persists after refresh', await p.$eval('.pp-profile-photo', (e) => e.src) === heroAfter);
  const firstId = heroAfter.split('/photos/')[1];
  await p.setInputFiles('[data-profile-upload]', 'img/cat-close.jpg'); await p.waitForFunction(() => /updated/.test(document.querySelector('[data-profile-status]').textContent), null, { timeout: 15000 });
  const second = await p.$eval('.pp-profile-photo', (e) => e.src); ok('replacing gives a new photo', second !== heroAfter);
  ok('old profile photo row removed', (await ctx.request.get('http://127.0.0.1:8787/photos/' + firstId, { headers: H })).status() === 404);
  await p.click('[data-profile-remove]'); await p.waitForFunction(() => /removed/.test(document.querySelector('[data-profile-status]').textContent), null, { timeout: 8000 });
  ok('remove falls back to newest diary photo', await p.$eval('.pp-profile-photo', (e) => e.src) === heroBefore && (await p.textContent('.pp-photo-change')).includes('Add a photo'));
  // Final demo state: Willow + Teddy each with a profile photo
  await p.setInputFiles('[data-profile-upload]', 'img/cat-sit.jpg'); await p.waitForFunction(() => /updated/.test(document.querySelector('[data-profile-status]').textContent), null, { timeout: 15000 });
  const willowProfile = (await p.$eval('.pp-profile-photo', (e) => e.src)).split('/photos/')[1];
  await p.click('.pp-chip:has-text("Teddy")'); await p.waitForTimeout(200);
  await p.setInputFiles('[data-profile-upload]', 'img/dachshund-sofa.jpg'); await p.waitForFunction(() => /updated/.test(document.querySelector('[data-profile-status]').textContent), null, { timeout: 15000 });
  ok('Teddy has his own photo; chips differ', (await p.$$eval('.pp-chip img', (els) => new Set(els.map((e) => e.src)).size)) === 2);
  // bad file type
  await p.setInputFiles('[data-profile-upload]', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') }); await p.waitForTimeout(200);
  ok('non-image rejected client-side', /choose a photo/i.test(await p.textContent('[data-profile-status]')));
  await ctx.close();
  // Other customer cannot set or see it
  const j = await request.newContext({ baseURL: 'http://127.0.0.1:8787', extraHTTPHeaders: H }); await j.post('/login', { data: { email: 'jamie@example.com', password: 'password-jamie-1' } });
  ok('other customer POST profile-photo → 404', (await j.post(`/me/pets/${seed.sarah.willow}/profile-photo`, { data: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } })).status() === 404);
  ok('other customer DELETE profile-photo → 404', (await j.delete(`/me/pets/${seed.sarah.willow}/profile-photo`)).status() === 404);
  ok('other customer GET profile photo file → 404', (await j.get('/photos/' + willowProfile)).status() === 404);
  ok('signed-out GET profile photo file → 401', (await (await request.newContext({ baseURL: 'http://127.0.0.1:8787', extraHTTPHeaders: H })).get('/photos/' + willowProfile)).status() === 401);
  // Admin sees it (JSON + card avatar)
  const a = await b.newContext({ viewport: { width: 1440, height: 900 } }); await a.request.post('http://127.0.0.1:8787/login', { data: { email: 'admin-tester@example.com', password: 'password-admin-1' }, headers: H });
  const cust = await (await a.request.get('http://127.0.0.1:8787/admin/customers', { headers: H })).json(); const willow = cust.customers.flatMap((c) => c.pets).find((x) => x.id === seed.sarah.willow);
  ok('admin JSON carries profilePhotoUrl', !!(willow && willow.profilePhotoUrl));
  const ap = await a.newPage(); ap.on('pageerror', (e) => errors.push(e.message)); await ap.goto('http://127.0.0.1:8788/admin.html', { waitUntil: 'networkidle' });
  const card = await ap.$(`[data-pet="${seed.sarah.willow}"]`); ok('admin card shows photo avatar', !!(await card.$('img.pp-avatar')));
  await card.screenshot({ path: 'shots/admin-card-willow.png' }); await a.close(); await b.close();
  console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors');
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
