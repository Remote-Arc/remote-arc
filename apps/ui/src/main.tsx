import { loadLocale } from "./locales/locale-catalog.js";
import { chooseLocaleSurface, initialLocale, workspacePaths } from "./locales/locale-preference.js";
import "../../../packages/protocol/src/error-codes.js";
import { startProductEvents } from "./lib/product-events.js";
import "../../../packages/docs/src/arc-use-cases.js";
import "./features/browser-runner/runner-view.js";
import "./styles/arc/composer/arc-composer.css";
import "./styles/arc/composer/arc-references.css";
import "./styles/scrollbars.css";
import "./components/workspace-loading.js";
import "./features/marketing/home/landing-content.js";
import "./components/install-commands.js";
import "./features/marketing/home/home-connection-scene.js";
import "./features/apps/apps-manager.js";
import "./features/marketing/use-cases/agent-use-cases.js";
import "./features/arc/workspace/arc-workspace.js";
import "./features/tasks/connect-tasks.js";
import "./features/dashboard/workspace-picker.js";
import "./lib/dashboard-workspaces.js";
import "./styles/dashboard-workspaces.css";
import "./features/marketing/arc/arc-future.js";
import "./features/marketing/arc/arc-roadmap.js";
import "./features/install/client-setup-guides.js";

import "./features/tasks/dashboard-task-view.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "./app/i18n.js";
import "./lib/marketing-paths.js";
import "./features/settings/dashboard-settings.js";
import "./features/admin/admin-operations.js";
import "./features/dashboard/usage-conversion.js";
import "./features/admin/admin-console.js";
import "./app/product-pwa.js";
import "./features/marketing/public-engagement.js";
import "./features/marketing/trust-pages.js";
import { ThemeProvider } from "./app/theme.js";
import { UI_PREVIEW } from "./preview/preview-mode.js";
import { installUiPreviewFetchMock } from "./preview/preview.js";
import "./features/security/security-authorizations.js";
import "./styles/styles.css";
import "./styles/dashboard/dashboard.css";
import "./styles/marketing/home/laptop-hero.css";
import "./styles/workspace-design.css";
import "./styles/marketing/marketing-design.css";
import "./styles/dashboard/device-fleet-design.css";
import "./styles/dashboard/devices/device-recovery.css";
import "./styles/product-typography.css";
import "./styles/arc-product-polish.css";
import "./styles/components/brand-wordmark.css";
import "./styles/experience-refresh.css";
import "./styles/connect-guide.css";
import "./styles/auth/pairing.css";
import "./styles/security/security-center.css";
import { MCP_ENDPOINT } from "./config/app-config.js";

import "./components/public-layout.js";
import "./features/auth/auth-pages.js";
import "./features/auth/pair-device.js";

import "./features/install/client-install-page.js";
import "./features/marketing/marketing-pages.js";
import "./features/marketing/releases-page.js";
import "./features/blog/intent-driven-article.js";
import "./features/blog/blog-pages.js";
import "./features/dashboard/dashboard.js";
import { App } from "./app/app.js";

// Production builds resolve ./preview/preview.js to preview-disabled.ts (see
// vite.config.ts), so the website never ships the fixtures and Skill catalog.
installUiPreviewFetchMock(MCP_ENDPOINT);

startProductEvents();
const locale = initialLocale();
const surface = chooseLocaleSurface(
  location.pathname,
  location.hostname,
  UI_PREVIEW,
  workspacePaths,
);
if (location.hostname === "agent.remotearc.app" && location.pathname === "/")
  history.replaceState({}, "", "/overview");
const root = document.getElementById("root")!;
void loadLocale(locale, surface).then(
  () => {
    createRoot(root).render(
      <React.StrictMode>
        <ThemeProvider>
          <I18nProvider surface={surface} initialLanguage={locale}>
            <App />
          </I18nProvider>
        </ThemeProvider>
      </React.StrictMode>,
    );
  },
  () => {
    // The dictionary itself may be unreachable. Keep a server-rendered page if present.
    if (root.hasChildNodes()) return;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = locale === "zh" ? "重新加载 Remote Arc" : "Reload Remote Arc";
    retry.onclick = () => location.reload();
    root.append(retry);
  },
);
