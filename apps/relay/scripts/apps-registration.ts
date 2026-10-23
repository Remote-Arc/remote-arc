import { pathToFileURL } from "node:url";
import { APP_CATALOG, APP_PROVIDERS, appScopes } from "../src/app-catalog.js";
import { callbackUrl } from "../src/app-oauth.js";
import {SLACK_BOT_SCOPES} from '../src/slack-bot-common.js';

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
    ["dropbox","DROPBOX","https://www.dropbox.com/developers/apps"],
    ["asana","ASANA","https://app.asana.com/0/my-apps"],
    ["airtable","AIRTABLE","https://airtable.com/create/oauth"],
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
      ...(name==="vercel"?{integrationSlugEnv:"APP_VERCEL_INTEGRATION_SLUG",configuredPermissions:["integration-configuration:read","project:read","deployment:read-write","project-env-vars:read-write"],note:"External integration installation; register the exact callback, preserve state and configure project access. Environment variable tools require project environment variable read/write permission. Operations follow installation grants."}:{}),
      ...(name==="supabase"?{configuredPermissions:["organizations:read","projects:read","database:write","secrets:read","secrets:write","edge_functions:read","edge_functions:write"],note:"Management API OAuth app, not a Supabase Auth OAuth server. Configure matching Management API permissions on the platform app, including Edge Functions and secrets for the new writes. Validate exact permission identifiers in the current provider console; execution follows connected organization grants."}:{}),
      ...(name==="linear"?{actor:"user",pkce:"S256",note:"User-actor OAuth with read, issues:create and write scopes, rotating refresh tokens. Existing accounts need explicit reauthorization for comment and issue updates."}:{}),
      ...(name==="x"?{applicationType:"confidential_web",pkce:"S256",payer:"platform_project",note:"Remote Arc developer project owns API charges. Keep spending controls and funding explicit; no automatic top-ups."}:{}),
      ...(name==="meta"?{graphVersionEnv:"APP_META_GRAPH_VERSION",note:"Pin a currently supported Graph API version. Instagram requires an eligible professional account linked to a Facebook Page."}:{}),
      ...(name==="shopify"?{note:"Use a public app with authorization-code flow; validate the shop domain and callback HMAC. Request protected customer data access before exposing order data."}:{}),
      ...(name==="notion"?{note:"Enable Read content, Insert content and Update content for the implemented page/block tools, plus user information access for users.list. Users explicitly select pages shared with the public integration; only those resources are available."}:{}),
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
        display_information: { name: "Remote Arc", description: "Chat with Remote Arc and run tasks with your own connected tools.", background_color: "#19191d" },
        features:{bot_user:{display_name:'Remote Arc',always_online:false},app_home:{home_tab_enabled:false,messages_tab_enabled:true,messages_tab_read_only_enabled:false}},
        oauth_config: { redirect_urls: [callbacks.slack,origin.origin+'/api/slack/oauth/callback'], scopes: { user: declaredScopes(["slack"]),bot:[...SLACK_BOT_SCOPES] } },
        settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: true,event_subscriptions:{request_url:origin.origin+'/api/slack/events',bot_events:['message.im','app_mention','app_uninstalled','tokens_revoked']} },
      },
      scopeModel: "Separate user OAuth for outbound tools and workspace Bot OAuth for inbound conversations. Bot installation never grants the installer's Arc identity to other members.",
      signingSecretName:'APP_SLACK_SIGNING_SECRET',
      distribution: "Enable the provider's distribution settings before onboarding workspaces outside the development workspace.",
      clientIdSecretName: "APP_SLACK_CLIENT_ID",
      clientSecretSecretName: "APP_SLACK_CLIENT_SECRET",
    },
    google: {
      registrationUrl: "https://console.cloud.google.com/auth/overview",
      applicationName: "Remote Arc Apps",
      applicationType: "Web application",
      agenticClient: true,
      apiServices: ["gmail.googleapis.com", "calendar-json.googleapis.com", "youtube.googleapis.com", "drive.googleapis.com", "docs.googleapis.com", "sheets.googleapis.com", "slides.googleapis.com", "searchconsole.googleapis.com", "analyticsadmin.googleapis.com", "analyticsdata.googleapis.com", "googleads.googleapis.com"],
      authorizedRedirectUris: googleProviders.map(provider => callbacks[provider]),
      declaredScopes: declaredScopes(googleProviders),
      audience: "External; start in Testing with explicit test users. Complete applicable verification before public launch.",
      clientIdSecretName: "APP_GOOGLE_CLIENT_ID",
      clientSecretSecretName: "APP_GOOGLE_CLIENT_SECRET",
      credentialIsolation: "Use a dedicated Apps OAuth client, separate from the existing Google sign-in client.",
      agenticClientNote: "Select Use this client for an AI-powered agent for this dedicated client. This is required when using Google's Workspace MCP servers; the current native REST adapters do not depend on those preview servers.",
    },
    microsoft: {
      registrationUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
      applicationName: "Remote Arc Apps",
      platform: "Web",
      supportedAccountTypes: "Accounts in any organizational directory and personal Microsoft accounts",
      authority: "https://login.microsoftonline.com/common",
      redirectUris: APP_PROVIDERS.filter(provider=>APP_CATALOG[provider].credential==='MICROSOFT').map(provider=>callbacks[provider]),
      delegatedPermissions: declaredScopes(APP_PROVIDERS.filter(provider=>APP_CATALOG[provider].credential==='MICROSOFT')),
      applicationPermissions: [],
      implicitGrant: false,
      publicClientFlows: false,
      clientIdSecretName: "APP_MICROSOFT_CLIENT_ID",
      clientSecretSecretName: "APP_MICROSOFT_CLIENT_SECRET",
    },
    ...additions,
    googleAds: { apiVersion:"v26", legacyOptionalDeveloperTokenEnv:"APP_GOOGLE_ADS_DEVELOPER_TOKEN", note:"Access levels belong to the Google Cloud project owning the OAuth client. Developer tokens were sunset on September 9, 2026 and are no longer required. Confirm project access level and approved use case." },
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
