import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path"; import {fileURLToPath} from "node:url"; import {DatabaseSync} from "node:sqlite"; import {z} from "zod";
import {APP_CATALOG,APP_OPERATIONS,APP_CATEGORIES,APP_PROVIDERS,AppError,appScopes,appOperation,type AppEnv,type AppProvider} from "../src/app-catalog.js";
import {EXTRA_PROVIDER_IDS} from "../src/app-integrations.js";
import {authorizationUrl,exchangeTokens,providerIdentity,providerJson,revokeProvider,seal,unseal,type AppTokens} from "../src/app-oauth.js";
import {connectionContext,appConfigured,providerHeaders,endpoint,checkShopifyCallback,extraIdentity,normalizeScope} from "../src/app-auth-adapters.js";
import {reserveAppDispatch,quoteAppOperation,reviewCreatedAction,dispatchHeaders,validateAppResult,redactProviderCredentials} from "../src/app-connection-policy.js";
import {discoverApps,appDiscoverySchema} from "../src/app-discovery.js";
import {callApp,handleApps,listApps} from "../src/apps.js";import {sha256Hex} from "../src/auth.js";import {registrationPack} from "./apps-registration.js";
const sql=new DatabaseSync(":memory:");sql.exec("PRAGMA foreign_keys=ON");
const migrations=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../migrations");
for(const file of fs.readdirSync(migrations).filter(v=>v.endsWith(".sql")).sort())sql.exec(fs.readFileSync(path.join(migrations,file),"utf8"));
const db={prepare(query:string){const stmt=sql.prepare(query);const b=(values:any[])=>({async first(){return stmt.get(...values)||null;},async all(){return{results:stmt.all(...values)};},async run(){const r=stmt.run(...values);return{success:true,meta:{changes:Number(r.changes)}};}});return{...b([]),bind(...values:any[]){assert(!values.includes(undefined),query);return b(values);}};}} as unknown as D1Database;
const origin="https://mcp.remotearc.app",uuid="11111111-1111-4111-8111-111111111111",stamp=new Date().toISOString(),future=new Date(Date.now()+3600000).toISOString();
for(const user of ["one","two"]){sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'user',?)").run(user,user,user+"@example.invalid",stamp);sql.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(await sha256Hex("session-"+user),user,future,stamp);}
const env:AppEnv={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,ENABLE_APPS:"1",APP_TOKEN_KEY:Buffer.alloc(32,7).toString("base64"),APP_META_GRAPH_VERSION:"v26.0",APP_GOOGLE_ADS_DEVELOPER_TOKEN:"operator-ads-token"};
for(const def of Object.values(APP_CATALOG)){if(def.credential){env["APP_"+def.credential+"_CLIENT_ID"]="client-"+def.credential;env["APP_"+def.credential+"_CLIENT_SECRET"]="secret-"+def.credential;}}
const deny=(fn:()=>unknown,code:string)=>assert.rejects(async()=>fn(),(e:any)=>e instanceof AppError&&e.code===code);
const records:{url:string;method:string;headers:Headers;body:any}[]=[];let active:AppProvider="youtube";
const json=(value:any,status=200)=>Response.json(value,{status});
const context=(p:AppProvider)=>connectionContext(env,p,p==="shopify"?{shopDomain:"test-shop.myshopify.com"}:p==="whatsapp"?{businessAccountId:"100",phoneNumberId:"200"}:{});
const scopes=(p:AppProvider)=>appScopes(p,["read","write"]);
const fetcher:typeof fetch=async(input,init={})=>{
 const href=String(input),method=init.method||"GET",headers=new Headers(init.headers);
 let body:any=init.body;if(typeof body==="string"){try{body=JSON.parse(body);}catch{body=new URLSearchParams(body);}}
 records.push({url:href,method,headers,body});
 const def=APP_CATALOG[active];
 if(def.token&&href===endpoint(def.token,context(active))){
  if(active==="notion"){assert(headers.get("authorization")?.startsWith("Basic "));assert(!body.client_secret);}
  if(active==="shopify")assert.equal(body.grant_type,undefined);
  if(def.credential==="ATLASSIAN")assert.equal(body.grant_type,"authorization_code");
  return json({access_token:"private-access-"+active,refresh_token:"private-refresh-"+active,expires_in:3600,scope:scopes(active).join(" "),...(active==="salesforce"?{instance_url:"https://example.my.salesforce.com"}:{})});
 }
 if(href.endsWith("/oauth2/v3/userinfo"))return json({sub:"google-user",email:"person@example.invalid"});
 if(href.endsWith("/me?fields=id,name"))return json({id:"meta-user",name:"Example Person"});
 if(href.endsWith("/me/permissions"))return json({data:scopes(active).map(permission=>({permission,status:"granted"}))});
 if(href==="https://api.atlassian.com/me")return json({account_id:"atlassian-user",name:"Example Person"});
 if(href.endsWith("/oauth/token/accessible-resources"))return json([{id:uuid,scopes:scopes(active),name:"Test site"}]);
 if(href.endsWith("/v1/users/me"))return json({id:uuid,bot:{workspace_id:"notion-workspace",workspace_name:"Test workspace"}});
 if(href==="https://api.linkedin.com/v2/userinfo")return json({sub:"linkedin-user",name:"Example Person"});
 if(href.endsWith("/services/oauth2/userinfo"))return json({organization_id:"org-one",user_id:"sf-user",preferred_username:"person@example.invalid"});
 if(href.endsWith("/oauth/v3/token/introspect"))return json({active:true,hub_id:123,scopes:scopes(active),hub_domain:"example.invalid"});
 if(href.endsWith("/v2/user"))return json({user:{id:"vercel-user",email:"person@example.invalid"}});
 if(href==="https://api.linear.app/graphql"&&String(init.body).includes("viewer"))return json({data:{viewer:{id:uuid,name:"Example",email:"person@example.invalid"}}});
 if(href==="https://api.x.com/2/users/me")return json({data:{id:"123",username:"example"}});
 if(href.endsWith("/v1/organization"))return json({creditBalance:1000});
 if(href==="https://api.supabase.com/v1/organizations")return json([{id:"org",name:"Example"}]);
 if(href.endsWith("/100/phone_numbers"))return json({data:[{id:"200",display_phone_number:"+15550001234"}]});
 if(href.includes("fields=id,name,access_token"))return json({id:"123",name:"Page",access_token:"private-page-token"});
 if(href.endsWith("/graphql.json"))return json({data:{shop:{id:"gid://shopify/Shop/1",myshopifyDomain:"test-shop.myshopify.com",name:"Example"},productCreate:{product:{id:"1",status:"DRAFT"},userErrors:[]}}});
 if(href.includes("/export?"))return new Response("Exported document",{headers:{"content-type":"text/plain"}});
 return json({id:"7123",data:{issueCreate:{success:true}},access_token:"must-never-return",nested:{refresh_token:"must-never-return"}});
};
const req=(route:string,method="GET",body?:any,user="one",headers={})=>new Request(origin+route,{method,headers:{cookie:"rl_session=session-"+user,origin,"content-type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const api=(route:string,method="GET",body?:any,user="one",extra={})=>handleApps(req(route,method,body,user,extra),env,fetcher);
async function signature(q:URLSearchParams){const copy=new URLSearchParams(q);copy.delete("hmac");copy.delete("signature");copy.sort();const text=[...copy].map(([k,v])=>k+"="+v).join("&"),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.APP_SHOPIFY_CLIENT_SECRET!),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return Buffer.from(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text))).toString("hex");}
const connections=new Map<AppProvider,string>();
for(const provider of EXTRA_PROVIDER_IDS){
 active=provider;assert(appConfigured(env,provider));let response:Response;
 if(APP_CATALOG[provider].auth==="api_key"){
  const body={provider,credential:"own-private-key-"+provider,permissions:["read","write"],settings:provider==="whatsapp"?{businessAccountId:"100",phoneNumberId:"200"}:{},dailyCallLimit:100,usageConsent:true};
  assert.equal((await api("/api/apps/connections","POST",{...body,usageConsent:false})).status,400);
  assert.equal((await api("/api/apps/connections","POST",body,"one",{origin:"https://evil.invalid"})).status,403);
  response=await api("/api/apps/connections","POST",body);assert.equal(response.status,200,provider+":"+await response.clone().text());
 }else{
  const started=await api("/api/apps/authorize","POST",{provider,permissions:["read","write"],settings:provider==="shopify"?{shopDomain:"test-shop.myshopify.com"}:{}});
  assert.equal(started.status,200,provider);
  const auth=new URL((await started.json() as any).authorizationUrl),state=auth.searchParams.get("state");
  if(APP_CATALOG[provider].pkce)assert.equal(auth.searchParams.get("code_challenge_method"),"S256");
  if(APP_CATALOG[provider].credential==="ATLASSIAN")assert.equal(auth.searchParams.get("audience"),"api.atlassian.com");
  if(provider==="notion")assert.equal(auth.searchParams.get("owner"),"user");
  const q=new URLSearchParams({state:state!,code:"example-code"});
  if(provider==="shopify"){q.set("shop","test-shop.myshopify.com");q.set("timestamp","123");q.set("hmac",await signature(q));}
  response=await api("/api/apps/oauth/"+provider+"/callback?"+q);assert.equal(response.status,303,provider+":"+await response.clone().text());
  assert.equal((await api("/api/apps/oauth/"+provider+"/callback?"+q)).status,400,"OAuth states are single use");
 }
 const list=await listApps(env,"one"),conn=list.connections.find(c=>c.provider===provider)!;assert(conn,provider);connections.set(provider,conn.id);
 assert.equal((await listApps(env,"two")).connections.length,0);
 const stored=sql.prepare("SELECT token_ciphertext FROM app_connections WHERE id=?").get(conn.id)!;assert(!String(stored.token_ciphertext).includes("private"));
 assert(!JSON.stringify(list).includes("private-access"));assert(!JSON.stringify(list).includes("own-private-key"));
}
assert.equal(APP_PROVIDERS.length,29);assert.equal(APP_CATEGORIES.length,8);assert.equal(connections.size,23);
const argsByField:Record<string,any>={limit:20,index:1,dimensions:["query"],id:"123",documentId:"doc-1",revisionId:"rev-1",spreadsheetId:"sheet-1",range:"Sheet1!A1:B2",values:[["Verified",12]],playlistId:"playlist-1",ids:["video-1"],siteUrl:"https://example.invalid/",startDate:"2026-10-01",endDate:"2026-10-07",metrics:["sessions"],propertyId:"123",customerId:"123",deploymentId:"deployment-1",taskId:uuid,promptText:"A calm ocean",ratio:"1280:720",duration:5,maxCredits:60,userId:"123",text:"Reviewed content",message:"Reviewed content",pageId:"123",accountId:"123",mediaId:"123",commentId:"123",imageUrl:"https://example.invalid/image.png",caption:"Reviewed caption",creationId:"7123",sourceCallId:uuid,to:"15550001234",name:"approved_template",language:"en_US",cloudId:uuid,jql:"project = TEST",projectKey:"TEST",issueTypeId:"123",summary:"Reviewed summary",description:"Reviewed description",spaceId:"123",title:"Reviewed title",blockId:uuid,parentPageId:uuid,commentary:"Reviewed post",projectRef:"abcdefghijklmnopqrst",query:"SELECT 1",teamId:uuid,email:"person@example.invalid",firstName:"Example",lastName:"Person",campaignId:"123"};
const idIdentity={userId:"one",scope:"apps:read apps:write"};let createdMediaCall="";
for(const operation of APP_OPERATIONS.filter(o=>EXTRA_PROVIDER_IDS.includes(o.provider as any))){
 active=operation.provider;
 const required=(z.toJSONSchema(operation.schema) as any).required||[];
 const arguments_:Record<string,any>=Object.fromEntries(required.map((key:string)=>{assert(key in argsByField,"Missing fixture "+key);return[key,argsByField[key]];}));
 if(active==="notion"&&operation.name==="pages.get")arguments_.pageId=uuid;
 if(active==="google_analytics"&&arguments_.dimensions)arguments_.dimensions=["date"];
 if(active==="meta_ads"&&arguments_.accountId)arguments_.accountId="act_123";
 if(active==="instagram"&&operation.name==="media.publish")arguments_.sourceCallId=createdMediaCall;
 const input={connectionId:connections.get(active)!,operation:operation.name,arguments:arguments_,requestId:crypto.randomUUID()};
 const count=records.length;
 let result=await callApp(env,idIdentity,input,fetcher);
 if(operation.permission==="write"){
  assert.equal(result.status,"pending_approval",active+" "+operation.name);assert.equal(records.length,count,"No writes before approval");
  assert.equal((await api("/api/apps/approvals/"+result.callId,"POST",{approve:true},"two")).status,409);
  assert.equal((await api("/api/apps/approvals/"+result.callId,"POST",{approve:true})).status,200);
  const results=await Promise.all([callApp(env,idIdentity,input,fetcher),callApp(env,idIdentity,input,fetcher)]);
  result=results.find(r=>r.status==="succeeded")!;assert(result,active+" "+operation.name);
 }else assert.equal(result.status,"succeeded",active+" "+operation.name);
 if(active==="instagram"&&operation.name==="media.create")createdMediaCall=result.callId!;
 assert(!JSON.stringify(result).includes("must-never-return"));
 const beforeReplay=records.length;assert.equal((await callApp(env,idIdentity,input,fetcher)).status,"succeeded");assert.equal(records.length,beforeReplay,"Replay never dispatches");
 const request=records.at(-1)!;assert(new URL(request.url).protocol==="https:");assert(!request.url.includes("private"));
 if(active==="linear")assert.equal(request.headers.get("authorization"),"own-private-key-linear");
 if(active==="runway")assert.equal(request.headers.get("x-runway-version"),"2024-11-06");
 if(active==="shopify"){assert.equal(request.headers.get("authorization"),null);assert.equal(request.headers.get("x-shopify-access-token"),"private-access-shopify");}
 if(active==="google_sheets"&&operation.name==="values.update"){assert.equal(request.method,"PUT");assert(new URL(request.url).searchParams.get("valueInputOption")==="RAW");assert.deepEqual(request.body.values,[["Verified",12]]);}
 if(active==="google_docs"&&operation.name==="documents.insertText")assert.equal(request.body.writeControl.requiredRevisionId,"rev-1");
 if(active==="shopify"&&operation.name==="products.createDraft")assert.equal(request.body.variables.product.status,"DRAFT");
 if(active==="facebook"&&operation.name==="posts.create"){assert.equal(request.headers.get("authorization"),"Bearer private-page-token");assert.equal(new URLSearchParams(String(request.body)).get("message"),"Reviewed content");}
 if(active==="runway"&&operation.name==="videos.generate"){assert.equal(request.body.model,"gen4.5");assert.equal(request.body.maxCredits,undefined);}
}
const all=await discoverApps(env,"one");assert.equal(all.total,29);assert.equal(all.apps.length,12);assert.equal(all.nextCursor,12);assert(!("operations" in all.apps[0]!));
const selected=await discoverApps(env,"one",{provider:"runway"});assert.equal(selected.apps.length,1);assert((selected.apps[0] as any).operations.length===3);assert(selected.connections.every(c=>c.provider==="runway"));
assert.equal((await discoverApps(env,"one",{category:"creative",query:"runway",cursor:20})).apps.length,0);
assert.equal((await discoverApps({...env,ENABLE_APPS:undefined},"one",{})).total,0);
assert.throws(()=>appDiscoverySchema.parse({limit:26}));assert.throws(()=>appDiscoverySchema.parse({provider:"wrong"}));
const run=appOperation("runway","videos.generate");await deny(()=>quoteAppOperation(run,{duration:10,maxCredits:20}),"app_cost_limit");assert.equal(quoteAppOperation(run,{duration:10,maxCredits:120})?.estimatedUnits,120);
assert.equal(quoteAppOperation(appOperation("runway","organization.get"),{}),undefined);
await deny(()=>quoteAppOperation({...run,quote:()=>({payer:"connected_account",unit:"credits",estimatedUnits:-1,maximumApprovedUnits:1})},{}),"app_cost_limit");
assert.deepEqual(redactProviderCredentials({ACCESS_TOKEN:"secret",a:[{api_key:"secret",safe:true}],safe:3}),{a:[{safe:true}],safe:3});
assert.throws(()=>validateAppResult("shopify","products.createDraft",{data:{productCreate:{userErrors:[{message:"No"}]}}}),/app_provider_rejected/);
assert.throws(()=>validateAppResult("linear","issues.create",{data:{issueCreate:{success:false}}}),/app_provider_rejected/);
assert.throws(()=>validateAppResult("runway","videos.generate",{}),/app_invalid_provider_response/);
await deny(()=>reviewCreatedAction(env,"one",connections.get("instagram")!,"instagram","media.publish",{sourceCallId:uuid}),"app_source_action_required");
await deny(()=>reviewCreatedAction(env,"one",connections.get("instagram")!,"instagram","media.publish",{sourceCallId:createdMediaCall,accountId:"999",creationId:"7123"}),"app_source_action_mismatch");
assert.equal(await reviewCreatedAction(env,"one","none","x","posts.create",{}),null);
const review=await reviewCreatedAction(env,"one",connections.get("instagram")!,"instagram","media.publish",{sourceCallId:createdMediaCall,accountId:"123",creationId:"7123"});assert.equal(review?.target.caption,"Reviewed caption");assert.equal(review?.target.imageUrl,"https://example.invalid/image.png");
const runwayId=connections.get("runway")!,row=sql.prepare("SELECT * FROM app_connections WHERE id=?").get(runwayId) as any;
sql.prepare("DELETE FROM app_dispatch_usage WHERE connection_id=?").run(runwayId);sql.prepare("UPDATE app_connections SET daily_call_limit=2 WHERE id=?").run(runwayId);
const reserved=await Promise.allSettled(Array.from({length:6},()=>reserveAppDispatch(env,"one",row)));assert.equal(reserved.filter(r=>r.status==="fulfilled").length,2);
await deny(()=>reserveAppDispatch({...env,APP_DAILY_PROVIDER_LIMIT:"bad"} as AppEnv,"one",row),"app_budget_not_configured");
await deny(()=>reserveAppDispatch({...env,APP_DAILY_PROVIDER_LIMIT:"1"} as AppEnv,"one",row),"app_daily_limit_reached");
await deny(()=>reserveAppDispatch(env,"two",row),"app_daily_limit_reached");
sql.prepare("UPDATE app_connections SET daily_call_limit=100 WHERE id=?").run(runwayId);
assert(!appConfigured({...env,APP_TOKEN_KEY:undefined},"runway"));assert(!appConfigured({...env,APP_META_GRAPH_VERSION:undefined},"facebook"));
for(const p of ["shopify","whatsapp"] as const)assert.throws(()=>connectionContext(env,p,{}));
for(const bad of ["evil.com","https://test.myshopify.com","test.myshopify.com.evil.com","test.myshopify.com/a"])assert.throws(()=>connectionContext(env,"shopify",{shopDomain:bad}));
assert.throws(()=>connectionContext(env,"youtube",{shopDomain:"test.myshopify.com"}));assert.throws(()=>connectionContext(env,"youtube",{businessAccountId:"1"}));assert.throws(()=>connectionContext({...env,APP_META_GRAPH_VERSION:"bad"},"facebook"));
const q=new URLSearchParams({shop:"test-shop.myshopify.com",code:"a&b=c",state:"state",timestamp:"123"});q.set("hmac",await signature(q));await checkShopifyCallback(new Request(origin+"/callback?"+q),env,context("shopify"));q.set("code","tampered");await deny(()=>checkShopifyCallback(new Request(origin+"/callback?"+q),env,context("shopify")),"invalid_shopify_callback");
await deny(()=>checkShopifyCallback(new Request(origin+"/callback?shop=other.myshopify.com&hmac=1"),env,context("shopify")),"invalid_shopify_callback");
await deny(()=>checkShopifyCallback(new Request(origin+"/callback?shop=test-shop.myshopify.com&hmac=1"),{...env,APP_SHOPIFY_CLIENT_SECRET:undefined},context("shopify")),"app_not_configured");
const tokens:AppTokens={accessToken:"secret-user-key",scopes:[],expiresAt:null,context:context("whatsapp")};
for(const p of EXTRA_PROVIDER_IDS){await deny(()=>providerIdentity(p,{...tokens,context:context(p)},async()=>json({}),env),p==="x"?"app_user_token_required":p==="whatsapp"?"app_resource_not_authorized":p==="salesforce"?"app_identity_unavailable":"app_identity_unavailable");}
await deny(()=>extraIdentity("salesforce",{...tokens,context:{instanceOrigin:"https://evil.invalid"}},fetcher,env),"app_identity_unavailable");
await deny(()=>extraIdentity("salesforce",{...tokens,context:{}},fetcher,env),"app_identity_unavailable");
await deny(()=>extraIdentity("hubspot",tokens,fetcher),"app_not_configured");
await deny(()=>extraIdentity("shopify",{...tokens,context:{shopDomain:"evil.invalid"}},fetcher,env),"app_identity_unavailable");
await deny(()=>extraIdentity("whatsapp",{...tokens,context:{}},fetcher,env),"app_whatsapp_settings_required");
active="jira";await deny(()=>providerIdentity("jira",{...tokens,context:{}},async(url)=>json(String(url).endsWith("/me")?{account_id:"one"}:[]),env),"app_resource_not_authorized");
assert.equal(await extraIdentity("github",tokens,fetcher,env),null);
assert.throws(()=>providerHeaders("google_ads",tokens,{} as AppEnv),/app_not_configured/);assert.equal(normalizeScope("profile"),"https://www.googleapis.com/auth/userinfo.profile");assert.equal(normalizeScope("email"),"https://www.googleapis.com/auth/userinfo.email");
await deny(()=>dispatchHeaders(env,"facebook","posts.create",{pageId:"123"},{...tokens,context:context("facebook")},async()=>json({id:"other"})),"app_resource_not_authorized");
for(const p of EXTRA_PROVIDER_IDS){active=p;const r=await revokeProvider(env,p,{...tokens,context:context(p)},async()=>json({}));if(APP_CATALOG[p].auth==="api_key")assert.deepEqual(r,{localOnly:true});else if(APP_CATALOG[p].credential!=="GOOGLE")assert(r.providerConsentUrl&&!r.providerConsentUrl.includes("undefined"));}
const pack=registrationPack(origin);assert.equal(Object.keys(pack.callbacks).length,23);assert.equal(pack.apiKeyProviders.length,6);assert(pack.google.authorizedRedirectUris.length===9);assert.equal(pack.authBackend,"remote_arc_native");assert(!JSON.stringify(pack).includes("secret-GOOGLE"));
assert.equal((await api("/api/apps/connections","POST",{provider:"youtube",credential:"own-secret-key",permissions:["read"],usageConsent:true})).status,400);
assert.equal((await api("/api/apps/connections","POST",{provider:"runway",credential:"own-secret-key",permissions:["read"]})).status,400);
await deny(()=>providerJson("https://example.invalid",{},async()=>json({errors:[{message:"secret"}]})),"app_provider_failed");
const requestBad=APP_OPERATIONS.filter(o=>EXTRA_PROVIDER_IDS.includes(o.provider as any));for(const operation of requestBad)assert.throws(()=>operation.schema.parse({unexpected:"field"}));

const minimalProfiles:[AppProvider,unknown][]=[
 ["facebook",{id:"id"}],["notion",{id:"id",bot:{}}],["linkedin",{sub:"id",email:"person@example.invalid"}],["linkedin",{sub:"id"}],
 ["vercel",{user:{id:"id",username:"test"}}],["vercel",{user:{id:"id"}}],["linear",{data:{viewer:{id:"id",name:"Test"}}}],["linear",{data:{viewer:{id:"id"}}}],
 ["x",{data:{id:"1",name:"Test"}}],["x",{data:{id:"1"}}],["salesforce",{user_id:"user",organization_id:"org",name:"Test"}],["salesforce",{user_id:"user",organization_id:"org"}],
 ["hubspot",{active:true,hubId:123,scope:"crm.objects.contacts.read"}],["hubspot",{active:true,hub_id:123,user:"person@example.invalid"}],
 ["shopify",{data:{shop:{id:"gid",myshopifyDomain:"test-shop.myshopify.com"}}}],["whatsapp",{data:[{id:"200",verified_name:"Test"}]}],["whatsapp",{data:[{id:"200"}]}],
];
for(const[p,profile]of minimalProfiles){
 const ctx=p==="salesforce"?{instanceOrigin:"https://test.my.salesforce.com"}:context(p);
 const result=await providerIdentity(p,{...tokens,context:ctx},async(url)=>String(url).endsWith("/me/permissions")?json({data:[]}):json(profile),env);
 assert(result.id&&typeof result.label==="string"&&result.label.length);
}
await deny(()=>providerIdentity("facebook",{...tokens,context:context("facebook")},async(url)=>String(url).endsWith("/me/permissions")?json({}):json({id:"id"}),env),"app_identity_unavailable");
await deny(()=>providerIdentity("salesforce",{...tokens,context:{instanceOrigin:"https://test.my.salesforce.com"}},async()=>json({}),env),"app_identity_unavailable");
const jiraIdentity=await providerIdentity("jira",{...tokens,scopes:[],context:{}},async(url)=>json(String(url).endsWith("/me")?{account_id:"id",email:"person@example.invalid"}:[{id:uuid,scopes:scopes("jira")},{id:"invalid"}]),env);assert(jiraIdentity.id);
assert.equal((await providerJson("https://api.linkedin.com/rest/posts",{},async()=>new Response(null,{status:201,headers:{"x-restli-id":"urn:li:share:123"}}))).id,"urn:li:share:123");
active="hubspot";const hubspotTokens=await exchangeTokens(env,"hubspot",{code:"code",verifier:"verifier"},async()=>json({access_token:"private",expires_in:1800,scopes:["crm.objects.contacts.read"]}));assert.deepEqual(hubspotTokens.scopes,["crm.objects.contacts.read"]);
assert.throws(()=>appOperation("runway","videos.generate").schema.parse({promptText:"x".repeat(1001),duration:5,ratio:"1280:720",maxCredits:60}));
assert.throws(()=>appOperation("youtube","channels.list").schema.parse({limit:51}));
assert.throws(()=>appOperation("youtube","videos.list").schema.parse({playlistId:"id",limit:51}));
const noDispatch=records.length;await deny(()=>callApp(env,idIdentity,{connectionId:runwayId,operation:"videos.generate",arguments:{promptText:"Test",duration:10,ratio:"1280:720",maxCredits:10},requestId:crypto.randomUUID()},fetcher),"app_cost_limit");assert.equal(records.length,noDispatch);
assert.equal((await handleApps(req("/api/apps/connections","POST",{provider:"runway",credential:"own-secret-key",permissions:["read"],usageConsent:true}),{...env,APP_TOKEN_KEY:undefined},fetcher)).status,503);
assert.equal((await api("/api/apps/connections","POST",{provider:"whatsapp",credential:"own-secret-key",permissions:["read"],usageConsent:true})).status,400);
assert.equal((await api("/api/apps/connections","POST",{provider:"runway",credential:"spaces are forbidden",permissions:["read"],usageConsent:true})).status,400);

const closedPulls=appOperation("github","pulls.list");assert.equal(new URL(closedPulls.request(closedPulls.schema.parse({repo:"team/product",state:"closed"})).url).searchParams.get("state"),"closed");
const upgrade=new DatabaseSync(":memory:");upgrade.exec("PRAGMA foreign_keys=ON");
for(const file of fs.readdirSync(migrations).filter(v=>v.endsWith(".sql")&&v<"0031").sort())upgrade.exec(fs.readFileSync(path.join(migrations,file),"utf8"));
upgrade.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES('old-user','old-user','old@example.invalid','user',?)").run(stamp);
upgrade.prepare("INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,created_at,updated_at) VALUES('old-connection','old-user','github','old-account','Old account','active','[\"read\"]','[]','encrypted',?,?)").run(stamp,stamp);
upgrade.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,status,expires_at,created_at,updated_at) VALUES('old-call','old-user','old-connection',1,'repositories.list','read','old-request','hash','encrypted','succeeded',?,?,?)").run(future,stamp,stamp);
upgrade.exec("BEGIN");upgrade.exec(fs.readFileSync(path.join(migrations,"0031_apps_registry_and_usage.sql"),"utf8"));upgrade.exec("COMMIT");
assert.equal(upgrade.prepare("SELECT account_label,daily_call_limit FROM app_connections WHERE id='old-connection'").get()?.daily_call_limit,100);assert.equal(upgrade.prepare("SELECT connection_id FROM app_calls WHERE id='old-call'").get()?.connection_id,"old-connection");assert.equal(upgrade.prepare("PRAGMA foreign_key_check").all().length,0);upgrade.close();
console.log("Apps expansion: 23 new provider auth flows, every operation, reviewed writes, concurrent replay, billing limits, discovery and existing-data migration passed. Provider HTTP is mocked; no real account acceptance is claimed.");
sql.close();
