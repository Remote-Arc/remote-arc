import type { MessageKey } from "../../locales/locale-catalog.js";
export type ConsentGroup = {
  key: string;
  icon: string;
  title: MessageKey;
  description: MessageKey;
};

// Labels are presentation-only: the server still enforces the exact OAuth scopes.
export function summarizeConsentScopes(input: readonly string[]): ConsentGroup[] {
  const scopes = new Set(input);
  const groups: ConsentGroup[] = [];
  const has = (...items: string[]) => items.some((scope) => scopes.has(scope));
  if (has("devices:read", "computer:read", "computer:write")) {
    const canWrite = scopes.has("computer:write");
    groups.push({
      key: "devices",
      icon: "⌘",
      title: "auth.oauthConsentSummary.devices.title",

      description: canWrite
        ? "auth.oauthConsentSummary.devices.withWrite"
        : "auth.oauthConsentSummary.devices.read",
    });
  }
  if (has("browser:read", "browser:interact")) {
    const canInteract = scopes.has("browser:interact");
    groups.push({
      key: "browser",
      icon: "▣",
      title: "auth.oauthConsentSummary.browser.title",

      description: canInteract
        ? "auth.oauthConsentSummary.browser.withWrite"
        : "auth.oauthConsentSummary.browser.read",
    });
  }
  if (has("apps:read", "apps:write")) {
    const canWrite = scopes.has("apps:write");
    groups.push({
      key: "apps",
      icon: "▦",
      title: "auth.oauthConsentSummary.apps.title",

      description: canWrite
        ? "auth.oauthConsentSummary.apps.withWrite"
        : "auth.oauthConsentSummary.apps.read",
    });
  }
  if (has("automation:read", "automation:write", "agent:write")) {
    const canAct = has("automation:write", "agent:write");
    groups.push({
      key: "automation",
      icon: "↻",
      title: "auth.oauthConsentSummary.automation.title",

      description: canAct
        ? "auth.oauthConsentSummary.automation.withWrite"
        : "auth.oauthConsentSummary.automation.read",
    });
  }
  if (scopes.has("offline_access")) {
    groups.push({
      key: "session",
      icon: "✓",
      title: "auth.oauthConsentSummary.session.title",

      description: "auth.oauthConsentSummary.session.description",
    });
  }
  return groups;
}
