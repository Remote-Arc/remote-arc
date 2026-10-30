// Team management end to end on the real D1 schema (in-memory SQLite):
// creation, visibility, invitations, roles, removal and request validation.
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleOrganizations } from "../src/auth/organizations.js";

const sql = new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
for (const file of fs.readdirSync(new URL("../migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
  sql.exec(fs.readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
}
const statement = (query: string, args: unknown[]) => ({
  async first() { return sql.prepare(query).get(...(args as never[])) ?? null; },
  async all() { return { results: sql.prepare(query).all(...(args as never[])) }; },
  async run() { return this.runSync(); },
  runSync() { return { success: true, meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }; },
});
const db = {
  prepare(query: string) { return { ...statement(query, []), bind: (...args: unknown[]) => statement(query, args) }; },
  async batch(statements: { runSync(): unknown }[]) { return statements.map((item) => item.runSync()); },
} as unknown as D1Database;

const APP = "https://agent.remotearc.app";
const env = { DB: db, PUBLIC_ORIGIN: "https://mcp.remotearc.app", APP_ORIGIN: "https://mcp.remotearc.app", DASHBOARD_ORIGIN: APP };
const now = new Date().toISOString();
for (const id of ["owner", "alice", "bob", "carol", "mallory"]) {
  sql.prepare("INSERT INTO users(id,google_sub,email,name,created_at) VALUES(?,?,?,?,?)").run(id, id, id + "@example.test", id, now);
}

const send = async (userId: string, path: string, method = "GET", payload?: unknown, headers: Record<string, string> = {}) => {
  const init: RequestInit = { method, headers: method === "GET" ? headers : { "content-type": "application/json", origin: APP, ...headers } };
  if (payload !== undefined) init.body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const response = await handleOrganizations(new Request(APP + "/api/organizations" + path, init), env, userId);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, body: await response.json() as Record<string, any> };
};
const expectError = async (result: Promise<{ status: number; body: Record<string, any> }>, status: number, error: string) => {
  const { status: actual, body } = await result;
  assert.equal(actual, status, error);
  assert.equal(body.error, error);
};

// Mutations need the dashboard origin and JSON.
await expectError(send("owner", "", "POST", { name: "Team" }, { origin: "https://evil.example" }), 403, "invalid_origin");
await expectError(send("owner", "", "POST", { name: "Team" }, { "content-type": "text/plain" }), 415, "json_required");
await expectError(send("owner", "", "POST", "{not json"), 400, "invalid_json");
await expectError(send("owner", "", "POST", [1, 2]), 400, "invalid_payload");
await expectError(send("owner", "", "POST", { name: "x".repeat(5000) }), 400, "request_too_large");
await expectError(send("owner", "", "POST", { name: " " }), 400, "invalid_organization_name");
await expectError(send("owner", "", "DELETE", {}), 405, "method_not_allowed");

// Create a team; the creator is its only owner.
const created = await send("owner", "", "POST", { name: "  Platform  " });
assert.equal(created.status, 201);
const team: string = created.body.organization.id;
assert.match(team, /^org:[a-f0-9-]{36}$/);
assert.equal(created.body.organization.name, "Platform");
const base = "/" + encodeURIComponent(team);
// Every account also has a private personal organization, listed first.
const teams = (organizations: any[]) => organizations.filter((org) => org.kind === "team");
let listed = await send("owner", "");
assert.deepEqual(listed.body.organizations.map((org: any) => [org.id, org.kind]), [["personal:owner", "personal"], [team, "team"]]);
assert.deepEqual(teams(listed.body.organizations).map((org: any) => [org.role, org.members]), [["owner", 1]]);
await expectError(send("mallory", base), 404, "not_found");
await expectError(send("owner", "/not-an-org"), 404, "not_found");
await expectError(send("owner", "/%E0%A4%A"), 404, "not_found");
await expectError(send("owner", "/org%3Aabc%2Fmembers"), 404, "not_found");

// Owners invite admins; duplicates and malformed invitations are refused.
await expectError(send("owner", base + "/invitations", "POST", { email: "not-an-email", role: "member" }), 400, "invalid_invitation");
await expectError(send("owner", base + "/invitations", "POST", { email: "alice@example.test", role: "owner" }), 400, "invalid_invitation");
const aliceInvite = await send("owner", base + "/invitations", "POST", { email: " Alice@Example.test ", role: "admin" });
assert.equal(aliceInvite.status, 201);
assert.equal(aliceInvite.body.invitation.email, "alice@example.test");
assert.equal(aliceInvite.body.delivery, "in_app");
await expectError(send("owner", base + "/invitations", "POST", { email: "alice@example.test", role: "member" }), 409, "already_invited");

// Invitees see their invitation and nothing else of the team.
listed = await send("alice", "");
assert.deepEqual(teams(listed.body.organizations), []);
assert.deepEqual(listed.body.invitations.map((invite: any) => [invite.organization_id, invite.role]), [[team, "admin"]]);
await expectError(send("alice", base), 404, "not_found");
await expectError(send("alice", "/invitations/accept", "POST", {}), 404, "not_found");
await expectError(send("alice", "/invitations/bad/accept", "POST", {}), 404, "not_found");
await expectError(send("bob", "/invitations/" + aliceInvite.body.invitation.id + "/accept", "POST", {}), 404, "invitation_unavailable");
let accepted = await send("alice", "/invitations/" + aliceInvite.body.invitation.id + "/accept", "POST", {});
assert.equal(accepted.status, 200);
assert.equal(accepted.body.organization_id, team);
await expectError(send("alice", "/invitations/" + aliceInvite.body.invitation.id + "/accept", "POST", {}), 404, "invitation_unavailable");

// Admins manage members but cannot hand out admin.
await expectError(send("alice", base + "/invitations", "POST", { email: "bob@example.test", role: "admin" }), 403, "owner_role_required");
const bobInvite = await send("alice", base + "/invitations", "POST", { email: "bob@example.test", role: "member" });
assert.equal(bobInvite.status, 201);
await expectError(send("alice", base + "/invitations", "POST", { email: "alice@example.test", role: "member" }), 409, "already_member");
accepted = await send("bob", "/invitations/" + bobInvite.body.invitation.id + "/accept", "POST", {});
assert.equal(accepted.status, 200);

// Rejecting and revoking invitations.
const carolInvite = await send("owner", base + "/invitations", "POST", { email: "carol@example.test", role: "member" });
assert.equal((await send("carol", "/invitations/" + carolInvite.body.invitation.id + "/reject", "POST", {})).status, 200);
await expectError(send("carol", "/invitations/" + carolInvite.body.invitation.id + "/accept", "POST", {}), 404, "invitation_unavailable");
const adminInvite = await send("owner", base + "/invitations", "POST", { email: "carol@example.test", role: "admin" });
await expectError(send("alice", base + "/invitations/" + adminInvite.body.invitation.id, "DELETE", {}), 403, "owner_role_required");
await expectError(send("bob", base + "/invitations/" + adminInvite.body.invitation.id, "DELETE", {}), 403, "forbidden");
await expectError(send("owner", base + "/invitations/missing", "DELETE", {}), 404, "invitation_unavailable");
assert.equal((await send("owner", base + "/invitations/" + adminInvite.body.invitation.id, "DELETE", {})).status, 200);
await expectError(send("owner", base + "/invitations", "GET"), 405, "method_not_allowed");

// An expired invitation never activates anyone.
const expiring = await send("owner", base + "/invitations", "POST", { email: "carol@example.test", role: "member" });
sql.prepare("UPDATE organization_invitations SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), expiring.body.invitation.id);
await expectError(send("carol", "/invitations/" + expiring.body.invitation.id + "/accept", "POST", {}), 404, "invitation_unavailable");
assert.deepEqual(teams((await send("carol", "")).body.organizations), []);

// Team view: members see members; only managers see pending invitations.
const ownerView = await send("owner", base);
assert.deepEqual(ownerView.body.members.map((member: any) => [member.user_id, member.role]), [["owner", "owner"], ["alice", "admin"], ["bob", "member"]]);
const memberView = await send("bob", base);
assert.equal(memberView.body.organization.role, "member");
assert.deepEqual(memberView.body.invitations, []);

// Renaming.
await expectError(send("bob", base, "PATCH", { name: "Mine" }), 403, "forbidden");
await expectError(send("alice", base, "PATCH", { name: "" }), 400, "invalid_organization_name");
assert.equal((await send("alice", base, "PATCH", { name: "Platform team" })).body.name, "Platform team");
await expectError(send("owner", base, "DELETE", {}), 405, "method_not_allowed");

// Roles and removal.
await expectError(send("alice", base + "/members/bob", "PATCH", { role: "admin" }), 403, "owner_role_required");
await expectError(send("owner", base + "/members/bob", "PATCH", { role: "owner" }), 400, "invalid_role");
await expectError(send("owner", base + "/members/owner", "PATCH", { role: "member" }), 403, "owner_role_required");
await expectError(send("owner", base + "/members/mallory", "PATCH", { role: "admin" }), 404, "member_not_found");
assert.equal((await send("owner", base + "/members/bob", "PATCH", { role: "admin" })).status, 200);
await expectError(send("alice", base + "/members/bob", "DELETE", {}), 403, "forbidden");
assert.equal((await send("owner", base + "/members/bob", "PATCH", { role: "member" })).status, 200);
assert.equal((await send("alice", base + "/members/bob", "DELETE", {})).status, 200, "Admins remove members");
await expectError(send("bob", base), 404, "not_found");
await expectError(send("owner", base + "/members/owner", "DELETE", {}), 403, "owner_cannot_leave");
assert.equal((await send("alice", base + "/members/alice", "DELETE", {})).status, 200, "Members can leave a team");
await expectError(send("owner", base + "/unknown", "GET"), 404, "not_found");

// Personal organizations stay private to their owner.
const personal = "personal:owner";
assert.equal((await send("owner", "/" + encodeURIComponent(personal))).body.organization.kind, "personal");
await expectError(send("owner", "/" + encodeURIComponent(personal) + "/invitations", "POST", { email: "bob@example.test", role: "member" }), 403, "personal_organization_is_private");

// Each owner may hold at most 20 teams.
for (let index = 1; index < 20; index++) assert.equal((await send("owner", "", "POST", { name: "Team " + index })).status, 201);
await expectError(send("owner", "", "POST", { name: "One too many" }), 409, "organization_limit_reached");

sql.close();
console.log("PASS: team creation limits, private visibility, owner-only admin invitations, accept/reject/expiry, roles, removal and request validation on the real schema");
