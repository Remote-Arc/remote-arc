import {getSessionUser} from '../auth/auth.js';
import {recordBusinessActivity} from './business-tracking.js';
import {recordProductEvent,eventStatement,eventContext,eventIdentity,safeEventError,uuid,type EventEnv} from './product-events.js';
type Env=EventEnv&{PUBLIC_ORIGIN:string;APP_ORIGIN?:string;DASHBOARD_ORIGIN?:string;MARKETING_ORIGIN?:string;PRODUCT_EVENTS_RATE_LIMITER?:{limit(input:{key:string}):Promise<{success:boolean}>}};
export const browserEvents:Record<string,{domain:string;outcome:'succeeded'|'accepted'|'failed'|'waiting'}>={
 'page.viewed':{domain:'navigation',outcome:'accepted'},
 'billing.offer.selected':{domain:'billing',outcome:'accepted'},
 'billing.checkout.viewed':{domain:'billing',outcome:'accepted'},
 'billing.checkout.continued':{domain:'billing',outcome:'accepted'},
 'billing.payment.mounted':{domain:'billing',outcome:'accepted'},
 'billing.payment.load_failed':{domain:'billing',outcome:'failed'},
 'billing.payment.completed_client':{domain:'billing',outcome:'accepted'},
 'billing.confirmation.waiting':{domain:'billing',outcome:'waiting'},
 'billing.confirmation.displayed':{domain:'billing',outcome:'accepted'},
 'billing.checkout.abandoned_client':{domain:'billing',outcome:'accepted'},
 'client.runtime.failed':{domain:'client',outcome:'failed'},
};
export const viewRoutes=['/checkout','/device','/settings','/overview','/devices','/apps','/connect','/security','/automations','/dashboard/agent/chat','/dashboard/agent/tasks','/dashboard/connect/overview','/dashboard/connect/devices','/dashboard/connect/apps','/dashboard/agent/skills','/dashboard/agent/routines'];
export async function boundedEventJson(request:Pick<Request,'headers'|'body'>,limit=16384){
 if(Number(request.headers.get('content-length'))>limit)throw Error('body_too_large');
 const reader=request.body?.getReader();if(!reader)throw Error('empty_body');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>limit){void reader.cancel();throw Error('body_too_large');}chunks.push(chunk.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function ingestProductEvents(request:Request,env:Env){
 const url=new URL(request.url),origin=env.DASHBOARD_ORIGIN||env.APP_ORIGIN||env.PUBLIC_ORIGIN;
 if(url.origin!==new URL(origin).origin)return Response.json({error:'not_found'},{status:404});
 if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
 if(request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')return Response.json({error:'invalid_origin_or_type'},{status:403});
 const user=await getSessionUser(request,env);if(!user)return Response.json({error:'unauthorized'},{status:401});
 if(env.PRODUCT_EVENTS_RATE_LIMITER&&!(await env.PRODUCT_EVENTS_RATE_LIMITER.limit({key:'product-events:'+user.id})).success)return Response.json({error:'rate_limited'},{status:429});
 try{
 const input=await boundedEventJson(request);
 if(!input||Object.keys(input).some(k=>!['journeyId','events'].includes(k))||!uuid(input.journeyId)||!Array.isArray(input.events)||input.events.length<1||input.events.length>20)throw Error('invalid');
 const count=await env.DB.prepare("SELECT COUNT(*) n FROM product_events WHERE user_id=?1 AND source='browser' AND occurred_at>=?2").bind(user.id,new Date(Date.now()-60000).toISOString()).first<{n:number}>();
 if((count?.n||0)+input.events.length>120)return Response.json({error:'rate_limited'},{status:429});
 const receivedAt=Date.now(),activityTimes:string[]=[];
 const events=input.events.map((e:any)=>{
  if(!e||Object.keys(e).some(k=>!['id','name','occurredAt','entityId','route','errorCode','traceId'].includes(k))||!uuid(e.id)||!Object.hasOwn(browserEvents,e.name)||e.traceId!==undefined&&!uuid(e.traceId)||e.entityId!==undefined&&!eventIdentity(e.entityId)||e.route!==undefined&&!viewRoutes.includes(e.route))throw Error('invalid');
  let at=new Date(receivedAt).toISOString();
  if(e.occurredAt!==undefined){const time=Date.parse(e.occurredAt);if(typeof e.occurredAt!=='string'||!Number.isFinite(time)||time<receivedAt-300000||time>receivedAt+5000)throw Error('invalid_time');at=new Date(Math.min(receivedAt,time)).toISOString();}
  const spec=browserEvents[e.name]!;
  if(e.name==='page.viewed')activityTimes.push(at);
  return eventStatement(env,{...spec,id:e.id,name:e.name,source:'browser',userId:user.id,journeyId:input.journeyId,traceId:e.traceId,entityId:e.entityId,route:e.route,errorCode:e.errorCode?'CLIENT_ERROR':undefined},at);
 });
 await env.DB.batch(events);
 await Promise.all([...new Map(activityTimes.map(at=>[at.slice(0,10),at])).values()].map(at=>recordBusinessActivity(env,user.id,at)));
 return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
 }catch{return Response.json({error:'events_unavailable_or_invalid'},{status:400,headers:{'cache-control':'no-store'}});}
}
const exact:Record<string,[string,string]>={
 '/auth/email/request':['auth','auth.email.requested'],'/auth/email/verify':['auth','auth.email.verify_requested'],
 '/auth/google/callback':['auth','auth.google.callback'],'/auth/reviewer':['auth','auth.reviewer.login'],
 '/oauth/decision':['oauth','oauth.consent'],'/oauth/token':['oauth','oauth.token'],
 '/api/device/start':['devices','device.pairing.started'],'/api/device/token':['devices','device.token.requested'],'/api/pairing/approve':['devices','device.pairing.approved'],
 '/api/billing/checkout':['billing','billing.checkout.created'],'/api/billing/checkout/abandon':['billing','billing.checkout.abandoned'],
 '/api/billing/plan/change':['billing','billing.plan.changed'],'/api/billing/subscription/renewal':['billing','billing.renewal.changed'],
 '/api/billing/payment-method/setup':['billing','billing.payment_method.setup'],'/api/billing/payment-method/confirm':['billing','billing.payment_method.confirmed'],
 '/api/billing':['billing','billing.offers.loaded'],'/api/billing/webhook':['billing','billing.webhook.received'],
};
export function requestEventRoute(request:Request){
 const path=new URL(request.url).pathname,method=request.method;
 if(exact[path]&&(method==='POST'||path==='/auth/google/callback'||path==='/api/billing'))return{domain:exact[path]![0],name:exact[path]![1],route:path};
 if(!['GET','HEAD','OPTIONS'].includes(method)){
  for(const [prefix,domain,name] of [['/api/arc/','tasks','task.request'],['/api/automations','automations','automation.request'],['/api/apps/','apps','app.request'],['/api/devices/','devices','device.request']] as const){
   if(path.startsWith(prefix))return{domain,name,route:prefix+':action'};
  }
 }
 return null;
}
export async function observeProductRequest(request:Request,response:Response,env:Env,started:number,context=eventContext(request)){
 const spec=requestEventRoute(request);if(!spec)return;
 try{
  // Clone synchronously, before the caller returns/consumes the response body.
  const copy=response.headers.get('content-type')?.includes('application/json')&&(response.status>=400||spec.name==='billing.checkout.created'||spec.name==='billing.offers.loaded')?response.clone():null;
  const user=new URL(request.url).pathname==='/api/billing/webhook'?null:await getSessionUser(request,env);
  let result:any=null;
  if(copy){try{result=await boundedEventJson(copy,16384);}catch{}}
  const error=response.status>=400?safeEventError(result?.error):undefined;
  const entityId=spec.name==='billing.checkout.created'?eventIdentity(result?.sessionId):null;
  if(entityId&&user)await env.DB.prepare('UPDATE arc_billing_checkouts SET journey_id=COALESCE(journey_id,?1),trace_id=COALESCE(trace_id,?2) WHERE session_id=?3 AND user_id=?4').bind(context.journeyId,context.traceId,entityId,user.id).run();
  const pairingWait=spec.name==='device.token.requested'&&[400,428].includes(response.status)&&result?.error==='authorization_pending';
  await recordProductEvent(env,{...spec,...context,source:'server',outcome:pairingWait?'waiting':response.status>=400?'failed':(spec.name.endsWith('.request')||spec.domain==='auth'||spec.domain==='oauth')?'accepted':'succeeded',userId:user?.id,entityId,errorCode:error,httpStatus:response.status,durationMs:Date.now()-started});
  if(spec.name==='billing.offers.loaded'&&response.ok&&result?.enabled===false)await recordProductEvent(env,{domain:'billing',name:'billing.checkout.unavailable',source:'server',outcome:'failed',userId:user?.id,...context,errorCode:'BILLING_NOT_CONFIGURED'});
 }catch{console.warn('product_request_observation_failed');}
}
