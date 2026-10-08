const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '../..');
const pet = (id, name, species) => ({ id, name, species, photos: [], age: '3–5 years' });
const customers = [
  { id: 'a', name: 'Alice Example', email: 'alice@example.test', pets: [pet('dog', 'Buddy', 'Dog'), pet('cat', 'Misty', 'Cat')] },
  { id: 'b', name: 'Bob Example', email: 'bob@example.test', pets: [] },
  { id: 'c', name: '<img src=x onerror=alert(1)>', email: 'safe@example.test', pets: [pet('rabbit', '<b>Rabbit</b>', 'Rabbit')] }
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
    const page = await browser.newPage(); const errors = []; let mode = 'ok';
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
    await page.fill('[data-search]', 'misty');
    assert.equal(await page.locator('.pp-user-table tbody tr').count(), 1);
    assert.equal(await page.locator('[data-count]').innerText(), '1 of 3 registered users');
    await page.locator('.pp-user-table a:has-text("View details")').click();
    assert.equal(await page.locator('#registered-user-0').count(), 1);
    await page.fill('[data-search]', 'bob@example.test');
    assert.match(await page.locator('.pp-user-table').innerText(), /Bob Example/);
    await page.fill('[data-search]', 'nobody-matches');
    assert.match(await page.locator('.pp-user-table').innerText(), /No users match/);
    await page.fill('[data-search]', '');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    mode = 'empty'; await page.reload();
    await page.waitForSelector('.pp-user-table');
    assert.match(await page.locator('.pp-user-table').innerText(), /No registered users yet/);
    mode = 'failure'; await page.reload();
    await page.waitForSelector('[role="alert"]');
    assert.equal(await page.locator('.pp-user-table').count(), 0);
    mode = 'forbidden'; await page.reload();
    await page.waitForURL('**/account.html');
    assert.equal(await page.locator('.pp-user-table').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: users, multiple/no pets, escaping, search before diaries, detail links, mobile overflow, empty/error and non-admin views');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
