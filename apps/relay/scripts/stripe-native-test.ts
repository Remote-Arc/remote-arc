import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleBilling,type BillingEnv} from '../src/billing/stripe-billing.js';
import {sha256Hex} from '../src/auth/auth.js';
import {configureStripePublicKey} from '../../../scripts/configure-stripe-public-key.mjs';
const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const DB={prepare(query:string){const statement=sql.prepare(query),bound=(args:any[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return this.runSync();},runSync(){const result=statement.run(...args);return{meta:{changes:Number(result.changes)}};}});return{...bound([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bound(args);}};},async batch(items:any[]){sql.exec('BEGIN IMMEDIATE');try{const result=items.map(item=>item.runSync());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
const now=new Date().toISOString(),end=new Date(Date.now()+30*86400000).toISOString(),origin='https://agent.remotearc.app';
for(const user of ['owner','other']){sql.prepare('INSERT INTO users(id,google_sub,email,created_at) VALUES(?,?,?,?)').run(user,user,user+'@example.invalid',now);sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex(user+'-session'),user,new Date(Date.now()+3600000).toISOString(),now);sql.prepare('INSERT INTO arc_billing_customers VALUES(?,?,?)').run(user,'cus_'+user,now);}
sql.prepare("INSERT INTO arc_billing_subscriptions(id,user_id,product_id,status,period_end,updated_at) VALUES('sub_owner','owner','arc-plus-v1','active',?,?)").run(end,now);
const env={DB,PUBLIC_ORIGIN:origin,DASHBOARD_ORIGIN:origin,ARC_CHAT_ENABLED:'1',ARC_CREDITS_ENABLED:'1',ARC_BILLING_ENABLED:'1',ARC_BILLING_ALLOW_TEST_MODE:'1',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture'} as BillingEnv;
const api=(path:string,body?:unknown,user='owner',requestOrigin=origin,overrides={})=>handleBilling(new Request(origin+'/api/billing'+(path?'/'+path:''),{method:body===undefined?'GET':'POST',headers:{cookie:'rl_session='+user+'-session',origin:requestOrigin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),{...env,...overrides});
const decode=async(response:Response,status=200)=>{const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;};
let cancelled=false,schedule=false,loseRenewalAck=true,setupReady=false,foreignSetup=false,foreignInvoice=false,checkoutStatus='open',checkouts=0;
let savedMethod:any={id:'pm_old',type:'card',customer:'cus_owner',card:{brand:'visa',last4:'4242',exp_month:12,exp_year:2030}};
const mutations:{path:string;body:URLSearchParams;key:string|null}[]=[],original=globalThis.fetch;
const subscription=()=>({id:'sub_owner',customer:'cus_owner',livemode:false,status:'active',cancel_at_period_end:cancelled,schedule:schedule?'sub_sched_owner':null});
let checkoutMode='embedded_page';
const checkout=()=>checkoutMode==='elements'?{id:'cs_test_elements',customer:'cus_other',livemode:false,status:'open',ui_mode:'elements',url:null,client_secret:'cs_test_elements_secret_fixture',billing_address_collection:null}:{id:'cs_test_native',customer:'cus_other',livemode:false,status:checkoutStatus,ui_mode:'embedded_page',url:null,client_secret:'cs_test_native_secret_fixture'};
globalThis.fetch=async(input,init)=>{
 const url=new URL(String(input));assert.equal(url.origin,'https://api.stripe.com');const key=new Headers(init?.headers).get('idempotency-key');
 if(init?.method==='POST'){
  const body=new URLSearchParams(String(init.body));mutations.push({path:url.pathname,body,key});
  if(url.pathname==='/v1/subscriptions/sub_owner'){
   if(body.has('cancel_at_period_end')){assert.equal(body.get('proration_behavior'),'none');cancelled=body.get('cancel_at_period_end')==='true';if(loseRenewalAck){loseRenewalAck=false;throw Error('Simulated lost acknowledgement');}}
   else assert.equal(body.get('default_payment_method'),'pm_new');return Response.json(subscription());
  }
  if(url.pathname==='/v1/subscription_schedules/sub_sched_owner/release'){schedule=false;return Response.json({id:'sub_sched_owner',status:'released'});}
  if(url.pathname==='/v1/setup_intents'){assert.equal(body.get('customer'),'cus_owner');assert.equal(body.get('usage'),'off_session');return Response.json({id:'seti_native',customer:'cus_owner',livemode:false,client_secret:'seti_native_secret_fixture'});}
  if(url.pathname==='/v1/customers/cus_owner'){assert.equal(body.get('invoice_settings[default_payment_method]'),'pm_new');return Response.json({id:'cus_owner'});}
  if(url.pathname==='/v1/checkout/sessions'){
   checkouts++;checkoutMode=body.get('ui_mode')!;assert(['embedded_page','elements'].includes(checkoutMode));assert.equal(body.has('success_url'),false);assert.equal(body.has('cancel_url'),false);assert.equal(body.get('redirect_on_completion'),checkoutMode==='elements'?null:'if_required','Elements sessions confirm on our page and return via return_url');assert(new URL(body.get('return_url')!).pathname==='/checkout');assert.equal(body.get('line_items[0][price]'),'price_plus');assert.equal(body.get('customer'),'cus_other');return Response.json(checkout());
  }
  if(url.pathname==='/v1/checkout/sessions/cs_test_native/expire'){checkoutStatus='expired';return Response.json(checkout());}
  throw Error('Unexpected mutation '+url.pathname);
 }
 if(url.pathname==='/v1/subscriptions/sub_owner')return Response.json(subscription());
 if(url.pathname==='/v1/subscription_schedules/sub_sched_owner')return Response.json({id:'sub_sched_owner',subscription:'sub_owner',current_phase:{end_date:Math.floor(Date.parse(end)/1000)}});
 if(url.pathname==='/v1/setup_intents/seti_native')return Response.json({id:'seti_native',customer:foreignSetup?'cus_other':'cus_owner',livemode:false,status:setupReady?'succeeded':'requires_payment_method',payment_method:'pm_new',metadata:{remote_arc_user:'owner',remote_arc_purpose:'billing-default'}});
 if(url.pathname==='/v1/customers/cus_owner')return Response.json({id:'cus_owner',livemode:false,invoice_settings:{default_payment_method:savedMethod}});
 if(url.pathname==='/v1/invoices')return Response.json({has_more:false,data:[{id:'in_native',customer:foreignInvoice?'cus_other':'cus_owner',livemode:false,created:Math.floor(Date.now()/1000),status:'paid',currency:'usd',amount_paid:3900,amount_due:0,invoice_pdf:'https://pay.stripe.com/invoice/fixture/pdf'}]});
 if(url.pathname==='/v1/subscriptions')return Response.json({has_more:false,data:[]});
 if(url.pathname==='/v1/prices')return Response.json({data:[{id:'price_plus',lookup_key:'remote-arc:arc-plus-v1',currency:'usd',unit_amount:3900,tax_behavior:'exclusive',active:true,recurring:{interval:'month',interval_count:1}}]});
 if(url.pathname==='/v1/checkout/sessions/cs_test_native')return Response.json(checkout());
 if(url.pathname==='/v1/checkout/sessions/cs_test_elements')return Response.json(checkout());
 throw Error('Unexpected read '+url.pathname);
};
try{
 const details=await decode(await api('details'));assert.equal(details.paymentMethod.last4,'4242');assert.equal(details.invoices[0].id,'in_native');assert(!JSON.stringify(details).includes('secret'));assert.equal(mutations.length,0,'Reading billing never creates a customer or payment');foreignInvoice=true;await decode(await api('details'),403);foreignInvoice=false;
 savedMethod.card.wallet={type:'apple_pay'};assert.equal((await decode(await api('details'))).paymentMethod.wallet,'apple_pay');
 savedMethod={id:'pm_link',type:'link',customer:'cus_owner',link:{email:'private@example.invalid'}};const linked=await decode(await api('details'));assert.deepEqual(linked.paymentMethod,{type:'link'});assert(!JSON.stringify(linked).includes('private@example.invalid'),'Wallet display does not expose Link identity');
 savedMethod.customer='cus_other';assert.equal((await decode(await api('details'))).paymentMethod,null,'Foreign payment methods are never displayed');savedMethod=null;
 await decode(await api('subscription/renewal',{action:'cancel',revision:0},'owner','https://untrusted.invalid'),403);await decode(await api('subscription/renewal',{action:'cancel',revision:0,extra:true}),400);
 await decode(await api('subscription/renewal',{action:'cancel',revision:0}),503);assert(cancelled);assert.equal(sql.prepare("SELECT cancel_at_period_end FROM arc_billing_subscriptions WHERE id='sub_owner'").get()!.cancel_at_period_end,0);
 await decode(await api('subscription/renewal',{action:'cancel',revision:0}));assert.equal(mutations.filter(item=>item.body.has('cancel_at_period_end')).length,1,'Lost acknowledgement reconciles current provider state without a second cancellation');
 await decode(await api('subscription/renewal',{action:'resume',revision:0}),409);await decode(await api('subscription/renewal',{action:'resume',revision:1}));assert(!cancelled);
 schedule=true;sql.prepare("UPDATE arc_billing_subscriptions SET pending_product_id='arc-pro-v1',pending_effective_at=? WHERE id='sub_owner'").run(end);
 const race=await Promise.all([api('subscription/renewal',{action:'cancel',revision:2}),api('subscription/renewal',{action:'cancel',revision:2})]);assert.deepEqual(race.map(item=>item.status).sort(),[200,409]);assert.equal(schedule,false);assert.equal(sql.prepare("SELECT pending_product_id FROM arc_billing_subscriptions WHERE id='sub_owner'").get()!.pending_product_id,null);
 await decode(await api('subscription/renewal',{action:'resume',revision:3},'owner',origin,{ARC_EMERGENCY_PAUSE:'1'}));assert(!cancelled,'An Arc pause cannot trap subscription management');
 await decode(await api('subscription/renewal',{action:'cancel',revision:4},'other'),404);
 const requestId=crypto.randomUUID(),setup=await decode(await api('payment-method/setup',{requestId}));assert.equal(setup.publishableKey,'pk_test_fixture');assert.equal(setup.id,'seti_native');await decode(await api('payment-method/confirm',{setupIntentId:'seti_native'}),409);setupReady=true;foreignSetup=true;await decode(await api('payment-method/confirm',{setupIntentId:'seti_native'}),403);foreignSetup=false;
 const reopened=await decode(await api('payment-method/setup',{requestId}));assert.equal(reopened.verified,true);assert.equal(reopened.clientSecret,undefined,'A reopened succeeded setup proceeds to confirmation without re-verifying payment details');
 await decode(await api('payment-method/confirm',{setupIntentId:'seti_native'}));await decode(await api('payment-method/confirm',{setupIntentId:'seti_native'}));const methodWrites=mutations.filter(item=>item.path==='/v1/customers/cus_owner');assert.equal(methodWrites.length,2);assert.equal(methodWrites[0].key,methodWrites[1].key,'Payment-method confirmation retains the same provider idempotency identity');
 const embedded=await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'embedded_page'},'other'));assert.equal(embedded.clientSecret,'cs_test_native_secret_fixture');assert.equal(embedded.mode,'embedded_page');assert.equal(embedded.url,undefined);assert.equal((await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'embedded_page'},'other'))).sessionId,embedded.sessionId);assert.equal(checkouts,1,'Repeated checkout returns the same embedded session');assert.equal(sql.prepare('SELECT ui_mode FROM arc_billing_checkouts WHERE session_id=?').get(embedded.sessionId)!.ui_mode,'embedded_page');
 const kept=await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'elements'},'other'));assert.deepEqual([kept.mode,kept.sessionId,checkouts],['embedded_page',embedded.sessionId,1],'An open session keeps its original mode; no second session');await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'embedded_page'},'other',origin,{STRIPE_PUBLISHABLE_KEY:'pk_live_wrongmode'}),503);assert.equal(checkouts,1);
 await decode(await api('checkout/abandon',{sessionId:embedded.sessionId},'owner'),404);await decode(await api('checkout/abandon',{sessionId:embedded.sessionId},'other'));await decode(await api('checkout/abandon',{sessionId:embedded.sessionId},'other'));assert.equal(mutations.filter(item=>item.path.endsWith('/expire')).length,1);
 // After the old session is closed, new checkouts use our own page with Stripe's themed fields.
 const elements=await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'elements'},'other'));assert.deepEqual([elements.mode,elements.sessionId,elements.clientSecret,elements.billingAddress,elements.url],['elements','cs_test_elements','cs_test_elements_secret_fixture',false,undefined]);assert.equal(checkouts,2);
 assert.equal(sql.prepare('SELECT ui_mode FROM arc_billing_checkouts WHERE session_id=?').get('cs_test_elements')!.ui_mode,'elements');
 assert.equal((await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'elements'},'other'))).sessionId,'cs_test_elements');assert.equal(checkouts,2,'Repeated Elements checkout reuses the open session');
 await decode(await api('checkout',{productId:'arc-plus-v1',uiMode:'custom'},'other'),400);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM arc_payment_receipts').get()!.n,0,'Checkout, renewal and payment-method changes do not issue Credits or receipts');assert(!mutations.some(item=>/charges|payment_intents|refunds/.test(item.path)));
 let configured=0;await configureStripePublicKey({GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/master',STRIPE_PUBLISHABLE_KEY:'pk_live_fixture',CLOUDFLARE_API_TOKEN:'fixture'},async(_url:any,init:any)=>{configured++;assert.equal(init.method,'PUT');assert.deepEqual(JSON.parse(init.body),{name:'STRIPE_PUBLISHABLE_KEY',type:'secret_text',text:'pk_live_fixture'});return Response.json({success:true});});assert.equal(configured,1);
 console.log('PASS: native embedded and Elements checkout, replay/frozen mode, CSRF/ownership, canonical invoices, renewal CAS/lost-ack recovery/scheduled-change release, paused management, verified payment methods and no purchase/receipt side effects');
}finally{globalThis.fetch=original;sql.close();}
