/** Same-origin business fetch metadata only; never inspect request/response bodies. */
const families = [
  "/api/billing",
  "/api/apps",
  "/api/devices",
  "/api/arc",
  "/api/automations",
  "/api/admin",
  "/api/runner",
  "/api/browser-auth",
  "/api/device",
  "/api/pairing",
  "/api/slack",
  "/auth",
  "/oauth",
  "/api",
];
export function observeBusinessFetch(
  native: typeof fetch,
  origin: string,
  headers: () => Record<string, string>,
  report: (metadata: { traceId?: string; route: string; errorCode: string }) => void,
): typeof fetch {
  return async (input, init) => {
    let url: URL;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), origin);
    } catch {
      return native(input, init);
    }
    const route =
      url.origin === origin && url.pathname !== "/api/product-events"
        ? families.find(
            (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + "/"),
          )
        : undefined;
    if (!route) return native(input, init);
    const updated = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined),
    );
    for (const [key, value] of Object.entries(headers()))
      if (!updated.has(key)) updated.set(key, value);
    try {
      return await native(input, { ...init, headers: updated });
    } catch (error) {
      if (!(error && typeof error === "object" && "name" in error && error.name === "AbortError"))
        try {
          report({
            route,
            traceId: updated.get("x-ra-trace-id") || undefined,
            errorCode: "NETWORK_ERROR",
          });
        } catch {}
      throw error;
    }
  };
}
