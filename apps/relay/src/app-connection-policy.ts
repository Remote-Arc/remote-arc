import { AppError, type AppEnv, type AppOperation, type AppProvider } from "./app-catalog.js";
import { providerHeaders } from "./app-auth-adapters.js";
import { providerJson, unseal, type AppTokens } from "./app-oauth.js";
import { sha256Hex } from "./auth.js";
import type { AppReview } from "./app-review.js";
import {reservePlatformAppFunding} from './app-platform-funding.js';
export async function reserveAppDispatch(env:AppEnv,userId:string,connection:{id:string;generation:number;provider:AppProvider}) {
  await reservePlatformAppFunding(env,userId,connection);
  const day=new Date().toISOString().slice(0,10),max=Number(env.APP_DAILY_PROVIDER_LIMIT||1000);
  if(!Number.isSafeInteger(max)||max<1||max>100000)throw new AppError("app_budget_not_configured",503);
  const result=await env.DB.prepare(`INSERT INTO app_dispatch_usage(connection_id,provider,day,dispatches)
 SELECT ?1,?2,?3,1 WHERE EXISTS(SELECT 1 FROM app_connections WHERE id=?1 AND user_id=?4 AND generation=?5 AND status='active')
 AND COALESCE((SELECT SUM(dispatches) FROM app_dispatch_usage WHERE provider=?2 AND day=?3),0)<?6
 ON CONFLICT(connection_id,day) DO UPDATE SET dispatches=dispatches+1
 WHERE dispatches<(SELECT daily_call_limit FROM app_connections WHERE id=?1 AND user_id=?4 AND generation=?5 AND status='active')
 AND COALESCE((SELECT SUM(dispatches) FROM app_dispatch_usage WHERE provider=?2 AND day=?3),0)<?6 RETURNING dispatches`)
 .bind(connection.id,connection.provider,day,userId,connection.generation,max).first();
  if(!result)throw new AppError("app_daily_limit_reached",429);
}
export function quoteAppOperation(operation:AppOperation,args:any){
 const quote=operation.quote?.(args);
 if(quote&&(!Number.isSafeInteger(quote.estimatedUnits)||quote.estimatedUnits<0||quote.estimatedUnits>quote.maximumApprovedUnits))throw new AppError("app_cost_limit",403);
 return quote;
}
export async function reviewCreatedAction(env:AppEnv,userId:string,connectionId:string,provider:AppProvider,operation:string,args:any):Promise<AppReview|null>{
 if(provider!=="instagram"||operation!=="media.publish")return null;
 const row=await env.DB.prepare("SELECT * FROM app_calls WHERE id=?1 AND user_id=?2 AND connection_id=?3 AND operation='media.create' AND status='succeeded'").bind(args.sourceCallId,userId,connectionId).first<{id:string;arguments_ciphertext:string;result_ciphertext:string}>();
 if(!row)throw new AppError("app_source_action_required",409);
 const input=await unseal<any>(env,row.arguments_ciphertext,`app-call:${userId}:${row.id}:arguments`),result=await unseal<any>(env,row.result_ciphertext,`app-call:${userId}:${row.id}:result`);
 if(result.id!==args.creationId||input.accountId!==args.accountId)throw new AppError("app_source_action_mismatch",409);
 const target={accountId:input.accountId,imageUrl:input.imageUrl,caption:input.caption,creationId:result.id,sourceCallId:row.id};
 return{target,hash:await sha256Hex(JSON.stringify(target))};
}
export async function dispatchHeaders(env:AppEnv,provider:AppProvider,operation:string,args:any,tokens:AppTokens,fetcher:typeof fetch){
 const headers=providerHeaders(provider,tokens,env);
 if(provider==="facebook"&&['posts.create','posts.update','posts.delete','comments.create'].includes(operation)){
  const root="https://graph.facebook.com/"+tokens.context?.graphVersion;
  const page=await providerJson(root+"/"+args.pageId+"?fields=id,name,access_token",{headers},fetcher);
  if(page.id!==args.pageId||typeof page.access_token!=="string")throw new AppError("app_resource_not_authorized",403);
  headers.authorization="Bearer "+page.access_token;
 }
 return headers;
}
export function validateAppResult(provider:AppProvider,operation:string,result:any){
 if(provider==="shopify"&&Object.values(result.data||{}).some((r:any)=>r?.userErrors?.length))throw new AppError("app_provider_rejected",400);
 if(provider==='linear'&&Object.values(result.data||{}).some((value:any)=>value?.success===false))throw new AppError('app_provider_rejected',400);
 if(provider==='google_ads'&&result.partialFailureError?.code)throw new AppError('app_provider_rejected',400);
 if(provider==="runway"&&['videos.generate','images.generate','videos.fromImage'].includes(operation)&&typeof result.id!=="string")throw new AppError("app_invalid_provider_response",502);
}
export function redactProviderCredentials(value:unknown,extraKeys:readonly string[]=[]):unknown{
 if(Array.isArray(value))return value.map(item=>redactProviderCredentials(item,extraKeys));
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([key])=>!["access_token","refresh_token","client_secret","api_key","authorization",...extraKeys].includes(key.toLowerCase())).map(([key,item])=>[key,redactProviderCredentials(item,extraKeys)]));
 return value;
}
