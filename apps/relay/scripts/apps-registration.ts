import { pathToFileURL } from "node:url";
import { APP_CATALOG, APP_PROVIDERS, appScopes } from "../src/app-catalog.js";
import { callbackUrl } from "../src/app-oauth.js";

export function registrationPack(value: string) {
  const origin = new URL(value);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Use a public HTTPS origin without a path, credentials, query or fragment.");
  }
  const env = { APP_ORIGIN: origin.origin, PUBLIC_ORIGIN: origin.origin } as Parameters<typeof callbackUrl>[0];
  const callbacks = Object.fromEntries(APP_PROVIDERS.map(provider => [provider, callbackUrl(env, provider)]));
  const declaredScopes = (providers: typeof APP_PROVIDERS[number][]) => [...new Set(providers.flatMap(provider => appScopes(provider, ["read", "write"])))];
  return {
    schemaVersion: 1,
    kind: "registration-template",
    authBackend: "remote_arc_native",
    defaultAuthMode: "remote_arc_managed",
    byoOAuthSupported: false,
    registered: false,
    enabled: false,
    origin: origin.origin,
    developerSetup: "Register these platform applications once. Each end user subsequently authorizes their own accounts.",
    callbacks,
    github: {
      registrationUrl: "https://github.com/organizations/Remote-Arc/settings/applications",
      applicationName: "Remote Arc",
      homepageUrl: "https://remotearc.app",
      callbackUrls: [callbacks.github],
      expireUserAccessTokens: true,
      enableDeviceFlow: false,
      requestedScopes: { read: appScopes("github", ["read"]), write: appScopes("github", ["read", "write"]) },
      warning: "GitHub OAuth repo scope includes upstream write access. Remote Arc's read permission separately denies every write operation.",
      clientIdSecretName: "APP_GITHUB_CLIENT_ID",
      clientSecretSecretName: "APP_GITHUB_CLIENT_SECRET",
    },
    slack: {
      registrationUrl: "https://api.slack.com/apps",
      manifest: {
        display_information: { name: "Remote Arc", description: "Connect approved AI workflows to your Slack workspace.", background_color: "#07151f" },
        oauth_config: { redirect_urls: [callbacks.slack], scopes: { user: declaredScopes(["slack"]) } },
        settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: true },
      },
      scopeModel: "User token. These are User Token Scopes, not Bot Token Scopes.",
      distribution: "Enable the provider's distribution settings before onboarding workspaces outside the development workspace.",
      clientIdSecretName: "APP_SLACK_CLIENT_ID",
      clientSecretSecretName: "APP_SLACK_CLIENT_SECRET",
    },
    google: {
      registrationUrl: "https://console.cloud.google.com/auth/overview",
      applicationName: "Remote Arc Apps",
      applicationType: "Web application",
      apiServices: ["gmail.googleapis.com", "calendar-json.googleapis.com"],
      authorizedRedirectUris: [callbacks.gmail, callbacks.google_calendar],
      declaredScopes: declaredScopes(["gmail", "google_calendar"]),
      audience: "External; start in Testing with explicit test users. Complete applicable verification before public launch.",
      clientIdSecretName: "APP_GOOGLE_CLIENT_ID",
      clientSecretSecretName: "APP_GOOGLE_CLIENT_SECRET",
      credentialIsolation: "Use a dedicated Apps OAuth client, separate from the existing Google sign-in client.",
    },
    microsoft: {
      registrationUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
      applicationName: "Remote Arc Apps",
      platform: "Web",
      supportedAccountTypes: "Accounts in any organizational directory and personal Microsoft accounts",
      authority: "https://login.microsoftonline.com/common",
      redirectUris: [callbacks.outlook, callbacks.microsoft_calendar],
      delegatedPermissions: declaredScopes(["outlook", "microsoft_calendar"]),
      applicationPermissions: [],
      implicitGrant: false,
      publicClientFlows: false,
      clientIdSecretName: "APP_MICROSOFT_CLIENT_ID",
      clientSecretSecretName: "APP_MICROSOFT_CLIENT_SECRET",
    },
    runtime: {
      enableFlag: "ENABLE_APPS",
      enableFlagValueAfterVerification: "1",
      vaultSecretName: "APP_TOKEN_KEY",
      vaultFormat: "Base64 encoding of 32 cryptographically random bytes; keep the same key while existing encrypted connections remain.",
      requestedPermissions: "Default read-only. Users explicitly choose write access; each external write also requires approval of its exact payload.",
      note: "Registration declares the available scopes. Per-user authorization only requests the permission set selected by that user.",
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--origin") {
    console.error("Usage: pnpm --filter @remotearc/relay exec tsx scripts/apps-registration.ts --origin https://mcp.remotearc.app");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(registrationPack(args[1]!), null, 2)); }
    catch (error) { console.error(error instanceof Error ? error.message : "Invalid origin"); process.exitCode = 1; }
  }
}
