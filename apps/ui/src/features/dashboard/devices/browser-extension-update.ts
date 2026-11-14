import { isOlderRelease } from "../../install/agent-update-guide.js";

/**
 * The paired extension's version and the latest one, when it is older.
 * `latest` is the version live on Chrome Web Store; without it there is no
 * notice, because Chrome could not install anything newer yet.
 */
export function browserExtensionUpdate(
  device: { platform: string; agent_version?: string | null },
  latest: string | null,
) {
  if (device.platform !== "browser" || !device.agent_version || !latest) return null;
  const current = device.agent_version.replace(/^browser-/, "");
  return isOlderRelease(current, latest) ? { current, latest } : null;
}
