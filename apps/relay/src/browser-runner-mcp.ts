import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { OAuthIdentity } from "./auth.js";
import { registerMcpTool } from "./mcp-errors.js";

/**
 * Browser Runner: a task-scoped browser that the user's own Go Agent runs on
 * their computer (installed Chrome/Edge/Chromium over CDP). The contract is
 * host-neutral: everything a caller needs to continue lives in the tool
 * results (session state, snapshot ids, next_action), so ChatGPT, Claude,
 * Cursor, Codex or any MCP client can drive it without prompts/resources.
 * MCP names equal the device tool names.
 *
 * Registered only when ENABLE_BROWSER_RUNNER=1, and each device must list the
 * tools explicitly in its allowed tools (see device-call.ts).
 */
export const BROWSER_RUNNER_TOOLS = [
  "browser_runner_start",
  "browser_runner_snapshot",
  "browser_runner_act",
  "browser_runner_status",
  "browser_runner_confirm",
  "browser_runner_close",
] as const;

export type BrowserRunnerTool = (typeof BROWSER_RUNNER_TOOLS)[number];
export const isBrowserRunnerTool = (tool: string): tool is BrowserRunnerTool =>
  (BROWSER_RUNNER_TOOLS as readonly string[]).includes(tool);

type Scope = "browser:read" | "browser:interact";
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export type BrowserRunnerDeps = {
  identity: OAuthIdentity | null;
  hasScope: (identity: OAuthIdentity, scope: Scope) => boolean;
  authRequired: (scope: Scope, identity: OAuthIdentity | null) => unknown;
  consume: (identity: OAuthIdentity) => Promise<unknown>;
  oauthToolMeta: (scope: Scope) => unknown;
  textResult: (value: unknown) => ToolResult;
  callDevice: (identity: OAuthIdentity, deviceId: string, tool: BrowserRunnerTool, args: Record<string, unknown>) => Promise<unknown>;
};

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const deviceId = z.string().min(1).max(200);
const snapshotId = z.string().min(1).max(60);
// e12 on the page, f1e3 inside the first embedded frame of the snapshot.
const ref = z.string().regex(/^(f[1-9]\d?)?e[1-9]\d{0,3}$/);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/);

const what =
  " Browser Runner is a separate background browser that the Remote Arc Agent runs on the user's computer for multi-step web tasks (applications, bookings, forms). It never uses the user's everyday browser, cookies or passwords. To read or act on a tab the user is looking at in their own browser, use shared_tab_* instead.";

type Definition = {
  scope: Scope;
  title: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  annotations: Record<string, boolean>;
};

const definitions: Record<BrowserRunnerTool, Definition> = {
  browser_runner_start: {
    scope: "browser:interact",
    title: "Start or resume a background browser task",
    description:
      "Start, or resume with the same task_id, a task browser on a linked computer. allowed_origins lists every site the task may visit (for example https://jobs.example.com or https://*.greenhouse.io); redirects, links and popups outside them are blocked and page content can never add sites. Adding sites to an existing task requires scope_change_reason AND a one-time approval for the exact origins in Dashboard Security / Boundary requests; giving the model a reason does not grant permission. Re-run the same start call only after the user approves. Runs headless by default; pass headless=false when the user must sign in, enter a code or solve a CAPTCHA in the window. Resuming reopens the last page and reports unconfirmed submits." +
      what,
    input: z.object({
      device_id: deviceId,
      task_id: id,
      allowed_origins: z.array(z.string().min(1).max(260)).min(1).max(20),
      start_url: z.string().url().max(2000).optional(),
      profile: id.optional(),
      headless: z.boolean().optional(),
      scope_change_reason: z.string().min(1).max(200).optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false, idempotentHint: true },
  },
  browser_runner_snapshot: {
    scope: "browser:read",
    title: "Read the task browser's page",
    description:
      "Return a bounded view of the current page: url, title, headings, visible text and interactive elements with refs (e1, e2, ...; f1e1 for elements inside embedded frames such as hosted application forms), roles, labels, non-sensitive values, options and validation errors. Refs are valid only for the returned snapshot_id; take a new snapshot after the page changes. frames lists embedded frames; frames outside allowed_origins are named but never read. Sensitive fields are marked and never show values. blockers report a sign-in, verification code or CAPTCHA that only the user can complete.",
    input: z.object({
      device_id: deviceId,
      session_id: id,
      max_elements: z.number().int().min(10).max(400).optional(),
      max_text: z.number().int().min(500).max(20000).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  browser_runner_act: {
    scope: "browser:interact",
    title: "Act in the task browser",
    description:
      "Do one thing in the task browser. On an element from the latest snapshot (snapshot_id + ref): click, fill (value), select (option value or label), check, uncheck, press (key), or upload (path of a pdf/doc/docx/txt/rtf/odt/png/jpg up to 25 MB in a Trusted Location on the computer). Without a ref: navigate (url inside allowed_origins) or wait (text and/or url_contains, timeout_ms up to 30000). Passwords, one-time codes and payment fields are always refused. The Agent rejects native POST submit buttons and obvious submission controls unless effect=submit; never use a generic button/Enter as a way around this. Mark anything that sends or saves externally (submit, apply, book, pay, post) with effect=submit and a stable idempotency_key: that key is never sent twice, other submits wait until it is confirmed, and after a crash or timeout it is reported as unknown rather than retried. Use effect=navigation for steps such as Next.",
    input: z.object({
      device_id: deviceId,
      session_id: id,
      action: z.enum(["click", "fill", "select", "check", "uncheck", "press", "upload", "navigate", "wait"]),
      snapshot_id: snapshotId.optional(),
      ref: ref.optional(),
      value: z.string().max(10000).optional(),
      key: z.enum(["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "Space"]).optional(),
      path: z.string().min(1).max(1000).optional(),
      url: z.string().url().max(2000).optional(),
      text: z.string().min(1).max(200).optional(),
      url_contains: z.string().min(1).max(300).optional(),
      timeout_ms: z.number().int().min(250).max(30000).optional(),
      effect: z.enum(["none", "navigation", "submit"]).optional(),
      idempotency_key: idempotencyKey.optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true, idempotentHint: true },
  },
  browser_runner_status: {
    scope: "browser:read",
    title: "Show a browser task's checkpoint",
    description:
      "Return a task's saved checkpoint: state, last page, recent action receipts, uploads with SHA-256, submits with their status (unverified, unknown, confirmed) and next_action. Use it to continue in a new conversation or a different AI. Omit session_id to list tasks the running Agent knows.",
    input: z.object({ device_id: deviceId, session_id: id.optional() }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  browser_runner_confirm: {
    scope: "browser:interact",
    title: "Confirm the result of a submit",
    description:
      "Settle a submit that is unverified or unknown. outcome=confirmed needs evidence copied exactly from the current page (for example a confirmation number) and is checked against the page. outcome=not_submitted for an unknown submit needs user_confirmed=true, meaning the user checked that nothing was sent. New submits in the task stay blocked until this is settled.",
    input: z.object({
      device_id: deviceId,
      session_id: id,
      idempotency_key: idempotencyKey,
      outcome: z.enum(["confirmed", "not_submitted"]),
      evidence: z.string().min(4).max(300),
      user_confirmed: z.boolean().optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, idempotentHint: true },
  },
  browser_runner_close: {
    scope: "browser:interact",
    title: "Close a browser task",
    description:
      "Close the task browser and keep its checkpoint so the task can be resumed. forget=true also deletes the checkpoint and the task's own browser profile, including any sign-in kept there.",
    input: z.object({ device_id: deviceId, session_id: id, forget: z.boolean().optional() }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
  },
};

export function registerBrowserRunnerTools(server: McpServer, deps: BrowserRunnerDeps) {
  for (const tool of BROWSER_RUNNER_TOOLS) {
    const def = definitions[tool];
    registerMcpTool(
      server,
      tool,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.input,
        annotations: def.annotations,
        _meta: deps.oauthToolMeta(def.scope),
      },
      async (input: Record<string, unknown>) => {
        const { identity } = deps;
        if (!identity || !deps.hasScope(identity, def.scope)) return deps.authRequired(def.scope, identity);
        const usageError = await deps.consume(identity);
        if (usageError) return usageError;
        const { device_id, ...args } = input;
        return deps.textResult(await deps.callDevice(identity, String(device_id), tool, args));
      },
    );
  }
}

export const browserRunnerDefinitionsForTest = definitions;
