import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {processStripeEvent,handleBilling,type BillingEnv} from '../src/stripe-billing.js';
import {verifyStripeSignature,STRIPE_API_VERSION} from '../src/stripe-client.js';
import {creditBalance} from '../src/arc-credits.js';
import {currentArcPlan} from '../src/arc-plan.js';
import {sha256Hex} from '../src/auth.js';
import {getAccountPlan} from '../src/entitlements.js';
import {getSessionUser} from '../src/auth.js';
import {getMonthlyUsage} from '../src/usage.js';
import {handlePairingApprove} from '../src/device.js';
import {handleArcAdminBilling} from '../src/arc-admin-billing.js';
import {activateArcTrial} from '../src/arc-trial.js';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const stmt=sql.prepare(query);const bound=(args:any[])=>({async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){return this.runSync();},runSync(){const r=stmt.run(...args);return{success:true,meta:{changes:Number(r.changes)}};}});return{...bound([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bound(args);}};},async batch(items:Array<{runSync:()=>unknown}>){sql.exec('BEGIN IMMEDIATE');try{const r=items.map(s=>s.runSync());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
const stamp=new Date().toISOString(),start=Math.floor(Date.now()/1000)-60,end=start+30*86400;
for(const user of ['one','two','trial'])sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'user',?)").run(user,user,user+'@example.invalid',stamp);
sql.prepare('INSERT INTO arc_billing_customers VALUES(?,?,?)').run('one','cus_fixture',stamp);
sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('fixture-session'),'one',new Date(Date.now()+3600000).toISOString(),stamp);
const env:BillingEnv={DB:db,PUBLIC_ORIGIN:'https://mcp.remotearc.app',DASHBOARD_ORIGIN:'https://agent.remotearc.app',ARC_BILLING_ENABLED:'1',ARC_CHAT_ENABLED:'1',ARC_CREDITS_ENABLED:'1',ARC_BILLING_ALLOW_TEST_MODE:'1',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
let refunded=false,invoiceOwner='cus_fixture',invoicePrice=3900,subscriptionStatus='active',hasSchedule=false;const mutations:Array<{path:string;body:URLSearchParams;key:string|null}>=[];
const fixtures:Record<string,any>={
 '/v1/invoices/in_fixture/lines?limit=2':{has_more:false,data:[{quantity:1,amount:3900,pricing:{price_details:{price:'price_plus'}},period:{start,end}}]},
 '/v1/prices/price_plus':{id:'price_plus',lookup_key:'remote-arc:arc-plus-v1',currency:'usd',unit_amount:3900,tax_behavior:'exclusive',active:true,recurring:{interval:'month',interval_count:1}},
 '/v1/prices/price_topup':{id:'price_topup',lookup_key:'remote-arc:arc-topup-500-v1',currency:'usd',unit_amount:1000,tax_behavior:'exclusive',active:true,recurring:null},
 '/v1/invoice_payments?invoice=in_fixture&limit=2':{has_more:false,data:[{status:'paid',payment:{payment_intent:'pi_fixture'}}]},
 '/v1/payment_intents/pi_fixture':{id:'pi_fixture',status:'succeeded',currency:'usd',amount_received:3900,latest_charge:'ch_fixture'},
 '/v1/payment_intents/pi_topup':{id:'pi_topup',status:'succeeded',currency:'usd',amount_received:1000,latest_charge:'ch_topup'},
 '/v1/charges/ch_topup':{id:'ch_topup',payment_intent:'pi_topup',paid:true,amount_refunded:0,disputed:false},
 '/v1/checkout/sessions/cs_test_fixture':{id:'cs_test_fixture',customer:'cus_fixture',mode:'payment',livemode:false,payment_status:'paid',status:'complete',currency:'usd',amount_subtotal:1000,amount_total:1000,total_details:{amount_discount:0},payment_intent:'pi_topup'},
 '/v1/checkout/sessions/cs_test_fixture/line_items?limit=2':{has_more:false,data:[{quantity:1,price:'price_topup'}]},
  '/v1/billing_portal/configurations?active=true&limit=100':{has_more:false,data:[{id:'bpc_fixture',metadata:{remote_arc:'billing-v1'},features:{subscription_update:{enabled:false},subscription_cancel:{mode:'at_period_end'}}}]},
};
const original=globalThis.fetch,requests:string[]=[];
globalThis.fetch=async(input,init)=>{const u=new URL(String(input));assert.equal(u.origin,'https://api.stripe.com');assert.equal(new Headers(init?.headers).get('stripe-version'),STRIPE_API_VERSION);requests.push(u.pathname+u.search);
 if(init?.method==='POST'){
  const body=new URLSearchParams(String(init.body));mutations.push({path:u.pathname,body,key:new Headers(init.headers).get('idempotency-key')});
   if(u.pathname==='/v1/billing_portal/sessions'){assert.equal(body.get('customer'),'cus_fixture');return Response.json({url:'https://billing.stripe.com/p/session/fixture'});}
  if(u.pathname==='/v1/subscription_schedules'){assert.equal(body.get('from_subscription'),'sub_fixture');hasSchedule=true;return Response.json({id:'sub_sched_fixture',current_phase:{start_date:start,end_date:end}});}
  if(u.pathname==='/v1/subscription_schedules/sub_sched_fixture'){assert.equal(body.get('proration_behavior'),'none');assert.equal(body.get('phases[0][end_date]'),String(end));assert.equal(body.get('phases[1][start_date]'),String(end));assert.equal(body.get('phases[1][duration][interval]'),'month');return Response.json({id:'sub_sched_fixture'});}
  if(u.pathname==='/v1/checkout/sessions'){assert.equal(body.get('line_items[0][price]'),'price_plus');assert.equal(body.get('line_items[0][quantity]'),'1');assert.equal(body.get('customer'),'cus_fixture');const providerCreationTime=Math.floor((Date.now()+5000)/1000);assert(Number(body.get('expires_at'))>=providerCreationTime+1800,'Stripe requires 30 minutes AFTER provider creation, including network delay and second rounding');assert.equal(new URL(body.get('success_url')!).pathname,'/checkout');assert.equal(new URL(body.get('cancel_url')!).pathname,'/checkout');return Response.json({id:'cs_test_open',url:'https://checkout.stripe.com/c/pay/fixture'});}
 }
 if(u.pathname==='/v1/subscriptions')return Response.json({has_more:false,data:subscriptionStatus==='canceled'?[]:[{status:subscriptionStatus}]});
 if(u.pathname==='/v1/prices'){const pro=u.searchParams.get('lookup_keys[]')==='remote-arc:arc-pro-v1';return Response.json({data:[pro?{...fixtures['/v1/prices/price_plus'],id:'price_pro',lookup_key:'remote-arc:arc-pro-v1',unit_amount:7900}:fixtures['/v1/prices/price_plus']]});}
 if(u.pathname==='/v1/subscription_schedules/sub_sched_fixture')return Response.json({id:'sub_sched_fixture',current_phase:{start_date:start,end_date:end}});
 if(u.pathname==='/v1/checkout/sessions/cs_test_open')return Response.json({id:'cs_test_open',status:'open',url:'https://checkout.stripe.com/c/pay/fixture'});
 if(u.pathname==='/v1/invoices/in_fixture')return Response.json({id:'in_fixture',customer:invoiceOwner,livemode:false,status:'paid',currency:'usd',amount_remaining:0,amount_paid:invoicePrice,total:invoicePrice,total_excluding_tax:invoicePrice,subtotal_excluding_tax:invoicePrice,total_discount_amounts:[],post_payment_credit_notes_amount:0,billing_reason:'subscription_create',parent:{subscription_details:{subscription:'sub_fixture'}}});
 if(u.pathname==='/v1/subscriptions/sub_fixture')return Response.json({id:'sub_fixture',customer:'cus_fixture',status:subscriptionStatus,cancel_at_period_end:subscriptionStatus==='canceled',items:{data:[{quantity:1,price:'price_plus'}]},schedule:hasSchedule?'sub_sched_fixture':null});
 if(u.pathname==='/v1/charges/ch_fixture')return Response.json({id:'ch_fixture',payment_intent:'pi_fixture',paid:true,amount_refunded:refunded?3900:0,disputed:false});
 const value=fixtures[u.pathname+u.search];assert(value,'Unexpected provider call '+u.pathname+u.search);return Response.json(value);
};
const event=(eventId:string,type='invoice.paid',object='in_fixture')=>({id:'evt_'+eventId,type,livemode:false,data:{object:{id:object}}});
const action=(route:string,productId:string)=>handleBilling(new Request('https://agent.remotearc.app/api/billing/'+route,{method:'POST',headers:{origin:'https://agent.remotearc.app',cookie:'rl_session=fixture-session','content-type':'application/json'},body:JSON.stringify({productId})}),env);
try{
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('trial-session'),'trial',new Date(Date.now()+3600000).toISOString(),stamp);
 await activateArcTrial(env,'trial');
 const trialRequest=()=>new Request('https://agent.remotearc.app/api/billing',{headers:{cookie:'rl_session=trial-session'}});
 const trialResponse=await handleBilling(trialRequest(),env);assert.equal(trialResponse.status,200);
 const publicRates=(await trialResponse.clone().json() as any).models;assert(publicRates.length>0);assert(!publicRates.some((model:any)=>model.id==='arc-auto'||model.id==='auto'),'Public named-model rates do not identify Auto routing');
 const trialBilling=await trialResponse.json() as any;assert.equal(trialBilling.plan.id,'free');assert.equal(trialBilling.access.status,'active');assert.equal(trialBilling.access.daysRemaining,14);assert(trialBilling.credits.available>0);assert.equal(trialBilling.subscriptions.length,0);assert.equal(trialBilling.hasCustomer,false);assert.equal(mutations.length,0,'Viewing an active trial does not bind a card or create a subscription');
 sql.prepare("UPDATE arc_trials SET started_at='2000-01-01',expires_at='2000-01-15' WHERE user_id='trial'").run();
 const expiredBilling=await (await handleBilling(trialRequest(),env)).json() as any;assert.equal(expiredBilling.access.status,'expired');assert.equal(expiredBilling.access.canUse,false);assert.equal(expiredBilling.plan.id,'free');
 await processStripeEvent(env,event('initial'),'initial');assert.equal((await creditBalance(db,'one')).available,1500);assert.equal((await currentArcPlan(db,'one')).id,'arc-plus-v1');
 assert.equal(await getAccountPlan(env,'one'),'plus');assert.equal((await getMonthlyUsage(env,'one')).limit,null);assert.equal((await getSessionUser(new Request('https://agent.remotearc.app/api/me',{headers:{cookie:'rl_session=fixture-session'}}),env))?.plan,'plus');
 for(let i=0;i<9;i++)sql.prepare('INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)').run('existing-'+i,'one','Computer','linux','existing-secret-'+i,stamp);
 for(const code of ['PAIR-A','PAIR-B'])sql.prepare('INSERT INTO device_pairings(device_code_hash,device_secret_hash,user_code,device_name,platform,status,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)').run('code-'+code,'secret-'+code,code,'New computer','linux','pending',new Date(end*1000).toISOString(),stamp);
 const paired=await Promise.all(['PAIR-A','PAIR-B'].map(code=>handlePairingApprove(new Request('https://agent.remotearc.app/api/pairing/approve',{method:'POST',headers:{origin:'https://agent.remotearc.app',cookie:'rl_session=fixture-session','content-type':'application/json'},body:JSON.stringify({user_code:code})}),{...env,REGISTRY:{} as DurableObjectNamespace})));
 assert.deepEqual(paired.map(r=>r.status).sort(),[200,403]);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM devices WHERE user_id='one'").get()?.n,10,'Concurrent pairing cannot exceed the paid plan’s 10-computer limit');
 assert.equal((await action('plan/change','arc-pro-v1')).status,200);assert.equal(sql.prepare("SELECT pending_product_id FROM arc_billing_subscriptions WHERE id='sub_fixture'").get()?.pending_product_id,'arc-pro-v1');assert.equal((await creditBalance(db,'one')).available,1500,'Scheduling a future upgrade does not issue unearned Credits');
 const mutationCount=mutations.length;assert.equal((await action('plan/change','arc-pro-v1')).status,200);assert.equal(mutations.length,mutationCount,'Repeated plan selection does not mutate twice');
 assert.equal((await action('plan/change','arc-plus-v1')).status,200);assert.equal(sql.prepare("SELECT pending_product_id FROM arc_billing_subscriptions WHERE id='sub_fixture'").get()?.pending_product_id,null);
 assert.equal((await action('plan/change','arc-pro-v1')).status,200);const changes=mutations.filter(m=>m.path.endsWith('/sub_sched_fixture'));assert.notEqual(changes[0].key,changes.at(-1)?.key,'Changing back and forth uses a new Stripe mutation key');
 await Promise.all([processStripeEvent(env,event('initial'),'initial'),processStripeEvent(env,event('duplicate'),'duplicate')]);assert.equal((await creditBalance(db,'one')).available,1500);assert.deepEqual(sql.prepare('SELECT provider FROM billing_model_grants ORDER BY provider').all().map(r=>r.provider),['anthropic','openai','openrouter']);
  // A delayed previous-period invoice must not roll the subscription's current SKU back.
  const futureEnd=new Date((end+30*86400)*1000).toISOString();
  sql.prepare("UPDATE arc_billing_subscriptions SET product_id='arc-pro-v1',period_end=? WHERE id='sub_fixture'").run(futureEnd);
  await processStripeEvent(env,event('olderinvoice'),'olderinvoice');
  const kept=sql.prepare("SELECT product_id,period_end FROM arc_billing_subscriptions WHERE id='sub_fixture'").get();assert.equal(kept?.product_id,'arc-pro-v1');assert.equal(kept?.period_end,futureEnd);
  sql.prepare("UPDATE arc_billing_subscriptions SET product_id='arc-plus-v1',period_end=?,pending_product_id='arc-plus-v1',pending_effective_at=? WHERE id='sub_fixture'").run(new Date(end*1000).toISOString(),new Date(start*1000).toISOString());
  await processStripeEvent(env,event('appliedplan'),'appliedplan');
  assert.equal(sql.prepare("SELECT pending_product_id FROM arc_billing_subscriptions WHERE id='sub_fixture'").get()?.pending_product_id,null,'The invoice for an applied plan clears the scheduled-change label');
 sql.prepare("INSERT INTO arc_billing_checkouts(id,user_id,product_id,kind,session_id,status,expires_at,created_at) VALUES('topup','one','arc-topup-500-v1','payment','cs_test_fixture','open',?,?)").run(new Date(end*1000).toISOString(),stamp);
 await processStripeEvent(env,event('topup','checkout.session.completed','cs_test_fixture'),'topup');await processStripeEvent(env,event('topup2','checkout.session.async_payment_succeeded','cs_test_fixture'),'topup2');assert.equal((await creditBalance(db,'one')).available,2000);
 assert.equal((await creditBalance(db,'two')).available,0);
 subscriptionStatus='canceled';await processStripeEvent(env,event('cancel','customer.subscription.deleted','sub_fixture'),'cancel');assert.equal((await currentArcPlan(db,'one')).id,'arc-plus-v1','Period-end cancellation preserves the paid period');
 refunded=true;await processStripeEvent(env,event('refund','charge.refunded','ch_fixture'),'refund');assert.equal((await creditBalance(db,'one')).available,500);assert.equal((await currentArcPlan(db,'one')).id,'free');
 assert(sql.prepare("SELECT revoked_at FROM billing_model_grants WHERE provider='openrouter'").get()?.revoked_at,'Refunds revoke the newly added provider as well');
 assert.equal(await getAccountPlan(env,'one'),'free');assert.equal((await getMonthlyUsage(env,'one')).limit,500);
 await assert.rejects(()=>processStripeEvent(env,event('late'),'late'),/PAYMENT_NOT_FINAL/);assert.equal((await creditBalance(db,'one')).available,500);
 assert.equal(sql.prepare("SELECT status FROM arc_payment_events WHERE id='evt_late'").get()?.status,'failed');
 refunded=false;await processStripeEvent(env,event('late'),'late');assert.equal((await creditBalance(db,'one')).available,500,'Refund tombstone prevents resurrection even if a subsequent provider fixture appears paid');
 invoiceOwner='cus_unknown';await processStripeEvent(env,event('unknown'),'unknown');assert.equal((await creditBalance(db,'two')).available,0);invoiceOwner='cus_fixture';
 invoicePrice=999;await assert.rejects(()=>processStripeEvent(env,event('wrongprice'),'wrongprice'),/INVOICE_MISMATCH/);invoicePrice=3900;
 sql.prepare("INSERT INTO arc_billing_checkouts(id,user_id,product_id,kind,status,expires_at,created_at) VALUES('legacy-invalid-expiry','one','arc-plus-v1','subscription','creating',?,?)").run(new Date(Date.now()+1800000).toISOString(),stamp);
 assert.equal((await action('checkout','arc-plus-v1')).status,200);assert.equal((await action('checkout','arc-plus-v1')).status,200);assert.equal(mutations.filter(m=>m.path==='/v1/checkout/sessions').length,1,'A retry reopens the same checkout');assert.equal(mutations.find(m=>m.path==='/v1/checkout/sessions')?.key,'arc-checkout:legacy-invalid-expiry','Recover a rejected legacy expiry with the same intent/key, never a second checkout identity');assert.equal((await creditBalance(db,'one')).available,500,'Opening or returning from checkout never grants allowance');
 assert(mutations.find(m=>m.path==='/v1/checkout/sessions')?.body.get('success_url')?.includes('session_id={CHECKOUT_SESSION_ID}'));
 assert.equal(mutations.find(m=>m.path==='/v1/checkout/sessions')?.body.has('payment_method_types[0]'),false,'Current Stripe API uses Dashboard-managed payment methods');
 const checkoutStatus=(session:string,token='fixture-session')=>handleBilling(new Request('https://agent.remotearc.app/api/billing/checkout-status?session='+session,{headers:{cookie:'rl_session='+token}}),env);
 assert.equal((await(await checkoutStatus('cs_test_open')).json() as any).status,'open');
 assert.equal((await(await checkoutStatus('cs_test_fixture')).json() as any).status,'complete');
 assert.equal((await checkoutStatus('cs_test_missing')).status,404);
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('other-session'),'two',new Date(Date.now()+3600000).toISOString(),stamp);
 assert.equal((await checkoutStatus('cs_test_open','other-session')).status,404,'Checkout status is private to its owner');
 assert.equal((await action('checkout','arc-topup-500-v1')).status,402,'An expired or refunded plan cannot purchase unusable top-ups');
 await assert.rejects(()=>processStripeEvent(env,{...event('live'),livemode:true},'live'),/ACCOUNT_MISMATCH/);
 const raw=JSON.stringify(event('signed')),t=Math.floor(Date.now()/1000),key=await crypto.subtle.importKey('raw',new TextEncoder().encode('whsec_fixture'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw))).toString('hex');
 await verifyStripeSignature(raw,`t=${t},v1=${'0'.repeat(64)},v1=${sig}`,'whsec_fixture');
 await assert.rejects(()=>verifyStripeSignature(raw+' ',`t=${t},v1=${sig}`,'whsec_fixture'),/SIGNATURE_INVALID/);
 await assert.rejects(()=>verifyStripeSignature(raw,`t=${t-301},v1=${sig}`,'whsec_fixture'),/SIGNATURE_EXPIRED/);
 const request=(path:string,method='GET',origin='https://agent.remotearc.app',cookie='rl_session=fixture-session')=>new Request('https://agent.remotearc.app'+path,{method,headers:{origin,cookie,'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
 assert.equal((await handleBilling(request('/api/billing','GET',undefined,''),env)).status,401);
 assert.equal((await handleBilling(request('/api/billing/checkout','POST','https://evil.invalid'),env)).status,403);
 assert.equal((await handleBilling(request('/api/billing/checkout','POST'),{...env,ARC_CHAT_ENABLED:'0'})).status,503);
 const response=await handleBilling(request('/api/billing'),env);assert.equal(response.status,200);const data=await response.json() as any;assert.equal(data.plan.id,'free');assert.equal(data.usage.limit,500);assert(!JSON.stringify(data).includes('sk_test_fixture'));
  const pausedEnv={...env,ARC_EMERGENCY_PAUSE:'1'};
  const pausedData=await (await handleBilling(request('/api/billing'),pausedEnv)).json() as any;
  assert.equal(pausedData.enabled,false);assert.equal(pausedData.portalEnabled,true,'Emergency Arc pause must not prevent existing customers from managing payment/cancellation');
  assert.equal((await handleBilling(request('/api/billing/portal','POST'),pausedEnv)).status,200);
  assert.equal((await handleBilling(request('/api/billing/checkout','POST'),pausedEnv)).status,503);
  assert.equal((await handleArcAdminBilling(request('/api/admin/arc-billing','GET',undefined,''),env)).status,401);
  assert.equal((await handleArcAdminBilling(request('/api/admin/arc-billing'),env)).status,403);
  sql.prepare("UPDATE users SET role='admin' WHERE id='one'").run();
  const adminResponse=await handleArcAdminBilling(request('/api/admin/arc-billing'),env);assert.equal(adminResponse.status,200);assert.equal(adminResponse.headers.get('cache-control'),'private, no-store');
  const adminData=await adminResponse.json() as any;assert.equal(adminData.paidRevenueUsd,10);assert.equal(adminData.refundedReceiptValueUsd,39);assert.equal(adminData.modelRatedCostUsd,0);assert(!JSON.stringify(adminData).includes('sk_test_fixture'));
  assert.equal((await handleArcAdminBilling(request('/api/admin/arc-billing','POST'),env)).status,405);
 console.log('Stripe billing: canonical payments, ownership, duplicate events, top-up replay, paid-period cancellation, refund tombstones, out-of-order events, failed-event recovery, forged/expired signatures, CSRF, launch gates and finite Free allowance passed.');
}finally{globalThis.fetch=original;sql.close();}
