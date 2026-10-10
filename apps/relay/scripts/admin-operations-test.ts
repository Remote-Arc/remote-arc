import assert from "node:assert/strict";
import { handleAdminCallCredits, handleAdminOperations, handleAdminBilling } from "../src/admin-operations.js";
import { summarizeCloudflareBillableUsage } from "../src/cloudflare-billing.js";
import { getMonthlyUsage, consumeToolCall } from "../src/usage.js";
const origin = "https://mcp.remotearc.app";
const baseUser = {
  id:"operator",email:"admin@unit.test",name:"Operator",avatar_url:null,
  role:"admin",plan:"plus",has_plus_grant:1,
};
function fakeDB(role = "admin") {
  const writes: Array<{sql:string;args:unknown[]}> = [];
  let usage = 250;
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
          bind(...params: unknown[]) { args = params; return statement; },
          async first() {
            if (sql.includes("FROM sessions s")) return {...baseUser,role};
            if (sql.includes("SELECT id, role FROM users")) return {id:"target",role:"user"};
            if (sql.includes("SELECT COUNT(*) AS total FROM users")) return {total:2};
            if (sql.includes("SELECT COUNT(*) AS total FROM devices")) return {total:1};
            if (sql.includes("FROM audit_events") && sql.includes("AS last7d")) return {count:200,last7d:50};
            if (sql.includes("FROM users u WHERE u.id") || sql.includes("FROM users u WHERE u.id=?1")) {
              return {role:"user",email:"target@unit.test",plan:"free",has_plus_grant:0,extra_calls:500};
            }
            if (sql.includes("FROM user_call_credit_grants WHERE id=?1")) return {user_id:"target",month_key:new Date().toISOString().slice(0,7),extra_calls:500,reason:"early feedback reward"};
            if (sql.includes("SELECT tool_calls FROM user_monthly_usage")) return {tool_calls:usage};
            if (sql.includes("INSERT INTO user_monthly_usage")) { usage++; return {tool_calls:usage}; }
            return null;
          },
          async all() {
            if (sql.includes("FROM users u LEFT JOIN")) return {results:[{
              id:"target",email:"target@unit.test",name:"Target",role:"user",plan:"free",
              used:250,extra:500,device_count:1,last_activity:"2026-10-10T00:00:00Z",
              created_at:"2026-10-01T00:00:00Z",has_plus_grant:0,linked_login:"email_only",first_mcp_client:"ChatGPT",
            }]};
            if (sql.includes("FROM devices d WHERE")) return {results:[{
              id:"dev-1",user_id:"target",name:"Mac",platform:"darwin",arch:"arm64",
              last_seen:"2026-10-10T00:00:00Z",created_at:"2026-10-01T00:00:00Z",
            }]};
            if (sql.includes("GROUP BY substr(created_at")) return {results:[]};
            return {results:[]};
          },
          async run() { writes.push({sql,args});return {meta:{changes:1}}; },
      };
      return statement;
    },
  } as unknown as D1Database;
  const registry = {
    getByName() {return {
      fetch: async () => Response.json([{id:"dev-1",status:"online",agentVersion:"0.6.1-rc.5",recovery_bundle_version:"0.6.1-rc.5"}]),
    };},
  } as unknown as DurableObjectNamespace;
  return {env:{DB:db,REGISTRY:registry,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,
    MONTHLY_TOOL_CALL_LIMIT:"10000"},writes};
}
const req = (path: string, token=true, init: RequestInit={}) => new Request(origin+path,{
  ...init,headers:{...(token?{cookie:"rl_session=unit-session"}:{}),...(init.headers || {})},
});
{
  const {env,writes} = fakeDB();
  assert.equal((await handleAdminOperations(req("/api/admin/operations",false),env)).status,401);
  assert.equal((await handleAdminCallCredits(req("/api/admin/call-credits",false,{method:"POST"}),env)).status,401);
  assert.equal(writes.length,0,"no authenticated session can mutate records");
}
{
  const {env} = fakeDB("user");
  assert.equal((await handleAdminOperations(req("/api/admin/operations"),env)).status,403);
  assert.equal((await handleAdminCallCredits(req("/api/admin/call-credits",true,{method:"GET"}),env)).status,403);
}
{
  const {env,writes} = fakeDB();
  const response = await handleAdminOperations(req("/api/admin/operations"),env);
  assert.equal(response.status,200);
  const data = await response.json() as any;
  assert.equal(data.totals.online,1);
  assert.equal(data.devices[0].agent_version, "0.6.1-rc.5");
  assert.deepEqual(data.users[0].live_agent_versions, ["0.6.1-rc.5"]);
  assert.equal(data.users[0].linked_login, "email_only");
  assert.equal(data.users[0].first_mcp_client, "ChatGPT");
  assert.equal(writes.length,0, "reading live device versions and login hints must not write into D1");
  assert.equal(data.users[0].allowance,10500);
  assert.equal(data.billing.actualUsd,null);
  assert.ok(!JSON.stringify(data).includes("credential_hash"));
  const unauthorized = await handleAdminCallCredits(req("/api/admin/call-credits",true,{
    method:"POST",headers:{"origin":"https://attacker.invalid","content-type":"application/json"},
    body:JSON.stringify({userId:"target",amount:500,reason:"unit grant",month:new Date().toISOString().slice(0,7)}),
  }),env);
  assert.equal(unauthorized.status,403);
  assert.equal(writes.length,0);
  const bad = await handleAdminCallCredits(req("/api/admin/call-credits",true,{
    method:"POST",headers:{"origin":origin,"content-type":"application/json"},
    body:JSON.stringify({userId:"target",amount:-1,reason:"unit grant",month:new Date().toISOString().slice(0,7)}),
  }),env);
  assert.equal(bad.status,400);
  const grant = await handleAdminCallCredits(req("/api/admin/call-credits",true,{
    method:"POST",headers:{"origin":origin,"content-type":"application/json"},
    body:JSON.stringify({userId:"target",amount:500,reason:"early feedback reward",month:new Date().toISOString().slice(0,7)}),
  }),env);
  assert.equal(grant.status,201);
  assert.equal(writes.length,1);
  assert.match(writes[0]!.sql,/INSERT INTO user_call_credit_grants/);
  const usage = await getMonthlyUsage(env,"target");
  assert.equal(usage.limit,10500);
  const consumed = await consumeToolCall(env,"target");
  assert.equal(consumed.limit,10500);
}
{
  const parsed = summarizeCloudflareBillableUsage({result:[
    {ServiceFamilyName:"Workers",ContractedCost:1.25,BillingCurrency:"USD"},
    {ServiceFamilyName:"D1",ContractedCost:0.4,BillingCurrency:"USD"},
    {ServiceFamilyName:"Workers",ContractedCost:0.35,BillingCurrency:"USD"},
  ]});
  assert.equal(parsed.total, 2);
  assert.deepEqual(parsed.services, [{name:"Workers",cost:1.6},{name:"D1",cost:0.4}]);
  assert.throws(() => summarizeCloudflareBillableUsage({result:[{ServiceName:"Unknown"}]}), /billing_costs_unavailable/);
  const {env} = fakeDB();
  assert.equal((await handleAdminBilling(req("/api/admin/billing",false),env)).status, 401);
  assert.equal((await handleAdminBilling(req("/api/admin/billing"),env)).status, 503);
}
console.log("Admin operations status, agent versions, account hints and read-only billing tests passed.");
