import assert from "node:assert/strict";
import { validateSubmission, submitWebsiteInterest, listWebsiteSubmissions, updateWebsiteSubmission } from "../src/domains/engagement.ts";
import { safeReturnTo } from "../src/auth.ts";

const valid={category:"early_access",email:" Sam@Example.COM ",name:"Sam",message:"Please automate my GitHub report and summary",source:"arc",website:"",consent:true};
assert.equal(validateSubmission(valid).email,"sam@example.com");
for(const change of [
 {consent:false},{website:"https://spam.invalid"},{email:"not_an_email"},
 {message:"hi"},{source:"https://evil.com/?x=1"},{category:"sales"},
 {message:"a".repeat(3001)}
]){
 assert.equal(validateSubmission({...valid,...change}),null);
}
const sent=[];
let allowed=true;
const db={prepare(sql){return{bind(...values){return{async run(){sent.push({sql,values});return{success:true}}}}}}};
const env={DB:db,PUBLIC_ORIGIN:"https://mcp.remotearc.app",APP_ORIGIN:"https://mcp.remotearc.app",MARKETING_ORIGIN:"https://remotearc.app",ADMIN_ORIGIN:"https://admin.remotearc.app",ENGAGEMENT_RATE_LIMITER:{async limit(){return {success:allowed}}}};
const req=(body,opts={})=>new Request("https://remotearc.app/api/public/engagement",{
 method:"POST",headers:{"content-type":"application/json","origin":opts.origin??"https://remotearc.app","cf-connecting-ip":"127.0.0.5"},body:JSON.stringify(body)
});
const result=await submitWebsiteInterest(req(valid),env);
assert.equal(result.status,201);assert.equal((await result.json()).ok,true);
assert.equal(sent.length,1);
assert.equal(sent[0].values[2],"sam@example.com");
assert.equal((await submitWebsiteInterest(req(valid,{origin:"https://evil.example"}),env)).status,403);
assert.equal((await submitWebsiteInterest(req({...valid,message:"x"}),env)).status,400);
allowed=false;
assert.equal((await submitWebsiteInterest(req(valid),env)).status,429);
assert.equal(sent.length,1);
assert.equal((await submitWebsiteInterest(req(valid),{...env,ENGAGEMENT_RATE_LIMITER:undefined})).status,503);
assert.equal((await listWebsiteSubmissions(new Request("https://admin.remotearc.app/api/admin/submissions"),env)).status,401);
assert.equal((await updateWebsiteSubmission(new Request("https://admin.remotearc.app/api/admin/submissions/00000000-0000-0000-0000-000000000001",{method:"DELETE",headers:{origin:"https://admin.remotearc.app"}}),env,"00000000-0000-0000-0000-000000000001")).status,401);
const e=new Request("https://mcp.remotearc.app/auth/login");
assert.equal(safeReturnTo("https://admin.remotearc.app/",e,env),"https://admin.remotearc.app/");
assert.equal(safeReturnTo("https://evil.example/",e,env),"https://mcp.remotearc.app/");
console.log("Engagement validation, CSRF, throttling, fail-closed, admin gates and safe admin login redirect passed");
