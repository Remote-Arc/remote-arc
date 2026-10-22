import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { OAuthIdentity } from "./auth.js";
import { registerMcpTool } from "./mcp-errors.js";

/**
 * Shared-tab tools: the Chrome/Edge Companion extension, acting only on tabs
 * the user explicitly shared from their own everyday browser. The public MCP
 * names are shared_tab_*; the device protocol (browser_read_page,
 * browser_click, ...) and stored device permissions are unchanged, so no
 * extension update or re-grant is needed.
 */
export const SHARED_TAB_TOOLS = ["shared_tab_list", "shared_tab_read", "shared_tab_click", "shared_tab_fill"] as const;

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
  | "browser_fill";

export type SharedTabDeps = {
  identity: OAuthIdentity | null;
  hasScope: (identity: OAuthIdentity, scope: Scope) => boolean;
  authRequired: (scope: Scope, identity: OAuthIdentity | null) => unknown;
  consume: (identity: OAuthIdentity) => Promise<unknown>;
  oauthToolMeta: (scope: Scope) => unknown;
  textResult: (value: unknown) => ToolResult;
  callDevice: (identity: OAuthIdentity, deviceId: string, tool: DeviceTool, args: Record<string, unknown>) => Promise<unknown>;
};

const scopeNote =
  " Works only on tabs the user shared from their own browser with the Remote Arc Companion extension (a device with platform browser). For multi-step work in a separate background browser on a computer, use browser_runner_* instead.";

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

  registerMcpTool(server, "shared_tab_fill", {
    title: "Fill a field in a shared browser tab",
    description:
      "Fill one non-sensitive field (ref) from the latest shared_tab_read page snapshot. Requires the user to enable Click & fill for that tab. Password, one-time-code, payment-card and file fields are always blocked." +
      scopeNote,
    inputSchema: z.object({
      device_id: deviceId,
      tab_id: tabId,
      snapshot_id: z.string().min(1).max(120),
      ref: z.string().regex(/^e[1-9]\d*$/),
      value: z.string().max(20000),
    }),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
    _meta: deps.oauthToolMeta("browser:interact"),
  }, async ({ device_id, tab_id, snapshot_id, ref, value }: { device_id: string; tab_id?: number; snapshot_id: string; ref: string; value: string }) => {
    const g = await guard("browser:interact");
    if (!g.identity) return g.denied;
    return deps.textResult(await deps.callDevice(g.identity, device_id, "browser_fill", { ...tab(tab_id), snapshot_id, ref, value }));
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
