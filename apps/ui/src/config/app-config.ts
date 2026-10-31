import { UI_PREVIEW } from "../preview/preview-mode.js";

export const MARKETING_ORIGIN = "https://remotearc.app";
export const APP_ORIGIN = "https://agent.remotearc.app";
export const MCP_ENDPOINT = "https://mcp.remotearc.app/mcp";
export const dashboardHref = (path: string) => UI_PREVIEW ? path : APP_ORIGIN + path;
export const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";
export const GEMINI_CONNECTORS_URL = "https://gemini.google.com/customize/connectors";
export function cursorMcpInstallUrl() {
  const config = window.btoa(JSON.stringify({ url: MCP_ENDPOINT }));
  return "cursor://anysphere.cursor-deeplink/mcp/install?name=remote-arc&config=" + encodeURIComponent(config);
}
