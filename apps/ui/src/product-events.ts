/** Bounded first-party operational events. No URLs, form values, messages, stacks or payment details. */
type EventName='page.viewed'|'billing.offer.selected'|'billing.checkout.viewed'|'billing.checkout.continued'|'billing.payment.mounted'|'billing.payment.load_failed'|'billing.payment.completed_client'|'billing.confirmation.waiting'|'billing.confirmation.displayed'|'billing.checkout.abandoned_client'|'client.runtime.failed';
type Item={id:string;name:EventName;entityId?:string;route?:string;errorCode?:string;traceId?:string};
let journey:string|undefined,queue:Item[]=[],timer:ReturnType<typeof setTimeout>|undefined,installed=false;
export function productJourney(){
 if(journey)return journey;
 try{const saved=sessionStorage.getItem('ra-event-journey');if(saved&&/^[a-f0-9-]{36}$/.test(saved))journey=saved;}catch{}
 journey??=crypto.randomUUID();try{sessionStorage.setItem('ra-event-journey',journey);}catch{}return journey;
}
export function productRequestHeaders():Record<string,string>{if(typeof window==='undefined'||import.meta.env?.VITE_UI_PREVIEW==='1')return {};try{return{'x-ra-journey-id':productJourney(),'x-ra-trace-id':crypto.randomUUID()};}catch{return {};}}
export function trackProductEvent(name:EventName,metadata:Omit<Item,'id'|'name'>={}){
 if(typeof window==='undefined'||import.meta.env?.VITE_UI_PREVIEW==='1'||location.hostname==='admin.remotearc.app')return;
 try{queue.push({id:crypto.randomUUID(),name,...metadata});if(queue.length>20)queue.shift();if(!timer)timer=setTimeout(()=>void flush(),600);}catch{}
}
async function flush(){
 clearTimeout(timer);timer=undefined;const events=queue.splice(0,20);if(!events.length)return;
 try{await fetch('/api/product-events',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({journeyId:productJourney(),events})});}catch{/* Telemetry never interrupts a purchase and is not authoritative. */}
}
const views=['/checkout','/settings','/overview','/devices','/apps','/connect','/security','/automations','/dashboard/agent/chat','/dashboard/agent/tasks','/dashboard/connect/overview','/dashboard/connect/devices','/dashboard/connect/apps','/dashboard/agent/skills','/dashboard/agent/routines'];
export function recordProductView(){if(typeof window!=='undefined'&&views.includes(location.pathname))trackProductEvent('page.viewed',{route:location.pathname});}
export function startProductEvents(){
 if(installed||typeof window==='undefined'||location.hostname!=='agent.remotearc.app'||import.meta.env?.VITE_UI_PREVIEW==='1')return;installed=true;
 const view=recordProductView;
 view();window.addEventListener('popstate',view);
 window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')view();});
 window.addEventListener('pagehide',()=>void flush());
 window.addEventListener('error',()=>trackProductEvent('client.runtime.failed',{errorCode:'CLIENT_ERROR'}));
 window.addEventListener('unhandledrejection',()=>trackProductEvent('client.runtime.failed',{errorCode:'CLIENT_ERROR'}));
}
