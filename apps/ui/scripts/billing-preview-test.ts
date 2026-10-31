import assert from 'node:assert/strict';
import {createBillingPreview} from '../src/preview/billing-preview.js';
const memory=new Map<string,string>(),storage={getItem:(key:string)=>memory.get(key)||null,setItem:(key:string,value:string)=>{memory.set(key,value);}};
const origin='https://preview.example.invalid';let demo=createBillingPreview(storage,new URL('/checkout?demo=new',origin));
const call=async(path:string,body?:unknown)=>{const response=demo.handle(new URL('/api/billing'+path,origin),body===undefined?'GET':'POST',body===undefined?undefined:JSON.stringify(body));assert(response);return{status:response.status,value:await response.json() as any};};
const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('A billing preview must not contact a provider');};
try{
 const offers=(await call('')).value;assert.equal(offers.plan.monthlyPriceCents,0);const selected=offers.plans.find((p:any)=>p.monthlyPriceCents>0);
 const order=(await call('/checkout',{productId:selected.id})).value;assert.equal((await call('/checkout',{productId:selected.id})).value.sessionId,order.sessionId,'Preview clicks reuse one order');
 await call('/preview/complete',{sessionId:order.sessionId});await call('/preview/complete',{sessionId:order.sessionId});
 demo=createBillingPreview(storage,new URL('/checkout?checkout=success',origin));assert.equal((await call('/checkout-status?session='+order.sessionId)).value.status,'complete','Simulated completion survives the payment return');assert.equal((await call('')).value.plan.id,selected.id);
 assert.equal((await call('/subscription/renewal',{action:'cancel',revision:0})).status,200);assert.equal((await call('/subscription/renewal',{action:'resume',revision:0})).status,409);assert.equal((await call('/subscription/renewal',{action:'resume',revision:1})).status,200);
 await call('/payment-method/confirm',{setupIntentId:'seti_preview'});assert.equal((await call('/details')).value.paymentMethod.last4,'1881');
 assert.equal(demo.handle(new URL('/api/billing/portal',origin),'POST','{}'),null,'Unsupported actions stay blocked by the existing preview boundary');
 const isolated=createBillingPreview({getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');}},new URL('/checkout',origin));assert.equal(isolated.handle(new URL('/api/billing',origin),'GET',undefined)?.status,200);
 console.log('PASS: isolated billing preview, checkout replay/return persistence, renewal revisions, simulated card updates and no provider calls');
}finally{globalThis.fetch=original;}
