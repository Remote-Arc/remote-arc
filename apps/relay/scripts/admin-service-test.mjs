import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adminApiMethods, handleAdminServiceRequest, publicAdminResponse } from "../src/admin-service.ts";
const origin="https://admin.remotearc.app",id="00000000-0000-4000-8000-000000000001";
let role="admin",writes=[],saved;
const env={PUBLIC_ORIGIN:"https://mcp.remotearc.app",ADMIN_ORIGIN:origin,REGISTRY:{getByName(){return{async fetch(){return Response.json([])}}}},DB:{prepare(sql){let values=[];return{bind(...items){values=items;return this;},async first(){
 if(sql.includes("FROM sessions s"))return {id:"operator",email:"operator@example.test",name:"Admin",role,plan:"free",has_plus_grant:0};
 if(sql.includes("SELECT id, role FROM users"))return{id:"target",role:"user"};
 if(sql.includes("SELECT id, email FROM users"))return{id:"target",email:"target@example.test"};
 if(sql.includes("FROM user_call_credit_grants WHERE id=?1"))return saved;
 return null;},async all(){return{results:[]}},async run(){writes.push(sql);if(sql.includes("INSERT INTO user_call_credit_grants"))saved={user_id:values[1],month_key:values[2],extra_calls:values[3],reason:values[4]};return{success:true,meta:{changes:1}};}}}}};
function request(path="/api/me",{method="GET",cookie=true,requestOrigin=origin,body,contentType="application/json",host=origin}={}){return new Request(host+path,{method,headers:{...(cookie?{cookie:"rl_session=test"}:{}),origin:requestOrigin,"content-type":contentType,"x-remote-arc-role":"admin"},...(body===undefined?{}:{body:JSON.stringify(body)})})}
for(const path of ["/mcp","/api/devices","/auth/logout","/api/admin/unknown","/api/admin/plan-grants/a/revoke/more"])assert.equal(adminApiMethods(path),null);
assert.deepEqual(adminApiMethods("/api/admin/submissions/"+id),["PATCH","DELETE"]);
assert.deepEqual(adminApiMethods("/api/admin/plan-grants/"+id+"/revoke"),["POST"]);
assert.equal((await handleAdminServiceRequest(request("/api/me",{host:"https://mcp.remotearc.app"}),env)).status,404);
assert.equal((await handleAdminServiceRequest(request("/api/admin/unknown"),env)).status,404);
assert.equal((await handleAdminServiceRequest(request("/api/me",{method:"POST"}),env)).status,405);
assert.equal((await handleAdminServiceRequest(request("/api/me",{cookie:false}),env)).status,401);
role="user";assert.equal((await handleAdminServiceRequest(request(),env)).status,403);role="admin";
for(const path of ["/api/admin/plan-grants","/api/admin/call-credits","/api/admin/plan-grants/"+id+"/revoke"]){
 assert.equal((await handleAdminServiceRequest(request(path,{method:"POST",requestOrigin:"https://remotearc.app",body:{}}),env)).status,403);
 assert.equal((await handleAdminServiceRequest(request(path,{method:"POST",contentType:"text/plain",body:{}}),env)).status,415);
}
assert.equal(writes.length,0,"Rejected boundary requests must not reach mutations");
for(const path of ["/api/me","/api/monitor","/api/admin/operations?page=0","/api/admin/plan-grants","/api/admin/submissions"]){
 const response=await handleAdminServiceRequest(request(path),env);assert.equal(response.status,200,path);
 assert.match(response.headers.get("cache-control"),/no-store/);assert.equal(response.headers.get("x-remote-arc-admin-contract"),"1");
}
assert.equal((await handleAdminServiceRequest(request("/api/admin/billing"),env)).status,503);
assert.equal((await handleAdminServiceRequest(request("/api/admin/plan-grants",{method:"POST",body:{email:"target@example.test",reason:"Phase 1 review"}}),env)).status,201);
assert.equal((await handleAdminServiceRequest(request("/api/admin/plan-grants/"+id+"/revoke",{method:"POST",body:{}}),env)).status,200);
const credit={userId:"target",month:new Date().toISOString().slice(0,7),amount:100,reason:"Phase 1 test",requestId:id};
assert.equal((await handleAdminServiceRequest(request("/api/admin/call-credits",{method:"POST",body:credit}),env)).status,201);
for(const method of ["PATCH","DELETE"])assert.equal((await handleAdminServiceRequest(request("/api/admin/submissions/"+id,{method,body:{status:"reviewed"}}),env)).status,200);
assert.ok(writes.length>0,"Authorized requests execute the original core handlers");
assert.equal(await publicAdminResponse(request(),env),null);
assert.equal(await publicAdminResponse(request(),{...env,ADMIN_SERVICE_MODE:"legacy"}),null);
assert.equal((await publicAdminResponse(request(),{...env,ADMIN_SERVICE_MODE:"typo"})).status,503);
assert.equal((await publicAdminResponse(request(),{...env,ADMIN_SERVICE_MODE:"external"})).status,503);
let forwarded;const external={...env,ADMIN_SERVICE_MODE:"external",ADMIN_UI:{async fetch(value){forwarded=value;return new Response("independent admin")}}};
assert.equal(await(await publicAdminResponse(request(),external)).text(),"independent admin");
assert.equal(forwarded.headers.get("cookie"),"rl_session=test");
external.ADMIN_UI.fetch=async()=>{throw Error("offline")};assert.equal((await publicAdminResponse(request(),external)).status,503);
const deployConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.match(deployConfig, /"binding"\s*:\s*"ADMIN_UI"/, "Admin UI service binding is required");
assert.match(deployConfig, /"service"\s*:\s*"remote-arc-admin"/, "Bind exactly the independently deployed Admin Worker");
assert.match(deployConfig, /"ADMIN_SERVICE_MODE"\s*:\s*"external"/, "Admin must route to independently owned UI");
console.log("PASS: admin service allowlist, real session/RBAC, all mutation origins, service binding, and reversible external routing");
