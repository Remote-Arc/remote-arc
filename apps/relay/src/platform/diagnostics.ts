/** Keep operational errors content-free; arbitrary exception text can contain secrets. */
export function diagnosticError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (message.startsWith("D1_ERROR:")) return "D1_ERROR: details omitted";
  if (error instanceof TypeError) return "TypeError: details omitted";
  if (error instanceof RangeError) return "RangeError: details omitted";
  return "Error: details omitted";
}

// The Go Agent reports raw os errors, so the path comes first and the reason
// last. Only the fixed code leaves this function.
const DEVICE_READ_FAILURES: [RegExp, string][] = [
  [/: (?:no such file or directory|The system cannot find the (?:file|path) specified\.)$/, "ENOENT"],
  [/: (?:permission denied|operation not permitted|Access is denied\.)$/, "EACCES"],
  [/^Path is not a directory: |: not a directory$/, "ENOTDIR"],
  [/^Path is not a file: |: is a directory$/, "EISDIR"],
  [/^File is too large for /, "FILE_TOO_LARGE"],
  [/^Binary file detected\./, "BINARY_FILE"],
];

/** A failed read needs a stable recovery hint, never its original path/content. */
export function deviceReadDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  for (const code of ["ENOENT", "EACCES", "EPERM", "ENOTDIR", "EISDIR", "FILE_CHANGED_DURING_READ"]) {
    if (message === code || message.startsWith(code + ":")) return code + ": details omitted";
  }
  for (const [pattern, code] of DEVICE_READ_FAILURES) {
    if (pattern.test(message)) return code + ": details omitted";
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
