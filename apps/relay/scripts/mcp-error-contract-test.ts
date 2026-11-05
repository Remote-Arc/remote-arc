import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  classifyExpectedMcpError,
  registerMcpTool,
  expectedMcpFailureResult,
  mcpBillingRecovery,
} from "../src/mcp/mcp-errors.js";
import { consumeToolCall, getMonthlyUsage } from "../src/billing/usage.js";
import { createRemoteLinkMcp } from "../src/mcp/mcp.js";
import { DEFAULT_MCP_SCOPES } from "../src/auth/oauth.js";
import type { OAuthIdentity } from "../src/auth/auth.js";

const expectedCases: Array<[Error, string]> = [
  [
    new Error("start_process requires cwd when multiple Trusted Write Locations are configured."),
    "WORKSPACE_CWD_REQUIRED",
  ],
  [
    new Error('tool "write_file" requires a Trusted Write Location on this device'),
    "WORKSPACE_REQUIRED",
  ],
  [
    new Error(
      "Blocked by Remote Arc Trusted Write Locations: path is outside the allowed write roots.",
    ),
    "WORKSPACE_DENIED",
  ],
  [
    new Error("Blocked by Remote Arc Task Workspace: path escapes the owned candidate."),
    "WORKSPACE_DENIED",
  ],
  [new Error("Remote Arc approval required before this out-of-scope write"), "APPROVAL_REQUIRED"],
  [
    new Error(
      "Blocked by Remote Arc Sensitive Path Policy. Add a narrow sensitive-path exception for this device if you intentionally need access.",
    ),
    "SENSITIVE_PATH_BLOCKED",
  ],
  [
    new Error("Blocked by Remote Arc Safety Guard: system shutdown or reboot."),
    "SAFETY_GUARD_BLOCKED",
  ],
  [new Error('tool "start_process" is disabled for this device'), "TOOL_DISABLED"],
  [new Error("device offline"), "DEVICE_OFFLINE"],
  [new Error("device call timed out"), "DEVICE_TIMEOUT"],
  [new Error("device not found or revoked"), "DEVICE_NOT_FOUND"],
  [new Error("device not found"), "DEVICE_NOT_FOUND"],
  [new Error("trigger requires task_version=1."), "INVALID_TOOL_REQUEST"],
  [new Error("Goal not found."), "GOAL_NOT_FOUND"],
  [
    new Error("Goal revision changed or it is not awaiting a decision. Read context again."),
    "GOAL_DECISION_CONFLICT",
  ],
  [new Error("Device did not return managed process id."), "DEVICE_PROTOCOL_ERROR"],
  [
    new Error(
      "Trusted Write Locations are enabled. start_process requires an in-scope cwd. Terminal commands are not an OS sandbox and may still access paths outside that directory.",
    ),
    "WORKSPACE_CWD_REQUIRED",
  ],
  [
    new Error("Managed process not found or its local retention window has expired."),
    "PROCESS_NOT_FOUND",
  ],
  [new Error("ENOENT: no such file or directory, stat '/tmp/missing'"), "PATH_NOT_FOUND"],
  [new Error("Path is not a file: /tmp/folder"), "PATH_TYPE_MISMATCH"],
  [
    new Error("Binary file detected. read_file currently supports text files only."),
    "BINARY_FILE_REQUIRES_BINARY_READ",
  ],
  [
    new Error("Expected 1 replacement(s) in /tmp/a.txt, found 0. No changes were written."),
    "EDIT_CONFLICT",
  ],
  [
    new Error("No reversible Remote Arc file change is available on this device."),
    "UNDO_UNAVAILABLE",
  ],
  [
    new Error(
      'No browser_runner session "missing" on this device. Call browser_runner_start first.',
    ),
    "BROWSER_SESSION_NOT_FOUND",
  ],
  [
    new Error(
      'No Browser Runner session "missing" on this device. Call browser_runner_start first.',
    ),
    "BROWSER_SESSION_NOT_FOUND",
  ],
  [
    new Error("browser_runner requires terminal mode on this device."),
    "BROWSER_RUNNER_UNAVAILABLE",
  ],
  [
    new Error("Browser Runner requires terminal mode on this device."),
    "BROWSER_RUNNER_UNAVAILABLE",
  ],
];

for (const [error, code] of expectedCases) {
  assert.equal(classifyExpectedMcpError(error)?.code, code);
}
const timeoutHint = classifyExpectedMcpError(
  new Error("device call timed out: private-timeout-canary"),
);
assert.match(timeoutHint!.message, /may have executed/);
assert.match(timeoutHint!.message, /before retrying/);
assert(!timeoutHint!.message.includes("private-timeout-canary"));
const expired = classifyExpectedMcpError(Error("DEVICE_CALL_EXPIRED: private-expiry-canary"));
assert.equal(expired?.code, "DEVICE_CALL_EXPIRED");
assert.match(expired!.message, /No operation was started/);
assert(!expired!.message.includes("private-expiry-canary"));

const quota = new Error("Monthly Remote Arc tool-call limit reached (10000/10000).") as Error & {
  code?: string;
};
quota.code = "MONTHLY_LIMIT_REACHED";
assert.equal(classifyExpectedMcpError(quota)?.code, "MONTHLY_LIMIT_REACHED");

const plan = new Error("Remote Arc Plus is required for binary read.") as Error & { code?: string };
plan.code = "PLAN_UPGRADE_REQUIRED";
assert.equal(classifyExpectedMcpError(plan)?.code, "PLAN_UPGRADE_REQUIRED");
for (const code of [
  "PLAN_UPGRADE_REQUIRED",
  "BINARY_TRANSFER_LIMIT_REACHED",
  "MONTHLY_LIMIT_REACHED",
]) {
  const body = JSON.parse(
    expectedMcpFailureResult({ code, message: "Limit reached" }).content[0].text,
  );
  assert.equal(body.error.upgrade_url, "https://agent.remotearc.app/settings?section=billing");
  assert(
    body.error.recovery.actions.some(
      (action: { url: string }) => action.url === body.error.upgrade_url,
    ),
  );
}
assert.equal(
  mcpBillingRecovery("app_connection_limit").upgrade_url,
  "https://agent.remotearc.app/settings?section=billing",
);
for (const code of [
  "app_daily_limit_reached",
  "app_platform_funded_allowance_reached",
  "BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE",
])
  assert.equal(
    mcpBillingRecovery(code).upgrade_url,
    undefined,
    "service-side limits must not promise that upgrading fixes them",
  );

assert.equal(
  classifyExpectedMcpError(new Error("D1_ERROR: database corrupted unexpectedly")),
  null,
  "unknown infrastructure failures must remain true internal errors",
);

let registeredHandler: ((...args: any[]) => Promise<any>) | undefined;
const fakeServer = {
  registerTool(_name: string, _definition: unknown, handler: (...args: any[]) => Promise<any>) {
    registeredHandler = handler;
    return {};
  },
} as unknown as McpServer;

registerMcpTool(fakeServer, "start_process", {}, async () => {
  throw new Error(
    "start_process requires cwd when multiple Trusted Write Locations are configured.",
  );
});
assert(registeredHandler, "safe MCP handler was not registered");
const structured = await registeredHandler!({});
assert.equal(structured.isError, undefined);
const structuredPayload = JSON.parse(structured.content[0].text);
assert.equal(structuredPayload.ok, false);
assert.equal(structuredPayload.error.code, "WORKSPACE_CWD_REQUIRED");
assert.match(structuredPayload.error.message, /requires cwd/);

registerMcpTool(fakeServer, "internal_probe", {}, async () => {
  throw new Error("D1_ERROR: unexpected storage failure");
});
await assert.rejects(() => registeredHandler!({}), /D1_ERROR/);

type UserRow = { role: string; email: string; plan?: string; has_plus_grant?: number };
function usageDb(user: UserRow, toolCalls: number) {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() {
              if (
                sql.includes("FROM users u WHERE u.id") ||
                sql.includes("SELECT role, email FROM users")
              )
                return user;
              if (sql.includes("SELECT tool_calls FROM user_monthly_usage")) {
                return { tool_calls: toolCalls };
              }
              if (sql.includes("INSERT INTO user_monthly_usage")) {
                return { tool_calls: toolCalls + 1 };
              }
              return null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

const adminEnv = {
  DB: usageDb({ role: "admin", email: "admin@example.com" }, 25000),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
};
const adminUsage = await getMonthlyUsage(adminEnv, "admin-user");
assert.equal(adminUsage.unlimited, true);
assert.equal(adminUsage.limit, null);
assert.equal(adminUsage.remaining, null);
const adminConsumed = await consumeToolCall(adminEnv, "admin-user");
assert.equal(adminConsumed.unlimited, true);
assert.equal(adminConsumed.limit, null);

const operatorEnv = {
  DB: usageDb({ role: "user", email: "operator@example.com" }, 25000),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  OPERATOR_EMAIL: "Operator@Example.com",
};
const operatorUsage = await getMonthlyUsage(operatorEnv, "operator-user");
assert.equal(operatorUsage.unlimited, true);
assert.equal(operatorUsage.limit, null);

const normalEnv = {
  DB: usageDb({ role: "user", email: "normal@example.com" }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
};
const normalUsage = await getMonthlyUsage(normalEnv, "normal-user");
assert.equal(normalUsage.unlimited, false);
assert.equal(normalUsage.limit, 10000);
assert.equal(normalUsage.remaining, 9877);

const freeLimitedEnv = {
  DB: usageDb({ role: "user", email: "free@example.com", plan: "free", has_plus_grant: 0 }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  FREE_MONTHLY_TOOL_CALL_LIMIT: "1000",
};
assert.equal((await getMonthlyUsage(freeLimitedEnv, "free-user")).limit, 1000);

const paidEnv = {
  DB: usageDb({ role: "user", email: "plus@example.com", plan: "plus", has_plus_grant: 0 }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  FREE_MONTHLY_TOOL_CALL_LIMIT: "1000",
};
assert.equal((await getMonthlyUsage(paidEnv, "plus-user")).limit, 10000);

const grantEnv = {
  DB: usageDb({ role: "user", email: "grant@example.com", plan: "free", has_plus_grant: 1 }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  FREE_MONTHLY_TOOL_CALL_LIMIT: "1000",
};
assert.equal((await getMonthlyUsage(grantEnv, "grant-user")).limit, 10000);

const authEnv = {
  PUBLIC_ORIGIN: "https://mcp.remotearc.app",
  DB: {
    prepare() {
      throw new Error("An OAuth scope challenge must not access storage");
    },
  } as unknown as D1Database,
  REGISTRY: {} as DurableObjectNamespace,
};
const authIdentity = (scope: string): OAuthIdentity => ({
  userId: "scope-test-user",
  clientId: "scope-test-client",
  grantId: null,
  resource: authEnv.PUBLIC_ORIGIN + "/mcp",
  scope,
});
async function challengedScopes(
  identity: OAuthIdentity | null,
  name: string,
  args: Record<string, unknown>,
) {
  const response = await createRemoteLinkMcp(authEnv, identity).fetch(
    new Request(authEnv.PUBLIC_ORIGIN + "/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const text = await response.text();
  assert(response.ok, text);
  const payload = JSON.parse(
    text.trim().startsWith("{")
      ? text
      : text
          .split("\n")
          .find((line) => line.startsWith("data: "))!
          .slice(6),
  );
  assert(!payload.error, JSON.stringify(payload));
  assert.equal(payload.result.isError, true, "missing scopes must still block execution");
  const challenge = payload.result._meta?.["mcp/www_authenticate"]?.[0] || "";
  const scopes = /scope="([^"]+)"/.exec(challenge)?.[1].split(/\s+/) || [];
  assert.equal(new Set(scopes).size, scopes.length, "challenge scopes must be unique");
  return new Set(scopes);
}

assert.deepEqual(await challengedScopes(null, "list_devices", {}), new Set(DEFAULT_MCP_SCOPES));
assert.deepEqual(
  await challengedScopes(authIdentity("devices:read"), "read_file", {
    device_id: "scope-test-device",
    path: "/scope-test.txt",
  }),
  new Set(["devices:read", "computer:read", "offline_access"]),
);
assert.deepEqual(
  await challengedScopes(authIdentity("computer:read"), "list_devices", {}),
  new Set(["computer:read", "devices:read", "offline_access"]),
);
assert.deepEqual(
  await challengedScopes(
    authIdentity("devices:read computer:read computer:read offline_access"),
    "write_file",
    {
      device_id: "scope-test-device",
      path: "/scope-test.txt",
      content: "scope test",
    },
  ),
  new Set(["devices:read", "computer:read", "computer:write", "offline_access"]),
);

// Production deliberately disables experimental goal creation/decisions, but
// read-only context for an existing goal must still be discoverable by clients.
const disabledGoalsMcp = createRemoteLinkMcp(
  { ...authEnv, ENABLE_EXPERIMENTAL_AGENT_GOALS: "0" },
  authIdentity("automation:read"),
);
const listed = await disabledGoalsMcp.fetch(
  new Request(authEnv.PUBLIC_ORIGIN + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  }),
);
const listedText = await listed.text();
assert(listed.ok, listedText);
const listedJson = JSON.parse(
  listedText.trim().startsWith("{")
    ? listedText
    : listedText
        .split("\n")
        .find((line) => line.startsWith("data: "))!
        .slice(6),
);
assert(!listedJson.error, listedText);
const listedNames = new Set<string>(
  listedJson.result.tools.map((tool: { name: string }) => tool.name),
);
assert(
  listedNames.has("get_goal_context"),
  "existing goal checkpoints remain readable in production",
);
assert(!listedNames.has("create_agent_goal"), "experimental goal creation must stay disabled");
assert(!listedNames.has("submit_goal_decision"), "experimental mutations must stay disabled");

// A fresh tool list advertises only current names, but hosts that cached the
// pre-rc.4 list can still call the old shared-tab names (routed, scope-checked).
for (const name of ["shared_tab_list", "shared_tab_read", "shared_tab_click", "shared_tab_fill"]) {
  assert(listedNames.has(name), name + " must be listed");
}
for (const name of [
  "browser_list_tabs",
  "browser_get_current_tab",
  "browser_read_page",
  "browser_get_selected_text",
  "browser_extract_links",
  "browser_extract_table",
  "browser_click",
  "browser_fill",
]) {
  assert(!listedNames.has(name), name + " must not be advertised to fresh clients");
}
assert.deepEqual(
  await challengedScopes(authIdentity("devices:read"), "browser_read_page", { device_id: "ext" }),
  new Set(["devices:read", "browser:read", "offline_access"]),
);

// Fixed public operations declare their own read/write contracts; the
// internal generic executor must not remain callable through cached names.
const appsMcp = createRemoteLinkMcp(
  { ...authEnv, ENABLE_APPS: "1" },
  authIdentity("apps:read apps:write"),
);
const appsList = await appsMcp.fetch(
  new Request(authEnv.PUBLIC_ORIGIN + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
  }),
);
const appsText = await appsList.text();
assert(appsList.ok, appsText);
const appsJson = JSON.parse(
  appsText.trim().startsWith("{")
    ? appsText
    : appsText
        .split(String.fromCharCode(10))
        .find((line) => line.startsWith("data: "))!
        .slice(6),
);
const appsTools = appsJson.result.tools as Array<{
  name: string;
  securitySchemes?: Array<{ scopes: string[] }>;
}>;
assert(
  !appsTools.some((tool) => tool.name === "call_app"),
  "The generic call_app executor is no longer published",
);
const readAction = appsTools.find((tool) => tool.name === "run_app_read_action");
assert.deepEqual(readAction?.securitySchemes?.[0]?.scopes, ["apps:read"]);
const writeAction = appsTools.find((tool) => tool.name === "run_app_write_action");
assert.deepEqual(writeAction?.securitySchemes?.[0]?.scopes, ["apps:read", "apps:write"]);
assert(
  !appsTools.some((tool) => ["github_issues_create", "gmail_messages_get"].includes(tool.name)),
);
const listApps = appsTools.find((tool) => tool.name === "list_apps");
assert.deepEqual(listApps?.securitySchemes?.[0]?.scopes, ["apps:read"]);

console.log(
  "PASS: MCP error contract, incremental OAuth scopes, and admin/operator unlimited usage regressions",
);

{
  const { authRequiredText } = await import("../src/mcp/mcp.js");
  const signedIn = authRequiredText(["apps:read"], true);
  assert.match(signedIn, /apps:read scope/);
  assert.match(signedIn, /reconnect Remote Arc in this AI app's connector settings/);
  const signedOut = authRequiredText(["computer:read", "computer:write"], false);
  assert.match(signedOut, /computer:read \+ computer:write scopes/);
  assert.match(signedOut, /connect Remote Arc/);
  console.log("PASS: missing-scope errors tell the AI what the person should do");
}
// A quota-blocked tool must give the person a usable upgrade path without
// dispatching work, charging another call, or requiring fresh tool metadata.
{
  const { createWorkerFixture, AGENT, MCP } = await import("./worker-fixture.js");
  const fixture = createWorkerFixture();
  const identity = authIdentity(DEFAULT_MCP_SCOPES.join(" "));
  fixture.addUser(identity.userId);
  fixture.env.ARC_BILLING_ENABLED = "1";
  fixture.sql
    .prepare(
      "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)",
    )
    .run(identity.userId, fixture.now.slice(0, 7), 9999, fixture.now);
  const profiles = ["generic", "chatgpt", "claude"] as const;
  async function rpc(
    profile: (typeof profiles)[number],
    method: string,
    params: unknown,
    overrides: Record<string, unknown> = {},
  ) {
    const handler = createRemoteLinkMcp({ ...fixture.env, ...overrides } as never, identity, {
      clientProfile: profile,
    });
    const response = await handler.fetch(
      new Request(MCP + "/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
    const text = await response.text();
    assert(response.ok, text);
    const payload = JSON.parse(
      text.trim().startsWith("{")
        ? text
        : text
            .split("\n")
            .find((line) => line.startsWith("data: "))!
            .slice(6),
    );
    assert(!payload.error, text);
    return payload.result;
  }
  try {
    const allowed = await rpc("generic", "tools/call", { name: "list_devices", arguments: {} });
    assert(
      !JSON.stringify(allowed).includes("MONTHLY_LIMIT_REACHED"),
      "the last available call still works",
    );
    const cases = [
      ["list_devices", {}],
      [
        "read_file",
        { device_id: "33333333-3333-4333-8333-333333333333", path: "/private/quota-canary" },
      ],
      [
        "start_process",
        { device_id: "33333333-3333-4333-8333-333333333333", command: "printf quota-canary" },
      ],
    ] as const;
    for (const profile of profiles)
      for (const [name, args] of cases) {
        const result = await rpc(profile, "tools/call", { name, arguments: args });
        const payload = JSON.parse(result.content[0].text);
        assert.equal(payload.error.code, "MONTHLY_LIMIT_REACHED");
        assert.equal(payload.error.upgrade_url, AGENT + "/settings?section=billing");
        assert(
          payload.error.message.includes(payload.error.upgrade_url),
          "the upgrade link is also readable in the tool text",
        );
        assert.match(payload.error.message, /reset/i, "waiting for reset remains an option");
        assert(
          !JSON.stringify(payload).includes("quota-canary"),
          "tool arguments do not leak into the upgrade message",
        );
        assert.equal(fixture.state.calls.length, 0, "exhausted requests must not reach a device");
      }
    for (const [overrides, origin] of [
      [
        { DASHBOARD_ORIGIN: undefined, APP_ORIGIN: "https://legacy.example.test" },
        "https://legacy.example.test",
      ],
      [{ DASHBOARD_ORIGIN: undefined, APP_ORIGIN: undefined }, MCP],
    ] as const) {
      const result = await rpc(
        "generic",
        "tools/call",
        { name: "list_devices", arguments: {} },
        overrides,
      );
      assert.equal(
        JSON.parse(result.content[0].text).error.upgrade_url,
        origin + "/settings?section=billing",
      );
    }
    for (const profile of ["generic", "chatgpt"] as const) {
      const listed = await rpc(profile, "tools/list", {});
      assert.match(
        listed.tools.find((tool: { name: string }) => tool.name === "list_devices").description,
        /MONTHLY_LIMIT_REACHED.*upgrade_url/,
      );
      const initialized = await rpc(profile, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "quota-test", version: "1" },
      });
      assert.match(initialized.instructions, /MONTHLY_LIMIT_REACHED.*upgrade_url/);
    }
    assert.equal(
      (await getMonthlyUsage(fixture.env as never, identity.userId)).used,
      10000,
      "rejected calls and metadata reads do not consume more allowance",
    );
    const page = await fixture.call(AGENT + "/settings?section=billing");
    assert.equal(page.status, 302, "the upgrade URL is a real sign-in-preserving Dashboard route");
    assert.match(page.headers.get("location") || "", /billing/);
    console.log(
      "PASS: quota errors carry an actionable upgrade URL in all client profiles without dispatch or extra quota charges",
    );
  } finally {
    await Promise.all(fixture.pending);
    fixture.sql.close();
  }
}
