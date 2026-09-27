// Exercises browser UI against the actual Worker with an isolated SQLite database.
// Requires the adjacent palmers-pet-care-api checkout and Node 24+.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import worker from '../../../palmers-pet-care-api/src/index.js';
import { db, env, call } from '../../../palmers-pet-care-api/tests/bookings.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
db.exec('DELETE FROM bookings; DELETE FROM booking_days');
const date=new Date().toISOString().slice(0,8)+'15', emptyDate=date.slice(0,8)+'20';
const payload={petIds:['dog','dog2'],serviceId:'sitting',date,time:'09:00',duration:2};
assert.equal((await call('POST','/me/bookings',payload)).status,201);
const browser=await chromium.launch({channel:'chrome',headless:true});
const errors=[];
async function pageFor(user){
 const context=await browser.newContext();
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='127.0.0.1'&&url.port==='8787'){
   const response=await worker.fetch(new Request(req.url(),{method:req.method(),headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1:8788',Cookie:'ppc_session='+user},body:req.postData()||undefined}),env);
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  if(url.hostname==='127.0.0.1'){
   const path=resolve(new URL('../..',import.meta.url).pathname,'.'+url.pathname);
   if(existsSync(path))return route.fulfill({body:readFileSync(path),contentType:path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html'});
  }
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
}
try{
 const admin=await pageFor('admin'),customer=await pageFor('a');
 await admin.goto('http://127.0.0.1:8788/admin-calendar.html');await admin.waitForSelector('[data-day]');
 await admin.locator(`[data-day="${date}"]`).click();await admin.waitForSelector('[data-approve]');
 assert.match(await admin.locator('#day-appointments').textContent(),/a@example.com/);
 await customer.goto('http://127.0.0.1:8788/bookings.html');await customer.waitForSelector('.calendar-event');
 assert.equal(await customer.locator('.calendar-event .booking-state').first().evaluate(el=>getComputedStyle(el).color),'rgb(180, 35, 24)');
 await admin.locator('[data-approve]').click();await admin.waitForFunction(()=>document.querySelector('#day-status').textContent==='Appointment approved.');
 await customer.waitForSelector('.calendar-event .is-approved');
 assert.equal(await customer.locator('.calendar-event .booking-state').first().evaluate(el=>getComputedStyle(el).color),'rgb(35, 122, 59)');
 assert.equal(await customer.locator('.repeat-card .booking-state').first().evaluate(el=>getComputedStyle(el).color),'rgb(35, 122, 59)');
 await admin.selectOption('[name=status]','full');await admin.locator('#availability-form button').click();await admin.waitForFunction(()=>document.querySelector('#day-status').textContent.startsWith('Availability saved'));
 await customer.waitForFunction(date=>document.querySelector(`[data-add="${date}"]`).disabled,date);assert.equal(await customer.locator('.calendar-event').count(),2);
 // A stale calendar cannot bypass closure through a manually entered start date.
 await customer.locator(`[data-add="${emptyDate}"]`).click();await customer.locator('.pet-options label').first().click();await customer.fill('[name=date]',date);await customer.click('#save-booking');await customer.waitForFunction(()=>document.querySelector('#booking-error').textContent.includes('full or unavailable'));await customer.locator('[data-dismiss]').first().click();
 await admin.selectOption('[name=status]','open');await admin.locator('#availability-form button').click();await admin.waitForFunction(()=>document.querySelector('#day-status').textContent.startsWith('Availability saved'));
 await customer.waitForFunction(date=>!document.querySelector(`[data-add="${date}"]`).disabled,date);await customer.locator('.calendar-event').first().click();await customer.fill('[name=duration]','3');await customer.click('#save-booking');await customer.waitForFunction(()=>!document.querySelector('#booking-dialog').open);assert.match(await customer.locator('.calendar-event').first().textContent(),/Awaiting approval/);
 await admin.waitForSelector('[data-approve]');
 // Polling updates the open day without overwriting an unsaved availability choice.
 await admin.selectOption('[name=status]','full');
 const added=await call('POST','/me/bookings',{...payload,time:'12:00'});
 await admin.waitForFunction(()=>document.querySelectorAll('.admin-appointment').length===2);
 assert.equal(await admin.locator('[name=status]').inputValue(),'full');
 await call('DELETE','/me/bookings/'+added.booking.id);
 await admin.waitForFunction(()=>document.querySelectorAll('.admin-appointment').length===1);
 await admin.click('#close-day');await admin.locator(`[data-day="${emptyDate}"]`).click();await admin.waitForFunction(()=>document.querySelector('#day-appointments').textContent.includes('No appointments'));
 await admin.selectOption('[name=status]','unavailable');await admin.locator('#availability-form button').click();await admin.waitForFunction(()=>document.querySelector('#day-status').textContent.startsWith('Availability saved'));await admin.click('#close-day');assert.match(await admin.locator(`[data-day="${emptyDate}"]`).textContent(),/Unavailable/);
 await customer.waitForFunction(date=>document.querySelector(`[data-add="${date}"]`).disabled,emptyDate);
 const forbidden=await pageFor('b');await forbidden.goto('http://127.0.0.1:8788/admin-calendar.html');await forbidden.waitForFunction(()=>document.querySelector('#calendar-status').textContent.includes('Only admin'));assert.equal(await forbidden.locator('[data-day]').count(),0);
 await admin.setViewportSize({width:390,height:844});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await admin.locator(`[data-day="${date}"]`).click();await admin.waitForSelector('[data-approve]');await admin.screenshot({path:'/private/tmp/palmers-admin-day-mobile.png',fullPage:true});
 // Keep an in-progress customer draft and its original version when an approval arrives.
 await customer.locator('.calendar-event').first().click();await customer.fill('[name=duration]','4');
 await admin.locator('[data-approve]').click();await customer.waitForSelector('.calendar-event .is-approved');
 assert.equal(await customer.locator('[name=duration]').inputValue(),'4');
 await customer.click('#save-booking');await customer.waitForFunction(()=>document.querySelector('#booking-error').textContent.includes('changed'));
 assert.equal((await call('GET','/me/bookings')).bookings[0].duration,3);
 assert.deepEqual(errors,[]);
 console.log('PASS automatic sync without reload, red/green status, open-day changes, draft preservation, stale-edit protection; browser + real Worker: admin day details, approval, full/unavailable dates, reopening, persistence, rejected closed-day writes, edit reapproval, access control and mobile layout');
}finally{await browser.close();}
