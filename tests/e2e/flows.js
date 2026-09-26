const { chromium } = require('playwright-core');
const email = `flow${Date.now()}@example.com`, password = 'password-flow-1';
const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  (' + extra + ')' : ''}`);
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const r = await ctx.request.post('http://127.0.0.1:8787/register', { data: { name: 'Flow Tester', email, phone: '07700 900000', password, pet: { name: 'Biscuit', species: 'Dog', age: '3–5 years', notes: 'Chews shoes.' } }, headers: { Origin: 'http://127.0.0.1:8788' } });
  if (!r.ok()) throw new Error('register ' + r.status());
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let navs = 0; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs++; });
  await p.goto('http://127.0.0.1:8788/account.html', { waitUntil: 'networkidle' }); const navsAfterLoad = navs;
  ok('greeting uses first name', (await p.textContent('h1')).trim() === 'Hello, Flow.', await p.textContent('h1'));
  ok('URL carries ?pet= after load', /\?pet=/.test(p.url()), p.url());
  // Add a pet
  await p.click('[data-pets-card] [data-add-pet], .pp-pets-head [data-add-pet]');
  ok('add modal open', await p.$eval('[data-modal="pet"]', (d) => d.open));
  await p.click('[data-pet-form] [data-submit]');
  ok('validation blocks empty submit', (await p.textContent('[data-pet-form] [data-error]')).includes('highlighted'));
  await p.fill('#pf-name', 'Pickle'); await p.selectOption('#pf-species', 'Cat'); await p.selectOption('#pf-age', '1–2 years'); await p.fill('#pf-diet', 'Wet food, twice daily'); await p.fill('#pf-notes', 'Bossy but affectionate.');
  await p.click('[data-pet-form] [data-submit]'); await p.waitForFunction((n) => !document.querySelector('[data-modal=\"' + n + '\"]').open, 'pet', { timeout: 8000 });
  ok('pet count now 2', (await p.textContent('[data-pet-count]')).trim() === '2');
  ok('new pet selected + profile shows it', (await p.textContent('#profile-panel h3')).trim() === 'Pickle');
  ok('feeding routine shown', (await p.textContent('#profile-panel')).includes('Wet food, twice daily'));
  ok('diary title follows selection', (await p.textContent('[data-diary-title]')).trim() === 'Pickle’s photo diary');
  ok('diary empty state', (await p.textContent('[data-diary-body]')).includes('No photos yet'));
  // Switch chip → no reload, URL updates, diary follows
  const pickleUrl = p.url();
  await p.click('.pp-chip:has-text("Biscuit")'); await p.waitForTimeout(150);
  ok('chip switch: profile = Biscuit', (await p.textContent('#profile-panel h3')).trim() === 'Biscuit');
  ok('chip switch: URL changed', p.url() !== pickleUrl && /\?pet=/.test(p.url()));
  ok('chip switch: no full reload', navs === navsAfterLoad, `navigations=${navs - navsAfterLoad}`);
  ok('chip aria-selected updated', await p.$eval('.pp-chip:has-text("Biscuit")', (e) => e.getAttribute('aria-selected')) === 'true');
  await p.goBack(); await p.waitForTimeout(150); ok('browser back restores Pickle', (await p.textContent('#profile-panel h3')).trim() === 'Pickle');
  await p.reload({ waitUntil: 'networkidle' }); ok('selection survives refresh', (await p.textContent('#profile-panel h3')).trim() === 'Pickle');
  // Edit pet
  await p.click('[data-edit-pet]'); ok('edit modal title', (await p.textContent('[data-pet-modal-title]')).includes('Pickle’s details'));
  ok('edit modal prefilled', await p.inputValue('#pf-notes') === 'Bossy but affectionate.');
  await p.fill('#pf-name', 'Pickles'); await p.click('[data-pet-form] [data-submit]'); await p.waitForFunction((n) => !document.querySelector('[data-modal=\"' + n + '\"]').open, 'pet', { timeout: 8000 });
  ok('edit saved in place', (await p.textContent('#profile-panel h3')).trim() === 'Pickles' && (await p.textContent('.pp-chip[aria-selected="true"]')).includes('Pickles'));
  ok('edit button text updates', (await p.textContent('[data-edit-pet]')).includes('Pickles’ details'));
  // Edit owner
  await p.click('[data-edit-owner]'); ok('owner modal prefilled', await p.inputValue('#of-name') === 'Flow Tester');
  ok('email field locked', await p.$eval('#of-email', (e) => e.disabled));
  await p.fill('#of-phone', 'abc'); await p.click('[data-owner-form] [data-submit]'); await p.waitForTimeout(300);
  ok('server rejects bad phone', (await p.textContent('[data-owner-form] [data-error]')).includes('mobile number'));
  await p.fill('#of-name', 'Flo Tester'); await p.fill('#of-phone', '07700 900111'); await p.click('[data-owner-form] [data-submit]'); await p.waitForFunction((n) => !document.querySelector('[data-modal=\"' + n + '\"]').open, 'owner', { timeout: 8000 });
  ok('owner saved in place', (await p.textContent('[data-owner-fullname]')).trim() === 'Flo Tester' && (await p.textContent('[data-owner-phone]')).trim() === '07700 900111' && (await p.textContent('h1')).trim() === 'Hello, Flo.');
  // Remove pet with confirmation
  await p.click('[data-remove-pet]'); ok('confirm dialog names the pet', (await p.textContent('#confirm-title')).includes('Pickles'));
  await p.click('[data-modal="confirm"] [data-close]'); ok('cancel keeps pet', (await p.textContent('[data-pet-count]')).trim() === '2');
  await p.click('[data-remove-pet]'); await p.click('[data-confirm-form] [data-submit]'); await p.waitForFunction((n) => !document.querySelector('[data-modal=\"' + n + '\"]').open, 'confirm', { timeout: 8000 }); await p.waitForTimeout(150);
  ok('pet removed, selection falls to Biscuit', (await p.textContent('[data-pet-count]')).trim() === '1' && (await p.textContent('#profile-panel h3')).trim() === 'Biscuit');
  await p.click('[data-remove-pet]'); await p.click('[data-confirm-form] [data-submit]'); await p.waitForFunction((n) => !document.querySelector('[data-modal=\"' + n + '\"]').open, 'confirm', { timeout: 8000 }); await p.waitForTimeout(150);
  ok('last pet removed → empty state, diary hidden', (await p.textContent('[data-profile]')).includes('No pets yet') && await p.$eval('[data-diary-card]', (e) => e.hidden) && !/\?pet=/.test(p.url()));
  ok('empty-state Add a pet opens modal', (await p.click('[data-profile] [data-add-pet]'), await p.$eval('[data-modal="pet"]', (d) => d.open)));
  await p.keyboard.press('Escape'); ok('Escape closes modal', !(await p.$eval('[data-modal="pet"]', (d) => d.open)));
  await ctx.close();
  // Sarah: show more + lightbox + keyboard focus
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await c2.request.post('http://127.0.0.1:8787/login', { data: { email: 'sarah@example.com', password: 'password-sarah-1' }, headers: { Origin: 'http://127.0.0.1:8788' } });
  const q = await c2.newPage(); q.on('pageerror', (e) => errors.push(e.message)); await q.goto('http://127.0.0.1:8788/account.html', { waitUntil: 'networkidle' });
  ok('6 of 7 photos shown', (await q.$$('.pp-photo-card')).length === 6 && (await q.textContent('[data-show-more]')).includes('1 more'));
  const stamps = await q.$$eval('.pp-photo-card time', (els) => els.map((e) => e.textContent)); ok('UK-time stamp format', stamps[0] === '24 Sept 2026 · 10:42', stamps[0]);
  ok('newest first', await q.$$eval('.pp-photo-card time', (els) => els.map((e) => +new Date(e.dateTime)).every((t, i, a) => i === 0 || a[i - 1] >= t)));
  await q.click('[data-show-more]'); ok('show more reveals all', (await q.$$('.pp-photo-card')).length === 7 && !(await q.$('[data-show-more]')));
  ok('alt text = caption', await q.$eval('.pp-photo-card img', (e) => e.alt) === 'A quiet moment');
  await q.click('.pp-photo-card:nth-child(2) .pp-photo-btn'); ok('lightbox opens with caption', await q.$eval('[data-modal="lightbox"]', (d) => d.open) && (await q.textContent('[data-lightbox-caption]')) === 'Ready for a little fuss');
  await q.keyboard.press('Escape'); ok('lightbox Escape closes + focus returns', !(await q.$eval('[data-modal="lightbox"]', (d) => d.open)) && await q.evaluate(() => document.activeElement.classList.contains('pp-photo-btn')));
  await q.click('.pp-chip:has-text("Teddy")'); await q.waitForTimeout(150); ok('Teddy diary has 2 photos', (await q.$$('.pp-photo-card')).length === 2 && (await q.textContent('[data-diary-title]')).includes('Teddy'));
  // keyboard: tab reaches chips and buttons (real buttons)
  const kinds = await q.$$eval('.pp-chip, [data-add-pet], [data-edit-pet], [data-remove-pet], [data-edit-owner], .pp-photo-btn', (els) => [...new Set(els.map((e) => e.tagName))]); ok('all controls are real <button>s', kinds.join() === 'BUTTON', kinds.join());
  await c2.close(); await b.close();
  console.log(errors.length ? 'CONSOLE/PAGE ERRORS: ' + errors.join(' | ') : 'no console or page errors');
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
