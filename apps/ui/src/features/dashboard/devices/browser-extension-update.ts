import companionManifest from "../../../../../browser-extension/manifest.json" with { type: "json" };
import { isOlderRelease } from "../../install/agent-update-guide.js";

// The version the Chrome extension download page serves. The extension is
// loaded unpacked, so Chrome never updates it by itself.
export const LATEST_BROWSER_EXTENSION_VERSION: string = companionManifest.version;

/** The paired extension's version and the latest one, when it is older. */
export function browserExtensionUpdate(device: { platform: string; agent_version?: string | null }) {
  if (device.platform !== "browser" || !device.agent_version) return null;
  const current = device.agent_version.replace(/^browser-/, "");
  return isOlderRelease(current, LATEST_BROWSER_EXTENSION_VERSION) ? { current, latest: LATEST_BROWSER_EXTENSION_VERSION } : null;
}
