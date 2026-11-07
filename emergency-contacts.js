(async()=>{
 const API=(['localhost','127.0.0.1'].includes(location.hostname)?'http://127.0.0.1:8787':'https://api.palmerspetcare.co.uk'),status=document.getElementById('report-status'),gallery=document.getElementById('report-content'),search=document.getElementById('emergency-search'),count=document.getElementById('gallery-count');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const phone=v=>v?`<a href="tel:${esc(String(v).replace(/[^+0-9]/g,''))}">${esc(v)}</a>`:'Not provided';
 try{
  const params=new URLSearchParams(location.search),query=params.has('division')?'?division='+encodeURIComponent(params.get('division')):'';
  const r=await fetch(API+'/admin/customers'+query,{credentials:'include'}),d=await r.json();
  if(!r.ok){if(r.status===401){status.innerHTML='Please <a href="'+esc('login.html')+'">sign in</a> to view emergency contacts.';return}throw new Error(d.error||'Contacts could not load.')}
  const customers=d.customers||[];
  function render(){
   const q=search.value.trim().toLocaleLowerCase('en-GB'),terms=q.split(/\s+/).filter(Boolean);let pets=0,owners=0;
   const html=customers.map(o=>{
    const common=[o.name,o.email,o.phone,o.workPhone,o.address,o.emergencyName,o.emergencyRelationship,o.emergencyPhone].join(' ');
    const matches=(o.pets||[]).filter(p=>{const text=(common+' '+p.name+' '+p.species+' '+p.breed).toLocaleLowerCase('en-GB');return terms.every(t=>text.includes(t))});
    if(!matches.length)return '';owners++;pets+=matches.length;
    return `<section class="emergency-owner"><h2>${esc(o.name)}</h2><div class="emergency-pets">${matches.map(p=>`<article class="report-card emergency-tile">${p.profilePhotoUrl?`<img src="${esc(API+p.profilePhotoUrl)}" alt="${esc(p.name)}" loading="lazy" data-pet-photo>`:`<div class="emergency-placeholder" role="img" aria-label="No photo for ${esc(p.name)}">${esc(p.name.slice(0,1))}<small>No photo yet</small></div>`}<div class="emergency-details"><h3>${esc(p.name)}</h3><p class="report-muted">${esc([p.species,p.breed].filter(Boolean).join(' · '))}</p><dl><dt>Owner</dt><dd>${esc(o.name)}</dd><dt>Owner phone</dt><dd>${phone(o.phone)}</dd>${o.workPhone?`<dt>Work phone</dt><dd>${phone(o.workPhone)}${o.workExt?' · ext. '+esc(o.workExt):''}</dd>`:''}<dt>Email</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>${o.address?`<dt>Address</dt><dd>${esc(o.address)}</dd>`:''}</dl><div class="emergency-contact"><strong>Emergency contact</strong><p>${esc(o.emergencyName||'Name not provided')}${o.emergencyRelationship?' · '+esc(o.emergencyRelationship):''}<br>${phone(o.emergencyPhone)}</p></div></div></article>`).join('')}</div></section>`;
   }).join('');
   gallery.innerHTML=html||'<p>No pets match your search.</p>';gallery.hidden=false;
   count.textContent=pets+' '+(pets===1?'pet':'pets')+' · '+owners+' '+(owners===1?'owner':'owners');
   gallery.querySelectorAll('[data-pet-photo]').forEach(img=>img.addEventListener('error',()=>{const fallback=document.createElement('div');fallback.className='emergency-placeholder';fallback.textContent='Photo unavailable';img.replaceWith(fallback)},{once:true}));
  }
  status.textContent='Tap a phone number to call. Contact details are visible to authorised staff only.';
  search.addEventListener('input',render);render();
 }catch(e){status.textContent=e.message+' Refresh to try again.';status.setAttribute('role','alert')}
})();
