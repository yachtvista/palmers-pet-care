const { chromium } = require('playwright-core');
const ok = (l, c, x = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${x ? '  (' + x + ')' : ''}`);
const SITE = 'https://palmerspetcare.co.uk', API = 'https://api.palmerspetcare.co.uk';
const tmpEmail = `launch-check-${Date.now()}@example.com`;
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true }); const errors = [];
  // 1) admin signs in through the real login form
  const a = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await a.newPage(); p.on('pageerror', (e) => errors.push('admin: ' + e.message));
  await p.goto(SITE + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#login-email', { timeout: 30000 });
  ok('login page is the real form', !!(await p.$('[data-account-form="login"]')) && !(await p.content()).includes('not connected yet'));
  await p.fill('#login-email', 'enquiries@palmerspetcare.co.uk'); await p.fill('#login-password', 'Cadgy-Rushen-Layman-51'); await p.click('[data-account-form="login"] button[type="submit"]');
  await p.waitForURL(/admin\.html/, { timeout: 30000 }); await p.waitForSelector('[data-count]:not(:empty)', { timeout: 30000 });
  ok('admin lands on All customers', /admin\.html/.test(p.url()), await p.textContent('[data-count]'));
  await p.goto(SITE + '/account.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('[data-owner-first]:not(:empty)', { timeout: 30000 }); await p.waitForFunction(() => document.querySelector('[data-owner-first]').textContent !== '…', null, { timeout: 30000 }); ok('admin sees own dashboard + admin link', (await p.textContent('h1')).includes('Hello') && !(await p.$eval('[data-admin-link]', (e) => e.hidden)));
  await p.screenshot({ path: 'shots/live-admin.png' });
  // 2) throwaway customer registers, sees the dashboard
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } }); const q = await c.newPage(); q.on('pageerror', (e) => errors.push('cust: ' + e.message));
  await q.goto(SITE + '/register.html', { waitUntil: 'domcontentloaded' }); await q.waitForSelector('#pet-species option:nth-child(2)', { state: 'attached', timeout: 30000 });
  await q.fill('#pet-name', 'Launch Check'); await q.selectOption('#pet-species', 'Dog'); await q.selectOption('#pet-age', '3–5 years');
  await q.fill('#register-name', 'Launch Check'); await q.fill('#register-email', tmpEmail); await q.fill('#register-password', 'launch-check-pw-1'); await q.fill('#register-confirm', 'launch-check-pw-1');
  await q.click('[data-account-form="registration"] button[type="submit"]'); await q.waitForURL(/account\.html/, { timeout: 30000 }); await q.waitForSelector('#profile-panel', { timeout: 30000 });
  ok('customer registers and lands on dashboard', /account\.html\?pet=/.test(q.url()) && (await q.textContent('#profile-panel h3')).trim() === 'Launch Check');
  ok('customer has no admin link', await q.$eval('[data-admin-link]', (e) => e.hidden));
  ok('customer blocked from admin API', (await c.request.get(API + '/admin/customers')).status() === 403);
  await q.screenshot({ path: 'shots/live-customer.png' });
  const me = await (await c.request.get(API + '/me')).json(); console.log('THROWAWAY_USER_ID=' + me.owner.id);
  await b.close(); console.log(errors.length ? 'PAGE ERRORS: ' + errors.join(' | ') : 'no page errors');
})().catch((e) => { console.error('SCRIPT ERROR', e.message); process.exit(1); });
