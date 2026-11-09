// Current production wizard, intercepted synthetic API; no production writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.REASSURANCE_OUTPUT||'/private/tmp/palmers-reassurance-release';
(async()=>{
 const {PRODUCTS,CATALOG}=await import(path.resolve(root,'../palmers-api-reports/src/price-catalog.js'));
 const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync(out,{recursive:true});
 try {
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.port==='8787') {assert.equal(req.method(),'GET');return route.fulfill({json:u.pathname==='/public/availability'?{today:{date:'2026-11-09',time:'06:00'},availability:[],busy:[],services:PRODUCTS,offers:CATALOG}:{}});}
  if(u.hostname==='127.0.0.1') {const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+'/'))return route.abort();try{return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.jpg')?'image/jpeg':f.endsWith('.png')?'image/png':f.endsWith('.svg')?'image/svg+xml':'text/html'});}catch{return route.fulfill({status:404});}}
  return route.abort();
 });
 const results=[];
 async function check(width,step){
  const layout=await page.evaluate(()=>{const p=document.querySelector('.BookingReassurancePanel'),b=document.querySelector('#hbBooker'),pr=p.getBoundingClientRect(),br=b.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,gap:pr.top-br.bottom,width:pr.width,booker:br.width,background:getComputedStyle(p).backgroundColor,headline:getComputedStyle(document.querySelector('h1 em')).color,columns:getComputedStyle(p.querySelector('ul')).gridTemplateColumns.split(' ').length};});
  assert(!layout.overflow);assert.equal(layout.gap,24);assert.equal(layout.width,layout.booker);assert.equal(layout.background,layout.headline);
  assert.equal(layout.columns,width>1100?3:2);
  assert.equal(await page.locator('.BookingReassurancePanel li').count(),6);
  assert.equal(await page.locator('[data-reassurance-location]').textContent(),'Local, trusted care in Selsey');
  assert(!/insured|DBS/i.test(await page.locator('.BookingReassurancePanel').textContent()));
  await page.locator('.hb-hero').screenshot({path:path.join(out,`homepage-${width}-step-${step}.png`)});results.push({width,step,...layout});
 }
 for(const width of [375,430,768,1024,1440,1600]) {
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:8797/');await page.evaluate(()=>localStorage.clear());await page.reload();
  await check(width,1);await page.locator('[data-svc="walk"]').click();await check(width,2);
  await page.selectOption('#hbLen','60');await page.click('#hbDurationNext');await check(width,3);
  await page.click('#hbPetsNext');await page.waitForSelector('.hb-day:not(:disabled)');await check(width,4);
  await page.locator('.hb-day:not(:disabled)').first().click();await page.locator('[data-s="09:00"]').click();
  assert.equal(await page.locator('#hbSumPrice').textContent(),'£20.00');assert(await page.locator('#hbContinue').isEnabled());
  const saved=await page.evaluate(()=>localStorage.getItem('ppc-slot'));await page.reload();await page.waitForSelector('#hbContinue:not(:disabled)');assert.equal(await page.evaluate(()=>localStorage.getItem('ppc-slot')),saved);
 }
 await page.evaluate(()=>document.querySelector('.brand small').textContent='Example division');await page.addScriptTag({path:path.join(root,'BookingReassurancePanel.js')});assert.equal(await page.locator('[data-reassurance-location]').textContent(),'Local, trusted care in Example division');
 if(process.env.ACCEPTANCE_AXE){await page.addScriptTag({path:process.env.ACCEPTANCE_AXE});const audit=await page.evaluate(()=>axe.run(document.querySelector('.BookingReassurancePanel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(audit.violations,[]);fs.writeFileSync(path.join(out,'axe-panel.json'),JSON.stringify(audit,null,2));}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));
 console.log('PASS: current four-step wizard at six widths; panel content/order/colour/width, dynamic location, saved slot, £20 price, no browser errors or production writes');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
