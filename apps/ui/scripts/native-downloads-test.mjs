import { loadLocale } from "../src/locales/locale-catalog.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import cliPackage from "../../../packages/cli/package.json" with { type: "json" };

// Vite defines this from the newest CHANGELOG release, which vite.config.ts
// requires to match the CLI package version.
globalThis.__REMOTEARC_CLI_VERSION__ = cliPackage.version;
registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith(".css")
      ? { format: "module", source: "", shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { NativeInstall } = await import("../src/features/install/native-install.tsx");
const { I18nProvider } = await import("../src/app/i18n.tsx");
const previousWindow = globalThis.window;
const previousLocation = globalThis.location;
try {
  for (const locale of ["en", "zh"]) {
    await loadLocale(locale, "all");
    globalThis.location = {
      origin: "https://remotearc.app",
      hostname: "remotearc.app",
      pathname: locale === "zh" ? "/zh/downloads" : "/downloads",
      search: "",
    };
    globalThis.window = { location: globalThis.location };
    const html = renderToStaticMarkup(
      React.createElement(I18nProvider, null, React.createElement(NativeInstall)),
    );
    const native = [...html.matchAll(/href="(\/api\/downloads\/agent\/[^" ]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(new Set(native).size, 6);
    for (const href of native)
      assert.match(href, /^\/api\/downloads\/agent\/(darwin|windows|linux)\/(amd64|arm64)$/);
    for (const icon of ["macos", "windows", "linux"])
      assert(html.includes("/platform-brands/" + icon + ".svg"));
    assert.match(html, /class="nativeShellChoice" href="#shell-install"/);
    assert.match(html, /npx remotelink@latest/);
    assert.doesNotMatch(html, /ChatGPT|Type chmod \+x|输入 chmod \+x/);
    // Checksums come from Remote Arc's release mirror for the current Agent;
    // release notes stay on the website. Nothing links the GitHub repository
    // (the Homebrew tap command names it only as text, because brew needs it).
    assert(
      html.includes(`href="/api/downloads/release/remotelink-v${cliPackage.version}/SHA256SUMS"`),
      "SHA256SUMS links the mirror for the current version",
    );
    assert.match(html, new RegExp(`href="${locale === "zh" ? "/zh" : ""}/releases"`));
    assert.doesNotMatch(html, /href="[^"]*github\.com|REMOTE ARC \d+\.\d+\.\d+/);
  }
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
}
console.log(
  "PASS: bilingual native download cards, platform icons and six stable-channel links without a build-pinned version, and SHA256SUMS from the release mirror.",
);
