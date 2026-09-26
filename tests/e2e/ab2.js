const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  // A viewport taller than either page: the grid's min-height:100vh then fixes both sidebars at the same height.
  for (const [page, tag] of [['account-before.html', 'B'], ['account.html', 'A']]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 1 });
    await ctx.request.post('http://127.0.0.1:8787/login', { data: { email: 'sarah@example.com', password: 'password-sarah-1' }, headers: { Origin: 'http://127.0.0.1:8788' } });
    const p = await ctx.newPage(); await p.goto('http://127.0.0.1:8788/' + page, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
    const side = await p.$('aside.pp-side'); const box = await side.boundingBox(); await side.screenshot({ path: `shots/sideH-${tag}.png` });
    const foot = await p.$eval('aside.pp-side footer', (f) => { const r = f.getBoundingClientRect(); const s = getComputedStyle(f); return { top: r.top, h: r.height, font: s.fontSize, color: s.color, text: f.textContent }; });
    console.log(`${tag}: aside ${Math.round(box.width)}x${Math.round(box.height)} footer ${JSON.stringify(foot)}`);
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
