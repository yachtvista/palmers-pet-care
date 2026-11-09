window.PPCPrices=(()=>{
const CATALOG = [
 {id:'walk30',name:'30-minute solo dog walk',kind:'walk',minutes:30,rate:1500,extra:0,species:['Dog'],maxPets:1,description:'Individual attention, exercise and a photo update in your customer portal.'},
 {id:'walk60',name:'60-minute solo dog walk',kind:'walk',minutes:60,rate:2000,extra:0,species:['Dog'],maxPets:1,description:'Individual attention, exercise and a photo update in your customer portal.'},
 {id:'walkweek',name:'Weekly walk package',kind:'walk',minutes:30,rate:6500,extra:0,species:['Dog'],maxPets:1,visits:5,description:'Five separate 30-minute solo walks within seven days. Choose each date and start time.'},
 {id:'popdog',name:'Dog pop-in',kind:'popdog',minutes:30,rate:1600,extra:0,species:['Dog'],maxPets:1,description:'Feeding and fresh water, a complimentary 30-minute walk, a wellbeing check and portal photo updates.'},
 {id:'popcat',name:'Cat pop-in',kind:'popcat',minutes:30,rate:1600,extra:0,species:['Cat'],maxPets:1,description:'Feeding and fresh water, litter-tray cleaning and litter changes when required, 30 minutes of playtime and companionship, and portal photo updates.'},
 {id:'daycare',name:'Daytime Stay & Play',kind:'daycare',minutes:540,rate:8500,extra:0,species:['Dog'],maxPets:1,description:'Up to 9 hours in your home, including one 30-minute dog walk, feeding, playtime, companionship and portal photo updates.'},
 {id:'evening',name:'Evening Stay & Play',kind:'evening',minutes:270,rate:5000,extra:0,species:['Dog'],maxPets:1,fixedStart:'17:30',description:'17:30–22:00 (4½ hours), including one 30-minute dog walk, feeding, playtime, companionship and portal photo updates.'},
 {id:'sitting',name:'Overnight care',kind:'overnight',minutes:720,rate:4000,extra:0,fixedStart:'20:00',description:'20:00–08:00 in your home, with evening and morning walks, feeding, fresh water, comfort, companionship and morning updates. Extra dog +£8; extra cat or small pet +£4 per night.'},
 ...[100,190,270,340,400].map((p,i)=>({id:'stay24_'+(i+1),name:(i+1)+' day'+(i?'s':'')+' & '+(i+1)+' night'+(i?'s':'')+' · 24-hour care',kind:'stay24',minutes:(i+1)*1440,rate:p*100,extra:(i+1)*1000,species:['Dog'],maxPets:2,description:'Daytime companionship and overnight care in your pet’s home. Includes two 30-minute walks per day, feeding, fresh water, playtime, cuddles, companionship and portal photo updates.'}))
];
function quoteReason(service,species) {
 if(!service)return 'Please choose a service.';
 if(!species.length)return 'Choose at least one pet.';
 if(service.species&&species.some(s=>!service.species.includes(s)))return 'This pet combination needs a quote.';
 if(service.maxPets&&species.length>service.maxPets)return 'Please request a quote for additional pets.';
 return null;
}
function catalogPrice(service,species){
 if(quoteReason(service,species))return null;
 if(service.id==='sitting')return service.rate+species.slice().sort((a,b)=>(b==='Dog')-(a==='Dog')).slice(1).reduce((n,s)=>n+(s==='Dog'?800:400),0);
 return service.rate+(service.extra||0)*Math.max(0,species.length-1);
}
const PRODUCTS=CATALOG.filter(s=>s.id!=='walkweek').concat(Array.from({length:18},(_,i)=>({...CATALOG.find(s=>s.id==='daycare'),id:'daycare_'+((i+1)*30),minutes:(i+1)*30})));
return {CATALOG,PRODUCTS,quoteReason,catalogPrice};})();
