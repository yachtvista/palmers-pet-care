// Run with PLAYWRIGHT_MODULE pointing to an installed playwright-core module.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();let bookings=[],counter=0;
const services=[{id:'walk60',name:'Dog walking · 60 minutes',unit:'hours',step:1,rate:2200,extra:500},{id:'sitting',name:'House-sitting · overnight',unit:'days',step:1,rate:4000}];
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.hostname==='127.0.0.1' && url.port==='8787') {
 let data;
 if(url.pathname==='/me') data={pets:[{id:'p1',name:'Biscuit',species:'Dog'},{id:'p2',name:'Pickle',species:'Dog'}]};
 else if(req.method()==='GET') data={services,bookings};
 else if(req.method()==='DELETE'){bookings=bookings.filter(b=>b.id!==url.pathname.split('/').pop());data={ok:true};}
 else {const b=req.postDataJSON(),s=services.find(s=>s.id===b.serviceId);b.id=req.method()==='POST'?String(++counter):url.pathname.split('/').pop();b.unit=s.unit;b.petNames=b.petIds.map(id=>id==='p1'?'Biscuit':'Pickle');b.total=(s.rate+(b.petIds.length-1)*(s.extra||800))*b.duration;bookings=bookings.filter(x=>x.id!==b.id).concat(b);data={booking:b};}
 return route.fulfill({json:data});
 }
 if(url.hostname==='127.0.0.1') {const file=path.resolve(__dirname,'../..','.'+url.pathname);if(fs.existsSync(file))return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});}
 return route.abort();
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8788/bookings.html');await page.waitForSelector('.calendar-add');
await page.locator('.calendar-add').nth(10).click();await page.locator('#save-booking').click();assert.match(await page.locator('#booking-error').textContent(),/at least one/);
await page.locator('.pet-options label').nth(0).click();await page.locator('.pet-options label').nth(1).click();assert.match(await page.locator('#booking-cost').textContent(),/£27.00/);
await page.locator('.pet-options label').nth(1).click();assert.match(await page.locator('#booking-cost').textContent(),/£22.00/);
await page.selectOption('[name=serviceId]','sitting');await page.fill('[name=duration]','3');await page.click('#save-booking');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(await page.locator('.calendar-event').count(),3);
await page.reload();await page.waitForSelector('.calendar-event');assert.equal(await page.locator('.calendar-event').count(),3);
await page.locator('[data-copy]').click();await page.locator('.calendar-add').nth(20).click();await page.click('#save-booking');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(bookings.length,2);
await page.locator('.calendar-event').first().click();await page.fill('[name=duration]','2');await page.click('#save-booking');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(await page.locator('.calendar-event').count(),5);
await page.locator('.calendar-event').first().click();await page.click('#remove-booking');await page.click('#remove-booking');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(bookings.length,1);
const dt=await page.evaluateHandle(()=>new DataTransfer());await page.locator('[data-drag]').dispatchEvent('dragstart',{dataTransfer:dt});await page.locator('[data-date]').nth(4).dispatchEvent('drop',{dataTransfer:dt});assert.equal(await page.locator('dialog').evaluate(d=>d.open),true);await page.click('#save-booking');await page.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(bookings.length,2);
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/private/tmp/palmers-calendar-mobile.png',fullPage:true});
await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'/private/tmp/palmers-calendar-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
await browser.close();console.log('PASS: selection, costs, multi-day display, reload, edit, delete, copy, drag-and-drop, mobile layout, no browser errors');
})().catch(e=>{console.error(e);process.exit(1)});
