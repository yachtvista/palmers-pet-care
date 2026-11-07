/* Admin reports. All values are fetched through the existing secure session. */
(async()=>{
 const kind=document.body.dataset.report,API=(['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:8787':'https://api.palmerspetcare.co.uk'),status=document.getElementById('report-status'),content=document.getElementById('report-content');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>Number(v||0).toLocaleString('en-GB'),money=v=>v===null?'Not priced':new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format((v||0)/100);
 const table=(headers,rows,empty='No records in this period.')=>rows.length?`<div class="report-table"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<p class="report-muted">${esc(empty)}</p>`;
 const card=(title,body)=>`<section class="report-card"><h2>${esc(title)}</h2>${body}</section>`;
 const stats=items=>`<div class="report-stats">${items.map(([label,value])=>`<div class="report-card"><span class="report-muted">${esc(label)}</span><p class="report-stat">${esc(value)}</p></div>`).join('')}</div>`;
 function chart(series){
  const w=900,h=280,left=48,bottom=240,pw=836,ph=215,max=Math.max(5,...series.map(s=>s.views)),band=pw/series.length;
  const x=i=>left+(i+.5)*band,y=n=>bottom-n/max*ph;
  let svg='';for(let i=0;i<=4;i++){const n=Math.round(max*i/4);svg+=`<line x1="48" y1="${y(n)}" x2="884" y2="${y(n)}" stroke="#ddd6e8"/><text x="40" y="${y(n)+4}" text-anchor="end" font-size="12" fill="#657087">${n}</text>`}
  svg+=series.map((s,i)=>`<rect x="${x(i)-Math.min(28,band*.7)/2}" y="${y(s.views)}" width="${Math.min(28,band*.7)}" height="${bottom-y(s.views)}" fill="#6c4cf0"><title>${s.day}: ${s.views} views, ${s.uniques} unique visitors</title></rect>${i%Math.ceil(series.length/10)===0?`<text x="${x(i)}" y="260" text-anchor="middle" font-size="11" fill="#657087">${s.day.slice(8)}/${s.day.slice(5,7)}</text>`:''}`).join('');
  svg+=`<polyline points="${series.map((s,i)=>`${x(i)},${y(s.uniques)}`).join(' ')}" fill="none" stroke="#0d9488" stroke-width="2"/>`;
  svg+=series.map((s,i)=>`<circle cx="${x(i)}" cy="${y(s.uniques)}" r="3" fill="#0d9488"><title>${s.day}: ${s.uniques} unique visitors</title></circle>`).join('');
  return `<figure class="report-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Daily pageviews as purple bars and unique visitors as a teal line">${svg}</svg><figcaption class="legend"><span>■ Pageviews</span><span>● Unique visitors</span></figcaption></figure>`;
 }
 try{
  const params=new URLSearchParams(location.search);
  const division=params.get('division');
  document.querySelectorAll('.report-filters a').forEach(a=>{if(division)a.href+='&division='+encodeURIComponent(division)});
  const response=await fetch(API+'/admin/'+kind+'?'+params,{credentials:'include'}),d=await response.json();
  if(!response.ok){if(response.status===401){status.innerHTML='Please <a href="'+esc('login.html')+'">sign in</a> to view this page.';return}throw new Error(d.error||'Report could not load.')}
  const range=kind==='traffic'?d.range.range:d.range;
  document.querySelector(`[data-range="${range}"]`)?.setAttribute('aria-current','page');
  status.textContent=d.division+' · '+(kind==='traffic'?d.range.from+' to '+d.range.to:'By booking start date · '+(d.period.from?d.period.from+' to '+new Date(Date.parse(d.period.to)-86400000).toISOString().slice(0,10):'All dates'));
  if(kind==='traffic'){
   const t=d.totals,pct=n=>t.views?(n/t.views*100).toFixed(1)+'%':'—';
   document.querySelectorAll('input[type=date]').forEach(i=>{i.value=d.range[i.name];i.max=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'})});
   const country=code=>{try{return code==='Unknown'?code:code+' — '+new Intl.DisplayNames(['en'],{type:'region'}).of(code)}catch{return code}};
   content.innerHTML=stats([['Pageviews',num(t.views)],['Unique visitors',num(t.uniques)],['Sources',d.sources.filter(s=>s.key!=='internal').length],['Mobile share',pct(t.mobile)]])+card('Pageviews & unique visitors per day',chart(d.series))+`<div class="report-grid">`+card('Sources',table(['Source','Visits','Uniques','Share'],d.sources.map(s=>[s.key,num(s.views),num(s.uniques),pct(s.views)])))+card('Top pages',table(['Path','Views','Uniques'],d.pages.map(s=>[s.key,num(s.views),num(s.uniques)])))+card('Top referral domains',table(['Domain','Visits','Uniques'],d.referrals.map(s=>[s.key,num(s.views),num(s.uniques)])))+card('Countries',table(['Country','Visits','Share'],d.countries.map(s=>[country(s.key),num(s.views),pct(s.views)])))+card('Devices',table(['Device','Visits','Share'],d.devices.map(s=>[s.key,num(s.views),pct(s.views)])))+'</div><p class="report-note">Unique visitors use a hash that rotates every day. Multi-day totals count visitor-days. No raw IP addresses or tracking cookies are stored. Admin and account pages are excluded. Dates use Europe/London. Data is retained for 180 days.</p>';
  }else{
   const t=d.totals;
   content.innerHTML=stats([['Total booking value',money(t.total)],['Approved bookings',money(t.approved)],['Pending bookings',money(t.pending)],['Bookings',num(t.bookings)]])+`<div class="report-grid">`+card('Agreed custom prices',`<p class="report-stat">${num(t.custom)} bookings</p><p>Adjustment against standard estimates: <strong>${money(t.adjustment)}</strong></p>`)+card('Cancelled bookings',`<p class="report-stat">${money(t.cancelled)}</p><p>Excluded from total booking value.</p>`)+card('By service',table(['Service','Bookings','Value'],d.services.map(s=>[s.key,num(s.count),money(s.total)])))+card('By month',table(['Month','Bookings','Value'],d.months.map(s=>[s.key,num(s.count),money(s.total)])))+'</div>'+card('All bookings',table(['Date','Customer','Service','Status','Standard','Final charge','Pricing'],d.bookings.map(b=>[b.date,b.customer,b.service,b.status,money(b.standard),money(b.total),b.custom?'Custom'+(b.reason?' · '+b.reason:''):'Standard'])))+`<p class="report-note">Booking values use the saved final charge, including agreed custom prices, and are shown in GBP. Custom prices replace the standard estimate. Totals include approved and pending bookings; cancelled amounts are shown separately. Calendar periods use Europe/London, Monday starts the week, and the full charge belongs to the booking’s start date. These values are booked charges, not payments received.${t.unpriced?' '+num(t.unpriced)+' bookings have no saved charge and are marked Not priced.':''}</p>`;
  }
  content.hidden=false;
 }catch(e){status.textContent=e.message+' Refresh to try again.';status.setAttribute('role','alert')}
})();
