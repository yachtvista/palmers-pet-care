const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '../..');
const pet = (id, name, species) => ({ id, name, species, photos: [], age: '3–5 years' });
const customers = [
  { id: 'a', name: 'Alice Example', email: 'alice@example.test', pets: [{ ...pet('dog', 'Buddy', 'Dog'), dateOfBirth: '2020-10-15' }, { ...pet('cat', 'Misty', 'Cat'), dateOfBirth: '2022-10-31' }, { ...pet('other', 'Winter', 'Cat'), dateOfBirth: '2020-11-01' }, { ...pet('invalid', 'Invalid date', 'Dog'), dateOfBirth: '2020-10-32' }, { ...pet('future', 'Future date', 'Dog'), dateOfBirth: '2027-10-16' }, pet('missing', 'No birthday', 'Dog'), { ...pet('leap', 'Leap pet', 'Cat'), dateOfBirth: '2020-02-29' }] },
  { id: 'b', name: 'Bob Example', email: 'bob@example.test', pets: [] },
  { id: 'c', name: '<img src=x onerror=alert(1)>', email: 'safe@example.test', pets: [{ ...pet('rabbit', '<b>Rabbit</b>', 'Rabbit'), dateOfBirth: '2021-10-01' }] }
];
(async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
    try { res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'America/Los_Angeles' });
    await page.clock.install({ time: new Date('2026-10-15T00:30:00Z') });
    const errors = []; let mode = 'ok';
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**/*', route => route.abort());
    await page.route('http://127.0.0.1:8787/**', async route => {
      const url = route.request().url();
      if (url.endsWith('/admin/customers')) return route.fulfill({ status: mode === 'forbidden' ? 403 : mode === 'failure' ? 500 : 200, json: mode === 'ok' ? { customers, count: 3 } : mode === 'empty' ? { customers: [], count: 0 } : { error: 'Unavailable' } });
      // Keep diary requests pending to verify the directory/search work independently.
      if (url.includes('/pets/')) return;
      return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + '/admin.html');
    await page.waitForSelector('.pp-user-table tbody tr');
    assert.equal(await page.locator('.pp-user-table tbody tr').count(), 3);
    assert.match(await page.locator('.pp-user-table').innerText(), /Buddy \(Dog\).*Misty \(Cat\)/s);
    assert.match(await page.locator('.pp-user-table').innerText(), /No pets registered/);
    assert.equal(await page.locator('.pp-user-table img, .pp-user-table b').count(), 0);
    assert.equal(await page.locator('.pp-user-table a[href="mailto:alice@example.test"]').count(), 1);
    assert.equal(await page.locator('.pp-birthday-item').count(), 3);
    assert.deepEqual(await page.locator('.pp-birthday-details h3').allTextContents(), ['<b>Rabbit</b>', 'Buddy', 'Misty']);
    assert.match(await page.locator('[data-pet="dog"]').innerText(), /Date of birth\s+15 October 2020/i);
    assert.match(await page.locator('.pp-user-table').innerText(), /Date of birth: 15 October 2020/);
    assert.match(await page.locator('[data-pet="missing"]').innerText(), /Date of birth\s+Not provided/i);
    assert.match(await page.locator('[data-pet="invalid"]').innerText(), /Date of birth\s+Not provided/i);
    assert.match(await page.locator('.pp-birthday-item.is-today').innerText(), /Buddy.*Turns 6 years old.*Today/s);
    assert.equal(await page.locator('.pp-birthdays b, .pp-birthdays img').count(), 0);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'palmers-birthdays-desktop.png'), fullPage: true });
    await page.fill('[data-search]', 'misty');
    assert.equal(await page.locator('.pp-user-table tbody tr').count(), 1);
    assert.equal(await page.locator('[data-count]').innerText(), '1 of 3 registered users');
    await page.locator('.pp-user-table a:has-text("View details")').click();
    assert.equal(await page.locator('#registered-user-0').count(), 1);
    // Birthday navigation clears search so the requested pet remains reachable.
    await page.locator('[data-birthday-pet="dog"]').click();
    assert.equal(await page.locator('[data-search]').inputValue(), '');
    assert.equal(await page.locator('[data-pet="dog"]').evaluate(el => el === document.activeElement), true);
    await page.fill('[data-search]', 'bob@example.test');
    assert.match(await page.locator('.pp-user-table').innerText(), /Bob Example/);
    await page.fill('[data-search]', 'nobody-matches');
    assert.match(await page.locator('.pp-user-table').innerText(), /No users match/);
    await page.fill('[data-search]', '');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'palmers-birthdays-mobile.png'), fullPage: true });
    // London is already October while the browser's local timezone is still September.
    await page.clock.setFixedTime(new Date('2026-10-01T00:30:00Z')); await page.reload();
    await page.waitForSelector('.pp-birthday-item.is-today');
    assert.match(await page.locator('.pp-birthday-item.is-today').innerText(), /Rabbit/);
    await page.clock.setFixedTime(new Date('2028-02-29T12:00:00Z')); await page.reload();
    await page.waitForSelector('.pp-birthday-item.is-today');
    assert.match(await page.locator('.pp-birthday-item.is-today').innerText(), /Leap pet.*Turns 8 years old/s);
    await page.clock.setFixedTime(new Date('2026-12-01T12:00:00Z')); await page.reload();
    await page.waitForSelector('.pp-birthdays');
    assert.match(await page.locator('.pp-birthdays').innerText(), /No pets with a recorded birthday this month/);
    mode = 'empty'; await page.reload();
    await page.waitForSelector('.pp-user-table');
    assert.match(await page.locator('.pp-user-table').innerText(), /No registered users yet/);
    mode = 'failure'; await page.reload();
    await page.waitForSelector('[role="alert"]');
    assert.equal(await page.locator('.pp-birthdays').count(), 0);
    assert.equal(await page.locator('.pp-user-table').count(), 0);
    mode = 'forbidden'; await page.reload();
    await page.waitForURL('**/account.html');
    assert.equal(await page.locator('.pp-birthdays').count(), 0);
    assert.equal(await page.locator('.pp-user-table').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: dates of birth, birthday ordering/ages/today, missing/invalid/future dates, leap day, London timezone, birthday navigation, users, multiple/no pets, escaping, search before diaries, detail links, mobile overflow, empty/error and non-admin views');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
