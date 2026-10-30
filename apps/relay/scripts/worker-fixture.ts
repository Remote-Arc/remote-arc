// Shared fixture for tests that drive the Worker entry (src/index.ts): real D1
// SQL on in-memory SQLite, stub bindings, a recorded device registry and a
// session helper. No network is used.
import fs from "node:fs";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { createSession } from "../src/auth/auth.js";

// Node needs the Cloudflare-only base classes used by unrelated exports.
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") return {
    url: "data:text/javascript,export class DurableObject {} export class WorkerEntrypoint {}", shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });
export const worker = (await import("../src/index.js")).default;
hooks.deregister();

export const MCP = "https://mcp.remotearc.app", AGENT = "https://agent.remotearc.app";
export const SITE = "https://remotearc.app", ADMIN = "https://admin.remotearc.app";
export const SHELL = '<!doctype html><html><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>';

export type RegistryCall = { deviceId: string; tool: string; arguments: Record<string, unknown>; policy: Record<string, unknown> };

export function createWorkerFixture() {
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

  const limits = { auth: true, email: true, mcp: true };
  const state = {
    assetsFailure: null as Error | null,
    // Online devices the registry reports for presence lookups.
    online: [] as Record<string, unknown>[],
    // Answers a device tool call; by default every tool succeeds with an empty result.
    tool: (_call: RegistryCall): Response => Response.json({ result: {} }),
    // Replaces the whole registry, for example to simulate an outage.
    registry: null as null | ((request: Request) => Promise<Response>),
    calls: [] as RegistryCall[],
  };
  const env = {
    DB: db,
    PUBLIC_ORIGIN: MCP, APP_ORIGIN: MCP, DASHBOARD_ORIGIN: AGENT, MARKETING_ORIGIN: SITE, ADMIN_ORIGIN: ADMIN,
    ENABLE_APPS: "1",
    AUTH_RATE_LIMITER: { limit: async () => ({ success: limits.auth }) },
    EMAIL_RATE_LIMITER: { limit: async () => ({ success: limits.email }) },
    MCP_RATE_LIMITER: { limit: async () => ({ success: limits.mcp }) },
    REGISTRY: {
      getByName: () => ({
        async fetch(request: Request) {
          if (state.registry) return state.registry(request);
          const path = new URL(request.url).pathname;
          if (path === "/devices") return Response.json(state.online);
          if (path === "/call") {
            const call = await request.json() as RegistryCall;
            state.calls.push(call);
            return state.tool(call);
          }
          return Response.json({ ok: true });
        },
      }),
    },
    ASSETS: {
      async fetch(request: Request) {
        if (state.assetsFailure) throw state.assetsFailure;
        const path = new URL(request.url).pathname;
        if (path === "/install.sh") return new Response("#!/bin/sh\necho install\n", { headers: { etag: "abc" } });
        if (path.endsWith(".js")) return new Response("console.log(1)", { headers: { "content-type": "text/javascript" } });
        return new Response(SHELL, { headers: { "content-type": "text/html", etag: "shell" } });
      },
    },
  } as Record<string, unknown>;

  const pending: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(promise: Promise<unknown>) { pending.push(Promise.resolve(promise).catch(() => undefined)); },
    passThroughOnException() {},
  } as unknown as ExecutionContext;
  const call = (url: string, init: RequestInit = {}) => worker.fetch(new Request(url, init), env as never, ctx);
  const now = new Date().toISOString();
  const addUser = (id: string, role = "user") =>
    sql.prepare("INSERT INTO users(id,google_sub,email,name,created_at,role) VALUES(?,?,?,?,?,?)").run(id, id, id + "@example.test", id, now, role);
  const sessionCookie = async (id: string) => "rl_session=" + encodeURIComponent(await createSession(id, env as never));
  return { sql, db, env, limits, state, pending, ctx, call, now, addUser, sessionCookie };
}

export const location = (response: Response) => response.headers.get("location");
export const json = async (response: Response) => JSON.parse(await response.text());
