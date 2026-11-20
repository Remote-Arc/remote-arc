/** The desktop agent builds the relay serves at /api/downloads/agent/{platform}/{arch}. */
export type AgentPlatform = "darwin" | "windows" | "linux";
export type AgentArch = "arm64" | "amd64";
export type AgentTarget = { platform: AgentPlatform; arch: AgentArch };

type UserAgentData = {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
};
const agentData = () => (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;

/** The desktop platform of this browser's computer, or null on a phone or tablet. */
export function detectAgentPlatform(): AgentPlatform | null {
  const data = agentData();
  const value = data?.platform || navigator.platform || navigator.userAgent;
  if (data?.mobile || /android|iphone|ipad|ipod/i.test(navigator.userAgent)) return null;
  if (/win/i.test(value)) return "windows";
  if (/linux|x11|cros/i.test(value)) return "linux";
  return "darwin";
}

/**
 * The build for this computer. Chromium reports the CPU through client hints;
 * elsewhere the user agent decides, and a Mac defaults to Apple silicon, which
 * every Mac sold since 2023 uses. Resolves to null on a phone or tablet.
 */
export async function detectAgentTarget(): Promise<AgentTarget | null> {
  const platform = detectAgentPlatform();
  if (!platform) return null;
  let architecture = "";
  try {
    architecture =
      (await agentData()?.getHighEntropyValues?.(["architecture"]))?.architecture ?? "";
  } catch {
    /* Client hints are optional; fall back to the user agent. */
  }
  // Every Mac browser reports "Intel Mac OS X", so without a client hint the
  // user agent cannot tell a Mac's CPU apart.
  const arm = architecture
    ? architecture === "arm"
    : platform === "darwin" || /aarch64|arm64|armv8/i.test(navigator.userAgent);
  return { platform, arch: arm ? "arm64" : "amd64" };
}

export const AGENT_PLATFORM_NAMES: Record<AgentPlatform, string> = {
  darwin: "macOS",
  windows: "Windows",
  linux: "Linux",
};

export const agentDownloadPath = ({ platform, arch }: AgentTarget) =>
  "/api/downloads/agent/" + platform + "/" + arch;
