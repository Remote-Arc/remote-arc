import assert from "node:assert/strict";
import { adminArcInterest, submitArcInterest } from "../src/lead-intake.js";

type Row = {id:string;kind:string;email:string;name:string|null;company:string|null;message:string;locale:string;source:string;status:string;created_at:string;updated_at:string};
const leads:Row[]=[];
let role:"admin"|"user"="admin";
const fakeDB={
  prepare(sql:string){
    let binds:unknown[]=[];
    const statement={
      bind(...args:unknown[]){binds=args;return statement;},
      async first(){
        if(sql.includes("FROM sessions s"))return {id:"admin",email:"admin@example.com",name:"Admin",avatar_url:null,role,plan:"free",has_plus_grant:0};
        if(sql.includes("COUNT(*) AS total FROM arc_interest_leads"))return {total:leads.filter(x=>!sql.includes("WHERE status")||x.status===binds[0]).length};
        throw Error("Unexpected first SQL: "+sql);
      },
      async all(){
        if(!sql.includes("FROM arc_interest_leads"))throw Error("Unexpected all SQL: "+sql);
        const rows=leads.filter(x=>!sql.includes("WHERE status")||x.status===binds[0]).sort((a,b)=>b.created_at.localeCompare(a.created_at));
        const m=sql.match(/OFFSET (\d+)/);return {results:rows.slice(Number(m?.[1]||0),Number(m?.[1]||0)+30)};
      },
      async run(){
        if(sql.includes("INSERT INTO arc_interest_leads")){
          const [id,kind,email,name,company,message,locale,source,created]=binds as string[];
          leads.push({id,kind,email,name,company,message,locale,source,status:"new",created_at:created,updated_at:created});
          return {meta:{changes:1}};
        }
        if(sql.includes("UPDATE arc_interest_leads")){
          const lead=leads.find(x=>x.id===binds[2]);if(!lead)return {meta:{changes:0}};
          lead.status=String(binds[0]);lead.updated_at=String(binds[1]);return {meta:{changes:1}};
        }
        throw Error("Unexpected run SQL: "+sql);
      }
    };
    return statement;
  }
};
const env={DB:fakeDB,PUBLIC_ORIGIN:"https://remotearc.app"} as unknown as Parameters<typeof submitArcInterest>[1];
const json=(payload:unknown,opts:{url?:string;origin?:string;type?:string;cookie?:string;method?:string}={})=>new Request(opts.url||"https://remotearc.app/api/public/arc-interest",{
  method:opts.method||"POST",
  headers:{"content-type":opts.type||"application/json",origin:opts.origin||"https://remotearc.app",...(opts.cookie?{cookie:opts.cookie}:{})},
  body:JSON.stringify(payload)
});
const good={kind:"early_access",email:"Dev@Example.com",name:"Dev",company:"Example",message:"Integrate Jira and GitHub to write weekly summaries",locale:"zh",source:"arc"};
const valid=await submitArcInterest(json(good),env);
assert.equal(valid.status,201);assert.equal(leads.length,1);assert.equal(leads[0]!.email,"dev@example.com");assert.equal(leads[0]!.kind,"early_access");
assert.equal((await submitArcInterest(json({...good,message:"short"}),env)).status,400);
assert.equal((await submitArcInterest(json({...good,email:"invalid"}),env)).status,400);
assert.equal((await submitArcInterest(json({...good,website:"spambot.site"}),env)).status,202);
assert.equal(leads.length,1,"Honeypot must not persist");
assert.equal((await submitArcInterest(json(good,{origin:"https://evil.example"}),env)).status,403);
assert.equal((await submitArcInterest(json(good,{url:"https://mcp.remotearc.app/api/public/arc-interest",origin:"https://mcp.remotearc.app"}),env)).status,403);
assert.equal((await submitArcInterest(json({...good,message:"x".repeat(6200)}),env)).status,413);
assert.equal((await submitArcInterest(new Request("https://remotearc.app/api/public/arc-interest",{method:"POST",headers:{origin:"https://remotearc.app","content-type":"application/json"},body:"{invalid"}),env)).status,400);

const adminUrl="https://admin.remotearc.app/api/admin/arc-interest";
assert.equal((await adminArcInterest(new Request(adminUrl),env)).status,401);
const authorized={cookie:"rl_session=test-token"};
role="user";
assert.equal((await adminArcInterest(new Request(adminUrl,{headers:authorized}),env)).status,403);
role="admin";
const result=await adminArcInterest(new Request(adminUrl,{headers:authorized}),env);
assert.equal(result.status,200);
const data=await result.json() as {total:number;items:Row[]};
assert.equal(data.total,1);
assert.equal(data.items[0]!.message,good.message);
assert.equal((await adminArcInterest(json({id:leads[0]!.id,status:"contacted"},{url:adminUrl,origin:"https://evil.example",cookie:"rl_session=test-token",method:"PATCH"}),env)).status,403);
const patch=await adminArcInterest(json({id:leads[0]!.id,status:"contacted"},{url:adminUrl,origin:"https://admin.remotearc.app",cookie:"rl_session=test-token",method:"PATCH"}),env);
assert.equal(patch.status,200);assert.equal(leads[0]!.status,"contacted");
assert.equal((await adminArcInterest(new Request(adminUrl+"?status=contacted",{headers:authorized}),env)).status,200);
console.log("Arc interest API tests passed: validation, origin, honeypot, payload budget, admin auth, pagination, status update");
