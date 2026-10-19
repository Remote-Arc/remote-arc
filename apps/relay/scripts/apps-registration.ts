import { pathToFileURL } from "node:url";
import { APP_CATALOG, APP_PROVIDERS, appScopes } from "../src/app-catalog.js";
import { callbackUrl } from "../src/app-oauth.js";

export function registrationPack(value: string) {
  const origin = new URL(value);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Use a public HTTPS origin without a path, credentials, query or fragment.");
  }
  const env = { APP_ORIGIN: origin.origin, PUBLIC_ORIGIN: origin.origin } as Parameters<typeof callbackUrl>[0];
  const callbacks = Object.fromEntries(APP_PROVIDERS.filter(provider => APP_CATALOG[provider].auth !== "api_key").map(provider => [provider, callbackUrl(env, provider)]));
  const declaredScopes = (providers: typeof APP_PROVIDERS[number][]) => [...new Set(providers.flatMap(provider => appScopes(provider, ["read", "write"])))];
  const googleProviders = APP_PROVIDERS.filter(provider => APP_CATALOG[provider].credential === "GOOGLE");
  const additions = Object.fromEntries([
    ["vercel","VERCEL","https://vercel.com/dashboard/integrations/console"],
    ["linear","LINEAR","https://linear.app/settings/api/applications"],
    ["supabase","SUPABASE","https://supabase.com/dashboard"],
    ["x","X","https://developer.x.com/"],
    ["meta","META","https://developers.facebook.com/apps/"],
    ["atlassian","ATLASSIAN","https://developer.atlassian.com/console/myapps/"],
    ["notion","NOTION","https://www.notion.so/profile/integrations"],
    ["shopify","SHOPIFY","https://dev.shopify.com/dashboard"],
    ["linkedin","LINKEDIN","https://www.linkedin.com/developers/apps"],
    ["hubspot","HUBSPOT","https://developers.hubspot.com/"],
    ["salesforce","SALESFORCE","https://login.salesforce.com/"],
  ].map(([name,credential,registrationUrl]) => {
    const providers = APP_PROVIDERS.filter(provider => APP_CATALOG[provider].credential === credential);
    return [name,{registrationUrl,applicationName:"Remote Arc Apps",providers,redirectUris:providers.map(provider=>callbacks[provider]),declaredScopes:declaredScopes(providers),clientIdSecretName:"APP_"+credential+"_CLIENT_ID",clientSecretSecretName:"APP_"+credential+"_CLIENT_SECRET",
      review:"Register the platform application once. Validate provider distribution, requested permissions and eligible account types before public onboarding.",
      ...(name==="vercel"?{integrationSlugEnv:"APP_VERCEL_INTEGRATION_SLUG",configuredPermissions:["integration-configuration:read","project:read","deployment:read-write"],note:"External integration installation; register the exact callback, preserve state and configure project access. Operations follow the installation's provider permissions and project access."}:{}),
      ...(name==="supabase"?{configuredPermissions:["organizations:read","projects:read","database:write"],note:"Management API OAuth app, not a Supabase Auth OAuth server. Scopes are configured on the app rather than in the authorization URL; operations follow the connected organization's grants and limits."}:{}),
      ...(name==="linear"?{actor:"user",pkce:"S256",note:"User-actor OAuth with read and issues:create scopes, rotating refresh tokens."}:{}),
      ...(name==="x"?{applicationType:"confidential_web",pkce:"S256",payer:"platform_project",note:"Remote Arc developer project owns API charges. Keep spending controls and funding explicit; no automatic top-ups."}:{}),
      ...(name==="meta"?{graphVersionEnv:"APP_META_GRAPH_VERSION",note:"Pin a currently supported Graph API version. Instagram requires an eligible professional account linked to a Facebook Page."}:{}),
      ...(name==="shopify"?{note:"Use a public app with authorization-code flow; validate the shop domain and callback HMAC. Request protected customer data access before exposing order data."}:{}),
      ...(name==="notion"?{note:"Enable the corresponding read/insert content capabilities. Users explicitly select pages shared with the public integration."}:{}),
    }];
  }));
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
      apiServices: ["gmail.googleapis.com", "calendar-json.googleapis.com", "youtube.googleapis.com", "drive.googleapis.com", "docs.googleapis.com", "sheets.googleapis.com", "searchconsole.googleapis.com", "analyticsadmin.googleapis.com", "analyticsdata.googleapis.com", "googleads.googleapis.com"],
      authorizedRedirectUris: googleProviders.map(provider => callbacks[provider]),
      declaredScopes: declaredScopes(googleProviders),
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
    ...additions,
    googleAds: { developerTokenEnv:"APP_GOOGLE_ADS_DEVELOPER_TOKEN", note:"OAuth alone does not grant Google Ads API access; request a developer token and the applicable access level." },
    apiKeyProviders: APP_PROVIDERS.filter(provider=>APP_CATALOG[provider].auth==="api_key").map(provider=>({provider,credentialOwner:"end_user",serverSecretRequired:false,connectionNote:APP_CATALOG[provider].connectionNote,billingNote:APP_CATALOG[provider].billingNote})),
    runtime: {
      enableFlag: "ENABLE_APPS",
      enableFlagValueAfterVerification: "1",
      providerDailyLimitEnv: "APP_DAILY_PROVIDER_LIMIT",
      vaultSecretName: "APP_TOKEN_KEY",
      vaultFormat: "Base64 encoding of 32 cryptographically random bytes; keep the same key while existing encrypted connections remain.",
      requestedPermissions: "Connecting enables implemented read and write tools within the granted provider scopes. Remote Arc does not add a separate per-action approval; writes require apps:write in the AI client's MCP grant.",
      note: "Registration declares the available scopes. Per-user authorization requests the complete declared scope set. Existing connections need renewed provider consent for newly added scopes.",
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
