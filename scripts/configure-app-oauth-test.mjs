import assert from "node:assert/strict";import {readFileSync} from "node:fs";
import {APP_OAUTH_PLATFORMS,appOAuthSecrets,configureAppOAuth} from "./configure-app-oauth.mjs";

// apps/relay/scripts/apps-expansion-test.ts checks this list against the provider catalog.
// Every supplied secret is mapped from the deploy workflow.
const workflow=readFileSync(new URL("../.github/workflows/deploy-cloudflare.yml",import.meta.url),"utf8");
for(const platform of APP_OAUTH_PLATFORMS)for(const suffix of ["CLIENT_ID","CLIENT_SECRET"]){
 const name="APP_"+platform+"_"+suffix;assert(workflow.includes(name+": ${{ secrets."+name+" }}"),name+" is not passed to configure-app-oauth");
}

assert.deepEqual(appOAuthSecrets({}),[]);
assert.deepEqual(appOAuthSecrets({APP_LINEAR_CLIENT_ID:"",APP_LINEAR_CLIENT_SECRET:""}),[],"Unset GitHub secrets arrive as empty strings");
assert.throws(()=>appOAuthSecrets({APP_LINEAR_CLIENT_ID:"id-only"}),/both/);
assert.throws(()=>appOAuthSecrets({APP_LINEAR_CLIENT_ID:"id",APP_LINEAR_CLIENT_SECRET:"has space"}),/format/);
assert.deepEqual(appOAuthSecrets({APP_ASANA_CLIENT_ID:"a-id",APP_ASANA_CLIENT_SECRET:"a-secret",APP_VERCEL_INTEGRATION_SLUG:"remote-arc"}).map(item=>item.name),
 ["APP_ASANA_CLIENT_ID","APP_ASANA_CLIENT_SECRET","APP_VERCEL_INTEGRATION_SLUG"]);

const configuration={accountId:"test-account",worker:"remote-link-relay",token:"private-api-token"};
let calls=[];
assert.deepEqual(await configureAppOAuth({...configuration,env:{}},async()=>{calls.push("unexpected");return Response.json({});}),{configured:[],retained:[]});
assert.deepEqual(calls,[],"Nothing supplied means no Cloudflare call");

const env={APP_ASANA_CLIENT_ID:"asana-id",APP_ASANA_CLIENT_SECRET:"asana-secret",APP_GITHUB_CLIENT_ID:"gh-id",APP_GITHUB_CLIENT_SECRET:"gh-secret"};
const written=[];
const result=await configureAppOAuth({...configuration,env},async(url,init)=>{
 assert.equal(new Headers(init.headers).get("authorization"),"Bearer private-api-token");
 if(init.method==="GET")return Response.json({success:true,result:[{name:"APP_GITHUB_CLIENT_ID"},{name:"APP_GITHUB_CLIENT_SECRET"}]});
 const body=JSON.parse(init.body);assert.equal(body.type,"secret_text");written.push([body.name,body.text]);
 return Response.json({success:true,result:{name:body.name}});
});
assert.deepEqual(written,[["APP_ASANA_CLIENT_ID","asana-id"],["APP_ASANA_CLIENT_SECRET","asana-secret"]]);
assert.deepEqual(result,{configured:["APP_ASANA_CLIENT_ID","APP_ASANA_CLIENT_SECRET"],retained:["APP_GITHUB_CLIENT_ID","APP_GITHUB_CLIENT_SECRET"]},"Existing clients are never rotated");
await assert.rejects(()=>configureAppOAuth({...configuration,env},async()=>Response.json({success:false,errors:[{message:"private-api-token"}]},{status:403})),
 error=>!error.message.includes("private-api-token")&&!error.message.includes("asana-secret"));
await assert.rejects(()=>configureAppOAuth({...configuration,env},async()=>Response.json({success:true,result:{}})),/list/);
await assert.rejects(()=>configureAppOAuth({accountId:"",worker:"w",token:"t",env}),/configuration/);
console.log("App OAuth provisioning: workflow parity, pair validation, missing-only writes and secret-free errors passed.");
