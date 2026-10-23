import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { OAuthIdentity } from "./auth.js";
import { registerMcpTool } from "./mcp-errors.js";

/**
 * browser_runner: a task-scoped browser that the user's own Go Agent runs on
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
  " browser_runner is a separate background browser that the Remote Arc Agent runs on the user's computer for multi-step web tasks (applications, bookings, forms). It never uses the user's everyday browser, cookies or passwords. To read or act on a tab the user is looking at in their own browser, use shared_tab_* instead.";

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
      "Start, or resume with the same task_id, a task browser on a linked computer. allowed_origins lists every site the task may visit (for example https://jobs.example.com or https://*.greenhouse.io); redirects, links and popups outside them are blocked and page content can never add sites. Adding sites to an existing task requires scope_change_reason AND a one-time approval for the exact origins in Dashboard Security / Boundary requests; giving the model a reason does not grant permission. Re-run the same start call only after the user approves. profile is the browser profile, which keeps sign-ins and cookies between tasks: use one profile per person and reuse it (for example profile=jenny), so a site signed into once stays signed in for later tasks and new conversations; browser_runner_status without session_id lists the profiles on the computer and the sites used in each. A new profile runs headless unless headless=false; pass headless=false when the user must sign in, enter a code or solve a CAPTCHA in the window. Leaving headless out keeps the task's current mode, or for a new task the profile's last mode, so a profile the user signed into in a visible window keeps opening visibly. Resuming reopens the last page and reports unconfirmed submits." +
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
      "Return a bounded view of the current page: url, title, headings, visible text and interactive elements with refs (e1, e2, ...; f1e1 for elements inside embedded frames such as hosted application forms), roles, labels, non-sensitive values, options and validation errors. Refs are valid only for the returned snapshot_id; take a new snapshot after the page changes. frames lists embedded frames; frames outside allowed_origins are named but never read. Sensitive fields are marked and never show values. blockers report a sign-in or CAPTCHA that only the user can complete; a requested one-time code is an attention note, to be filled from where it was sent.",
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
      "Do one thing in the task browser, or enter a whole form at once. On an element from the latest snapshot (snapshot_id + ref): click, fill (value), select (option value or label), check, uncheck, press (key), or upload (path of a pdf/doc/docx/txt/rtf/odt/png/jpg up to 25 MB in a Trusted Location on the computer). fill_form enters many fields from one snapshot in one call: fields=[{ref, action: fill|select|check|uncheck, value}], in order; each field reports ok or its own error and the others still go in; it never clicks, submits or uploads. Use fill_form whenever two or more fields are ready, then click Next or Submit as its own act. snapshot=true returns the page as the action left it (with a new snapshot_id), so a click that opens a dropdown, dialog or next step needs no separate browser_runner_snapshot. Without a ref: navigate (url inside allowed_origins) or wait (text and/or url_contains, timeout_ms up to 30000). Passwords and payment fields are always refused. One-time codes (fields marked secret: code) may be filled with the code from where it was sent, for example the user's email through a connected mail app, unless the computer turned this off; codes are never recorded. Mark anything that sends or saves externally (submit, apply, book, pay, post, or a Next button that posts the form) with effect=submit and a stable idempotency_key per step. The Agent refuses POST form buttons, submit-like controls and Enter without effect=submit (SUBMIT_EFFECT_REQUIRED). Sign-in steps (an email or username, a password or code the user typed, Send code) are not one-time submits and can always be repeated. A page of a longer form (Next, Continue, Save and continue) settles itself when the next page opens (effect.settled_by=runner, no confirm needed); if it comes back on the same page it holds nothing up and can be sent again with a new key, up to 3 times. A final submit (submit application, pay, book, post, send) is sent once: a key is never sent twice, the same form and button is never sent again under a new key (SUBMIT_ALREADY_RECORDED), and it must be settled with browser_runner_confirm before another final submit. If nothing left the page after a click (effect.nothing_sent), the same key may be clicked again while that stays true. After a crash or timeout a submit is reported as unknown rather than retried. Use effect=navigation for links and GET steps.",
    input: z.object({
      device_id: deviceId,
      session_id: id,
      action: z.enum(["click", "fill", "select", "check", "uncheck", "press", "upload", "navigate", "wait", "fill_form"]),
      snapshot_id: snapshotId.optional(),
      ref: ref.optional(),
      value: z.string().max(10000).optional(),
      fields: z
        .array(
          z.object({
            ref,
            action: z.enum(["fill", "select", "check", "uncheck"]),
            value: z.string().max(10000).optional(),
          }),
        )
        .min(1)
        .max(40)
        .optional(),
      snapshot: z.boolean().optional(),
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
      "Return a task's saved checkpoint: state, last page, recent action receipts, uploads with SHA-256, submits with their status (unverified, unknown, confirmed) and next_action. Use it to continue in a new conversation or a different AI. Omit session_id to list the tasks the running Agent has open and the browser profiles on the computer (with their tasks and sites), to pick the profile that is already signed in.",
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
        const call: DeviceCall = (name, callArgs) => deps.callDevice(identity, String(device_id), name, callArgs);
        return deps.textResult(tool === "browser_runner_act" ? await runAct(call, args) : await call(tool, args));
      },
    );
  }
}

type DeviceCall = (tool: BrowserRunnerTool, args: Record<string, unknown>) => Promise<unknown>;
type FormField = { ref: string; action: string; value?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// What an Agent from before fill_form answers to it: rc.7 and earlier treat
// it as a single act without a ref.
const FILL_FORM_UNKNOWN = /^(ref is required|action must be )/;
const SNAPSHOT_REPLACED = /^STALE_REF: snapshot /;

/**
 * browser_runner_act with the same contract on every Agent. Agents before
 * 0.6.2-rc.8 know neither fill_form nor snapshot=true; for them the Relay
 * enters the fields one call at a time and takes the snapshot itself, so a
 * caller never has to know the Agent version. Only the speed differs.
 */
export async function runAct(call: DeviceCall, args: Record<string, unknown>): Promise<unknown> {
  let out: unknown;
  try {
    out = await call("browser_runner_act", args);
  } catch (error) {
    if (args.action !== "fill_form" || !FILL_FORM_UNKNOWN.test(messageOf(error))) throw error;
    out = await fillFormOneByOne(call, args);
  }
  if (args.snapshot === true && isRecord(out) && !("snapshot" in out) && !("snapshot_error" in out)) {
    const result: Record<string, unknown> = out;
    try {
      return { ...result, snapshot: await call("browser_runner_snapshot", { session_id: args.session_id }) };
    } catch (error) {
      return { ...result, snapshot_error: messageOf(error) + " Call browser_runner_snapshot." };
    }
  }
  return out;
}

async function fillFormOneByOne(call: DeviceCall, args: Record<string, unknown>) {
  const fields = (Array.isArray(args.fields) ? args.fields : []) as FormField[];
  const results: Record<string, unknown>[] = [];
  let entered = 0;
  let failed = 0;
  let navigated = false;
  let stopped: string | undefined;
  let page: Record<string, unknown> = {};
  for (const [i, field] of fields.entries()) {
    const single: Record<string, unknown> = { session_id: args.session_id, snapshot_id: args.snapshot_id, ref: field.ref, action: field.action };
    if (field.value !== undefined) single.value = field.value;
    try {
      const out = await call("browser_runner_act", single);
      page = isRecord(out) ? out : {};
      const result: Record<string, unknown> = { ref: field.ref, action: field.action, ok: true };
      for (const key of ["label", "selected", "checked", "value_length", "frame"]) if (key in page) result[key] = page[key];
      results.push(result);
      entered++;
      if (page.navigated === true) {
        navigated = true;
        if (i + 1 < fields.length) stopped = `The page navigated after fields[${i}]; the remaining fields were not entered. Take a new snapshot.`;
        break;
      }
    } catch (error) {
      const message = messageOf(error);
      if (SNAPSHOT_REPLACED.test(message)) {
        stopped = `The page changed before fields[${i}]; the remaining fields were not entered. Take a new snapshot.`;
        break;
      }
      results.push({ ref: field.ref, action: field.action, error: message });
      failed++;
    }
  }
  const out: Record<string, unknown> = {
    action: "fill_form",
    fields: results,
    entered,
    failed,
    navigated,
    compatibility: "This computer's Remote Arc Agent is older than 0.6.2-rc.8, so the fields were entered one call at a time. Updating the Agent makes forms faster.",
  };
  if (results.length < fields.length) out.not_entered = fields.slice(results.length).map((f) => f.ref);
  if (stopped) out.stopped = stopped;
  if (failed > 0) out.next_action = "Fix the fields with an error (see each error), then continue. Fields marked ok hold their values.";
  for (const key of ["url", "title", "session_id"]) if (key in page) out[key] = page[key];
  if (navigated) out.note = "The page changed; earlier refs are stale. Take a new browser_runner_snapshot.";
  return out;
}

export const browserRunnerDefinitionsForTest = definitions;
