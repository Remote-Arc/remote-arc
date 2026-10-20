import assert from 'node:assert/strict';
import {billingRequest,secureBillingUrl,BillingFailure} from '../src/arc-billing-client.js';
const original=globalThis.fetch;let requests=0;
try{
 globalThis.fetch=(async(path,init)=>{requests++;assert.equal(path,'/api/billing/checkout');assert.equal(init?.credentials,'same-origin');assert.deepEqual(JSON.parse(String(init?.body)),{productId:'plus',versionId:'version-reviewed'});return Response.json({error:'BILLING_PROVIDER_ERROR',reference:'req_safe_reference'},{status:503});}) as typeof fetch;
 await assert.rejects(()=>billingRequest('checkout',{productId:'plus',versionId:'version-reviewed'}),(error:any)=>error instanceof BillingFailure&&error.reference==='req_safe_reference');assert.equal(requests,1,'A provider failure does not trigger an automatic POST retry');
 for(const value of ['https://checkout.stripe.com.evil.invalid/a','https://checkout.stripe.com@evil.invalid/a','http://checkout.stripe.com/a','javascript:alert(1)','https://user:password@checkout.stripe.com/a'])assert.throws(()=>secureBillingUrl(value));
 assert.equal(secureBillingUrl('https://checkout.stripe.com/c/pay/synthetic'),'https://checkout.stripe.com/c/pay/synthetic');assert.equal(secureBillingUrl('https://billing.stripe.com/p/session/synthetic'),'https://billing.stripe.com/p/session/synthetic');
 console.log('PASS: reviewed price version, same-origin billing, safe request references, no automatic POST replay and exact Stripe redirect hosts');
}finally{globalThis.fetch=original;}
