import { z } from "zod";
import { APP_CATALOG, AppError, type AppContext, type AppEnv, type AppProvider } from "./app-catalog.js";
import { providerJson, type AppTokens } from "./app-oauth.js";
import { sha256Hex } from "../auth/auth.js";
export const connectionSettingsSchema=z.object({shopDomain:z.string().max(100).optional(),businessAccountId:z.string().regex(/^\d{1,30}$/).optional(),phoneNumberId:z.string().regex(/^\d{1,30}$/).optional()}).strict();
export function appConfigured(env:AppEnv,provider:AppProvider) {
  const def=APP_CATALOG[provider],vars=env as Record<string,unknown>;
  return Boolean(env.APP_TOKEN_KEY && (!def.requiredEnv?.some(key=>!vars[key])) && (def.auth==="api_key" || (vars["APP_"+def.credential+"_CLIENT_ID"]&&vars["APP_"+def.credential+"_CLIENT_SECRET"])));
}
export function connectionContext(env:AppEnv,provider:AppProvider,raw:unknown={}):AppContext {
  const settings=connectionSettingsSchema.parse(raw),context:AppContext={};
  if(provider==="shopify"){
    const domain=settings.shopDomain?.toLowerCase().trim();
    if(!domain||!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))throw new AppError("app_shop_domain_required");
    context.shopDomain=domain;
  }else if(settings.shopDomain)throw new AppError("invalid_app_settings");
  if(["facebook","instagram","meta_ads","whatsapp"].includes(provider)){
    if(!/^v\d{2,3}\.0$/.test(env.APP_META_GRAPH_VERSION||""))throw new AppError("app_not_configured",503);
    context.graphVersion=env.APP_META_GRAPH_VERSION;
  }
  if(provider==="whatsapp"){
    if(!settings.businessAccountId||!settings.phoneNumberId)throw new AppError("app_whatsapp_settings_required");
    context.businessAccountId=settings.businessAccountId;context.phoneNumberId=settings.phoneNumberId;
  }else if(settings.businessAccountId||settings.phoneNumberId)throw new AppError("invalid_app_settings");
  return context;
}
export function endpoint(template:string,context:AppContext={}){
  return template.replace("{version}",context.graphVersion||"").replaceAll("{shopDomain}",context.shopDomain||"");
}
export function providerHeaders(provider:AppProvider,tokens:AppTokens,env?:AppEnv):Record<string,string>{
  const headers:Record<string,string>={authorization:"Bearer "+tokens.accessToken,accept:"application/json","content-type":"application/json","user-agent":"Remote-Arc-Apps"};
  if(provider==="notion")headers["notion-version"]="2025-09-03";
  if(provider==="runway")headers["x-runway-version"]="2024-11-06";
  if(provider==="linkedin"){headers["linkedin-version"]="202609";headers["x-restli-protocol-version"]="2.0.0";}
  if(provider==="shopify"){delete headers.authorization;headers["x-shopify-access-token"]=tokens.accessToken;}
  if(provider==="google_ads"&&env?.APP_GOOGLE_ADS_DEVELOPER_TOKEN)headers["developer-token"]=env.APP_GOOGLE_ADS_DEVELOPER_TOKEN;
  return headers;
}
export function normalizeScope(scope:string,provider?:AppProvider) { if(provider&&APP_CATALOG[provider].credential!=="GOOGLE")return scope; return scope==="email"?"https://www.googleapis.com/auth/userinfo.email":scope==="profile"?"https://www.googleapis.com/auth/userinfo.profile":scope; }
export async function extraIdentity(provider:AppProvider,tokens:AppTokens,fetcher:typeof fetch,env?:AppEnv):Promise<{id:string;label:string}|null>{
  const def=APP_CATALOG[provider],headers=providerHeaders(provider,tokens,env);
  const get=(url:string)=>providerJson(url,{headers},fetcher);
  if(provider==='dropbox'){
    const result=await providerJson('https://api.dropboxapi.com/2/users/get_current_account',{method:'POST',headers,body:'null'},fetcher);
    if(typeof result.account_id!=='string'||!result.account_id)throw new AppError('app_identity_unavailable',502);
    return{id:result.account_id,label:result.email||result.name?.display_name||result.account_id};
  }
  if(provider==='asana'){
    const result=await get('https://app.asana.com/api/1.0/users/me');
    if(typeof result.data?.gid!=='string'||!result.data.gid)throw new AppError('app_identity_unavailable',502);
    return{id:result.data.gid,label:result.data.email||result.data.name||result.data.gid};
  }
  if(provider==='airtable'){
    const result=await get('https://api.airtable.com/v0/meta/whoami');
    if(typeof result.id!=='string'||!result.id.startsWith('usr')||!Array.isArray(result.scopes)||result.scopes.some((scope:unknown)=>typeof scope!=='string'))throw new AppError('app_identity_unavailable',502);
    tokens.scopes=result.scopes;
    return{id:result.id,label:result.email||'Airtable '+result.id};
  }
  if(!["github","slack","gmail","outlook","google_calendar","microsoft_calendar"].includes(provider)&&def.credential==="GOOGLE"){
    const r=await get("https://www.googleapis.com/oauth2/v3/userinfo");if(!r.sub||!r.email)throw new AppError("app_identity_unavailable",502);
    return{id:r.sub,label:r.email};
  }
  if(def.credential==="META"){
    const root="https://graph.facebook.com/"+tokens.context?.graphVersion;
    const r=await get(root+"/me?fields=id,name"),grants=await get(root+"/me/permissions");
    if(!r.id||!Array.isArray(grants.data))throw new AppError("app_identity_unavailable",502);
    tokens.scopes=grants.data.filter((p:any)=>p.status==="granted").map((p:any)=>p.permission);
    return{id:r.id,label:r.name||r.id};
  }
  if(def.credential==="ATLASSIAN"){
    const r=await get("https://api.atlassian.com/me"),resources=await get("https://api.atlassian.com/oauth/token/accessible-resources");
    if(!r.account_id||!Array.isArray(resources))throw new AppError("app_identity_unavailable",502);
    tokens.scopes=[...new Set([...tokens.scopes,...resources.flatMap((s:any)=>Array.isArray(s.scopes)?s.scopes:[])])];
    tokens.context={...tokens.context,cloudIds:resources.filter((s:any)=>Array.isArray(s.scopes)&&s.scopes.some((v:string)=>v.includes(provider==="jira"?"jira":"confluence"))).map((s:any)=>s.id)};
    if(!tokens.context.cloudIds?.length)throw new AppError("app_resource_not_authorized",403);
    return{id:r.account_id,label:r.name||r.email||r.account_id};
  }
  if(provider==="notion"){
    const r=await get("https://api.notion.com/v1/users/me");if(!r.id||!r.bot)throw new AppError("app_identity_unavailable",502);
    return{id:r.bot.workspace_id||r.id,label:r.bot.workspace_name||r.name||"Notion workspace"};
  }
  if(provider==="linkedin"){
    const r=await get("https://api.linkedin.com/v2/userinfo");if(!r.sub)throw new AppError("app_identity_unavailable",502);
    tokens.context={...tokens.context,subjectId:r.sub};return{id:r.sub,label:r.name||r.email||r.sub};
  }
  if(provider==="salesforce"){
    const origin=tokens.context?.instanceOrigin;if(!origin)throw new AppError("app_identity_unavailable",502);
    const u=new URL(origin);if(u.protocol!=="https:"||!u.hostname.endsWith(".salesforce.com")||u.pathname!=="/"||u.port||u.username||u.password)throw new AppError("app_identity_unavailable",502);
    const r=await get(u.origin+"/services/oauth2/userinfo");if(!r.user_id||!r.organization_id)throw new AppError("app_identity_unavailable",502);
    return{id:r.organization_id+":"+r.user_id,label:r.preferred_username||r.name||r.user_id};
  }
  if(provider==="hubspot"){
    if(!env)throw new AppError("app_not_configured",503);
    const form=new URLSearchParams({token_type_hint:"access_token",access_token:tokens.accessToken,client_id:env.APP_HUBSPOT_CLIENT_ID||"",client_secret:env.APP_HUBSPOT_CLIENT_SECRET||""});
    const r=await providerJson("https://api.hubapi.com/oauth/v3/token/introspect",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form},fetcher);
    if(r.active!==true||!(r.hub_id||r.hubId))throw new AppError("app_identity_unavailable",502);
    if(Array.isArray(r.scopes))tokens.scopes=r.scopes;else if(typeof r.scope==="string")tokens.scopes=r.scope.split(" ");
    return{id:String(r.hub_id||r.hubId),label:r.user||r.hub_domain||"HubSpot "+(r.hub_id||r.hubId)};
  }
  if(provider==="shopify"){
    const domain=tokens.context?.shopDomain;if(!domain||!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))throw new AppError("app_identity_unavailable",502);
    const r=await providerJson("https://"+domain+"/admin/api/2026-07/graphql.json",{method:"POST",headers,body:JSON.stringify({query:"query { shop { id name myshopifyDomain } }"})},fetcher);
    if(!r.data?.shop?.id||r.data.shop.myshopifyDomain!==domain)throw new AppError("app_identity_unavailable",502);
    return{id:r.data.shop.id,label:r.data.shop.name||domain};
  }
  if(provider==="vercel"&&tokens.context?.vercelConfigurationId){
    const context=tokens.context,url=new URL("https://api.vercel.com/v1/integrations/configuration/"+encodeURIComponent(context.vercelConfigurationId!));
    if(context.vercelTeamId)url.searchParams.set("teamId",context.vercelTeamId);
    const r=await get(url.href);
    if(r.id!==context.vercelConfigurationId||(r.teamId||undefined)!==context.vercelTeamId)throw new AppError("app_resource_not_authorized",403);
    return{id:r.id,label:context.vercelTeamId?"Vercel team "+context.vercelTeamId:"Vercel integration "+r.id};
  }
  if(provider==="vercel"){const r=await get("https://api.vercel.com/v2/user");if(!r.user?.id)throw new AppError("app_identity_unavailable",502);return{id:r.user.id,label:r.user.email||r.user.username||r.user.id};}
  if(provider==="linear"){const r=await providerJson("https://api.linear.app/graphql",{method:"POST",headers,body:JSON.stringify({query:"query { viewer { id name email } }"})},fetcher);if(!r.data?.viewer?.id)throw new AppError("app_identity_unavailable",502);return{id:r.data.viewer.id,label:r.data.viewer.email||r.data.viewer.name||r.data.viewer.id};}
  if(provider==="x"){const r=await get("https://api.x.com/2/users/me");if(!r.data?.id)throw new AppError("app_user_token_required",403);tokens.context={...tokens.context,subjectId:r.data.id};return{id:r.data.id,label:r.data.username||r.data.name||r.data.id};}
  if(provider==="runway"){const r=await get("https://api.dev.runwayml.com/v1/organization");if(typeof r.creditBalance!=="number"||!Number.isFinite(r.creditBalance))throw new AppError("app_identity_unavailable",502);return{id:"api-key:"+(await sha256Hex(tokens.accessToken)).slice(0,24),label:"Runway API organization"};}
  if(provider==="supabase"){const r=await get("https://api.supabase.com/v1/organizations");if(!Array.isArray(r)||!r.length||r.some(org=>typeof org.id!=="string"||!org.id))throw new AppError("app_identity_unavailable",502);const ids=[...new Set<string>(r.map(org=>org.id))].sort();tokens.context={...tokens.context,supabaseOrganizationIds:ids};return{id:"oauth:"+(await sha256Hex(JSON.stringify(ids))).slice(0,24),label:r.length===1?(r[0].name||"Supabase organization"):"Supabase · "+ids.length+" organizations"};}
  if(provider==="whatsapp"){
    const context=tokens.context;if(!context?.businessAccountId||!context.phoneNumberId||!context.graphVersion)throw new AppError("app_whatsapp_settings_required");
    const r=await get("https://graph.facebook.com/"+context.graphVersion+"/"+context.businessAccountId+"/phone_numbers");
    const phone=r.data?.find((p:any)=>p.id===context.phoneNumberId);if(!phone)throw new AppError("app_resource_not_authorized",403);
    return{id:context.businessAccountId+":"+phone.id,label:phone.display_phone_number||phone.verified_name||phone.id};
  }
  return null;
}
export async function checkShopifyCallback(request:Request,env:AppEnv,context:AppContext){
  const q=new URL(request.url).searchParams;
  if(q.get("shop")!==context.shopDomain||!q.get("hmac"))throw new AppError("invalid_shopify_callback",403);
  const params=new URLSearchParams(q);params.delete("hmac");params.delete("signature");params.sort();
  const raw=[...params.entries()].map(([k,v])=>k+"="+v).join("&");
  const secret=env.APP_SHOPIFY_CLIENT_SECRET;if(!secret)throw new AppError("app_not_configured",503);
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
  const expected=Array.from(signature,b=>b.toString(16).padStart(2,"0")).join(""),actual=q.get("hmac")!;
  let mismatch=actual.length^expected.length;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^(actual.charCodeAt(i)||0);
  if(mismatch)throw new AppError("invalid_shopify_callback",403);
}
