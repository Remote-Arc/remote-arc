import { UI_PREVIEW } from "../preview/preview-mode.js";
import { ORIGINS } from "./hosts.js";

export const MARKETING_ORIGIN = ORIGINS.marketing;
export const APP_ORIGIN = ORIGINS.app;
export const MCP_ENDPOINT = ORIGINS.mcp + "/mcp";
export const dashboardHref = (path: string) => (UI_PREVIEW ? path : APP_ORIGIN + path);
export const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";
export const GEMINI_CONNECTORS_URL = "https://gemini.google.com/customize/connectors";
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/remote-arc-browser/eldbdnmgaecbdgpinljemenkolfmmjie";
export function cursorMcpInstallUrl() {
  const config = window.btoa(JSON.stringify({ url: MCP_ENDPOINT }));
  return (
    "cursor://anysphere.cursor-deeplink/mcp/install?name=remote-arc&config=" +
    encodeURIComponent(config)
  );
}
