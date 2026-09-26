const { request } = require('playwright-core');
const fs = require('fs');
const API = 'http://127.0.0.1:8787';
const H = { Origin: 'http://127.0.0.1:8788' };
async function ctx() { return request.newContext({ baseURL: API, extraHTTPHeaders: H }); }
async function signInOrRegister(c, body) {
  let r = await c.post('/register', { data: body });
  if (r.status() === 409) r = await c.post('/login', { data: { email: body.email, password: body.password } });
  if (!r.ok()) throw new Error(body.email + ' ' + r.status() + ' ' + await r.text());
  return r.json();
}
(async () => {
  const out = {};
  // Sarah: two pets
  const sarah = await ctx();
  let me = await signInOrRegister(sarah, { name: 'Sarah Mitchell', email: 'sarah@example.com', phone: '07700 900123', password: 'password-sarah-1',
    pet: { name: 'Willow', species: 'Cat', age: '1–2 years', notes: 'Loves chirping at the birds. A little shy at first, but always ready for a chin scratch.', diet: 'Wet food, twice daily', likes: 'Window sills, feather wands', dislikes: 'The hoover' } });
  me = await (await sarah.get('/me')).json();
  let willow = me.pets.find(p => p.name === 'Willow'); let teddy = me.pets.find(p => p.name === 'Teddy');
  if (!teddy) { const r = await sarah.post('/me/pets', { data: { name: 'Teddy', species: 'Dog', age: '3–5 years', notes: 'Bouncy, food-motivated and friendly with every dog he meets. Needs a firm “wait” at the door.' } }); teddy = (await r.json()).pet;
    await sarah.patch('/me/pets/' + teddy.id, { data: { diet: 'Dry kibble, morning and evening', likes: 'The beach, tennis balls', dislikes: 'Fireworks' } }); }
  out.sarah = { id: me.owner.id, willow: willow.id, teddy: teddy.id };
  // Jamie: registered with a pet, pet removed below → no pets
  const jamie = await ctx();
  const j = await signInOrRegister(jamie, { name: 'Jamie Okafor', email: 'jamie@example.com', phone: '07700 900777', password: 'password-jamie-1', pet: { name: 'Temp', species: 'Rabbit', age: 'Under 1 year' } });
  const jm = await (await jamie.get('/me')).json(); out.jamie = { id: jm.owner.id, pets: jm.pets.map(p => p.id) };
  // Admin tester (promoted via sqlite by the shell after this step)
  const adm = await ctx();
  await signInOrRegister(adm, { name: 'Admin Tester', email: 'admin-tester@example.com', password: 'password-admin-1', pet: { name: 'Placeholder', species: 'Other', age: '1–2 years' } });
  const am = await (await adm.get('/me')).json(); out.admin = { id: am.owner.id };
  fs.writeFileSync('seed.json', JSON.stringify(out, null, 2)); console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
