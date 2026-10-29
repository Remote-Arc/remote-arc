import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {sha256Hex} from "../src/auth.js";
import {handleBrowserAuth,parseBrowserAuth,browserAuthForDevice,NO_BROWSER_AUTH} from "../src/browser-auth.js";
import {callDevice} from "../src/device-call.js";
import {classifyExpectedMcpError} from "../src/mcp-errors.js";
import {DeviceRegistry} from "../src/registry.js";
import {extractCaptchaImages} from "../src/browser-auth-result.js";
const sql=new DatabaseSync(":memory:");
for(const name of fs.readdirSync(new URL("../migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort())
 sql.exec(fs.readFileSync(new URL("../migrations/"+name,import.meta.url),"utf8"));
const db={prepare(query:string){
 const stmt=sql.prepare(query);
 const bind=(args:any[])=>({
  async first(){return stmt.get(...args)||null;},
  async all(){return {results:stmt.all(...args)};},
  async run(){return {success:true,meta:{changes:Number(stmt.run(...args).changes)}};}
 });
 return {...bind([]),bind(...args:any[]){return bind(args);}};
}} as any;
const now=new Date().toISOString(),origin="https://agent.remotearc.app";
for(const id of ["owner","other"]){
 sql.prepare("INSERT INTO users(id,google_sub,email,created_at) VALUES(?,?,?,?)").run(id,id,id+"@example.test",now);
 sql.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
  .run(await sha256Hex("token-"+id),id,new Date(Date.now()+86400000).toISOString(),now);
 sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools) VALUES(?,?,?,?,?,?,?)")
  .run("device-"+id,id,"Computer","linux","fixture-"+id,now,JSON.stringify(["browser_runner_start","browser_runner_act","browser_runner_snapshot"]));
}
const dispatches:any[]=[];
const env={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,DASHBOARD_ORIGIN:origin,
 REGISTRY:{getByName:()=>({fetch:async(request:Request)=>{
  dispatches.push(await request.json());return Response.json({result:{ok:true}});
 }})}
} as any;
function request(method="GET",body?:unknown,token="owner",sentOrigin:string|null=origin,device="device-owner"){
 return new Request(origin+"/api/browser-auth/"+device,{method,headers:{"cookie":"rl_session=token-"+token,...(sentOrigin?{origin:sentOrigin}:{}),"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
}
assert.deepEqual(parseBrowserAuth("{}"),NO_BROWSER_AUTH);
for(const code of ["BROWSER_AUTH_REQUIRED","BROWSER_AUTH_UPDATE_REQUIRED"])assert.equal(classifyExpectedMcpError(new Error(code+": approve/update"))?.code,code);
for(const origins of [[],["https://seek.co.nz.evil.test/path"],["https://*.seek.co.nz"],["http://seek.co.nz"],["https://x.test?secret=1"],["https://user:pass@x.test"]])
 assert.equal(parseBrowserAuth({otp:true,captcha:true,origins,mailbox:""}).otp,false);
const approved={otp:true,captcha:true,origins:["https://www.seek.co.nz"],mailbox:"jenny@example.test"};
assert.equal((await handleBrowserAuth(request("GET",undefined,"other"),env)).status,404);
assert.equal((await handleBrowserAuth(new Request(origin+"/api/browser-auth/device-owner"),env)).status,401);
for(const source of [null,"https://evil.test"]){
 assert.equal((await handleBrowserAuth(request("POST",approved,"owner",source),env)).status,403);
}
assert.equal((await handleBrowserAuth(request("POST",{...approved,origins:["https://www.seek.co.nz/path"]}),env)).status,400);
assert.equal((await handleBrowserAuth(request("POST",approved),env)).status,200);
assert.deepEqual(await (await handleBrowserAuth(request(),env)).json(),approved);
assert.deepEqual(await browserAuthForDevice(env,"other","device-owner"),NO_BROWSER_AUTH);
const identity={userId:"owner",clientId:"dashboard",grantId:null,scopes:["browser:read","browser:interact"]} as any;
await callDevice(env,identity,"device-owner","browser_runner_snapshot",{session_id:"task",browserAuth:{otp:true}});
assert.deepEqual(dispatches.at(-1).policy.browserAuth,approved);
assert.equal((await handleBrowserAuth(request("POST",NO_BROWSER_AUTH),env)).status,200);
await callDevice(env,identity,"device-owner","browser_runner_snapshot",{session_id:"task",browserAuth:approved});
assert.deepEqual(dispatches.at(-1).policy.browserAuth,NO_BROWSER_AUTH,"revocation must be fresh, not from tool args");
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event_type='device.browser_auth_updated'").get()!.n,2);
const image={frame:"f1",mimeType:"image/png",data:"YWJj"};
const converted=extractCaptchaImages({authentication:{captcha:true},captcha_images:[image]});
assert.equal(converted.images.length,1);assert(!("captcha_images" in converted.clean));
assert.equal(extractCaptchaImages({captcha_images:[{...image,mimeType:"image/svg+xml"}]}).images.length,0);
assert.equal(extractCaptchaImages({captcha_images:[{...image,data:"not base64!!"}]}).images.length,0);
const legacy={DB:{prepare(){throw Error("no such column: browser_auth_permissions");}}} as any;
assert.deepEqual(await browserAuthForDevice(legacy,"owner","device-owner"),NO_BROWSER_AUTH);
let sends=0;
const attachment={userId:"owner",deviceId:"device-owner",tools:["browser_runner_act"],capabilities:[] as string[]};
const socket={deserializeAttachment:()=>attachment,send:()=>{sends++;}};
const registry=new DeviceRegistry({getWebSockets:()=>[socket]} as any);
const old=await registry.fetch(new Request("https://registry/call",{method:"POST",headers:{"content-type":"application/json","x-remote-link-user-id":"owner"},body:JSON.stringify({deviceId:"device-owner",tool:"browser_runner_act",arguments:{action:"fill"},policy:{browserAuth:NO_BROWSER_AUTH}})}));
assert.equal(old.status,409);
assert.match((await old.json() as any).error,/BROWSER_AUTH_UPDATE_REQUIRED/);
assert.equal(sends,0,"old clients must not receive fills that ignore approval");
sql.close();console.log("Browser authentication: approval, origin validation, ownership, CSRF, revocation, dispatch policy, audit and image output passed.");
