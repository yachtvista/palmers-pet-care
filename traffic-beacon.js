/* First-party pageviews: public pages only, no query strings or account data. */
(()=>{if(['localhost','127.0.0.1'].includes(location.hostname)||navigator.webdriver||/^\/(admin|emergency-contacts|divisions|account|bookings|login|register|forgot-password|reset-password|session-link)([/.\-]|$)/i.test(location.pathname))return;
 const send=()=>fetch('https://api.palmerspetcare.co.uk/t',{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'text/plain'},body:JSON.stringify({p:location.pathname,r:document.referrer,u:new URLSearchParams(location.search).get('utm_source')||''})}).catch(()=>{});
 if(document.prerendering)document.addEventListener('prerenderingchange',send,{once:true});else send();})();
