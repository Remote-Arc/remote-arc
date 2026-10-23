export const ONBOARDING_PREVIEW_CODE = "DEMO-CODE";
export const ONBOARDING_PREVIEW_DEVICE = "preview-onboarding";

export function onboardingPreviewStep(url: URL): "pair" | "permissions" | "ready" {
  const step = url.searchParams.get("demo");
  return step === "permissions" || step === "ready" ? step : "pair";
}

export function createOnboardingPreviewDevice() {
  const safeTools = ["list_directory", "read_file", "read_binary_file", "get_file_info", "list_processes"];
  const tools = [...safeTools, "write_file", "edit_block", "undo_last_change", "start_process"];
  return {
    id: ONBOARDING_PREVIEW_DEVICE, name: "Preview computer", platform: "win32", arch: "x64", hostname: "PREVIEW-PC",
    created_at: new Date().toISOString(), last_seen: new Date().toISOString(), status: "online" as const,
    tools, available_tools: tools, allowed_tools: [...safeTools], workspace_roots: [] as string[],
    sensitive_paths: [] as string[], sensitive_allow_paths: [] as string[], protect_sensitive_paths: true, undo_enabled: true,
    background_agent_available: true, background_recovery_available: true, background_enabled: false,
    background_service: "preview", background_seen_at: new Date().toISOString(),
  };
}

/** All state is disposable browser memory. No request reaches a real device. */
export function createOnboardingPreview(url: URL) {
  const device = createOnboardingPreviewDevice();
  let approved = url.pathname === "/device" && onboardingPreviewStep(url) !== "pair";
  const reply = (body: unknown, status = 200) => Response.json(body, { status });
  return {
    devices: () => approved ? [device] : [],
    handle(url: URL, method: string, body?: unknown): Response | null {
      if (url.pathname === "/api/pairing" && method === "GET") {
        if (url.searchParams.get("code")?.toUpperCase() !== ONBOARDING_PREVIEW_CODE) return reply({ error: "Preview pairing code not found. Use DEMO-CODE." }, 404);
        return reply({ user_code: ONBOARDING_PREVIEW_CODE, device_name: device.name, platform: device.platform, arch: device.arch, hostname: device.hostname, status: "pending", expires_at: new Date(Date.now() + 300000).toISOString() });
      }
      const action = url.pathname.startsWith(`/api/devices/${device.id}/`) ? url.pathname.slice(`/api/devices/${device.id}/`.length) : null;
      if (url.pathname !== "/api/pairing/approve" && action === null) return null;
      let input: Record<string, unknown>;
      try { input = typeof body === "string" ? JSON.parse(body || "{}") : (body || {}) as Record<string, unknown>; }
      catch { return reply({ error: "Invalid preview request" }, 400); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return reply({ error: "Invalid preview request" }, 400);
      if (url.pathname === "/api/pairing/approve" && method === "POST") {
        if (input.user_code !== ONBOARDING_PREVIEW_CODE) return reply({ error: "Only the demo pairing code can be approved in preview." }, 400);
        approved = true;
        return reply({ device });
      }
      if (!approved) return reply({ error: "Preview computer is not paired" }, 404);
      if (action === "directories" && method === "GET") {
        const requested = url.searchParams.get("path")?.trim();
        const path = !requested || requested === "~" ? "C:\\Users\\Preview" : requested;
        return reply({ browser: { path, parent: path.replace(/[\\/][^\\/]+[\\/]?$/, "") || null, directories: ["Projects", "Documents"].map(name => ({ name, path: path.replace(/[\\/]$/, "") + "\\" + name, type: "directory" })), protected_entries_omitted: 0, truncated: false } });
      }
      if (method !== "POST") return reply({ error: "Unsupported preview action" }, 405);
      if (action === "tools" && Array.isArray(input.allowed_tools)) {
        device.allowed_tools = input.allowed_tools.filter((tool): tool is string => typeof tool === "string" && device.tools.includes(tool));
        return reply({ device });
      }
      if (action === "policy" && Array.isArray(input.workspace_roots)) {
        device.workspace_roots = input.workspace_roots.filter((path): path is string => typeof path === "string");
        return reply({ device });
      }
      if (action === "background" && typeof input.enabled === "boolean") {
        device.background_enabled = input.enabled;
        return reply({ enabled: input.enabled, status: { enabled: input.enabled, active: input.enabled, service: "preview" } });
      }
      return reply({ error: "Unsupported preview action" }, 400);
    },
  };
}
