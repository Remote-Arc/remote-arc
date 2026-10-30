import assert from "node:assert/strict";
import { handleAdminUsageInsights } from "../src/admin/admin-usage-insights.js";
import { adminApiMethods } from "../src/admin/admin-service.js";

const origin="https://admin.remotearc.app";
function fakeEnv(role:"admin"|"user"="admin"){
 const sqls:string[]=[];const values:unknown[][]=[];
 const db={prepare(sql:string){
   sqls.push(sql);
   let args:unknown[]=[];
   const s={bind(...p:unknown[]){args=p;values.push(p);return s;},
     async first(){
       if(sql.includes("FROM sessions s"))return {id:"admin",email:"admin@example.test",role,plan:"plus",name:"Admin"};
       if(sql==="SELECT id FROM users WHERE id=?1 LIMIT 1")return args[0]==="existing"?{id:"existing"}:null;
       if(sql.includes("FROM user_monthly_usage"))return {total:20000};
       if(sql.includes("COUNT(*) AS total"))return {total:1350,succeeded:1250,failed:100};
       return null;
     },
     async all(){
       if(sql.includes("GROUP BY substr"))return {results:[{day:"2026-10-24",calls:400,failures:12}]};
       if(sql.includes("GROUP BY tool_name"))return {results:[{tool:"read_file",calls:900,failures:10}]};
       if(sql.includes("GROUP BY outcome"))return {results:[{outcome:"allowed",calls:1250}]};
       return {results:[]};
     },
     async run(){throw Error("Read-only diagnostics must never write D1");}
   };return s;
 }} as unknown as D1Database;
 return {env:{DB:db,PUBLIC_ORIGIN:origin},sqls,values};
}
function req(query:string,auth=true,method="GET"){return new Request(origin+"/api/admin/usage-insights"+query,{method,headers:auth?{cookie:"rl_session=unit-session"}:{}});}
assert.deepEqual(adminApiMethods("/api/admin/usage-insights"),["GET"]);
const {env,sqls,values}=fakeEnv();
assert.equal((await handleAdminUsageInsights(req("?userId=existing",false),env)).status,401);
assert.equal((await handleAdminUsageInsights(req("?userId=../other"),env)).status,400);
assert.equal((await handleAdminUsageInsights(req("?userId=unknown"),env)).status,404);
assert.equal((await handleAdminUsageInsights(req("?userId=existing",true,"POST"),env)).status,405);
const denied=fakeEnv("user");
assert.equal((await handleAdminUsageInsights(req("?userId=existing"),denied.env)).status,403);
const result=await handleAdminUsageInsights(req("?userId=existing"),env);
assert.equal(result.status,200);
assert.equal(result.headers.get("cache-control"),"private, no-store");
const data=await result.json() as any;
assert.equal(data.chargedCalls,20000);
assert.deepEqual(data.audited,{total:1350,succeeded:1250,failed:100});
assert.equal(data.taskSuccessAvailable,false);
assert.equal(data.retriesAvailable,false);
assert.ok(sqls.filter(s=>s.includes("FROM audit_events")).length===4);
assert.ok(values.some(v=>v[0]==="existing"&&String(v[1]).includes("T00:00:00")));
assert.ok(!JSON.stringify(data).includes("admin@example.test"));
console.log("PASS: admin usage insights owner guard, bounded month aggregates, counts and privacy");
