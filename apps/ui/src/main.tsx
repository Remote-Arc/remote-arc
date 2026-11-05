import "../../../packages/protocol/src/error-codes.js";
import { startProductEvents } from "./lib/product-events.js";
import "../../../packages/docs/src/arc-use-cases.js";
import "./features/browser-runner/runner-view.js";
import "./features/arc/composer/arc-composer.css";
import "./features/arc/composer/arc-references.css";
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
import "./preview/preview-mode.js";
import { installUiPreviewFetchMock } from "./preview/preview.js";
import "./features/security/security-authorizations.js";
import "./styles/styles.css";
import "./features/dashboard/dashboard.css";
import "./features/marketing/home/laptop-hero.css";
import "./styles/workspace-design.css";
import "./features/marketing/marketing-design.css";
import "./features/dashboard/device-fleet-design.css";
import "./features/dashboard/devices/device-recovery.css";
import "./styles/product-typography.css";
import "./styles/arc-product-polish.css";
import "./components/brand-wordmark.css";
import "./styles/experience-refresh.css";
import "./styles/connect-guide.css";
import "./features/auth/pairing.css";
import "./features/security/security-center.css";
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
