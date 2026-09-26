const { request } = require('playwright-core'); const fs = require('fs');
const seed = require('./seed.json');
(async () => {
  const c = await request.newContext({ baseURL: 'http://127.0.0.1:8787', extraHTTPHeaders: { Origin: 'http://127.0.0.1:8788' } });
  const r = await c.post('/login', { data: { email: 'admin-tester@example.com', password: 'password-admin-1' } }); if (!r.ok()) throw new Error('admin login ' + r.status());
  const up = async (petId, file, caption) => { const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync('img/' + file).toString('base64'); const x = await c.post('/pets/' + petId + '/photos', { data: { dataUrl, caption } }); if (!x.ok()) throw new Error(file + ' ' + x.status() + ' ' + await x.text()); return (await x.json()).photo.id; };
  const existing = (await (await c.get('/pets/' + seed.sarah.willow + '/photos')).json()).photos.length;
  if (existing) { console.log('willow already has', existing, 'photos; skipping'); return; }
  const willow = [['cat-close.jpg', 'A quiet moment'], ['cat-sit.jpg', 'Ready for a little fuss'], ['cats-play.jpg', 'Settling in nicely'], ['sphynx.jpg', 'Made a new friend at the window'], ['jessie.jpg', 'Sunbeam found'], ['cat-close.jpg', 'Breakfast, then a nap'], ['cat-sit.jpg', 'Chin scratches accepted']];
  const teddy = [['puppy.jpg', 'Beach morning'], ['staffy.jpg', 'Muddy but happy']];
  const ids = { willow: [], teddy: [] };
  for (const [f, cap] of willow) ids.willow.push(await up(seed.sarah.willow, f, cap));
  for (const [f, cap] of teddy) ids.teddy.push(await up(seed.sarah.teddy, f, cap));
  fs.writeFileSync('photos.json', JSON.stringify(ids)); console.log('uploaded', ids.willow.length + ids.teddy.length);
})().catch(e => { console.error(e); process.exit(1); });
