// Short-lived: a registration change takes effect within the TTL on every isolate.
const PROFILE_TTL_MS = 10 * 60 * 1000;
const profileCache = new Map<string, { profile: "generic" | "claude"; expires: number }>();
// Anthropic publishes both hosts for its remote-connector OAuth callback (web, desktop and mobile).
const CLAUDE_CALLBACK_HOSTS = new Set(["claude.ai", "claude.com"]);

/**
 * OAuth-authenticated client capability metadata for the single Remote Arc MCP.
 * Never trust client_name or User-Agent: both are self-reported.
 * A code issued to Claude's registered redirect is only redeemed by a client
 * that controls that callback.
 */
export async function mcpClientProfile(
  db: Pick<D1Database, "prepare">, clientId: string,
): Promise<"generic" | "claude"> {
  const cached = profileCache.get(clientId);
  if (cached && cached.expires > Date.now()) return cached.profile;
  const record = await db.prepare("SELECT redirect_uris FROM oauth_clients WHERE client_id = ?1")
    .bind(clientId).first<{ redirect_uris: string }>();
  if (!record) return "generic";
  let uris: unknown;
  try { uris = JSON.parse(record.redirect_uris); } catch { return "generic"; }
  if (!Array.isArray(uris)) return "generic";
  const claude = uris.some((entry) => {
    if (typeof entry !== "string") return false;
    try {
      const uri = new URL(entry);
      return uri.protocol === "https:" && CLAUDE_CALLBACK_HOSTS.has(uri.hostname)
        && uri.pathname === "/api/mcp/auth_callback"
        && !uri.username && !uri.password;
    } catch { return false; }
  });
  const profile = claude ? "claude" : "generic";
  // This hot-isolate cache avoids one extra D1 read on most tool calls.
  if (profileCache.size >= 256) profileCache.clear();
  profileCache.set(clientId, { profile, expires: Date.now() + PROFILE_TTL_MS });
  return profile;
}
