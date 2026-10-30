import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ARC_PLANS,ARC_TOPUPS} from '@remotearc/protocol';
import {activeCommercial,commercialCatalog,saveCommercialDraft,publishCommercialDraft,approvedCommercialPrice} from '../src/arc-commercial-config.js';
import {handleAdminServiceRequest} from '../src/admin-service.js';
import {savePromotionDraft,publishPromotion,disablePromotion,checkoutPromotion} from '../src/arc-promotions.js';
import {processStripeEvent,handleBilling,type BillingEnv} from '../src/stripe-billing.js';
import {activateArcTrial,publicArcAccess} from '../src/arc-trial.js';
import {currentArcPlan} from '../src/arc-plan.js';
import {creditBalance} from '../src/arc-credits.js';
import {sha256Hex} from '../src/auth.js';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const statement=sql.prepare(query),bind=(args:any[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return this.runSync();},runSync(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}});return{...bind([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bind(args);}};},async batch(items:any[]){sql.exec('BEGIN IMMEDIATE');try{const result=items.map(i=>i.runSync());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
const env:BillingEnv={DB:db,PUBLIC_ORIGIN:'https://mcp.remotearc.app',DASHBOARD_ORIGIN:'https://agent.remotearc.app',ARC_BILLING_ENABLED:'1',ARC_CHAT_ENABLED:'1',ARC_CREDITS_ENABLED:'1',ARC_BILLING_ALLOW_TEST_MODE:'1',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
const at=new Date().toISOString(),start=Math.floor(Date.now()/1000)-10,end=start+30*86400,fixtures=new Map<string,any>(),mutations:Array<{path:string;body:URLSearchParams}>=[];
let losePrivateResponse=true;
for(const user of ['operator','old','new','other','trial-one','trial-two']){
 sql.prepare('INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)').run(user,user,user+'@example.invalid',user==='operator'?'admin':'user',at);
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex(user+'-session'),user,new Date(Date.now()+3600000).toISOString(),at);
}
for(const user of ['old','new','other'])sql.prepare('INSERT INTO arc_billing_customers VALUES(?,?,?)').run(user,'cus_'+user,at);
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(String(input));assert.equal(u.origin,'https://api.stripe.com');const key=u.pathname+u.search;
 if(init?.method==='POST'){
  const p=new URLSearchParams(String(init.body));mutations.push({path:key,body:p});
  if(u.pathname==='/v1/prices'){
   const id='price_'+mutations.length,value={id,lookup_key:p.get('lookup_key'),currency:p.get('currency'),unit_amount:Number(p.get('unit_amount')),tax_behavior:p.get('tax_behavior'),active:true,product:p.get('product'),recurring:p.has('recurring[interval]')?{interval:'month',interval_count:1}:null,metadata:{remote_arc_version:p.get('metadata[remote_arc_version]'),remote_arc_sku:p.get('metadata[remote_arc_sku]')}};fixtures.set('/v1/prices/'+id,value);return Response.json(value);
  }
  if(u.pathname==='/v1/coupons'){
   const value={id:p.get('id'),valid:true,percent_off:Number(p.get('percent_off')),duration:p.get('duration'),amount_off:null,max_redemptions:Number(p.get('max_redemptions')),redeem_by:Number(p.get('redeem_by')),metadata:{remote_arc_promotion:p.get('metadata[remote_arc_promotion]')},applies_to:{products:[p.get('applies_to[products][0]')]}};fixtures.set('/v1/coupons/'+value.id,value);return Response.json(value);
  }
  if(u.pathname==='/v1/promotion_codes'){
   assert.equal(p.get('promotion[type]'),'coupon');const value={id:'promo_'+mutations.length,active:true,code:p.get('code'),promotion:{type:'coupon',coupon:p.get('promotion[coupon]')},customer:p.get('customer'),expires_at:Number(p.get('expires_at')),metadata:{remote_arc_promotion:p.get('metadata[remote_arc_promotion]')}};fixtures.set('/v1/promotion_codes/'+value.id,value);return Response.json(value);
  }
  if(u.pathname.startsWith('/v1/promotion_codes/')){const value={...fixtures.get(u.pathname),active:p.get('active')!=='false'};fixtures.set(u.pathname,value);return Response.json(value);}
  if(u.pathname==='/v1/checkout/sessions'){assert(p.get('discounts[0][promotion_code]'));return Response.json({id:'cs_test_new',url:'https://checkout.stripe.com/c/pay/test'});}
  if(u.pathname==='/v1/subscriptions/sub_other'){
   assert.equal(p.get('proration_behavior'),'none');const value={...fixtures.get(u.pathname+'?expand[0]=discounts'),discounts:[{id:'di_private',source:{type:'coupon',coupon:p.get('discounts[0][coupon]')}}]};fixtures.set(u.pathname+'?expand[0]=discounts',value);
   if(losePrivateResponse){losePrivateResponse=false;throw new TypeError('lost response after provider applied discount');}return Response.json(value);
  }
 }
 if(fixtures.has(key))return Response.json(fixtures.get(key));
 if(u.pathname.startsWith('/v1/coupons/')&&fixtures.has(u.pathname))return Response.json(fixtures.get(u.pathname));
 if(u.pathname.startsWith('/v1/products/'))return Response.json({id:u.pathname.split('/').at(-1),metadata:{remote_arc_sku:'arc-plus-v1'}});
 if(u.pathname.startsWith('/v1/coupons/'))return Response.json({error:{code:'resource_missing'}},{status:404});
 if(u.pathname==='/v1/promotion_codes')return Response.json({has_more:false,data:[]});
 if(u.pathname==='/v1/subscriptions')return Response.json({has_more:false,data:[]});
 assert.fail('Unexpected Stripe call '+key);
};
function invoice(name:string,userId:string,price:any,discount?:{id:string;coupon:string;cents:number}){
 const id='in_'+name,sub='sub_'+userId,payment='pi_'+name,charge='ch_'+name;
 const value={id,customer:'cus_'+userId,livemode:false,status:'paid',currency:'usd',amount_remaining:0,amount_paid:price.unit_amount-(discount?.cents||0),total:price.unit_amount-(discount?.cents||0),total_excluding_tax:price.unit_amount-(discount?.cents||0),subtotal_excluding_tax:price.unit_amount,total_discount_amounts:discount?[{discount:discount.id,amount:discount.cents}]:[],billing_reason:'subscription_create',parent:{subscription_details:{subscription:sub}}};
 fixtures.set('/v1/invoices/'+id,value);fixtures.set('/v1/invoices/'+id+'?expand[0]=discounts',{...value,discounts:discount?[{id:discount.id,source:{type:'coupon',coupon:discount.coupon},start:Math.floor(Date.now()/1000)}]:[]});
 fixtures.set('/v1/invoices/'+id+'/lines?limit=2',{has_more:false,data:[{quantity:1,amount:price.unit_amount,pricing:{price_details:{price:price.id}},period:{start,end}}]});
 fixtures.set('/v1/subscriptions/'+sub,{id:sub,customer:'cus_'+userId,status:'active'});
 fixtures.set('/v1/invoice_payments?invoice='+id+'&limit=2',{has_more:false,data:[{status:'paid',payment:{payment_intent:payment}}]});
 fixtures.set('/v1/payment_intents/'+payment,{id:payment,status:'succeeded',currency:'usd',amount_received:value.total,latest_charge:charge});fixtures.set('/v1/charges/'+charge,{id:charge,payment_intent:payment,paid:true,amount_refunded:0,disputed:false});
 return{id:'evt_'+name,type:'invoice.paid',livemode:false,data:{object:{id}}};
}
const request=(path:string,value?:unknown,user='operator',origin='https://admin.remotearc.app')=>new Request('https://admin.remotearc.app'+path,{method:value===undefined?'GET':'POST',headers:{origin,cookie:'rl_session='+user+'-session','content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
try{
 const initial=await commercialCatalog(env);assert.deepEqual(initial.plans.map(({versionId,revision,...p})=>p),ARC_PLANS);assert.deepEqual(initial.topups.map(({versionId,revision,...p})=>p),ARC_TOPUPS);
 const legacy={id:'price_legacy',lookup_key:'remote-arc:arc-plus-v1',unit_amount:3900,currency:'usd',tax_behavior:'exclusive',active:false,recurring:{interval:'month',interval_count:1}};fixtures.set('/v1/prices/'+legacy.id,legacy);
 await processStripeEvent(env,invoice('old','old',legacy),'old');assert.equal((await creditBalance(db,'old')).available,1500);
 const head=await activeCommercial(env,'arc-plus-v1'),id=crypto.randomUUID(),next={...ARC_PLANS.find(p=>p.id==='arc-plus-v1')!,monthlyPriceCents:2900,monthlyCredits:1200};
 await saveCommercialDraft(env,'operator',{id,kind:'plan',revision:head.revision,config:next});assert.equal((await activeCommercial(env,'arc-plus-v1')).id,head.id,'Saving a draft does not change live prices');
 await publishCommercialDraft(env,'operator',id);assert.equal((await activeCommercial(env,'arc-plus-v1')).id,id);assert.equal((await currentArcPlan(db,'old')).monthlyCredits,1500,'Existing paid users keep their saved allowance');
 assert.equal((await currentArcPlan(db,'old')).monthlyPriceCents,3900);assert.equal((await commercialCatalog({DB:db})).plans.find(p=>p.id==='arc-plus-v1')?.monthlyPriceCents,3900,'Test publication cannot change the live catalog');
 assert.throws(()=>sql.prepare('UPDATE arc_commercial_versions SET published_at=NULL WHERE id=?').run(id),/immutable/);
 const stale=crypto.randomUUID();await assert.rejects(()=>saveCommercialDraft(env,'operator',{id:stale,kind:'plan',revision:1,config:next}),/CHANGED/);
 const competing=await activeCommercial(env,'arc-plus-v1'),ids=[crypto.randomUUID(),crypto.randomUUID()];for(const draftId of ids)await saveCommercialDraft(env,'operator',{id:draftId,kind:'plan',revision:competing.revision,config:next});
 const race=await Promise.allSettled(ids.map(draftId=>publishCommercialDraft(env,'operator',draftId)));assert.equal(race.filter(r=>r.status==='fulfilled').length,1,'Only one concurrent release can move the head');
 const version=await activeCommercial(env,'arc-plus-v1'),price=fixtures.get('/v1/prices/'+version.stripe_price_id);assert.equal((await approvedCommercialPrice(env,fixtures.get('/v1/prices/'+(await activeCommercial(env,'arc-plus-v1')).stripe_price_id))).credits,1200);
 const billingRequest=(body:unknown)=>handleBilling(new Request('https://agent.remotearc.app/api/billing/checkout',{method:'POST',headers:{origin:'https://agent.remotearc.app',cookie:'rl_session=new-session','content-type':'application/json'},body:JSON.stringify(body)}),env);
 assert.equal((await billingRequest({productId:'arc-plus-v1',versionId:head.id})).status,409,'Stale price quotes require user review');
 const promoId=crypto.randomUUID();await savePromotionDraft(env,'operator',{id:promoId,code:'WELCOME20',productId:'arc-plus-v1',percentOff:20,expiresAt:new Date(Date.now()+86400000).toISOString(),maxRedemptions:5});await publishPromotion(env,'operator',promoId);
 const promo=await checkoutPromotion(env,'new','cus_new','arc-plus-v1','welcome20');assert(promo);
 await assert.rejects(()=>checkoutPromotion(env,'new','cus_new','arc-pro-v1','WELCOME20'),/UNAVAILABLE/);
 assert.equal((await billingRequest({productId:'arc-plus-v1',versionId:version.id,promoCode:'WELCOME20'})).status,200);
 fixtures.set('/v1/checkout/sessions?subscription=sub_new&limit=2',{has_more:false,data:[{id:'cs_test_new'}]});
 const discounted=invoice('discounted','new',price,{id:'di_new',coupon:promo.coupon_id!,cents:580});await processStripeEvent(env,discounted,'discounted');await processStripeEvent(env,{...discounted,id:'evt_replay'},'replay');
 assert.equal((await creditBalance(db,'new')).available,1200,'Discounts retain the configured Credits, independently of net cash');
 assert.equal(sql.prepare("SELECT amount_cents FROM arc_payment_receipts WHERE id='in_discounted'").get()?.amount_cents,2320);assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_promotion_redemptions').get()?.n,1);
 await assert.rejects(()=>checkoutPromotion(env,'new','cus_new','arc-plus-v1','WELCOME20'),/UNAVAILABLE/);
 fixtures.set('/v1/checkout/sessions?subscription=sub_other&limit=2',{has_more:false,data:[]});
 await assert.rejects(()=>processStripeEvent(env,invoice('forged','other',price,{id:'di_forced',coupon:promo.coupon_id!,cents:580}),'forged'),/PROMOTION_MISMATCH/);
 assert.equal((await creditBalance(db,'other')).available,0,'Provider discounts without our owner-scoped intent cannot grant Credits');
 await disablePromotion(env,'operator',promoId);await assert.rejects(()=>checkoutPromotion(env,'other','cus_other','arc-plus-v1','WELCOME20'),/UNAVAILABLE/);
 const privateId=crypto.randomUUID();await savePromotionDraft(env,'operator',{id:privateId,code:'PRIVATE15',productId:'arc-plus-v1',percentOff:15,targetEmail:'other@example.invalid',expiresAt:new Date(Date.now()+86400000).toISOString(),maxRedemptions:1});
 sql.prepare("INSERT INTO arc_billing_subscriptions(id,user_id,product_id,status,period_end,cancel_at_period_end,updated_at,commercial_version_id) VALUES('sub_other','other','arc-plus-v1','active',?,0,?,?)").run(new Date(end*1000).toISOString(),at,version.id);
 fixtures.set('/v1/subscriptions/sub_other?expand[0]=discounts',{id:'sub_other',customer:'cus_other',status:'active',schedule:null,cancel_at_period_end:false,discounts:[]});
 await assert.rejects(()=>publishPromotion(env,'operator',privateId),/PROVIDER_UNAVAILABLE/);
 assert.equal(sql.prepare('SELECT status FROM arc_promotion_assignments WHERE promotion_id=?').get(privateId)?.status,'unknown');
 await publishPromotion(env,'operator',privateId);assert.equal(sql.prepare('SELECT status FROM arc_promotion_assignments WHERE promotion_id=?').get(privateId)?.status,'applied');
 assert.equal(mutations.filter(m=>m.path==='/v1/subscriptions/sub_other').length,1,'An ambiguous private offer is reconciled from canonical state without applying it twice');
 await assert.rejects(()=>checkoutPromotion(env,'new','cus_new','arc-plus-v1','PRIVATE15'),/UNAVAILABLE/);
 await activateArcTrial(env,'trial-one');const trial=await activeCommercial(env,'arc-trial-v1'),trialId=crypto.randomUUID();await saveCommercialDraft(env,'operator',{id:trialId,kind:'trial',revision:trial.revision,config:{id:'arc-trial-v1',days:7,credits:100}});await publishCommercialDraft(env,'operator',trialId);await activateArcTrial(env,'trial-two');
 assert.equal((await publicArcAccess(env,'trial-one')).trialCredits,200);assert.equal((await publicArcAccess(env,'trial-two')).trialCredits,100);assert.equal((await creditBalance(db,'trial-one')).available,200);assert.equal((await creditBalance(db,'trial-two')).available,100);
 assert.equal((await handleAdminServiceRequest(request('/api/admin/payments',undefined,'other'),env as any)).status,403);
 assert.equal((await handleAdminServiceRequest(request('/api/admin/payments/config/drafts',{},'operator','https://evil.invalid'),env as any)).status,403);
 const admin=await handleAdminServiceRequest(request('/api/admin/payments'),env as any);assert.equal(admin.status,200);const overview=await admin.json() as any;assert.equal(overview.mode,'test');assert.equal(overview.receipts.length,2);assert.equal(overview.revenue[0].cents,6220);assert(!JSON.stringify(overview).includes('sk_test_fixture'));
 sql.prepare("UPDATE users SET role='user' WHERE id='operator'").run();assert.equal((await handleAdminServiceRequest(request('/api/admin/payments'),env as any)).status,403,'Role revocation applies immediately');
 console.log('Commercial configuration: draft/publish isolation, immutable versions, CAS races, old subscriber and trial terms, stale quotes, scoped promotions, discounted Credits, replay, invalid-source rejection and admin boundaries passed.');
}finally{globalThis.fetch=original;sql.close();}
