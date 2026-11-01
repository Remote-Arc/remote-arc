import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { OAuthIdentity } from "../auth/auth.js";
import { registerMcpTool } from "./mcp-errors.js";

/**
 * Shared-tab tools: the Chrome/Edge Companion extension, acting only on tabs
 * the user explicitly shared from their own everyday browser. The public MCP
 * names are shared_tab_*; the device protocol (browser_read_page,
 * browser_click, ...) and stored device permissions are unchanged, so no
 * extension update or re-grant is needed.
 */
export const SHARED_TAB_TOOLS = ["shared_tab_list", "shared_tab_read", "shared_tab_click", "shared_tab_fill", "shared_tab_open", "shared_tab_act"] as const;

type Scope = "browser:read" | "browser:interact";
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
type DeviceTool =
  | "browser_list_tabs"
  | "browser_get_current_tab"
  | "browser_read_page"
  | "browser_get_selected_text"
  | "browser_extract_links"
  | "browser_extract_table"
  | "browser_click"
  | "browser_fill"
  | "browser_open_tab"
  | "browser_act";

export type SharedTabDeps = {
  identity: OAuthIdentity | null;
  hasScope: (identity: OAuthIdentity, scope: Scope) => boolean;
  authRequired: (scope: Scope, identity: OAuthIdentity | null) => unknown;
  consume: (identity: OAuthIdentity) => Promise<unknown>;
  oauthToolMeta: (scope: Scope) => unknown;
  textResult: (value: unknown) => ToolResult;
  callDevice: (identity: OAuthIdentity, deviceId: string, tool: DeviceTool, args: Record<string, unknown>) => Promise<unknown>;
  /** One-time secrets from request_secret: checked before a fill, marked used after it. */
  secrets?: {
    check: (identity: OAuthIdentity, deviceId: string, handle: string) => Promise<unknown>;
    used: (handle: string) => Promise<void>;
  };
};

const secretHandle = z.string().regex(/^sec_[a-z2-7]{24}$/);
const secretNote = "secret is a handle from request_secret: the value the user entered there is filled once, only on the site it was requested for, and you never see it. Pass value or secret, not both.";

const scopeNote =
  " Works through the Remote Arc Browser extension in the user's own browser (a device with platform browser): on tabs the user shared, and on sites the user allowed, where shared_tab_open opens tabs. Prefer it on sites where the user is signed in or that show human verification: it works in a normal tab of the user's own browser. Without the extension, browser_runner_* runs multi-step work in a separate Remote Arc window on a linked computer.";

/**
 * Tools added in extension 0.4.0. An older extension rejects them with
 * "Unsupported browser tool"; the user is then told to update it.
 */
export const EXTENSION_04_TOOLS = ["browser_open_tab", "browser_act"] as const;
const updateNotice =
  "EXTENSION_UPDATE_REQUIRED: this Remote Arc Browser extension is older than 0.4.0 and cannot open tabs or use shared_tab_act. Ask the user to download the current extension from https://remotearc.app/chrome-extension and reload it in chrome://extensions. shared_tab_read, shared_tab_click and shared_tab_fill still work.";
export function extensionUpdateError(tool: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return (EXTENSION_04_TOOLS as readonly string[]).includes(tool) && /Unsupported browser tool|unsupported browser tool/.test(message)
    ? new Error(updateNotice)
    : error instanceof Error ? error : new Error(message);
}

const actActions = ["click", "fill", "select", "check", "uncheck", "press", "scroll", "fill_form", "navigate", "back", "reload", "wait", "close", "confirm"] as const;
const ref = z.string().regex(/^e[1-9]\d*$/);

const deviceId = z.string().min(1).max(200);
const tabId = z.number().int().optional();
const parts = ["page", "selection", "links", "table"] as const;
const partTool: Record<(typeof parts)[number], DeviceTool> = {
  page: "browser_read_page",
  selection: "browser_get_selected_text",
  links: "browser_extract_links",
  table: "browser_extract_table",
};

export function registerSharedTabTools(server: McpServer, deps: SharedTabDeps) {
  const guard = async (scope: Scope) => {
    const { identity } = deps;
    if (!identity || !deps.hasScope(identity, scope)) return { denied: deps.authRequired(scope, identity) };
    const usageError = await deps.consume(identity);
    if (usageError) return { denied: usageError };
    return { identity };
  };
  const tab = (tab_id: number | undefined) => (tab_id !== undefined ? { tab_id } : {});
  const checkSecret = async (identity: OAuthIdentity, device: string, handle: string) => {
    if (!deps.secrets) throw new Error("One-time secrets are not available here.");
    await deps.secrets.check(identity, device, handle);
  };

  registerMcpTool(server, "shared_tab_list", {
    title: "List the user's shared browser tabs",
    description: "List the tabs the user explicitly shared with Remote Arc, with their tabId, title and URL." + scopeNote,
    inputSchema: z.object({ device_id: deviceId }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: deps.oauthToolMeta("browser:read"),
  }, async ({ device_id }: { device_id: string }) => {
    const g = await guard("browser:read");
    if (!g.identity) return g.denied;
    return deps.textResult(await deps.callDevice(g.identity, device_id, "browser_list_tabs", {}));
  });

  registerMcpTool(server, "shared_tab_read", {
    title: "Read a shared browser tab",
    description:
      "Read a shared tab without changing it. include picks what to return: page (text, headings and interactive elements with refs and a snapshot_id for shared_tab_click/fill; the default), selection (text the user selected), links, table (one table by table_index). Form values and raw HTML are not returned. Pass tab_id when several tabs are shared." +
      scopeNote,
    inputSchema: z.object({
      device_id: deviceId,
      tab_id: tabId,
      include: z.array(z.enum(parts)).min(1).max(4).optional(),
      table_index: z.number().int().min(0).optional(),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    _meta: deps.oauthToolMeta("browser:read"),
  }, async ({ device_id, tab_id, include, table_index }: { device_id: string; tab_id?: number; include?: (typeof parts)[number][]; table_index?: number }) => {
    const g = await guard("browser:read");
    if (!g.identity) return g.denied;
    const wanted = [...new Set(include?.length ? include : ["page" as const])];
    const out: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    for (const part of wanted) {
      const args = { ...tab(tab_id), ...(part === "table" ? { table_index: table_index ?? 0 } : {}) };
      try {
        out[part] = await deps.callDevice(g.identity, device_id, partTool[part], args);
      } catch (error) {
        // One unavailable part (for example a disabled permission) should not
        // hide the parts that were read successfully.
        if (wanted.length === 1) throw error;
        errors[part] = error instanceof Error ? error.message : String(error);
      }
    }
    if (Object.keys(out).length === 0) throw new Error(Object.values(errors)[0] || "shared tab read failed");
    if (Object.keys(errors).length) out.errors = errors;
    return deps.textResult(out);
  });

  registerMcpTool(server, "shared_tab_click", {
    title: "Click in a shared browser tab",
    description:
      "Click one element (ref) from the latest shared_tab_read page snapshot. Requires the user to enable Click & fill for that specific tab. Clicks can navigate or submit forms, so read the page again after each click." +
      scopeNote,
    inputSchema: z.object({
      device_id: deviceId,
      tab_id: tabId,
      snapshot_id: z.string().min(1).max(120),
      ref: z.string().regex(/^e[1-9]\d*$/),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    _meta: deps.oauthToolMeta("browser:interact"),
  }, async ({ device_id, tab_id, snapshot_id, ref }: { device_id: string; tab_id?: number; snapshot_id: string; ref: string }) => {
    const g = await guard("browser:interact");
    if (!g.identity) return g.denied;
    return deps.textResult(await deps.callDevice(g.identity, device_id, "browser_click", { ...tab(tab_id), snapshot_id, ref }));
  });

  registerMcpTool(server, "shared_tab_open", {
    title: "Open a tab in the user's browser",
    description:
      "Open a new tab in the user's own browser on a site the user allowed for AI, signed in as the user is. It opens in the background in a Remote Arc tab group and returns tab_id (and a page snapshot unless snapshot=false). If the site is not allowed yet, the call fails with SITE_NOT_ALLOWED and the user sees a page with an Allow button: ask the user to click it once, then call again. The tab keeps access as it moves between allowed sites. Use shared_tab_act to work in it." +
      scopeNote,
    inputSchema: z.object({
      device_id: deviceId,
      url: z.string().url().max(2000),
      active: z.boolean().optional(),
      snapshot: z.boolean().optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    _meta: deps.oauthToolMeta("browser:interact"),
  }, async ({ device_id, url, active, snapshot }: { device_id: string; url: string; active?: boolean; snapshot?: boolean }) => {
    const g = await guard("browser:interact");
    if (!g.identity) return g.denied;
    try {
      return deps.textResult(await deps.callDevice(g.identity, device_id, "browser_open_tab", { url, ...(active !== undefined ? { active } : {}), ...(snapshot !== undefined ? { snapshot } : {}) }));
    } catch (error) {
      throw extensionUpdateError("browser_open_tab", error);
    }
  });

  registerMcpTool(server, "shared_tab_act", {
    title: "Act in a tab in the user's browser",
    description:
      "Do one thing in a tab of the user's own browser, on a tab Remote Arc opened or one the user shared with Click & fill on. With snapshot_id + ref from the latest snapshot: click, fill (value; also rich text boxes), select (option value or label), check, uncheck, press (key: Enter, Tab, Escape, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Space, PageDown, PageUp, Home, End, Backspace), scroll (ref, or value up|down|top|bottom). fill_form fills many fields from one snapshot: fields=[{ref, action: fill|select|check|uncheck, value}]; each reports ok or its own error. For fill, secret=<handle from request_secret> replaces value: the value the user entered is filled once, only on its site, and you never see it. Without a ref: navigate (url on an allowed site), back, reload, wait (text and/or url_contains, timeout_ms up to 30000), close (only tabs Remote Arc opened). snapshot=true returns the page as the action left it. Each action waits for what it started (a page load, or the page to stop changing). Passwords, card numbers, CAPTCHA response tokens and file pickers are never filled. For login and registration challenges, ask the user to finish authentication in their browser. Do not retrieve or transmit OTP codes or other authentication secrets through model tools. OTP and CAPTCHA automation are disabled for public MCP calls even when enabled in Dashboard; use user takeover for authentication challenges. A click or Enter that sends something on the user's behalf (place order, pay, buy, post, comment, reply, send, submit, apply, delete, 提交, 支付, 购买, 下单, 发布, 评论...) is a final submit: confirm with the user first, then pass effect=submit and a stable idempotency_key. It is sent once (SUBMIT_KEY_USED for a used key), and the same form and button is refused under a new key (SUBMIT_ALREADY_RECORDED) until you settle it with action=confirm, idempotency_key and outcome=succeeded|failed after checking the page. Clicks and keys run as page events, so a few sites that only accept real input may ignore them; use browser_runner_* there." +
      scopeNote,
    inputSchema: z.object({
      device_id: deviceId,
      tab_id: tabId,
      action: z.enum(actActions),
      snapshot_id: z.string().min(1).max(120).optional(),
      ref: ref.optional(),
      value: z.string().max(20000).optional(),
      fields: z.array(z.object({ ref, action: z.enum(["fill", "select", "check", "uncheck"]).optional(), value: z.string().max(20000).optional() })).min(1).max(40).optional(),
      key: z.enum(["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Space", "PageDown", "PageUp", "Home", "End", "Backspace"]).optional(),
      url: z.string().url().max(2000).optional(),
      text: z.string().min(1).max(500).optional(),
      url_contains: z.string().min(1).max(500).optional(),
      timeout_ms: z.number().int().min(250).max(30000).optional(),
      effect: z.enum(["submit"]).optional(),
      idempotency_key: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/).optional(),
      outcome: z.enum(["succeeded", "failed"]).optional(),
      snapshot: z.boolean().optional(),
      secret: secretHandle.optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    _meta: deps.oauthToolMeta("browser:interact"),
  }, async (input: Record<string, unknown>) => {
    const g = await guard("browser:interact");
    if (!g.identity) return g.denied;
    const { device_id, ...args } = input as { device_id: string } & Record<string, unknown>;
    for (const key of Object.keys(args)) if (args[key] === undefined) delete args[key];
    const secret = typeof args.secret === "string" ? args.secret : undefined;
    if (secret && (args.action !== "fill" || args.value !== undefined)) throw new Error("secret works only with action=fill, in place of value.");
    if (secret) await checkSecret(g.identity, device_id, secret);
    try {
      const result = await deps.callDevice(g.identity, device_id, "browser_act", args);
      if (secret) await deps.secrets?.used(secret);
      return deps.textResult(result);
    } catch (error) {
      throw extensionUpdateError("browser_act", error);
    }
  });

  registerMcpTool(server, "shared_tab_fill", {
    title: "Fill a field in a shared browser tab",
    description:
      "Fill one field (ref) from the latest shared_tab_read snapshot with Click & fill enabled. Ask the user to enter OTP codes and other authentication secrets directly in their browser. Never pass passwords, OTP codes, payment-card details, CAPTCHA tokens or file-picker contents as model tool arguments. For an API key or token the user must give you, use request_secret and pass its handle as secret. " + secretNote +
      scopeNote,
    inputSchema: z.object({
      device_id: deviceId,
      tab_id: tabId,
      snapshot_id: z.string().min(1).max(120),
      ref: z.string().regex(/^e[1-9]\d*$/),
      value: z.string().max(20000).optional(),
      secret: secretHandle.optional(),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    _meta: deps.oauthToolMeta("browser:interact"),
  }, async ({ device_id, tab_id, snapshot_id, ref, value, secret }: { device_id: string; tab_id?: number; snapshot_id: string; ref: string; value?: string; secret?: string }) => {
    if ((value === undefined) === (secret === undefined)) throw new Error("Pass either value or secret (a handle from request_secret).");
    const g = await guard("browser:interact");
    if (!g.identity) return g.denied;
    if (secret) await checkSecret(g.identity, device_id, secret);
    const result = await deps.callDevice(g.identity, device_id, "browser_fill", { ...tab(tab_id), snapshot_id, ref, ...(secret ? { secret } : { value }) });
    if (secret) await deps.secrets?.used(secret);
    return deps.textResult(result);
  });
}

/**
 * Names the shared-tab tools had before 0.6.2-rc.4. MCP hosts cache a
 * connector's tool list (ChatGPT until the connector is refreshed, Claude
 * until it reconnects), and this stateless server cannot push
 * notifications/tools/list_changed, so a host that connected earlier keeps
 * calling these names. They stay callable with the same scopes, arguments and
 * device protocol, are hidden from tools/list, and every result tells the
 * model to have the user refresh the connector to see the current tools,
 * including browser_runner_*.
 */
export const LEGACY_SHARED_TAB_ALIASES = {
  browser_list_tabs: "shared_tab_list",
  browser_get_current_tab: "shared_tab_list",
  browser_read_page: "shared_tab_read",
  browser_get_selected_text: "shared_tab_read",
  browser_extract_links: "shared_tab_read",
  browser_extract_table: "shared_tab_read",
  browser_click: "shared_tab_click",
  browser_fill: "shared_tab_fill",
} as const;
export type LegacySharedTabTool = keyof typeof LEGACY_SHARED_TAB_ALIASES;
export const LEGACY_ALIAS_META_KEY = "remotearc/legacyAliasOf";

export function legacyRefreshNotice(name: LegacySharedTabTool) {
  return (
    `${name} was renamed to ${LEGACY_SHARED_TAB_ALIASES[name]}. This AI client is using a cached Remote Arc tool list. ` +
    "Ask the user to refresh or reconnect the Remote Arc connector in this client to load the current tools " +
    "(shared_tab_* for shared tabs and browser_runner_* for task browsers on a computer). This call still ran normally."
  );
}

export function registerLegacySharedTabAliases(server: McpServer, deps: SharedTabDeps) {
  const guard = async (scope: Scope) => {
    const { identity } = deps;
    if (!identity || !deps.hasScope(identity, scope)) return { denied: deps.authRequired(scope, identity) };
    const usageError = await deps.consume(identity);
    if (usageError) return { denied: usageError };
    return { identity };
  };
  const tab = (tab_id: number | undefined) => (tab_id !== undefined ? { tab_id } : {});
  const read = { readOnlyHint: true, openWorldHint: false, destructiveHint: false };
  const define = (
    name: LegacySharedTabTool,
    scope: Scope,
    inputSchema: z.ZodTypeAny,
    annotations: Record<string, boolean>,
    args: (input: Record<string, any>) => Record<string, unknown>,
  ) => {
    const meta = deps.oauthToolMeta(scope) as Record<string, unknown> | undefined;
    registerMcpTool(server, name, {
      title: `${name} (renamed to ${LEGACY_SHARED_TAB_ALIASES[name]})`,
      description: `Deprecated alias of ${LEGACY_SHARED_TAB_ALIASES[name]}, kept for AI clients with a cached tool list.` + scopeNote,
      inputSchema,
      annotations,
      _meta: { ...(meta ?? {}), [LEGACY_ALIAS_META_KEY]: LEGACY_SHARED_TAB_ALIASES[name] },
    }, async (input: Record<string, any>) => {
      const g = await guard(scope);
      if (!g.identity) return g.denied;
      const result = await deps.callDevice(g.identity, input.device_id, name, args(input));
      return deps.textResult({ notice: legacyRefreshNotice(name), result });
    });
  };
  const tabOnly = z.object({ device_id: deviceId, tab_id: tabId });
  const ref = z.string().regex(/^e[1-9]\d*$/);
  define("browser_list_tabs", "browser:read", z.object({ device_id: deviceId }), read, () => ({}));
  define("browser_get_current_tab", "browser:read", tabOnly, read, ({ tab_id }) => tab(tab_id));
  define("browser_read_page", "browser:read", tabOnly, read, ({ tab_id }) => tab(tab_id));
  define("browser_get_selected_text", "browser:read", tabOnly, read, ({ tab_id }) => tab(tab_id));
  define("browser_extract_links", "browser:read", tabOnly, read, ({ tab_id }) => tab(tab_id));
  define(
    "browser_extract_table", "browser:read",
    z.object({ device_id: deviceId, tab_id: tabId, table_index: z.number().int().min(0).default(0) }), read,
    ({ tab_id, table_index }) => ({ ...tab(tab_id), table_index }),
  );
  define(
    "browser_click", "browser:interact",
    z.object({ device_id: deviceId, tab_id: tabId, snapshot_id: z.string().min(1).max(120), ref }),
    { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
    ({ tab_id, snapshot_id, ref }) => ({ ...tab(tab_id), snapshot_id, ref }),
  );
  define(
    "browser_fill", "browser:interact",
    z.object({ device_id: deviceId, tab_id: tabId, snapshot_id: z.string().min(1).max(120), ref, value: z.string().max(20000) }),
    { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    ({ tab_id, snapshot_id, ref, value }) => ({ ...tab(tab_id), snapshot_id, ref, value }),
  );
}
