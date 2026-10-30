/** Keep operational errors content-free; arbitrary exception text can contain secrets. */
export function diagnosticError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (message.startsWith("D1_ERROR:")) return "D1_ERROR: details omitted";
  if (error instanceof TypeError) return "TypeError: details omitted";
  if (error instanceof RangeError) return "RangeError: details omitted";
  return "Error: details omitted";
}

/** A failed read needs a stable recovery hint, never its original path/content. */
export function deviceReadDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  for (const code of ["ENOENT", "EACCES", "EPERM", "ENOTDIR", "EISDIR", "FILE_CHANGED_DURING_READ"]) {
    if (message === code || message.startsWith(code + ":")) return code + ": details omitted";
  }
  if (/^device call timed out(?:$|:)/i.test(message)) return "DEVICE_TIMEOUT: details omitted";
  if (/^device (?:offline|not found|not found or revoked)$/.test(message)) return "DEVICE_UNAVAILABLE: details omitted";
  if (message.startsWith("Blocked by Remote Arc ")) return "DEVICE_POLICY_DENIED: details omitted";
  return diagnosticError(error);
}

const ROUTES = [
  "/mcp", "/health", "/api/device", "/api/devices", "/api/slack",
  "/api/arc", "/api/admin", "/api/apps", "/api/monitor", "/api/me",
  "/oauth", "/auth",
];

/** Keep static route families only; suffixes may contain codes or personal data. */
export function diagnosticRoute(path: string | undefined): string | undefined {
  if (path === undefined) return undefined;
  if (path === "/") return "/";
  for (const route of ROUTES) {
    if (path === route) return route;
    if (path.startsWith(route + "/")) return route + "/:redacted";
  }
  return "/:redacted";
}
