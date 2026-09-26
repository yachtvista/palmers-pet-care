// usage: node shot.js <email> <password> <outPrefix> [path]  → <prefix>-1440.png, <prefix>-390.png (+ -side.png sidebar crop at 1440)
const { chromium } = require('playwright-core');
const [email, password, prefix, path = 'account.html'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [w, h, tag] of [[1440, 900, '1440'], [390, 844, '390']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, timezoneId: 'Europe/London' });
    const r = await ctx.request.post('http://127.0.0.1:8787/login', { data: { email, password }, headers: { Origin: 'http://127.0.0.1:8788' } });
    if (!r.ok()) throw new Error('login ' + r.status());
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('http://127.0.0.1:8788/' + path, { waitUntil: 'networkidle' });
    await p.evaluate(async () => { document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; }); await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))); await document.fonts.ready; });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `shots/${prefix}-${tag}.png`, fullPage: true });
    if (tag === '1440') await p.screenshot({ path: `shots/${prefix}-side.png`, clip: { x: 0, y: 0, width: 230, height: 900 } });
    const sw = await p.evaluate(() => document.documentElement.scrollWidth); const cw = await p.evaluate(() => document.documentElement.clientWidth);
    console.log(`${prefix} ${tag}: scrollWidth=${sw} clientWidth=${cw}${sw > cw ? '  <-- HORIZONTAL SCROLL' : ''}${errors.length ? '  errors: ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
