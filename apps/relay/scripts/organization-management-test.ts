import assert from "node:assert/strict";
import { canManageOrganization, handleOrganizations } from "../src/auth/organizations.js";

assert.equal(canManageOrganization("owner","member","change_role"),true);
assert.equal(canManageOrganization("owner","owner","remove"),false);
assert.equal(canManageOrganization("admin","admin","remove"),false);
assert.equal(canManageOrganization("admin","member","remove"),true);
assert.equal(canManageOrganization("admin","member","change_role"),false);
assert.equal(canManageOrganization("member","member","remove"),false);

const APP = "https://mcp.remotearc.app";
const TEAM = "org:123e4567-e89b-12d3-a456-426614174000";
function mockDatabase(role: "owner"|"admin"|"member", kind:"team"|"personal"="team") {
  let writes = 0;
  const statements: string[] = [];
  const db = {
    prepare(sql:string) {
      statements.push(sql);
      const stmt = {
        bind(..._args:unknown[]) { return stmt; },
        async first() {
          if (sql.includes("FROM organization_members m") && sql.includes("JOIN organizations")) return {role,kind,name:"Development team"};
          if (sql.includes("FROM organization_members m") && sql.includes("JOIN users")) return null;
          if (sql.includes("SELECT role FROM organization_invitations")) return {role:"member"};
          if (sql.includes("COUNT(*)")) return {n:0};
          return null;
        },
        async all() {return {results:[]};},
        async run() { writes++; return {meta:{changes:1}}; },
      };
      return stmt;
    },
    async batch(..._args:unknown[]) {writes++; return [];},
  } as unknown as D1Database;
  return { db, writes:()=>writes, statements };
}
function request(path:string, method="GET", payload?:object, origin=APP) {
  return new Request(APP+"/api/organizations"+path,{
    method, headers: method==="GET"?{}:{"content-type":"application/json",origin},
    ...(payload===undefined||method==="GET"?{}:{body:JSON.stringify(payload)}),
  });
}
{
  const state=mockDatabase("member");
  const env={DB:state.db,APP_ORIGIN:APP,PUBLIC_ORIGIN:APP};
  const intrusion=await handleOrganizations(request("/"+TEAM+"/invitations","POST",{email:"outsider@example.com",role:"member"}),env,"user-1");
  assert.equal(intrusion.status,403);
  assert.equal(state.writes(),0);
  const role=await handleOrganizations(request("/"+TEAM+"/members/other","PATCH",{role:"admin"}),env,"user-1");
  assert.equal(role.status,403);
  assert.equal(state.writes(),0);
}
{
  const state=mockDatabase("owner");
  const env={DB:state.db,APP_ORIGIN:APP,PUBLIC_ORIGIN:APP};
  const csrf=await handleOrganizations(request("/"+TEAM,"PATCH",{name:"Hijacked"},"https://attacker.invalid"),env,"user-1");
  assert.equal(csrf.status,403);
  const badType=await handleOrganizations(new Request(APP+"/api/organizations/"+TEAM,{method:"PATCH",headers:{origin:APP,"content-type":"text/plain"},body:"{}"}),env,"user-1");
  assert.equal(badType.status,415);
  const invalid=await handleOrganizations(request("/"+TEAM,"PATCH",{name:" ".repeat(90)}),env,"user-1");
  assert.equal(invalid.status,400);
  assert.equal(state.writes(),0);
  const invite=await handleOrganizations(request("/"+TEAM+"/invitations","POST",{email:"person@example.com",role:"member"}),env,"owner");
  assert.equal(invite.status,201);
  const data=await invite.json() as {delivery:string;invitation:{email:string}};
  assert.equal(data.delivery,"in_app");
  assert.equal(data.invitation.email,"person@example.com");
  assert.equal(state.writes(),1);
}
{
  // Browser requests encode the ':' in organization IDs as '%3A'.
  // Details and member views must decode the segment before RBAC lookup.
  const state=mockDatabase("owner","personal");
  const env={DB:state.db,APP_ORIGIN:APP,PUBLIC_ORIGIN:APP};
  const encodedPersonal=await handleOrganizations(request("/"+encodeURIComponent("personal:user-1")),env,"user-1");
  assert.equal(encodedPersonal.status,200,"Encoded personal organization must load");
  const encodedTeam=await handleOrganizations(request("/"+encodeURIComponent(TEAM)),env,"user-1");
  assert.equal(encodedTeam.status,200,"Encoded team organization must load");
  const malicious=await handleOrganizations(request("/org%3A%2Fnot-a-team"),env,"user-1");
  assert.equal(malicious.status,404,"Encoded path separator must be rejected");
}
{
  const state=mockDatabase("owner","personal");
  const env={DB:state.db,APP_ORIGIN:APP,PUBLIC_ORIGIN:APP};
  assert.equal((await handleOrganizations(request("/personal:user-1/invitations","POST",{email:"foo@example.com",role:"member"}),env,"user-1")).status,403);
  assert.equal(state.writes(),0);
}

{
  // Validate the actual SQL migrations in an isolated, in-memory SQLite DB.
  const { DatabaseSync } = await import("node:sqlite");
  const { readFileSync } = await import("node:fs");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,created_at TEXT NOT NULL);");
  db.prepare("INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)").run("a","owner@example.com","Owner","2026-01-01T00:00:00Z");
  db.exec(readFileSync(new URL("../migrations/0027_organization_foundation.sql",import.meta.url),"utf8"));
  db.exec(readFileSync(new URL("../migrations/0034_organization_invitations.sql",import.meta.url),"utf8"));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM organizations WHERE kind='personal'").get() as {n:number}).n,1);
  db.prepare("INSERT INTO users(id,email,name,created_at) VALUES(?,?,?,?)").run("b","member@example.com","Member","2026-01-02T00:00:00Z");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM organizations WHERE kind='personal'").get() as {n:number}).n,2);
  db.prepare("INSERT INTO organizations(id,name,kind,created_at) VALUES(?,?,'team',?)").run(TEAM,"Development team","2026-01-01T00:00:00Z");
  db.prepare("INSERT INTO organization_members(organization_id,user_id,role,status,created_at) VALUES(?,?,'owner','active',?)")
    .run(TEAM,"a","2026-01-01T00:00:00Z");
  db.prepare("INSERT INTO organization_invitations(id,organization_id,email,role,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
    .run("inv-1",TEAM,"member@example.com","member","a","2027-01-01T00:00:00Z","2026-01-01T00:00:00Z");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM organization_members WHERE organization_id=?").get(TEAM) as {n:number}).n,1,
    "Pending invitation must not grant membership");
  assert.throws(() => db.prepare("INSERT INTO organization_invitations(id,organization_id,email,role,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
    .run("inv-2",TEAM,"MEMBER@example.com","member","a","2027-01-01T00:00:00Z","2026-01-01T00:00:00Z"),
    "Case-insensitive duplicate pending invitations must be rejected");
  db.close();
}

console.log("Organization role safety, CSRF, invite and personal-boundary tests passed.");
