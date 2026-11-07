// Browser acceptance for the admin-first release with unchanged public HTML/CSS.
import http from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import worker from '../../../palmers-pet-care-api/src/index.js';
import {fixture} from '../../../palmers-pet-care-api/tests/helpers/review-fixture.mjs';
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_MODULE||'playwright-core'),engine=process.env.ACCEPTANCE_BROWSER||'chromium';
const {db,env,call}=await fixture();env.ADMIN_FIRST_RELEASE='1';env.ALLOWED_ORIGIN='http://127.0.0.1:8788';delete env.COOKIE_DOMAIN;db.exec('DELETE FROM brand_owners');
const root=resolve(import.meta.dirname,'../..'),out=resolve(process.env.ADMIN_FIRST_EVIDENCE||'/private/tmp/palmers-admin-first',engine);mkdirSync(out,{recursive:true});let checks=0;const errors=[];const ok=(label,value)=>{assert(value,label);checks++;};
const publicBase='e524916632b01717874db21d393edd0265a3d55d',hash=b=>createHash('sha256').update(b).digest('hex');
const files=execFileSync('git',['ls-tree','-r','--name-only',publicBase],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>!f.includes('/')&&(/\.(html|css)$/.test(f)||['portal.js','book.js','session-link.js','booking-slots.js'].includes(f))&&f!=='admin-calendar.html');
const normalise=(f,b)=>f.endsWith('.html')?Buffer.from(b.toString().replace(/src="(home-booker\.js|bookings\.js)(?:\?[^"]*)?"/g,'src="$1"')):b;
for(const f of files)ok('Public content/layout unchanged (script cache keys excepted): '+f,hash(normalise(f,readFileSync(resolve(root,f))))===hash(normalise(f,execFileSync('git',['show',publicBase+':'+f],{cwd:root}))));

const verificationId='11111111-1111-4111-8111-111111111111';
const legacy={date:'2026-12-05',time:'20:00',duration:12,unit:'overnight',serviceId:'sitting',petIds:['pet-selsey','booked-cat'],petNames:['Legacy care dog','Misty'],total:4000};
db.prepare("INSERT INTO pets(id,user_id,name,species,age,created_at,updated_at) VALUES('booked-cat','selsey','Misty','Cat','3',1,1),('other-pet','selsey','Not booked','Rabbit','3',1,1)").run();
const petPhoto=readFileSync(resolve(root,'images/puppy.jpg'));
db.prepare("INSERT INTO pet_photos(id,pet_id,mime,data,bytes,created_by,created_at,kind) VALUES('appointment-photo','pet-selsey','image/jpeg',?,?, 'jess',1,'profile')").run(petPhoto.toString('base64'),petPhoto.length);
db.prepare("UPDATE pets SET profile_photo_id='appointment-photo',name='Legacy care dog' WHERE id='pet-selsey'").run();
db.prepare("INSERT INTO bookings(id,user_id,data,status,created_at,updated_at,division_id) VALUES('legacy','selsey',?,'approved',1,1,'selsey')").run(JSON.stringify(legacy));
db.prepare("INSERT INTO users(id,email,name,password_hash,created_at,division_id,locked_until) VALUES(?,?,'Release verification (synthetic)','synthetic',1,'selsey',253402300799000)").run(verificationId,'zz-release-customer-'+verificationId+'@example.invalid');
db.prepare("INSERT INTO division_memberships VALUES(?,'selsey','customer')").run(verificationId);
db.prepare("INSERT INTO bookings(id,user_id,data,status,created_at,updated_at,division_id) VALUES('verification',?,?,'cancelled',1,1,'selsey')").run(verificationId,JSON.stringify({...legacy,date:'2026-12-24'}));

const originalUsers=db.prepare('SELECT * FROM users ORDER BY id').all(),originalPets=db.prepare('SELECT * FROM pets ORDER BY id').all();
const api=http.createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const r=await worker.fetch(new Request('http://127.0.0.1:8787'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env,{waitUntil:p=>p});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){errors.push(e.message);res.writeHead(500);res.end('{}');}});
const web=http.createServer((req,res)=>{const f=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+'/')||!existsSync(f)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[extname(f)]||'application/octet-stream');res.end(readFileSync(f));});
await Promise.all([new Promise(r=>api.listen(8787,'127.0.0.1',r)),new Promise(r=>web.listen(8788,'127.0.0.1',r))]);
const browser=await pw[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
async function page(who,width=1440){const ctx=await browser.newContext({viewport:{width,height:1000},isMobile:engine==='chromium'&&width<650,hasTouch:width<650});await ctx.route('https://**/*',r=>r.abort());if(who)await ctx.addCookies([{name:'ppc_session',value:who,domain:'127.0.0.1',path:'/'}]);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));return p;}

async function openDay(p,date){await p.click(`[data-day="${date}"]`);await p.waitForFunction(()=>document.querySelector('#day-status').textContent==='');}
async function scrollEdge(p,bottom){
 const inner=p.locator('#planner-scroll'),outer=p.locator('#day-dialog');
 await inner.scrollIntoViewIfNeeded();await p.waitForTimeout(150);
 await outer.evaluate((el,bottom)=>{const max=el.scrollHeight-el.clientHeight;if(bottom&&el.scrollTop>=max-1)el.scrollTop=Math.max(0,max-200);if(!bottom&&el.scrollTop<1)el.scrollTop=Math.min(max,200);},bottom);
 await inner.evaluate((el,bottom)=>el.scrollTop=bottom?el.scrollHeight:0,bottom);
 const background=await p.evaluate(()=>window.scrollY);const before=await outer.evaluate(el=>el.scrollTop);const box=await inner.boundingBox(),frame=await outer.boundingBox();
 const visibleTop=Math.max(box.y,frame.y+100),visibleBottom=Math.min(box.y+box.height,frame.y+frame.height-15,p.viewportSize().height-15);
 assert(visibleBottom>visibleTop);await p.mouse.move(Math.min(box.x+box.width/2,p.viewportSize().width-20),(visibleTop+visibleBottom)/2);
 await p.mouse.wheel(0,bottom?420:-420);await p.waitForTimeout(350);
 const after=await outer.evaluate(el=>el.scrollTop);if(bottom?after<=before:after>=before)console.log('Scroll diagnostic',JSON.stringify({bottom,before,after,box,frame,target:await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,200),{x:Math.min(box.x+box.width/2,p.viewportSize().width-20),y:(visibleTop+visibleBottom)/2}),outer:await outer.evaluate(el=>({max:el.scrollHeight-el.clientHeight,overscroll:getComputedStyle(el).overscrollBehavior})),inner:await inner.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight,overscroll:getComputedStyle(el).overscrollBehavior}))}));ok('Timeline '+(bottom?'bottom':'top')+' passes scrolling into surrounding planner',bottom?after>before:after<before);ok('Page behind planner remains still',await p.evaluate(()=>window.scrollY)===background);
}
async function touchEdge(p,bottom){
 const outer=p.locator('#day-dialog'),inner=p.locator('#planner-scroll');await inner.scrollIntoViewIfNeeded();await p.waitForTimeout(150);
 await outer.evaluate((el,bottom)=>{const max=el.scrollHeight-el.clientHeight;el.scrollTop=bottom?Math.max(0,Math.min(el.scrollTop,max-150)):Math.min(max,Math.max(el.scrollTop,150));},bottom);
 await inner.evaluate((el,bottom)=>el.scrollTop=bottom?el.scrollHeight:0,bottom);const before=await outer.evaluate(el=>el.scrollTop),background=await p.evaluate(()=>window.scrollY),box=await inner.boundingBox();
 const lo=Math.max(box.y+10,100),hi=Math.min(box.y+box.height-10,800),x=box.x+box.width/2,from=bottom?hi-10:lo+10,to=bottom?lo+10:hi-10;
 const session=await p.context().newCDPSession(p);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/8}]});await p.waitForTimeout(25);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(350);await session.detach();
 const after=await outer.evaluate(el=>el.scrollTop);ok('Touch swipe chains into planner '+(bottom?'below':'above')+' the timeline',bottom?after>before:after<before);ok('Touch swipe leaves background page still',await p.evaluate(()=>window.scrollY)===background);
}
let currentPage;
try{
 const admin=await page('jess');currentPage=admin;await admin.goto('http://127.0.0.1:8788/admin.html');await admin.waitForFunction(()=>document.querySelector('[data-count]').textContent.includes('registered user'));
 ok('Retired verification account is absent from customer directory',!await admin.locator('[data-customers]').textContent().then(t=>t.includes('Release verification')));
 await admin.goto('http://127.0.0.1:8788/admin-calendar.html');await admin.waitForSelector('[data-day]');await admin.click('#next');
 ok('Cancelled verification booking absent from calendar',!(await admin.locator('[data-day="2026-12-24"]').textContent()).includes('Legacy care dog'));
 await openDay(admin,'2026-12-06');ok('Legacy booking has a direct agreed-price action',await admin.locator('[data-price-edit="legacy"]').count()===1);
 await admin.locator('#appt-legacy .appointment-pets').scrollIntoViewIfNeeded();await admin.waitForFunction(()=>document.querySelector('#appt-legacy .appointment-pet img')?.naturalWidth>0);
 ok('Only pets included in the booking have a photo card',await admin.locator('#appt-legacy .appointment-pet').count()===2&&await admin.locator('#appt-legacy [data-pet-id="other-pet"]').count()===0);
 ok('Stored profile photo loads through the protected API',await admin.locator('#appt-legacy .appointment-pet img').evaluate(img=>img.complete&&img.naturalWidth>0&&new URL(img.src).pathname==='/photos/appointment-photo'));
 ok('Dog and cat have distinguishable species borders',await admin.locator('#appt-legacy .appointment-pets').evaluate(el=>getComputedStyle(el.querySelector('[data-species="Dog"]')).borderColor!==getComputedStyle(el.querySelector('[data-species="Cat"]')).borderColor));
 ok('Missing pet photo has a labelled placeholder',await admin.locator('#appt-legacy [data-species="Cat"] [role="img"]').getAttribute('aria-label')==='No profile photo available for Misty');
 await admin.screenshot({path:resolve(out,'appointment-pets-desktop.png')});
 await admin.locator('#appt-legacy .appointment-pet img').evaluate(img=>img.src='http://127.0.0.1:8787/photos/missing-photo');await admin.waitForFunction(()=>!document.querySelector('#appt-legacy [data-species="Dog"] .appointment-pet-placeholder').hidden);ok('Missing or removed image falls back without a broken-photo card',await admin.locator('#appt-legacy .appointment-pet img').isHidden());


 // The production regression occurs over disabled night-time slots, not booked cards.
 if(process.env.DISABLED_SLOT_CONTROL==='1')await admin.addStyleTag({content:'.day-grid button.slot:disabled{pointer-events:auto!important}'});
 await scrollEdge(admin,true);await scrollEdge(admin,false);

 await admin.locator('[data-price-edit="legacy"]').click();await admin.fill('#price-form [name=agreedPrice]','35');await admin.fill('#price-form [name=priceReason]','Jess agreed long stay price');
 ok('Live price difference updates while typing',(await admin.locator('#price-difference').textContent()).includes('-£5.00'));
 await admin.check('#price-form [name=priceConfirmed]');await admin.click('#price-form button[type=submit]');await admin.waitForFunction(()=>!document.querySelector('#price-dialog').open);
 const row=db.prepare("SELECT * FROM bookings WHERE id='legacy'").get(),saved=JSON.parse(row.data);ok('Legacy agreed price saves without changing its original interval',saved.total===3500&&saved.date===legacy.date&&saved.time===legacy.time&&saved.duration===12&&!saved.startAt&&!saved.activities);ok('Before/after price audit retained',db.prepare("SELECT count(*) n FROM booking_price_audit WHERE booking_id='legacy'").get().n===1);
 await admin.locator('[data-price-edit="legacy"]').click();ok('Price persists after reopen',await admin.inputValue('#price-form [name=agreedPrice]')==='35.00');await admin.screenshot({path:resolve(out,'legacy-agreed-price-desktop.png')});await admin.locator('#price-dialog [data-close-price]').first().click();
 const mobile=await page('jess',390);currentPage=mobile;await mobile.setViewportSize({width:390,height:844});await mobile.goto('http://127.0.0.1:8788/admin-calendar.html');await mobile.waitForSelector('[data-day]');await mobile.click('#next');await openDay(mobile,'2026-12-06');if(process.env.DISABLED_SLOT_CONTROL==='1')await mobile.addStyleTag({content:'.day-grid button.slot:disabled{pointer-events:auto!important}'});await scrollEdge(mobile,true);await scrollEdge(mobile,false);if(engine==='chromium'){await touchEdge(mobile,true);await touchEdge(mobile,false);}
 await mobile.locator('#appt-legacy .appointment-pets').scrollIntoViewIfNeeded();await mobile.screenshot({path:resolve(out,'appointment-pets-mobile.png')});ok('Pet cards fit mobile planner',await mobile.locator('#appt-legacy .appointment-pets').evaluate(el=>el.scrollWidth<=el.clientWidth));
 await mobile.locator('[data-price-edit="legacy"]').click();ok('Mobile price form fits viewport',await mobile.locator('#price-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));await mobile.screenshot({path:resolve(out,'legacy-agreed-price-mobile.png')});await mobile.locator('#price-dialog [data-close-price]').first().click();
 const customer=await page('selsey',390);await customer.goto('http://127.0.0.1:8788/bookings.html');await customer.waitForSelector('[data-add]');await customer.click('#next');await customer.locator('[data-edit="legacy"]').first().click();await customer.waitForSelector('dialog[aria-label="Agreed booking details"]');ok('Customer sees the saved legacy charge',(await customer.locator('dialog[aria-label="Agreed booking details"]').textContent()).includes('£35.00'));
 for(const old of originalUsers)ok('Existing account retained',JSON.stringify(db.prepare('SELECT * FROM users WHERE id=?').get(old.id))===JSON.stringify(old));for(const old of originalPets)ok('Existing pet retained',JSON.stringify(db.prepare('SELECT * FROM pets WHERE id=?').get(old.id))===JSON.stringify(old));ok('No receipts created',db.prepare('SELECT count(*) n FROM financial_events').get().n===0);ok('Verification account/booking retained in database',!!db.prepare('SELECT id FROM users WHERE id=?').get(verificationId)&&!!db.prepare("SELECT id FROM bookings WHERE id='verification'").get());ok('No page errors',errors.length===0);
 writeFileSync(resolve(out,'results.json'),JSON.stringify({engine,checks,errors,publicBase,unchangedPublicFiles:files,legacyPrice:3500,preserved:true,kentActive:false},null,2));console.log(`PASS ${checks} Jess usability browser assertions (${engine})`);
}catch(error){if(currentPage)await currentPage.screenshot({path:resolve(out,'failure.png'),fullPage:true});writeFileSync(resolve(out,'failure.txt'),String(error)+'\n'+errors.join('\n'));throw error;}finally{await browser.close();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>web.close(r))]);db.close();}
