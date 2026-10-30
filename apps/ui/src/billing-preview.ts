import {ARC_PLANS,ARC_TOPUPS,ARC_PREMIUM_MODELS,CONNECT_UNLIMITED_PLAN_ID,FREE_BINARY_BYTES_PER_MONTH} from '@remotearc/protocol';
const storageKey='remote-arc-billing-preview-v1';
type State={planId:string;revision:number;cancelled:boolean;pending:string|null;methodUpdated:boolean;orders:Record<string,{productId:string;status:'open'|'complete'|'expired'}>};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
/** Local demo state only. No provider, authentication or production API calls. */
export function createBillingPreview(storage:Pick<Storage,'getItem'|'setItem'>,entry:URL){
 let state:State={planId:entry.pathname==='/checkout'?'free':'arc-plus-v1',revision:0,cancelled:false,pending:null,methodUpdated:false,orders:{}};
 try{const saved=JSON.parse(storage.getItem(storageKey)||'null');if(saved&&ARC_PLANS.some(p=>p.id===saved.planId)&&Number.isSafeInteger(saved.revision)&&saved.orders&&typeof saved.orders==='object')state=saved;}catch{}
 if(entry.searchParams.get('demo')==='new')state={...state,planId:'free',cancelled:false,pending:null,orders:{}};
 const save=()=>{try{storage.setItem(storageKey,JSON.stringify(state));}catch{}};
 save();
 const period=()=>new Date(Date.now()+30*86400000).toISOString(),plan=()=>ARC_PLANS.find(p=>p.id===state.planId)||ARC_PLANS[0];
 const plans=ARC_PLANS.map(p=>({...p,versionId:'preview:'+p.id})),topups=ARC_TOPUPS.map(p=>({...p,versionId:'preview:'+p.id}));
 return{handle(url:URL,method:string,body:unknown):Response|null{
  if(!url.pathname.startsWith('/api/billing'))return null;
  const path=url.pathname.slice('/api/billing'.length);let input:any={};try{if(body)input=JSON.parse(String(body));}catch{return json({error:'BILLING_INVALID_REQUEST'},400);}
  if(method==='GET'&&path==='')return json({enabled:true,connectEnabled:true,embeddedCheckoutEnabled:true,subscriptionManagementEnabled:true,hasCustomer:true,plan:plan(),access:{status:plan().id===CONNECT_UNLIMITED_PLAN_ID?'excluded':plan().monthlyPriceCents?'paid':'active',canUse:plan().id!==CONNECT_UNLIMITED_PLAN_ID,daysRemaining:14,dailyUsedPercent:0},credits:{available:plan().id===CONNECT_UNLIMITED_PLAN_ID?0:plan().monthlyCredits||200,pending:0},usage:{month:new Date().toISOString().slice(0,7),used:1732,limit:plan().connectToolCalls},transfer:{used:380*1024**2,limit:plan().id==='free'?FREE_BINARY_BYTES_PER_MONTH:null},plans,topups,models:ARC_PREMIUM_MODELS.map(m=>({id:m.id,label:m.label,inputCreditsPer1000:m.inputMicrosPerMillion/2000000,outputCreditsPer1000:m.outputMicrosPerMillion/2000000})),subscriptions:plan().monthlyPriceCents?[{status:'active',period_end:period(),cancel_at_period_end:Number(state.cancelled),revision:state.revision,pending_product_id:state.pending,pending_effective_at:state.pending?period():null}]:[]});
  if(method==='GET'&&path==='/details')return json({paymentMethod:{type:'card',brand:'Visa',last4:state.methodUpdated?'1881':'4242',expMonth:12,expYear:2030},invoices:plan().monthlyPriceCents?[{id:'in_preview',number:'DEMO-1001',status:'paid',currency:'usd',amountPaid:plan().monthlyPriceCents,amountDue:0,createdAt:new Date().toISOString(),pdfUrl:null}]:[],hasMore:false});
  if(method==='POST'&&path==='/checkout'){
   if(![...plans,...topups].some(p=>p.id===input.productId))return json({error:'BILLING_INVALID_PRODUCT'},400);
   let order=Object.entries(state.orders).find(([,order])=>order.status==='open');if(order&&order[1].productId!==input.productId)return json({error:'BILLING_CHECKOUT_IN_PROGRESS'},409);
   if(!order){const id='cs_preview_'+crypto.randomUUID().replaceAll('-','');state.orders[id]={productId:input.productId,status:'open'};order=[id,state.orders[id]];save();}
   return json({mode:input.uiMode==='elements'?'elements':'embedded_page',sessionId:order[0],clientSecret:'preview-only',publishableKey:'preview-only'});
  }
  if(method==='POST'&&path==='/checkout/abandon'){const order=state.orders[input.sessionId];if(!order)return json({error:'BILLING_CHECKOUT_NOT_FOUND'},404);if(order.status==='complete')return json({complete:true});order.status='expired';save();return json({expired:true});}
  if(method==='POST'&&path==='/preview/complete'){const order=state.orders[input.sessionId];if(!order||order.status==='expired')return json({error:'BILLING_CHECKOUT_NOT_FOUND'},404);order.status='complete';if(plans.some(p=>p.id===order.productId))state.planId=order.productId;save();return json({complete:true});}
  if(method==='GET'&&path==='/checkout-status')return json({status:state.orders[url.searchParams.get('session')||'']?.status||'expired'});
  if(method==='POST'&&path==='/subscription/renewal'){if(input.revision!==state.revision)return json({error:'BILLING_SUBSCRIPTION_CHANGED'},409);if(!['cancel','resume'].includes(input.action))return json({error:'BILLING_INVALID_REQUEST'},400);state.cancelled=input.action==='cancel';if(state.cancelled)state.pending=null;state.revision++;save();return json({cancelAtPeriodEnd:state.cancelled,effectiveAt:period()});}
  if(method==='POST'&&path==='/plan/change'){if(!plans.some(p=>p.id===input.productId&&p.monthlyPriceCents>0))return json({error:'BILLING_INVALID_PRODUCT'},400);state.pending=input.productId;state.revision++;save();return json({scheduled:true,effectiveAt:period()});}
  if(method==='POST'&&path==='/payment-method/setup')return json({id:'seti_preview',clientSecret:'preview-only',publishableKey:'preview-only'});
  if(method==='POST'&&path==='/payment-method/confirm'){if(input.setupIntentId!=='seti_preview')return json({error:'BILLING_PAYMENT_METHOD_NOT_READY'},409);state.methodUpdated=true;save();return json({updated:true});}
  return null;
 }};
}
