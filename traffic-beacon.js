/* First-party browser pageviews. No cookies, query strings or account data are stored. */
(()=>{
 const excluded=/^\/(admin|emergency-contacts|divisions|account|bookings|login|register|forgot-password|reset-password|session-link)([/.\-]|$)/i;
 if(['localhost','127.0.0.1'].includes(location.hostname)||navigator.webdriver||window.top!==window.self||excluded.test(location.pathname)||!/^(?:\/|\/(?:index|about|prices|gallery|contact|terms|privacy|book)(?:\.html)?)$/.test(location.pathname))return;
 if(/bot|spider|crawl|headless|phantom|selenium|playwright|puppeteer|lighthouse|pagespeed|preview/i.test(navigator.userAgent))return;
 let timer=null,sent=false,started=0;
 function schedule(){
  clearTimeout(timer);
  if(sent||document.prerendering||document.visibilityState!=='visible')return;
  started=performance.now();
  timer=setTimeout(()=>{
   if(sent||document.prerendering||document.visibilityState!=='visible'||navigator.webdriver)return;
   sent=true;
   fetch('https://api.palmerspetcare.co.uk/t',{method:'POST',mode:'cors',credentials:'include',keepalive:true,headers:{'Content-Type':'text/plain'},body:JSON.stringify({v:2,p:location.pathname,r:document.referrer,u:new URLSearchParams(location.search).get('utm_source')||'',visible:true,elapsed:Math.round(performance.now()-started)})}).catch(()=>{});
  },1550);
 }
 document.addEventListener('visibilitychange',schedule);
 document.addEventListener('prerenderingchange',schedule);
 schedule();
})();
