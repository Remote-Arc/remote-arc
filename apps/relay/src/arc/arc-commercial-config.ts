import {z} from 'zod';
import {ARC_PLANS,ARC_TOPUPS,CONNECT_UNLIMITED_PLAN_ID} from '@remotearc/protocol';
import {stripeRequest,stripeId,stripeLive,StripeError,type StripeEnv} from '../billing/stripe-client.js';

export type CommercialEnv=StripeEnv&{DB:D1Database};
export const commercialMode=(env:StripeEnv)=>/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY||'')?'test':'live';
export const planConfigSchema=z.object({
 id:z.enum(['free',CONNECT_UNLIMITED_PLAN_ID,'arc-plus-v1','arc-pro-v1']),label:z.string().trim().min(1).max(40),
 monthlyPriceCents:z.number().int().min(0).max(999900),monthlyCredits:z.number().int().min(0).max(100000),
 connectToolCalls:z.number().int().min(1).max(100000000).nullable(),deviceLimit:z.number().int().min(1).max(1000).nullable(),connectionLimit:z.number().int().min(1).max(5000),
 allHostedModels:z.boolean(),concurrentRuns:z.number().int().min(1).max(50),routines:z.number().int().min(0).max(1000),
 maxSteps:z.number().int().min(1).max(100),maxTokens:z.number().int().min(8000).max(1000000),maxSeconds:z.number().int().min(30).max(86400),
}).strict().refine(p=>p.id==='free'?p.monthlyPriceCents===0&&p.monthlyCredits===0&&!p.allHostedModels
 // Connect-only stays Connect-only: no Credits, no hosted models, explicit unlimited entitlements.
 :p.id===CONNECT_UNLIMITED_PLAN_ID?p.monthlyPriceCents>=100&&p.monthlyCredits===0&&!p.allHostedModels&&p.connectToolCalls===null&&p.deviceLimit===null
 :p.monthlyPriceCents>=100&&p.monthlyCredits>0&&p.allHostedModels&&p.deviceLimit!==null,'Paid plans require a nonzero price and allowance');
export type ArcPlanConfig=z.infer<typeof planConfigSchema>;
const topupConfigSchema=z.object({id:z.literal('arc-topup-500-v1'),credits:z.number().int().min(1).max(100000),priceCents:z.number().int().min(100).max(999900)}).strict();
const trialConfigSchema=z.object({id:z.literal('arc-trial-v1'),days:z.number().int().min(1).max(90),credits:z.number().int().min(1).max(10000)}).strict();
type CommercialConfig=ArcPlanConfig|z.infer<typeof topupConfigSchema>|z.infer<typeof trialConfigSchema>;
export type CommercialRow={id:string;product_id:string;kind:'plan'|'topup'|'trial';mode:'test'|'live';config_json:string;stripe_price_id:string|null;base_revision:number;published_at:string|null;created_at:string;created_by_user_id:string|null};
export function parseCommercialConfig(kind:CommercialRow['kind'],value:unknown){return kind==='plan'?planConfigSchema.parse(value):kind==='topup'?topupConfigSchema.parse(value):trialConfigSchema.parse(value);}
export function decodeCommercial(row:CommercialRow){const config=parseCommercialConfig(row.kind,JSON.parse(row.config_json));if(config.id!==row.product_id)throw new StripeError('BILLING_CONFIGURATION_INVALID');return{...row,config};}
export async function commercialVersion(db:D1Database,id:string){const row=await db.prepare('SELECT * FROM arc_commercial_versions WHERE id=?1 AND published_at IS NOT NULL').bind(id).first<CommercialRow>();if(!row)throw new StripeError('BILLING_CONFIGURATION_NOT_FOUND');return decodeCommercial(row);}
export async function activeCommercial(env:CommercialEnv,productId:string){
 const row=await env.DB.prepare('SELECT v.*,h.revision FROM arc_commercial_heads h JOIN arc_commercial_versions v ON v.id=h.version_id WHERE h.product_id=?1 AND h.mode=?2 AND v.published_at IS NOT NULL').bind(productId,commercialMode(env)).first<CommercialRow&{revision:number}>();
 if(!row)throw new StripeError('BILLING_CONFIGURATION_NOT_FOUND');return{...decodeCommercial(row),revision:row.revision};
}
export async function commercialCatalog(env:CommercialEnv){
 const versions=await Promise.all([...ARC_PLANS.map(p=>p.id),...ARC_TOPUPS.map(p=>p.id),'arc-trial-v1'].map(id=>activeCommercial(env,id)));
 return{plans:versions.filter(v=>v.kind==='plan').map(v=>({...v.config as ArcPlanConfig,deviceLimit:v.product_id==='arc-plus-v1'?10:v.product_id==='free'?2:(v.config as ArcPlanConfig).deviceLimit,versionId:v.id,revision:v.revision})),topups:versions.filter(v=>v.kind==='topup').map(v=>({...v.config as z.infer<typeof topupConfigSchema>,versionId:v.id,revision:v.revision})),trial:versions.find(v=>v.kind==='trial')!.config as z.infer<typeof trialConfigSchema>};
}
export function commercialOffer(version:ReturnType<typeof decodeCommercial>){
 const p=version.config;if('days' in p||'monthlyPriceCents' in p&&p.id==='free')throw new StripeError('BILLING_INVALID_PRODUCT',400);
 return{id:p.id,label:'label' in p?p.label:`${p.credits} Credits`,cents:'monthlyPriceCents' in p?p.monthlyPriceCents:p.priceCents,credits:'monthlyCredits' in p?p.monthlyCredits:p.credits,subscription:'monthlyPriceCents' in p,versionId:version.id};
}
function validateCommercialPrice(price:Record<string,any>,version:ReturnType<typeof decodeCommercial>,active=false){
 const p=commercialOffer(version),legacy=version.id.startsWith('seed:');
 if(price.currency!=='usd'||price.unit_amount!==p.cents||price.tax_behavior!=='exclusive'||active&&price.active===false||
   (p.subscription?price.recurring?.interval!=='month'||price.recurring?.interval_count!==1:Boolean(price.recurring))||
   (legacy?price.lookup_key!=='remote-arc:'+p.id:stripeId(price)!==version.stripe_price_id||price.lookup_key!=='remote-arc:version:'+version.id||price.metadata?.remote_arc_version!==version.id))throw new StripeError('BILLING_CATALOG_CONFLICT');
 return p;
}
export async function approvedCommercialPrice(env:CommercialEnv,price:Record<string,any>){
 const row=await env.DB.prepare('SELECT * FROM arc_commercial_versions WHERE stripe_price_id=?1 AND mode=?2 AND published_at IS NOT NULL').bind(stripeId(price),commercialMode(env)).first<CommercialRow>();
 if(row){const version=decodeCommercial(row);return{...validateCommercialPrice(price,version),version};}
 const sku=String(price.lookup_key||'').replace(/^remote-arc:/,'');
 if(![...ARC_PLANS.map(p=>p.id),...ARC_TOPUPS.map(p=>p.id)].includes(sku as any))throw new StripeError('BILLING_CATALOG_CONFLICT');
 const version=await commercialVersion(env.DB,`seed:${commercialMode(env)}:${sku}`);return{...validateCommercialPrice(price,version),version};
}
async function stripeProduct(env:CommercialEnv,offer:ReturnType<typeof commercialOffer>){
 const id='remote_arc_'+offer.id.replaceAll('-','_');
 try{const p=await stripeRequest(env,'/v1/products/'+id);if(p.metadata?.remote_arc_sku!==offer.id)throw new StripeError('BILLING_CATALOG_CONFLICT');}
 catch(e){if(!(e instanceof StripeError)||e.status!==404)throw e;await stripeRequest(env,'/v1/products','POST',new URLSearchParams({id,name:'Remote Arc '+offer.label,'metadata[remote_arc_sku]':offer.id}),'arc-product:'+offer.id);}
 return id;
}
export async function ensureCommercialPrice(env:CommercialEnv,productId:string,versionId?:string){
 const version=versionId?await commercialVersion(env.DB,versionId):await activeCommercial(env,productId),offer=commercialOffer(version);
 if(version.mode!==commercialMode(env)||version.product_id!==productId)throw new StripeError('BILLING_CONFIGURATION_CONFLICT');
 if(version.stripe_price_id){validateCommercialPrice(await stripeRequest(env,'/v1/prices/'+version.stripe_price_id),version,true);return version.stripe_price_id;}
 if(!version.id.startsWith('seed:'))throw new StripeError('BILLING_CATALOG_CONFLICT');
 const prices=await stripeRequest(env,'/v1/prices?'+new URLSearchParams({'lookup_keys[]':'remote-arc:'+productId,active:'true',limit:'2'}));
 if(prices.has_more||prices.data?.length>1)throw new StripeError('BILLING_CATALOG_CONFLICT');
 if(prices.data?.length){validateCommercialPrice(prices.data[0],version,true);return stripeId(prices.data[0]);}
 const product=await stripeProduct(env,offer),params=new URLSearchParams({product,currency:'usd',unit_amount:String(offer.cents),lookup_key:'remote-arc:'+offer.id,tax_behavior:'exclusive','metadata[remote_arc_sku]':offer.id,...(offer.subscription?{'recurring[interval]':'month'}:{})});
 const price=await stripeRequest(env,'/v1/prices','POST',params,'arc-price:'+offer.id);validateCommercialPrice(price,version,true);return stripeId(price);
}
export async function saveCommercialDraft(env:CommercialEnv,actorId:string,input:{id:string;kind:CommercialRow['kind'];config:unknown;revision:number}){
 const config=parseCommercialConfig(input.kind,input.config),mode=commercialMode(env),current=await activeCommercial(env,config.id);
 const existing=await env.DB.prepare('SELECT * FROM arc_commercial_versions WHERE id=?1').bind(input.id).first<CommercialRow>();
 if(existing){if(existing.created_by_user_id!==actorId||existing.mode!==mode||existing.config_json!==JSON.stringify(config)||existing.base_revision!==input.revision)throw new StripeError('BILLING_CONFIGURATION_CONFLICT',409);return decodeCommercial(existing);}
 if(current.revision!==input.revision)throw new StripeError('BILLING_CONFIGURATION_CHANGED',409);
 const at=new Date().toISOString();await env.DB.batch([
  env.DB.prepare('INSERT INTO arc_commercial_versions(id,product_id,kind,mode,config_json,base_revision,created_by_user_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)').bind(input.id,config.id,input.kind,mode,JSON.stringify(config),input.revision,actorId,at),
  env.DB.prepare('INSERT INTO arc_commercial_audit VALUES(?1,?2,\'draft_created\',?3,?4,?5,?6)').bind(crypto.randomUUID(),actorId,input.id,mode,JSON.stringify({productId:config.id,revision:input.revision}),at),
 ]);return{id:input.id,config};
}
export async function publishCommercialDraft(env:CommercialEnv,actorId:string,id:string){
 const row=await env.DB.prepare('SELECT * FROM arc_commercial_versions WHERE id=?1 AND mode=?2').bind(id,commercialMode(env)).first<CommercialRow>();if(!row)throw new StripeError('BILLING_CONFIGURATION_NOT_FOUND',404);
 if(row.published_at)return{id,published:true};
 const version=decodeCommercial(row),current=await activeCommercial(env,row.product_id);if(current.revision!==row.base_revision)throw new StripeError('BILLING_CONFIGURATION_CHANGED',409);
 let priceId:string|null=null;
 if(row.kind==='topup'||row.kind==='plan'&&row.product_id!=='free'){
  stripeLive(env);const offer=commercialOffer(version),product=await stripeProduct(env,offer);
  const price=await stripeRequest(env,'/v1/prices','POST',new URLSearchParams({product,currency:'usd',unit_amount:String(offer.cents),lookup_key:'remote-arc:version:'+id,tax_behavior:'exclusive','metadata[remote_arc_version]':id,'metadata[remote_arc_sku]':offer.id,...(offer.subscription?{'recurring[interval]':'month'}:{})}),'arc-commercial-price:'+id);
  priceId=stripeId(price);validateCommercialPrice(price,{...version,stripe_price_id:priceId},true);
 }
 const at=new Date().toISOString();const result=await env.DB.batch([
  env.DB.prepare('UPDATE arc_commercial_heads SET version_id=?1,revision=revision+1 WHERE product_id=?2 AND mode=?3 AND revision=?4').bind(id,row.product_id,row.mode,row.base_revision),
  env.DB.prepare('UPDATE arc_commercial_versions SET stripe_price_id=?1,published_at=?2 WHERE id=?3 AND published_at IS NULL AND EXISTS(SELECT 1 FROM arc_commercial_heads WHERE version_id=?3)').bind(priceId,at,id),
  env.DB.prepare("INSERT INTO arc_commercial_audit SELECT ?1,?2,'published',?3,?4,?5,?6 WHERE EXISTS(SELECT 1 FROM arc_commercial_heads WHERE version_id=?3)").bind(crypto.randomUUID(),actorId,id,row.mode,JSON.stringify({previousVersion:current.id,revision:current.revision+1}),at),
 ]);
 if(!result[0]?.meta.changes)throw new StripeError('BILLING_CONFIGURATION_CHANGED',409);
 return{id,published:true};
}
