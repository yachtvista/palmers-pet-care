const { chromium, request } = require('playwright-core');
const FOREIGN_PET = 'b1d65fa6-8313-426c-813e-c0da9ffb2b82'; // Willow belonging to owner@example.com, not Sarah
const FOREIGN_PHOTO = '5aa2efec-729e-4712-8d74-1814c665bf53'; // Sam Customer's photo
(async () => {
  const c = await request.newContext({ baseURL: 'http://127.0.0.1:8787', extraHTTPHeaders: { Origin: 'http://127.0.0.1:8788' } });
  const l = await c.post('/login', { data: { email: 'sarah@example.com', password: 'password-sarah-1' } }); if (!l.ok()) throw new Error('login');
  const probe = async (label, fn) => { const r = await fn(); console.log(`${label.padEnd(44)} → ${r.status()} ${(await r.text()).slice(0, 60)}`); };
  await probe('GET  /pets/<other>/photos', () => c.get(`/pets/${FOREIGN_PET}/photos`));
  await probe('GET  /pets/<other>/diary', () => c.get(`/pets/${FOREIGN_PET}/diary`));
  await probe('PATCH /me/pets/<other>', () => c.patch(`/me/pets/${FOREIGN_PET}`, { data: { name: 'Hacked' } }));
  await probe('DELETE /me/pets/<other>', () => c.delete(`/me/pets/${FOREIGN_PET}`));
  await probe('GET  /photos/<other photo>', () => c.get(`/photos/${FOREIGN_PHOTO}`));
  await probe('POST /pets/<own>/photos (customer, not admin)', async () => { const me = await (await c.get('/me')).json(); return c.post(`/pets/${me.pets[0].id}/photos`, { data: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', caption: 'x' } }); });
  await probe('GET  /admin/customers (customer)', () => c.get('/admin/customers'));
  // The page itself with a foreign ?pet=
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.request.post('http://127.0.0.1:8787/login', { data: { email: 'sarah@example.com', password: 'password-sarah-1' }, headers: { Origin: 'http://127.0.0.1:8788' } });
  const p = await ctx.newPage(); const hits = [];
  p.on('response', (r) => { if (r.url().includes(FOREIGN_PET)) hits.push(r.status() + ' ' + r.url().replace('http://127.0.0.1:8787', '')); });
  await p.goto(`http://127.0.0.1:8788/account.html?pet=${FOREIGN_PET}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  console.log('page ?pet=<other>: url now', p.url().replace('http://127.0.0.1:8788/', ''), '| profile shows:', await p.$eval('#profile-panel h3', (e) => e.textContent), '| diary title:', await p.$eval('[data-diary-title]', (e) => e.textContent), '| requests naming the foreign id:', hits.length ? hits.join(', ') : 'none');
  // Verify no foreign image URLs in the DOM
  const srcs = await p.$$eval('img', (els) => els.map((e) => e.src)); console.log('foreign photo in DOM:', srcs.some((s) => s.includes(FOREIGN_PHOTO)) ? 'YES (BAD)' : 'no');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
