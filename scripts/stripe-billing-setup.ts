import {spawnSync} from 'node:child_process';
import {ARC_PLANS,ARC_TOPUPS} from '../packages/protocol/src/index.js';

// Bootstrap only: ongoing prices, allowances and promotions are published from Admin → Payments into D1.
// Authentication stays in Stripe CLI's credential store. Never read or print its keys.
const args=process.argv.slice(2),configure=args.includes('--configure');
const expected=args[args.indexOf('--account')+1];
if(!args.includes('--account')||!/^acct_[A-Za-z0-9]+$/.test(expected??''))throw Error('Pass --account acct_... to bind setup to the intended Stripe sandbox.');
if(args.includes('--live'))throw Error('This helper configures sandboxes only. Live activation uses the reviewed owner setup workflow.');
const cli=process.env.STRIPE_CLI||'stripe';
const version='2026-09-30.endive';
function request(method:'get'|'post',path:string,values:Record<string,string|number|boolean>={},key?:string){
  const command=[method,path,'--stripe-version',version,'--color','off'];
  for(const [name,value]of Object.entries(values))command.push('-d',`${name}=${value}`);
  if(key)command.push('--idempotency',key);
  const result=spawnSync(cli,command,{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024});
  // Output may contain a newly created webhook secret. It must never be logged.
  if(result.error||result.status!==0)throw Error(`Stripe CLI ${method} ${path.split('?')[0]} failed. Inspect permissions in the Dashboard; no provider response was logged.`);
  let value;try{value=JSON.parse(result.stdout);}catch{throw Error('Stripe CLI did not return JSON.');}
  if(value.error)throw Error('Stripe rejected the setup request. No provider response was logged.');
  return value;
}
const account=request('get','/v1/account');
if(account.id!==expected)throw Error('Stripe account mismatch. Switch to the intended sandbox before continuing.');
const balance=request('get','/v1/balance');
if(balance.livemode!==false)throw Error('This helper only accepts a verified sandbox balance.');
const products=[...ARC_PLANS.filter(p=>p.monthlyPriceCents>0).map(p=>({id:p.id,name:p.label,cents:p.monthlyPriceCents,recurring:true})),...ARC_TOPUPS.map(p=>({id:p.id,name:`${p.credits} Credits`,cents:p.priceCents,recurring:false}))];
const catalog:Array<{sku:string;priceId:string|null;ready:boolean}>=[];
for(const p of products){
  const lookup='remote-arc:'+p.id;
  let prices=request('get','/v1/prices',{'lookup_keys[]':lookup,active:true,limit:2});
  if(prices.has_more||prices.data.length>1)throw Error('Duplicate Stripe catalog lookup key.');
  if(!prices.data.length&&configure){
    const productId='remote_arc_'+p.id.replaceAll('-','_');
    const found=request('get','/v1/products',{limit:100});
    const existing=found.data.find((item:any)=>item.id===productId);
    if(found.has_more&&!existing)throw Error('Product pagination needs operator review before creation.');
    if(existing&&existing.metadata?.remote_arc_sku!==p.id)throw Error('Product metadata conflicts with the Arc catalog.');
    if(!existing)request('post','/v1/products',{id:productId,name:'Remote Arc '+p.name,'metadata[remote_arc_sku]':p.id},'arc-product:'+p.id);
    const price=request('post','/v1/prices',{product:productId,currency:'usd',unit_amount:p.cents,lookup_key:lookup,tax_behavior:'exclusive','metadata[remote_arc_sku]':p.id,...(p.recurring?{'recurring[interval]':'month'}:{})},'arc-price:'+p.id);
    prices={data:[price]};
  }
  const price=prices.data[0];
  if(price&&(price.livemode!==false||price.currency!=='usd'||price.unit_amount!==p.cents||price.tax_behavior!=='exclusive'||price.lookup_key!==lookup||(p.recurring?price.recurring?.interval!=='month'||price.recurring?.interval_count!==1:Boolean(price.recurring))))throw Error('Stripe price differs from the shared Arc offer.');
  catalog.push({sku:p.id,priceId:price?.id??null,ready:Boolean(price)});
}
const portals=request('get','/v1/billing_portal/configurations',{active:true,limit:100});
let portal=portals.data.find((p:any)=>p.metadata?.remote_arc==='billing-v1');
if(!portal&&portals.has_more)throw Error('Portal pagination needs operator review.');
if(!portal&&configure)portal=request('post','/v1/billing_portal/configurations',{
  'business_profile[headline]':'Remote Arc billing','business_profile[privacy_policy_url]':'https://remotearc.app/privacy','business_profile[terms_of_service_url]':'https://remotearc.app/terms','metadata[remote_arc]':'billing-v1',
  'features[payment_method_update][enabled]':true,'features[invoice_history][enabled]':true,'features[subscription_cancel][enabled]':true,'features[subscription_cancel][mode]':'at_period_end','features[subscription_update][enabled]':false,
},'arc-portal-v1');
const hooks=request('get','/v1/webhook_endpoints',{limit:100});
console.log(JSON.stringify({mode:'sandbox',changed:configure,account:{id:account.id,country:account.country,defaultCurrency:account.default_currency,businessType:account.business_type,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,detailsSubmitted:account.details_submitted},catalog,portal:{id:portal?.id??null,ready:Boolean(portal)},webhooks:hooks.data.map((h:any)=>({id:h.id,url:h.url,status:h.status,apiVersion:h.api_version})),note:'Sandbox catalog readiness does not verify live activation, checkout payment, webhook delivery or payouts. No customer was charged.'},null,2));
