import assert from "node:assert/strict";
import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {handlePairingApprove} from "../src/device.js";
import {handleAdminPlanGrants,handleAdminPlanGrantRevoke} from "../src/plan-admin.js";
import {sha256Hex} from "../src/auth.js";

const sql=new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for(const name of fs.readdirSync(new URL("../migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort()) {
  sql.exec(fs.readFileSync(new URL("../migrations/"+name,import.meta.url),"utf8"));
}
const db={
  prepare(q:string){
    const statement=sql.prepare(q);
    const bind=(args:unknown[])=>({
      async first(){return statement.get(...args as [])||null;},
      async all(){return {results:statement.all(...args as [])};},
      async run(){return this.runSync();},
      runSync(){return {meta:{changes:Number(statement.run(...args as []).changes)}};}
    });
    return { ...bind([]),bind(...args:unknown[]){return bind(args);} };
  },
  async batch(items:any[]){
    sql.exec("BEGIN IMMEDIATE");
    try{const result=items.map(item=>item.runSync());sql.exec("COMMIT");return result;}
    catch(error){sql.exec("ROLLBACK");throw error;}
  }
} as unknown as D1Database;
const now=new Date().toISOString(),future=new Date(Date.now()+86400_000).toISOString();
const env={DB:db,PUBLIC_ORIGIN:"https://mcp.remotearc.app",APP_ORIGIN:"https://mcp.remotearc.app",ARC_BILLING_ENABLED:"0"} as const;
for(const [id,role] of [["freeuser","user"],["admin","admin"]] as const){
  sql.prepare("INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)").run(id,id,id+"@example.test",role,now);
  sql.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(await sha256Hex(id+"-session"),id,future,now);
}
let seq=0;
function pairing(platform:string){
  const id=++seq,code="PAIR-"+String(id).padStart(4,"0");
  sql.prepare("INSERT INTO device_pairings(device_code_hash,device_secret_hash,user_code,device_name,platform,status,expires_at,created_at) VALUES(?,?,?,?,?,'pending',?,?)")
    .run("code-"+id,"secret-"+id,code,"Test Device "+id,platform,future,now);
  return code;
}
async function approve(platform:string,user="freeuser"){
  const user_code=pairing(platform);
  const response=await handlePairingApprove(new Request("https://mcp.remotearc.app/api/pairing/approve",{
    method:"POST",headers:{cookie:"rl_session="+user+"-session","content-type":"application/json"},
    body:JSON.stringify({user_code})
  }),env);
  return {response,payload:await response.json() as any};
}
function counts(){
  return sql.prepare("SELECT platform,COUNT(*) n FROM devices WHERE revoked_at IS NULL GROUP BY platform").all() as Array<{platform:string;n:number}>;
}
const first=await approve("win32");assert.equal(first.response.status,200);
assert.equal((await approve("browser")).response.status,200);
assert.equal((await approve("darwin")).response.status,200,"Free 2nd computer must work despite browser");
const overflow=await approve("linux");
assert.equal(overflow.response.status,403);
assert.equal(overflow.payload.error,"device_limit_reached");
assert.equal(overflow.payload.limit,2);
assert.equal(overflow.payload.count,2);
assert.equal((await approve("browser")).response.status,200,"browser extension has its own quota");

// Existing administrator-controlled Plus grant API has explicit expiry and audit.
const grantBody={email:"freeuser@example.test",plan:"plus",reason:"Time-limited Plus upgrade QA",expires_at:future};
function adminRequest(path:string,body?:unknown,user="admin"){
  return new Request("https://mcp.remotearc.app"+path,{method:body===undefined?"GET":"POST",
    headers:{cookie:"rl_session="+user+"-session","content-type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
}
assert.equal((await handleAdminPlanGrants(adminRequest("/api/admin/plan-grants",grantBody,"freeuser"),env)).status,403);
const granted=await handleAdminPlanGrants(adminRequest("/api/admin/plan-grants",grantBody),env);
assert.equal(granted.status,201);
const grant=(await granted.json() as any).grant;
assert.equal(grant.expires_at,future);
const filtered=await handleAdminPlanGrants(adminRequest("/api/admin/plan-grants?email=freeuser%40example.test"),env);
assert.equal(filtered.status,200);
assert.equal(((await filtered.json()) as any).grants[0].id,grant.id);
for(let n=3;n<=10;n++){
  const result=await approve("win32");
  assert.equal(result.response.status,200,"Plus computer "+n+" should fit");
}
const plusOverflow=await approve("win32");
assert.equal(plusOverflow.response.status,403);
assert.equal(plusOverflow.payload.limit,10);
assert.equal(plusOverflow.payload.count,10);
const revoked=await handleAdminPlanGrantRevoke(adminRequest("/api/admin/plan-grants/"+grant.id+"/revoke",{}),env,grant.id);
assert.equal(revoked.status,200);
const afterRevoke=await approve("win32");
assert.equal(afterRevoke.response.status,403);
assert.equal(afterRevoke.payload.limit,2,"expired/revoked Plus must revert to Free 2-computer limit");
assert.equal(counts().find(x=>x.platform==="browser")?.n,2);
console.log("Device pairing: Free 2, Plus 10, browsers separate, quota errors, duration and revoke passed.");
