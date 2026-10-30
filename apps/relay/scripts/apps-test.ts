import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { APP_CATALOG, APP_OPERATIONS, CORE_APP_PROVIDERS as APP_PROVIDERS, AppError, appOperation, appScopes, credentials, type AppEnv, type AppProvider } from "../src/apps/app-catalog.js";
import { authorizationUrl, callbackUrl, exchangeTokens, providerIdentity, providerJson, revokeProvider, seal, unseal } from "../src/apps/app-oauth.js";
import { callApp, handleApps, listApps, validateAppAccess } from "../src/apps/apps.js";
import { loadAppReview, verifyAppReview, reviewRead } from "../src/apps/app-review.js";
import { sha256Hex } from "../src/auth/auth.js";
import { registrationPack } from "./apps-registration.js";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const file of fs.readdirSync(path.join(dir,"migrations")).filter(v=>v.endsWith(".sql")).sort()) sql.exec(fs.readFileSync(path.join(dir,"migrations",file),"utf8"));
const db = { prepare(query:string) {
  const stmt = sql.prepare(query);
  const bound=(values:unknown[])=>({
    async first(){ return stmt.get(...values) || null; },
    async all(){ return {results:stmt.all(...values)}; },
    async run(){ const r=stmt.run(...values); return {success:true,meta:{changes:Number(r.changes)}}; },
  });
  return {...bound([]),bind(...values:unknown[]){assert(!values.includes(undefined),query);return bound(values);}};
}} as unknown as D1Database;
const origin="https://mcp.remotearc.app", future=new Date(Date.now()+3600000).toISOString(), old="2000-01-01T00:00:00.000Z", stamp=new Date().toISOString();
for(const id of ["one","two"]) {
  sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,'user',?)").run(id,id,id+"@example.invalid",stamp);
  sql.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(await sha256Hex("session-"+id),id,future,stamp);
}
const env:AppEnv={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,ENABLE_APPS:"1",APP_TOKEN_KEY:Buffer.alloc(32,7).toString("base64")};
for(const credential of ["GITHUB","SLACK","GOOGLE","MICROSOFT"]) {
  env[`APP_${credential}_CLIENT_ID`]="client-"+credential;
  env[`APP_${credential}_CLIENT_SECRET`]="server-secret-"+credential;
}
const identity={userId:"one",scope:"apps:read apps:write"};
const requests:Array<{url:string;method:string;headers:Headers;body:unknown}>=[];
let activeProvider:AppProvider="github", version="v1", failWrites=false,githubAccount=17;
const json=(value:unknown,status=200)=>Response.json(value,{status});
const fetcher:typeof fetch=async(url,init={})=>{
  const href=String(url),method=init.method || "GET",headers=new Headers(init.headers);
  requests.push({url:href,method,headers,body:init.body});
  if (Object.values(APP_CATALOG).some(def=>def.token===href)) {
    const form=new URLSearchParams(String(init.body));
    assert(form.get("client_secret")?.startsWith("server-secret-"));
    const token={access_token:"private-token-"+activeProvider,refresh_token:"rotated-"+activeProvider,expires_in:3600,scope:appScopes(activeProvider,["read","write"]).join(" ")};
    return json(activeProvider==="slack"&&form.get("grant_type")!=="refresh_token"?{ok:true,authed_user:token}:token);
  }
  if(href==="https://api.github.com/user") return json({id:githubAccount,login:"test-user"});
  if(href==="https://slack.com/api/auth.test") return json({ok:true,user_id:"U1",team_id:"T1",team:"Test",user:"test-user"});
  if(href.endsWith("/users/me/profile")) return json({emailAddress:"tester@example.invalid"});
  if(href.endsWith("/calendarList/primary")) return json({id:"tester@example.invalid"});
  if(href.includes("graph.microsoft.com/v1.0/me?$select")) return json({id:"ms-user",mail:"tester@example.invalid"});
  if(href.includes("conversations.history")) return json({ok:true,messages:[{ts:"1700000000.000001",text:"Review "+version,user:"U1"}]});
  if(href.includes("conversations.info")) return json({ok:true,channel:{id:"C1",name:"approved-"+version,is_private:false,is_archived:false}});
  if(method==="GET"&&href.includes("/events/")) return json({id:"event-1",etag:'"'+version+'"',summary:"Review meeting",start:{dateTime:future},end:{dateTime:future},attendees:[]});
  if(failWrites&&method!=="GET") throw new Error("provider detail must not escape");
  if(method==="DELETE") return new Response(null,{status:204});
  return json({ok:true,id:"result-1",verifiedExample:true});
};
const req=(route:string,method="GET",body?:unknown,user="one",headers:Record<string,string>={})=>new Request(origin+route,{method,headers:{cookie:"rl_session=session-"+user,origin,"content-type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const api=(route:string,method="GET",body?:unknown,user="one",headers?:Record<string,string>)=>handleApps(req(route,method,body,user,headers),env,fetcher);
const deny=(fn:()=>unknown,code:string)=>assert.rejects(async()=>fn(),e=>e instanceof AppError&&e.code===code);
const payload={to:["approved@example.invalid"],subject:"Reviewed subject",body:"Reviewed body"};
const event={summary:"Reviewed meeting",start:"2026-10-18T10:00:00Z",end:"2026-10-18T11:00:00Z",attendees:["approved@example.invalid"]};

assert.equal((await handleApps(new Request(origin+"/api/apps"),env,fetcher)).status,401);
assert.deepEqual(await listApps({...env,ENABLE_APPS:undefined},"one"),{enabled:false,apps:[],connections:[]});
assert.equal((await handleApps(req("/api/apps/authorize","POST",{provider:"github",permissions:["read"]}),{...env,ENABLE_APPS:undefined},fetcher)).status,503);
assert.equal((await api("/api/apps/authorize","POST",{provider:"github",permissions:["read"]},"one",{origin:"https://evil.invalid"})).status,403);
assert.equal((await api("/api/apps/authorize","POST",{provider:"bad",permissions:["read"]})).status,400);
assert.equal((await api("/api/apps/call","POST",{bad:true})).status,400);
assert.equal((await api("/api/apps/unknown")).status,404);
assert((await listApps({...env,APP_SLACK_CLIENT_ID:undefined},"one")).apps.find(a=>a.provider==="slack")?.configured===false);
assert.throws(()=>credentials({...env,APP_TOKEN_KEY:undefined},"gmail"),/app_not_configured/);
await deny(()=>seal({...env,APP_TOKEN_KEY:"bad"},"secret","owner"),"app_vault_not_configured");
await deny(()=>seal({...env,APP_TOKEN_KEY:"%%%"},"secret","owner"),"app_vault_not_configured");
const cipher=await seal(env,{secret:"private-token"},"owner");
assert(!cipher.includes("private-token"));
assert.deepEqual(await unseal(env,cipher,"owner"),{secret:"private-token"});
await deny(()=>unseal(env,cipher,"other-owner"),"app_vault_unavailable");
await deny(()=>unseal(env,'{"v":2}',"owner"),"app_vault_unavailable");
await deny(()=>unseal({...env,APP_TOKEN_KEY:"wrong"},cipher,"owner"),"app_vault_unavailable");

const connections=new Map<AppProvider,string>();
async function connect(provider:AppProvider,permissions:string[]|undefined=undefined) {
  activeProvider=provider;
  const start=await api("/api/apps/authorize","POST",{provider,permissions});
  assert.equal(start.status,200);
  const location=new URL((await start.json() as any).authorizationUrl);
  assert.equal(location.searchParams.get("redirect_uri"),callbackUrl(env,provider));
  assert.equal(location.searchParams.get("code_challenge_method"),APP_CATALOG[provider].pkce?"S256":null);
  assert.equal(location.searchParams.get("client_secret"),null);
  assert.equal(location.searchParams.get(provider==="slack"?"user_scope":"scope"),appScopes(provider,(permissions||["read","write"]) as any).join(provider==="slack"?",":" "));
  const state=location.searchParams.get("state")!;
  const callback="/api/apps/oauth/"+provider+"/callback?state="+state+"&code=test-code";
  assert.equal((await api(callback,"GET",undefined,"two")).status,400,"another user cannot consume this state");
  assert.equal((await api(callback)).status,303);
  assert.equal((await api(callback)).status,400,"state is single-use");
  const rows=(await listApps(env,"one")).connections;
  const row=rows.find(r=>r.provider===provider)!; assert(row);
  assert.deepEqual(row.permissions,permissions||["read","write"]);
  connections.set(provider,row.id);
  return row.id;
}
for(const provider of APP_PROVIDERS) await connect(provider);
// Goal preflight must check the same ownership and read/write authority as
// dispatch, without creating a call or asking a provider to execute anything.
{
  const github=connections.get("github")!,saved=sql.prepare("SELECT permissions_json,scopes_json FROM app_connections WHERE id=?").get(github) as {permissions_json:string;scopes_json:string};
  const callsBefore=sql.prepare("SELECT COUNT(*) count FROM app_calls").get()!.count,requestsBefore=requests.length;
  try{
    await validateAppAccess(env,"one",github,"issues.create");
    await validateAppAccess(env,"one",github,"issues.get");
    await assert.rejects(()=>validateAppAccess(env,"two",github,"issues.get"),AppError);
    await assert.rejects(()=>validateAppAccess({...env,ENABLE_APPS:undefined},"one",github,"issues.get"),AppError);
    sql.prepare("UPDATE app_connections SET permissions_json=? WHERE id=?").run(JSON.stringify(["read"]),github);
    await validateAppAccess(env,"one",github,"issues.get");
    await validateAppAccess(env,"one",github,"issues.create"); // OAuth scopes, not legacy local flags, remain authoritative.
    sql.prepare("UPDATE app_connections SET permissions_json=?,scopes_json=? WHERE id=?").run(saved.permissions_json,JSON.stringify(["repo"]),github);
    await assert.rejects(()=>validateAppAccess(env,"one",github,"issues.get"),AppError);
    assert.equal(sql.prepare("SELECT COUNT(*) count FROM app_calls").get()!.count,callsBefore);
    assert.equal(requests.length,requestsBefore);
  }finally{sql.prepare("UPDATE app_connections SET permissions_json=?,scopes_json=? WHERE id=?").run(saved.permissions_json,saved.scopes_json,github);}
}
// Check actual account identity without executing a content operation. Capability
// counts use the same grant rules as dispatch, including broader replacement scopes.
{
const checkPath=(provider:AppProvider)=>"/api/apps/connections/"+connections.get(provider)+"/check";
for(const provider of APP_PROVIDERS){
  const before=requests.length,checked=await api(checkPath(provider),"POST",{});
  assert.equal(checked.status,200);const body=await checked.json() as any;
  assert.equal(body.verification,"provider_identity_checked");assert.equal(body.connectionId,connections.get(provider));
  assert.equal(body.toolAccess.available,body.toolAccess.total);assert.equal(body.toolAccess.needsReconnect,false);
  assert.equal(requests.length,before+1);assert.equal(requests.at(-1)?.method,"GET");
  assert(!JSON.stringify(body).includes("private-token"));
}
assert.equal((await api(checkPath("github"),"POST",{},"two")).status,404);
assert.equal((await handleApps(new Request(origin+checkPath("github"),{method:"POST",body:"{}",headers:{"content-type":"application/json",origin}}),env,fetcher)).status,401);
assert.equal((await api(checkPath("github"),"POST",{},"one",{origin:"https://evil.invalid"})).status,403);
assert.equal((await api(checkPath("github"),"POST",{},"one",{"content-type":"text/plain"})).status,415);
assert.equal((await api(checkPath("github"),"POST",{operation:"issues.create"})).status,400);
assert.equal((await handleApps(req(checkPath("github"),"POST",{}),{...env,APP_GITHUB_CLIENT_ID:undefined},fetcher)).status,503);
sql.prepare("UPDATE app_connections SET scopes_json=? WHERE id=?").run(JSON.stringify(["channels:read","channels:history","chat:write"]),connections.get("slack")!);
const limited=await (await api(checkPath("slack"),"POST",{})).json() as any;
assert.equal(limited.toolAccess.needsReconnect,true);assert(limited.toolAccess.available>0&&limited.toolAccess.available<limited.toolAccess.total);
assert.equal((await listApps(env,"one")).connections.find(row=>row.id===connections.get("slack"))?.toolAccess.needsReconnect,true);
await connect("slack");
for(const [provider,scopes] of [["gmail",["https://www.googleapis.com/auth/gmail.modify"]],["outlook",["User.Read","Mail.ReadWrite","Mail.Send"]],["microsoft_calendar",["User.Read","Calendars.ReadWrite"]]] as const){
  sql.prepare("UPDATE app_connections SET scopes_json=? WHERE id=?").run(JSON.stringify(scopes),connections.get(provider)!);
  const checked=await (await api(checkPath(provider),"POST",{})).json() as any;
  assert.equal(checked.toolAccess.needsReconnect,false,"Broader grants must not cause an endless reconnect loop");
  await connect(provider);
}
const checkGh=connections.get("github")!;
const revoked=await handleApps(req(checkPath("github"),"POST",{}),env,async()=>json({detail:"never expose token"},401));
assert.equal(revoked.status,401);assert.equal(sql.prepare("SELECT status FROM app_connections WHERE id=?").get(checkGh)?.status,"reauthorization_required");
assert.equal((await api(checkPath("github"),"POST",{})).status,409);await connect("github");
const transient=await handleApps(req(checkPath("github"),"POST",{}),env,async()=>json({detail:"private-token"},500));
assert.equal(transient.status,503);assert(!JSON.stringify(await transient.json()).includes("private-token"));
assert.equal(sql.prepare("SELECT status FROM app_connections WHERE id=?").get(checkGh)?.status,"active","A transient identity failure must not disconnect the user");
githubAccount=18;const wrongAccount=await api(checkPath("github"),"POST",{});assert.equal(wrongAccount.status,409);
assert.equal((await wrongAccount.json() as any).error,"app_account_changed");githubAccount=17;await connect("github");
const changed=await handleApps(req(checkPath("github"),"POST",{}),env,async()=>{
  sql.prepare("UPDATE app_connections SET generation=generation+1 WHERE id=?").run(checkGh);
  return json({id:17,login:"test-user"});
});
assert.equal(changed.status,409);assert.equal((await changed.json() as any).error,"app_connection_changed");await connect("github");
activeProvider="github";
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(await seal(env,{accessToken:"expired-check",refreshToken:"old-check-refresh",expiresAt:old,scopes:appScopes("github",["read","write"])},"app-token:one:github:"+checkGh),checkGh);
const refreshBefore=requests.length,refreshCheck=await api(checkPath("github"),"POST",{});
assert.equal(refreshCheck.status,200);assert(requests.slice(refreshBefore).some(request=>request.url===APP_CATALOG.github.token));
assert.equal((await unseal<any>(env,sql.prepare("SELECT token_ciphertext FROM app_connections WHERE id=?").get(checkGh)!.token_ciphertext as string,"app-token:one:github:"+checkGh)).refreshToken,"rotated-github");
const priorDailyLimit=sql.prepare("SELECT daily_call_limit FROM app_connections WHERE id=?").get(checkGh)!.daily_call_limit;
sql.prepare("UPDATE app_connections SET daily_call_limit=1 WHERE id=?").run(checkGh);
const quotaBefore=requests.length;assert.equal((await api(checkPath("github"),"POST",{})).status,429);assert.equal(requests.length,quotaBefore);
sql.prepare("UPDATE app_connections SET daily_call_limit=? WHERE id=?").run(priorDailyLimit,checkGh);
sql.prepare("INSERT INTO user_security_settings(user_id,mcp_paused,updated_at) VALUES('one',1,?)").run(stamp);
assert.equal((await api(checkPath("github"),"POST",{})).status,403);sql.prepare("DELETE FROM user_security_settings WHERE user_id='one'").run();
}
assert.equal((await listApps(env,"two")).connections.length,0);
assert(!JSON.stringify(await listApps(env,"one")).includes("private-token"));
const prior=connections.get("github");
assert.equal(await connect("github"),prior,"reconnecting the same account retains its identity");
env.ARC_BILLING_ENABLED='1';
assert.equal(await connect('github'),prior,'Existing connections can be reauthorized above a new plan limit');
const limitStart=await api('/api/apps/authorize','POST',{provider:'github'});
const limitState=new URL((await limitStart.json() as any).authorizationUrl).searchParams.get('state');
githubAccount=18;const connectedBefore=(await listApps(env,'one')).connections.length;
const overLimit=await api('/api/apps/oauth/github/callback?state='+limitState+'&code=limit-test');
assert.equal(overLimit.status,402);assert.equal((await overLimit.json() as any).error,'app_connection_limit');
assert.equal((await listApps(env,'one')).connections.length,connectedBefore,'An OAuth callback cannot exceed the connection cap');
githubAccount=17;env.ARC_BILLING_ENABLED='0';
await deny(()=>callApp(env,{...identity,userId:"two"},{connectionId:prior,operation:"repositories.list",arguments:{},requestId:"foreign-1"},fetcher),"app_connection_not_found");
await deny(()=>callApp({...env,ENABLE_APPS:undefined},identity,{}),"apps_not_enabled");
await deny(()=>callApp(env,{...identity,scope:"mcp:tools"},{connectionId:prior,operation:"repositories.list",arguments:{},requestId:"no-scope"},fetcher),"app_mcp_scope_required");

let sequence=0;
const input=(provider:AppProvider,operation:string,args:Record<string,unknown>)=>({connectionId:connections.get(provider)!,operation,arguments:args,requestId:"request-"+(++sequence)});
const read=input("github","repositories.list",{});
const before=requests.length;
const readResults=await Promise.all(Array.from({length:12},()=>callApp(env,identity,read,fetcher)));
assert.equal(requests.length-before,1,"concurrent clients dispatch a single operation");
assert(readResults.some(r=>r.status==="succeeded"));
assert.equal((await callApp(env,identity,read,fetcher)).replayed,true);
await deny(()=>callApp(env,identity,{...read,arguments:{limit:5}},fetcher),"app_request_id_conflict");
await deny(()=>callApp(env,identity,input("github","missing",{}),fetcher),"unsupported_app_operation");
sql.prepare("INSERT INTO user_security_settings(user_id,mcp_paused,updated_at) VALUES('one',1,?)").run(stamp);
await deny(()=>callApp(env,identity,input("github","repositories.list",{}),fetcher),"mcp_paused");
sql.prepare("UPDATE user_security_settings SET mcp_paused=0").run();
const write=input("github","issues.create",{repo:"owner/repo",title:"Explicit title",body:"Explicit issue"});
const writeStart=requests.length,pending=await callApp(env,identity,write,fetcher);
assert.equal(pending.status,"succeeded");assert.equal(requests.length,writeStart+1);
assert.equal((await api('/api/apps/approvals/'+pending.callId,'POST',{approve:true})).status,410);
const writes=await Promise.all(Array.from({length:12},()=>callApp(env,identity,write,fetcher)));
assert.equal(requests.length-writeStart,1);assert(writes.every(r=>r.status==='succeeded'));
assert.equal((await callApp(env,identity,write,fetcher)).replayed,true);
// A pre-upgrade pending operation is cancelled, never silently dispatched.
sql.prepare("UPDATE app_calls SET status='pending_approval' WHERE id=?").run(pending.callId);
assert.equal((await callApp(env,identity,write,fetcher)).status,'cancelled');assert.equal(requests.length-writeStart,1);
const uncertainInput=input('github','issues.create',{repo:'owner/repo',title:'Timeout',body:'Unknown'});
failWrites=true;await deny(()=>callApp(env,identity,uncertainInput,fetcher),'app_provider_unavailable');
const afterUnknown=requests.length;assert.equal((await callApp(env,identity,uncertainInput,fetcher)).status,'unknown');assert.equal(requests.length,afterUnknown);failWrites=false;
const reviewed=input('slack','messages.send',{channel:'C1',text:'Requested message'});
const reviewStart=requests.length;assert.equal((await callApp(env,identity,reviewed,fetcher)).status,'succeeded');
assert.equal(requests.length-reviewStart,2);assert.equal(requests[reviewStart].method,'GET');assert.equal(requests[reviewStart+1].method,'POST');
version='v2';
const deletion=input('google_calendar','events.delete',{id:'event-1'});
await callApp(env,identity,deletion,fetcher);assert.equal(requests.at(-1)?.method,'DELETE');assert.equal(requests.at(-1)?.headers.get('if-match'),'"v2"');
const reviewTokens={accessToken:"private",scopes:[],expiresAt:null};
assert.equal(reviewRead("github","issues.create",{}),null);
assert.equal(await loadAppReview("github","issues.create",{},reviewTokens,fetcher),null);
assert.deepEqual(await verifyAppReview("github","issues.create",{},reviewTokens,null,fetcher),{});
await deny(()=>verifyAppReview("slack","messages.send",{channel:"C1"},reviewTokens,null,fetcher),"app_review_unavailable");
await deny(()=>loadAppReview("slack","messages.send",{channel:"C1"},reviewTokens,async()=>json({ok:true})),"app_review_unavailable");
await deny(()=>loadAppReview("gmail","messages.modify",{id:"m1"},reviewTokens,async()=>json({})),"app_review_unavailable");
await deny(()=>loadAppReview("microsoft_calendar","events.delete",{id:"e"},reviewTokens,async()=>json({id:"e"})),"app_review_unavailable");
const gmailReview=await loadAppReview("gmail","messages.modify",{id:"m1"},reviewTokens,async()=>json({id:"m1",threadId:"t",payload:{headers:[{name:"Subject",value:"Reviewed"}]}}));
assert(gmailReview?.target.message);
assert.deepEqual(await verifyAppReview("gmail","messages.modify",{id:"m1"},reviewTokens,gmailReview,async()=>json({id:"m1",threadId:"t",payload:{headers:[{name:"Subject",value:"Reviewed"}]}})),{});
const msReview=await loadAppReview("microsoft_calendar","events.update",{id:"e",calendar:"c"},reviewTokens,async()=>json({id:"e","@odata.etag":'W/"1"',subject:"A",isCancelled:false}));
assert.equal(msReview?.target.title,"A");

const ghId=connections.get("github")!;
assert.equal((await api("/api/apps/connections/"+ghId,"PATCH",{permissions:["read"]})).status,200);
assert.equal((await callApp(env,identity,input("github","issues.create",{repo:"owner/repo",title:"Enabled",body:"Provider scope allows this"}),fetcher)).status,"succeeded");
assert.equal((await api("/api/apps/connections/"+ghId,"PATCH",{permissions:["read","write"]})).status,200);
sql.prepare("UPDATE app_connections SET scopes_json='[]' WHERE id=?").run(ghId);
await deny(()=>callApp(env,identity,input("github","repositories.list",{}),fetcher),"app_scope_required");
await connect("github");
const tokenContext=(provider:AppProvider,id:string)=>"app-token:one:"+provider+":"+id;
activeProvider="github";
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(await seal(env,{accessToken:"expired",refreshToken:"old-refresh",expiresAt:old,scopes:appScopes("github",["read","write"])},tokenContext("github",ghId)),ghId);
assert.equal((await callApp(env,identity,input("github","repositories.list",{}),fetcher)).status,"succeeded");
const saved=sql.prepare("SELECT token_ciphertext FROM app_connections WHERE id=?").get(ghId) as any;
assert.equal((await unseal<any>(env,saved.token_ciphertext,tokenContext("github",ghId))).refreshToken,"rotated-github");
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(await seal(env,{accessToken:"expired",expiresAt:old,scopes:appScopes("github",["read","write"])},tokenContext("github",ghId)),ghId);
await deny(()=>callApp(env,identity,input("github","repositories.list",{}),fetcher),"app_reauthorization_required");
assert.equal(sql.prepare("SELECT status FROM app_connections WHERE id=?").get(ghId)?.status,"reauthorization_required");
await connect("github");
const cancelledInput=input("github","issues.create",{repo:"owner/repo",title:"Disconnect",body:"No write"});
const cancelled=await callApp(env,identity,cancelledInput,fetcher);
sql.prepare("UPDATE app_calls SET status='approved' WHERE id=?").run(cancelled.callId);
assert.equal((await api("/api/apps/connections/"+ghId,"DELETE")).status,200);
assert.equal(sql.prepare("SELECT status FROM app_calls WHERE id=?").get(cancelled.callId)?.status,"cancelled");
await deny(()=>callApp(env,identity,cancelledInput,fetcher),"app_reauthorization_required");
assert.equal((await api("/api/apps/connections/00000000-0000-4000-8000-000000000000","DELETE")).status,404);
await connect("github");
assert.equal((await handleApps(req("/api/apps/connections/"+ghId,"DELETE"),{...env,APP_TOKEN_KEY:Buffer.alloc(32,9).toString("base64")},fetcher)).status,200,"vault failure cannot prevent local disconnect");
assert.equal(sql.prepare("SELECT token_ciphertext FROM app_connections WHERE id=?").get(ghId)?.token_ciphertext,null);

for(const provider of APP_PROVIDERS) {
  const previous={accessToken:"old",refreshToken:"keep-refresh",scopes:appScopes(provider,["read"]),expiresAt:old};
  const refreshed=await exchangeTokens(env,provider,{refreshToken:"old-refresh",previous},async()=>json({access_token:"new"}));
  assert.equal(refreshed.refreshToken,"keep-refresh");assert.deepEqual(refreshed.scopes,previous.scopes);
  await deny(()=>exchangeTokens(env,provider,{code:"bad",verifier:"valid"},async()=>json({})),"app_invalid_token_response");
  await deny(()=>exchangeTokens(env,provider,{refreshToken:"old",previous},async()=>json({access_token:"a",expires_in:0})),"app_invalid_token_response");
  await deny(()=>providerIdentity(provider,previous,async()=>json({})),"app_identity_unavailable");
  await revokeProvider(env,provider,previous,async(url,init)=>{assert(init?.method==="DELETE"||init?.method==="POST");return json({});});
}
for(const [status,code,body] of [[401,"app_reauthorization_required",{}],[429,"app_rate_limited",{}],[403,"app_scope_required",{}],[412,"app_review_changed",{}],[500,"app_provider_failed",{detail:"secret"}],[400,"app_provider_failed",{error:"other"}],[200,"app_scope_required",{ok:false,error:"missing_scope"}],[200,"app_reauthorization_required",{error:"invalid_grant"}],[200,"app_rate_limited",{error:"ratelimited"}]] as const) await deny(()=>providerJson("https://allowed.invalid",{},async()=>json(body,status)),code);
await deny(()=>providerJson("https://allowed.invalid",{},async()=>{throw Error("secret");}),"app_provider_unavailable");
await deny(()=>providerJson("https://allowed.invalid",{},async()=>new Response("invalid")),"app_invalid_provider_response");
await deny(()=>providerJson("https://allowed.invalid",{},async()=>new Response("x".repeat(1048577))),"app_response_too_large");
await deny(()=>providerJson("https://allowed.invalid",{},async()=>new Response(null,{status:302,headers:{location:"https://evil.invalid"}})),"app_provider_failed");
assert.deepEqual(await providerJson("https://allowed.invalid",{},async(_,init)=>{assert.equal(init?.redirect,"manual");return new Response(null,{status:204});}),{});

const slackArgs=(name:string):Record<string,unknown>=>{
 const channel={channel:"C1"},ts="1700000000.000001",paged={cursor:"next"};
 switch(name){
  case "auth.test":case "team.info":case "emoji.list":return {};
  case "channels.list":case "users.list":return paged;
  case "channels.get":case "pins.list":return channel;
  case "channels.members":case "messages.list":return {...channel,...paged};
  case "messages.get":case "threads.replies":case "messages.delete":return {...channel,ts};
  case "messages.permalink":return {...channel,message_ts:ts};
  case "search":case "search.files":return {query:"approved"};
  case "users.get":return {user:"U1"};
  case "users.lookup":return {email:"member@example.invalid"};
  case "reactions.get":case "pins.add":case "pins.remove":return {...channel,timestamp:ts};
  case "reactions.list":return {...paged,user:"U1"};
  case "bookmarks.list":return {channel_id:"C1"};
  case "files.list":return {channel:"C1",user:"U1"};
  case "files.get":return {file:"F1"};
  case "scheduled.list":return {...channel,...paged};
  case "messages.send":return {...channel,text:"approved",thread_ts:ts};
  case "messages.update":return {...channel,ts,text:"approved"};
  case "messages.schedule":return {...channel,text:"approved",post_at:Math.floor(Date.now()/1000)+3600};
  case "scheduled.delete":return {...channel,scheduled_message_id:"Q1"};
  case "reactions.add":case "reactions.remove":return {...channel,timestamp:ts,name:"thumbsup"};
  case "bookmarks.add":return {channel_id:"C1",title:"Project",link:"https://example.invalid/project"};
  case 'users.presence':return {user:'U1'};
  case 'bookmarks.edit':return {channel_id:'C1',bookmark_id:'Bk1',title:'Project'};
  case 'bookmarks.remove':return {channel_id:'C1',bookmark_id:'Bk1'};
  default:throw Error("Missing Slack fixture: "+name);
 }
};
for(const operation of APP_OPERATIONS.filter(o=>o.provider==="slack")) {
 const request=input("slack",operation.name,slackArgs(operation.name)),before=requests.length;
 const first=await callApp(env,identity,request,fetcher);
   assert.equal(first.status,'succeeded',operation.name);
  if(operation.permission==='write'){
   const dispatched=requests.slice(before).filter(r=>r.method==='POST');assert.equal(dispatched.length,1,'One direct Slack mutation');assert.equal(new URL(dispatched[0].url).origin,'https://slack.com');
   const results=await Promise.all(Array.from({length:4},()=>callApp(env,identity,request,fetcher)));assert(results.every(r=>r.status==='succeeded'));
  }
const after=requests.length;
 assert.equal((await callApp(env,identity,request,fetcher)).replayed,true);
 assert.equal(requests.length,after,"no replayed Slack request is sent twice");
}
assert.equal(APP_OPERATIONS.filter(o=>o.provider==="slack").length,35);
const changedArgs={channel:'C1',ts:'1700000000.000001'};
const originalReview=await loadAppReview('slack','messages.delete',changedArgs,reviewTokens,fetcher);version='v3';
await deny(()=>verifyAppReview('slack','messages.delete',changedArgs,reviewTokens,originalReview,fetcher),'app_review_changed');
const dmReview=await loadAppReview("slack","messages.send",{channel:"D1"},reviewTokens,async()=>json({ok:true,channel:{id:"D1",user:"U2",is_im:true}}));
assert.equal(dmReview?.target.name,"U2");
await deny(()=>loadAppReview("slack","messages.delete",{channel:"C1",ts:"1700000000.000001"},reviewTokens,async()=>json({ok:true,messages:[]})),"app_review_unavailable");
assert.throws(()=>appOperation("slack","bookmarks.add").schema.parse({channel_id:"C1",title:"Bad",link:"https://user:password@example.invalid"}));
assert.throws(()=>appOperation("slack","messages.delete").schema.parse({channel:"C1",ts:"invalid"}));
// Newly added scopes must not disable older already-authorized operations.
sql.prepare("UPDATE app_connections SET scopes_json=? WHERE id=?").run(JSON.stringify(["channels:read","channels:history","search:read","chat:write"]),connections.get("slack")!);
assert.equal((await callApp(env,identity,input("slack","messages.list",{channel:"C1"}),fetcher)).status,"succeeded");
await deny(()=>callApp(env,identity,input("slack","users.list",{}),fetcher),"app_scope_required");
await connect("slack");

for(const operation of APP_OPERATIONS.filter(op=>APP_PROVIDERS.includes(op.provider as any))) {
  let args:Record<string,unknown>={};
  if(operation.provider==="github") args=operation.name==="repositories.list"?{}:operation.name==="contents.read"?{repo:"owner/repo",path:"src/a.ts",ref:"main"}:operation.name==="issues.create"?{repo:"owner/repo",title:"Review",body:"Issue"}:{repo:"owner/repo"};
  else if(operation.provider==="slack") args=slackArgs(operation.name);
  else if(operation.provider==="gmail"||operation.provider==="outlook") args=["drafts.create","messages.send"].includes(operation.name)?payload:operation.name==="messages.list"?{query:"approved",...(operation.provider==="gmail"?{pageToken:"next"}:{})}:operation.name==="messages.modify"?{id:"m",addLabelIds:["STARRED"],removeLabelIds:[]}:{id:"m"};
  else args=operation.name==="calendars.list"?{}:operation.name==="events.list"?{calendar:"primary",after:event.start,before:event.end}:operation.name==="events.create"?{calendar:"primary",event}:operation.name==="events.update"?{calendar:"other",id:"e",event}:{calendar:"other",id:"e"};
  if(operation.provider==='github'){
    if(['issues.get','issues.update','comments.list','comments.create','pulls.get','pulls.files'].includes(operation.name))Object.assign(args,{number:1});
    if(operation.name==='issues.update')args.title='Updated';if(operation.name==='comments.create')args.body='An update';if(['actions.get','actions.rerun'].includes(operation.name))args.id='123';
  }
  if(operation.provider==='gmail'){
    if(['labels.list','drafts.list','threads.list'].includes(operation.name))args={};if(operation.name==='labels.create')args={name:'Work'};
  }
  if(operation.provider==='outlook'){
    if(operation.name==='folders.list')args={};if(operation.name==='messages.reply')args={id:'m',comment:'Reply'};
    if(operation.name==='messages.move')args={id:'m',destinationId:'inbox'};if(operation.name==='messages.markRead')args={id:'m',isRead:true};
  }
  if(operation.provider==='google_calendar'&&operation.name==='calendars.get')args={calendar:'primary'};
  if(operation.provider==='google_calendar'&&operation.name==='availability.query')args={calendars:['primary'],start:event.start,end:event.end};
  if(operation.provider==='microsoft_calendar'&&['calendars.get','events.accept','events.decline'].includes(operation.name))args={id:'e'};
  const parsed=operation.schema.safeParse(args);assert(parsed.success,operation.provider+' '+operation.name+': '+JSON.stringify(parsed.error));
  const plan=operation.request(parsed.data);
  assert(["api.github.com","slack.com","gmail.googleapis.com","graph.microsoft.com","www.googleapis.com"].includes(new URL(plan.url).hostname));
  assert(["GET","POST","PATCH","DELETE"].includes(plan.method));
  assert(!plan.url.includes("server-secret"));
  const defaultArgs={...args};delete defaultArgs.calendar;
  if(operation.provider.endsWith("calendar")&&operation.name!=="calendars.list") operation.request(operation.schema.parse(defaultArgs));
}
assert.throws(()=>appOperation("github","contents.read").schema.parse({repo:"../bad",path:"a"}));
assert.throws(()=>appOperation("github","contents.read").schema.parse({repo:"owner/repo",path:"../secret"}));
assert.throws(()=>appOperation("gmail","messages.send").schema.parse({...payload,subject:"injection\r\nBcc: other@example.invalid"}));
assert.throws(()=>appOperation("outlook","messages.send").schema.parse({...payload,to:["bad"]}));
assert.throws(()=>appOperation("google_calendar","events.create").schema.parse({event:{...event,end:event.start}}));
assert.throws(()=>appOperation("github","repositories.list").schema.parse({url:"https://evil.invalid"}));
const large="😀".repeat(25000),encoded=(appOperation("gmail","messages.send").request(appOperation("gmail","messages.send").schema.parse({...payload,body:large})).body as any).raw;
const mime=Buffer.from(encoded,"base64url").toString("utf8"),encodedBody=mime.split("\r\n\r\n")[1]!;
assert.equal(Buffer.from(encodedBody,"base64").toString("utf8"),large);
assert(encodedBody.split("\r\n").every(line=>line.length<=76));

const pack=registrationPack(origin);
assert.equal(pack.registered,false);assert.equal(pack.enabled,false);
for(const provider of APP_PROVIDERS) {
  const url=new URL(await authorizationUrl(env,provider,["read"],"state","verifier"));
  assert.equal(pack.callbacks[provider],url.searchParams.get("redirect_uri"));
  assert(!JSON.stringify(pack).includes("server-secret"));
}
assert(pack.slack.manifest.oauth_config.scopes.user.includes("chat:write"));
assert.deepEqual(pack.microsoft.applicationPermissions,[]);
for(const bad of ["http://example.com","https://example.com/path","https://user:pass@example.com","https://example.com?x=1","https://example.com#x"])assert.throws(()=>registrationPack(bad));

await connect("github");activeProvider="github";
const patchPendingInput=input("github","issues.create",{repo:"owner/repo",title:"Stale",body:"Stale approval"});
const patchPending=await callApp(env,identity,patchPendingInput,fetcher);
sql.prepare("UPDATE app_calls SET status='approved' WHERE id=?").run(patchPending.callId);
await api("/api/apps/connections/"+ghId,"PATCH",{permissions:["read","write"]});
await deny(()=>callApp(env,identity,patchPendingInput,fetcher),"app_approval_expired_or_connection_changed");
const timedInput=input("github","issues.create",{repo:"owner/repo",title:"Timed",body:"Timed approval"});
const timed=await callApp(env,identity,timedInput,fetcher);
sql.prepare("UPDATE app_calls SET status='approved' WHERE id=?").run(timed.callId);
sql.prepare("UPDATE app_calls SET expires_at=? WHERE id=?").run(old,timed.callId);
await deny(()=>callApp(env,identity,timedInput,fetcher),"app_approval_expired_or_connection_changed");
for(const [suffix,code] of [["&error=access_denied","app_authorization_denied"],["","missing_oauth_code"]]) {
  const started=await (await api("/api/apps/authorize","POST",{provider:"github",permissions:["read"]})).json() as any;
  const state=new URL(started.authorizationUrl).searchParams.get("state");
  const result=await api("/api/apps/oauth/github/callback?state="+state+suffix);
  assert.equal((await result.json() as any).error,code);
}
assert.equal((await api("/api/apps/oauth/github/callback")).status,400);
for(const mode of ['query','token']){
 const started=await (await api('/api/apps/authorize','POST',{provider:'slack'})).json() as any,state=new URL(started.authorizationUrl).searchParams.get('state');
 const callback='/api/apps/oauth/slack/callback?state='+state+(mode==='query'?'&error=invalid_team_for_non_distributed_app':'&code=fixture');
 const result=await handleApps(req(callback),env,async()=>json({ok:false,error:'invalid_team_for_non_distributed_app'}));
 assert.equal(result.status,303);assert.equal(new URL(result.headers.get('location')!).searchParams.get('app_error'),'slack_distribution_required');
}
assert.equal((await api("/api/apps/oauth/github/callback?state="+"a".repeat(129))).status,400);
assert.equal((await api("/api/apps/authorize","POST",{provider:"github",permissions:["read"]},"one",{"content-type":"text/plain"})).status,415);
const malformed=await handleApps(new Request(origin+"/api/apps/authorize",{method:"POST",headers:{origin,cookie:"rl_session=session-one","content-type":"application/json"},body:"{"}),env,fetcher);
assert.equal(malformed.status,400);
for(const provider of ["outlook","microsoft_calendar"] as const) {
  const id=connections.get(provider)!;
  const scopes=provider==="outlook"?["User.Read","Mail.ReadWrite"]:["User.Read","Calendars.ReadWrite"];
  sql.prepare("UPDATE app_connections SET scopes_json=? WHERE id=?").run(JSON.stringify(scopes),id);
  assert.equal((await callApp(env,identity,input(provider,provider==="outlook"?"messages.list":"calendars.list",{}),fetcher)).status,"succeeded");
}
const expiredWithRefresh={accessToken:"expired",refreshToken:"refresh",expiresAt:old,scopes:appScopes("github",["read","write"])};
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(await seal(env,expiredWithRefresh,tokenContext("github",ghId)),ghId);
let releaseRefresh:()=>void,signalRefresh:()=>void;
const refreshGate=new Promise<void>(resolve=>{releaseRefresh=resolve;}),enteredRefresh=new Promise<void>(resolve=>{signalRefresh=resolve;});
const gated:typeof fetch=async(url,init)=>{
  if(String(url)===APP_CATALOG.github.token){signalRefresh!();await refreshGate;}
  return fetcher(url,init);
};
const refreshing=callApp(env,identity,input("github","repositories.list",{}),gated);
await enteredRefresh;
await deny(()=>callApp(env,identity,input("github","repositories.list",{}),fetcher),"app_refresh_in_progress");
releaseRefresh!();assert.equal((await refreshing).status,"succeeded");
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(await seal(env,expiredWithRefresh,tokenContext("github",ghId)),ghId);
await deny(()=>callApp(env,identity,input("github","repositories.list",{}),async()=>json({error:"invalid_grant"},400)),"app_reauthorization_required");
await connect("github");
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(await seal(env,expiredWithRefresh,tokenContext("github",ghId)),ghId);
await deny(()=>callApp(env,identity,input("github","repositories.list",{}),async(url,init)=>String(url)===APP_CATALOG.github.token?json({access_token:"new",scope:"read:user"}):fetcher(url,init)),"app_scope_required");
await connect("github");
const limited=input("github","repositories.list",{});
await assert.rejects(()=>callApp({...env,MONTHLY_TOOL_CALL_LIMIT:"1"} as AppEnv,identity,limited,fetcher),/Monthly Remote Arc/);
const revokedTokens=await seal(env,expiredWithRefresh,tokenContext("github",ghId));
sql.prepare("UPDATE app_connections SET token_ciphertext=? WHERE id=?").run(revokedTokens,ghId);
let releaseRace:()=>void,signalRace:()=>void;
const raceGate=new Promise<void>(resolve=>{releaseRace=resolve;}),raceEntered=new Promise<void>(resolve=>{signalRace=resolve;});
const raceFetch:typeof fetch=async(url,init)=>{if(String(url)===APP_CATALOG.github.token){signalRace!();await raceGate;}return fetcher(url,init);};
const race=callApp(env,identity,input("github","repositories.list",{}),raceFetch);
await raceEntered;
await api("/api/apps/connections/"+ghId,"DELETE");
releaseRace!();
await deny(()=>race,"app_connection_changed");
assert.equal(sql.prepare("SELECT status FROM app_connections WHERE id=?").get(ghId)?.status,"disconnected");
assert.equal((await api("/api/apps/connections/"+ghId,"DELETE")).status,200);
await connect("github");
assert.equal((await handleApps(req("/api/apps/connections/"+ghId,"DELETE"),env,async()=>{throw Error("provider secret");})).status,200);
assert.equal((await handleApps(req("/api/apps/authorize","POST",{provider:"github",permissions:["read"]}),{...env,APP_GITHUB_CLIENT_ID:undefined},fetcher)).status,503);
assert.equal((await handleApps(req("/api/apps"),{...env,DB:{prepare(){throw Error("private database info");}} as unknown as D1Database},fetcher)).status,503);
for(const provider of ["gmail","slack","outlook"] as const) {
  assert.equal((await api("/api/apps/connections/"+connections.get(provider),"DELETE")).status,200);
}
const twoStates=await Promise.all(Array.from({length:2},async()=>{
  const r=await api("/api/apps/authorize","POST",{provider:"github",permissions:["read"]},"two");
  return new URL((await r.json() as any).authorizationUrl).searchParams.get("state");
}));
activeProvider="github";
const firstCallbacks=await Promise.all(twoStates.map(state=>api("/api/apps/oauth/github/callback?state="+state+"&code=test","GET",undefined,"two")));
assert(firstCallbacks.every(r=>r.status===303));
const ownTwo=(await listApps(env,"two")).connections;
assert.equal(ownTwo.length,1,"concurrent first authorizations produce a decryptable single account");
assert.equal((await callApp(env,{userId:"two",scope:"apps:read"},{connectionId:ownTwo[0]!.id,operation:"repositories.list",arguments:{},requestId:"two-read-1"},fetcher)).status,"succeeded");
await deny(()=>providerJson("https://allowed.invalid",{},async()=>new Response(new ReadableStream({start(controller){controller.error(Error("private stream error"));}}))),"app_provider_unavailable");

console.log("Apps: real SQLite ownership, OAuth lifecycle, approvals, concurrency, provider boundaries and registration configuration passed.");
sql.close();
