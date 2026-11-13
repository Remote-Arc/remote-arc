import React from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../src/app/i18n.js";
import { loadLocale } from "../src/locales/locale-catalog.js";
import { initialLocale } from "../src/locales/locale-preference.js";
import { ThemeProvider } from "../src/app/theme.js";
import { AdminConsole } from "../src/features/admin/admin-console.js";
// Local regression entry only; never included in a production bundle.
const nativeFetch = (window as Window & { metricsTestFetch?: typeof fetch }).metricsTestFetch;
if (nativeFetch) window.fetch = nativeFetch;
const host = document.createElement("div");
host.id = "admin-console-fixture";
document.getElementById("root")!.hidden = true;
document.body.append(host);
await loadLocale(initialLocale(), "all");
createRoot(host).render(
  <ThemeProvider>
    <I18nProvider>
      <AdminConsole />
    </I18nProvider>
  </ThemeProvider>,
);
