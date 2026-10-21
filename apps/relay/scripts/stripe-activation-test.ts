import assert from 'node:assert/strict';
import {activateStripe,stripeBillingEvents} from '../../../scripts/activate-stripe.mjs';
import {waitRuntimeReady} from '../../../scripts/wait-runtime-ready.mjs';
import {ensureStripePaymentDomain} from '../../../scripts/stripe-payment-domain.mjs';
const env={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/master',GITHUB_ACTOR:'yaohuangguan',STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',CLOUDFLARE_API_TOKEN:'worker-fixture'};
const noWait=async()=>{};
let calls:Array<{url:string;method:string}>=[],secrets:string[]=[],readyReads=0,fullyReadyAfter=1;
let account={country:'NZ',charges_enabled:true,payouts_enabled:true,details_submitted:true};
let endpoint={url:'https://agent.remotearc.app/api/billing/webhook',status:'enabled',api_version:'2026-09-30.endive',enabled_events:[...stripeBillingEvents]};
const fetcher=async(url:string,init?:RequestInit)=>{
 const method=init?.method||'GET',auth=new Headers(init?.headers).get('authorization');calls.push({url,method});
 if(url.startsWith('https://api.stripe.com/')){
  assert.equal(method,'GET','Provisioning must never create charges, refunds, subscriptions or customer messages');assert.equal(auth,'Bearer sk_live_fixture');
  if(url.endsWith('/account'))return Response.json(account);
  if(url.includes('/payment_method_domains?'))return Response.json({has_more:false,data:[{id:'pmd_fixture',domain_name:'agent.remotearc.app',livemode:true,enabled:true,apple_pay:{status:'active'},link:{status:'active'},google_pay:{status:'active'}}]});
  assert(url.endsWith('/webhook_endpoints?limit=100'));return Response.json({has_more:false,data:[endpoint]});
 }
 if(url.startsWith('https://api.cloudflare.com/')){
  assert.equal(method,'PUT');assert.equal(auth,'Bearer worker-fixture');assert(url.endsWith('/workers/scripts/remote-link-relay/secrets'));
  const secret=JSON.parse(init!.body as string);assert(['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'].includes(secret.name));assert.equal(secret.text,env[secret.name as keyof typeof env]);secrets.push(secret.name);return Response.json({success:true,result:{}});
 }
 assert.equal(url,'https://agent.remotearc.app/api/runtime-config');assert.equal(method,'GET');assert.equal(auth,null);
 readyReads++;return Response.json({arcAvailable:true,billingAvailable:secrets.length===2&&readyReads>=fullyReadyAfter});
};
await assert.rejects(()=>activateStripe({...env,GITHUB_REF:'refs/heads/not-master'},fetcher,noWait),/Protected/);assert.equal(calls.length,0);
await assert.rejects(()=>activateStripe({...env,STRIPE_SECRET_KEY:'sk_test_fixture'},fetcher,noWait),/Live/);assert.equal(calls.length,0);
account.charges_enabled=false;await assert.rejects(()=>activateStripe(env,fetcher,noWait),/incomplete/);assert.equal(secrets.length,0);account.charges_enabled=true;
account.details_submitted=false;await assert.rejects(()=>activateStripe(env,fetcher,noWait),/incomplete/);assert.equal(secrets.length,0);account.details_submitted=true;
account.country='US';await assert.rejects(()=>activateStripe(env,fetcher,noWait),/incomplete/);assert.equal(secrets.length,0);account.country='NZ';
endpoint.enabled_events=['invoice.paid'];await assert.rejects(()=>activateStripe(env,fetcher,noWait),/webhook/);assert.equal(secrets.length,0);endpoint.enabled_events=[...stripeBillingEvents];
// Receiving payments does not require bank payouts to be enabled. Stripe still
// controls charges_enabled; missing payouts never authorizes bypassing it.
account.payouts_enabled=false;
calls=[];readyReads=0;fullyReadyAfter=4;await activateStripe(env,fetcher,noWait);
assert.deepEqual(secrets,['STRIPE_WEBHOOK_SECRET','STRIPE_SECRET_KEY']);assert.equal(readyReads,4,'Wait for secret propagation without retrying monetary operations');
assert.equal(calls.filter(call=>call.url.startsWith('https://api.stripe.com/')).length,3);
assert.equal(calls.filter(call=>call.method!=='GET').length,2,'Only the two Worker Secret writes mutate external state');
calls=[];secrets=[];readyReads=0;fullyReadyAfter=1;account.payouts_enabled=true;
await activateStripe(env,fetcher,noWait);assert.deepEqual(secrets,['STRIPE_WEBHOOK_SECRET','STRIPE_SECRET_KEY']);
let tries=0,waits=0;
const delayed=await waitRuntimeReady(async()=>{tries++;return tries===1?new Response('old deployment'):Response.json({arcAvailable:tries>2});},state=>state.arcAvailable===true,async()=>{waits++;});
assert.equal(delayed.arcAvailable,true);assert.equal(tries,3);assert.equal(waits,2);
await assert.rejects(()=>waitRuntimeReady(async()=>Response.json({arcAvailable:false}),state=>state.arcAvailable===true,noWait),/readiness/);
let domain:any=null,domainWrites=0;
const domainFetcher=async(url:string,init?:RequestInit)=>{
 assert(url.startsWith('https://api.stripe.com/v1/payment_method_domains'));assert.equal(new Headers(init?.headers).get('authorization'),'Bearer sk_live_fixture');
 if((init?.method||'GET')==='GET')return Response.json({has_more:false,data:domain?[domain]:[]});
 domainWrites++;assert(new Headers(init?.headers).get('idempotency-key'));
 if(url.endsWith('/payment_method_domains')){assert.equal(new URLSearchParams(init?.body as string).get('domain_name'),'agent.remotearc.app');domain={id:'pmd_fixture',domain_name:'agent.remotearc.app',livemode:true,enabled:true,apple_pay:{status:'inactive'},link:{status:'active'}};}
 else if(url.endsWith('/validate'))domain.apple_pay.status='active';
 else{assert(url.endsWith('/pmd_fixture'));domain.enabled=true;}
 return Response.json(domain);
};
const wallets=await ensureStripePaymentDomain(env,'2026-09-30.endive',domainFetcher);assert.equal(wallets.applePay,'active');assert.equal(domainWrites,2,'Register and validate only our payment domain');
await ensureStripePaymentDomain(env,'2026-09-30.endive',domainFetcher);assert.equal(domainWrites,2,'Existing active domain requires no write');
domain.enabled=false;await ensureStripePaymentDomain(env,'2026-09-30.endive',domainFetcher);assert.equal(domainWrites,3);
domain.domain_name='unrelated.example';await assert.rejects(()=>ensureStripePaymentDomain(env,'2026-09-30.endive',domainFetcher),/identity/);assert.equal(domainWrites,3);
domain.domain_name='agent.remotearc.app';domain.livemode=false;await assert.rejects(()=>ensureStripePaymentDomain(env,'2026-09-30.endive',domainFetcher),/identity/);assert.equal(domainWrites,3);
await assert.rejects(()=>ensureStripePaymentDomain({...env,GITHUB_ACTOR:'other'},'2026-09-30.endive',domainFetcher),/Protected/);
console.log('PASS: protected live-only Stripe activation, NZ onboarding, complete endpoint, credential separation, no charges/customer writes and bounded readiness propagation');
