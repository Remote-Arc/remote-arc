import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  chooseLocale,
  chooseLocaleSurface,
  LOCALE_KEY,
  workspacePaths,
} from "./src/locales/locale-preference.js";
import { productHosts } from "./src/config/hosts.js";
import { isWebsiteLocation } from "./src/lib/website-origin.js";
import { previewRuntimeConfig } from "./src/preview/preview-config.js";

const cliPackage = JSON.parse(
  readFileSync(new URL("../../packages/cli/package.json", import.meta.url), "utf8"),
) as { version: string };

const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
const releaseHeading = /^##\s+(\d+\.\d+\.\d+)\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
const releaseMatches = [...changelog.matchAll(releaseHeading)];
const changelogReleases = releaseMatches.map((current, index) => {
  const next = releaseMatches[index + 1];
  const bodyStart = (current.index ?? 0) + current[0].length;
  const bodyEnd = next?.index ?? changelog.length;
  const body = changelog.slice(bodyStart, bodyEnd).trim();
  const title = body.match(/^###\s+(.+)$/m)?.[1]?.trim();
  const changes = [...body.matchAll(/^-\s+(.+)$/gm)].map((match) => match[1]!.trim());
  if (!title || !changes.length) {
    throw new Error(`Invalid CHANGELOG release section for ${current[1]}`);
  }
  return {
    version: current[1]!,
    date: current[2]!,
    status: "released" as const,
    title,
    summary: changes[0]!,
    changes,
  };
});

const candidateMatch = cliPackage.version.match(
  /^(\d+\.\d+\.\d+)-(?:alpha|beta|rc|canary)\.[0-9A-Za-z.-]+$/,
);
if (candidateMatch) {
  // A preview build may use an RC binary, but the dashboard must continue
  // displaying the latest *published* version until stable is released.
  if (!changelog.includes(`## ${candidateMatch[1]} - Unreleased`)) {
    throw new Error(`Missing unreleased CHANGELOG entry for ${cliPackage.version}`);
  }
} else if (changelogReleases[0]?.version !== cliPackage.version) {
  throw new Error(
    `Latest CHANGELOG version ${changelogReleases[0]?.version || "missing"} does not match CLI ${cliPackage.version}`,
  );
}

export default defineConfig(({ mode }) => {
  let localePreloader: string | undefined;
  return {
    resolve: {
      // The preview fetch mock embeds every fixture and the full Skill catalog
      // (several MB). Outside VITE_UI_PREVIEW builds, main.tsx gets a no-op.
      alias:
        (process.env.VITE_UI_PREVIEW ?? loadEnv(mode, process.cwd(), "VITE_").VITE_UI_PREVIEW) ===
        "1"
          ? []
          : [
              {
                find: /^\.\/preview\/preview\.js$/,
                replacement: fileURLToPath(
                  new URL("./src/preview/preview-disabled.ts", import.meta.url),
                ),
              },
            ],
    },
    plugins: [
      react(),
      {
        name: "preload-active-locale",
        generateBundle: {
          order: "pre",
          handler(_options, bundle) {
            const chunks = Object.values(bundle).filter((file) => file.type === "chunk");
            const dictionaries = Object.fromEntries(
              ["en", "zh"].map((locale) => [
                locale,
                Object.fromEntries(
                  ["common", "website", "dashboard", "admin"].map((surface) => {
                    const chunk = chunks.find((file) =>
                      file.facadeModuleId?.endsWith("/locales/" + locale + "/" + surface + ".ts"),
                    );
                    if (!chunk) throw new Error("Missing locale chunk: " + locale + "/" + surface);
                    return [surface, "/" + chunk.fileName];
                  }),
                ),
              ]),
            );
            const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
            const preview = (process.env.VITE_UI_PREVIEW ?? viteEnv.VITE_UI_PREVIEW) === "1";
            // The same VITE_*_ORIGIN values the app bundle reads, so a staging
            // build's preloader recognises the staging hosts.
            const { hostnames } = productHosts({ ...viteEnv, ...process.env });
            const source = [
              "(() => {",
              "const chooseLocale = " + chooseLocale.toString() + ";",
              "const chooseSurface = " + chooseLocaleSurface.toString() + ";",
              "const routes = " + JSON.stringify(workspacePaths) + ";",
              "const isWebsiteLocation = " + isWebsiteLocation.toString() + ";",
              "const hosts = " + JSON.stringify(hostnames) + ";",
              "let saved = null;",
              "try { saved = localStorage.getItem(" + JSON.stringify(LOCALE_KEY) + "); } catch {}",
              "const locale = chooseLocale(location.pathname, location.search, saved,",
              "navigator.languages?.[0] || navigator.language,",
              "isWebsiteLocation(location.hostname, location.port, hosts), routes);",
              "const surface = chooseSurface(location.pathname, location.hostname, " +
                preview +
                ", routes, hosts);",
              "const packs = " + JSON.stringify(dictionaries) + "[locale];",
              "for (const href of [packs.common, packs[surface]]) {",
              '  const preload = document.createElement("link");',
              '  preload.rel = "modulepreload";',
              "  preload.href = href;",
              "  document.head.append(preload);",
              "}",
              "})();",
            ].join("\n");
            const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
            localePreloader = "assets/locale-preload-" + hash + ".js";
            this.emitFile({ type: "asset", fileName: localePreloader, source });
          },
        },
        transformIndexHtml: {
          order: "post",
          handler(_html, { bundle }) {
            if (!bundle || !localePreloader) return [];
            return [
              {
                tag: "script",
                attrs: { async: true, src: "/" + localePreloader },
                injectTo: "head-prepend",
              },
            ];
          },
        },
      },
      {
        name: "local-runtime-config",
        configureServer(server) {
          server.middlewares.use("/api/runtime-config", (request, response) => {
            if (!["GET", "HEAD"].includes(request.method || "")) {
              response.writeHead(405, { allow: "GET, HEAD" });
              response.end();
              return;
            }
            const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
            response.writeHead(200, {
              "content-type": "application/json",
              "cache-control": "no-store",
            });
            response.end(
              request.method === "HEAD"
                ? undefined
                : JSON.stringify(previewRuntimeConfig(env, "development")),
            );
          });
        },
      },
    ],
    define: {
      __REMOTEARC_CLI_VERSION__: JSON.stringify(changelogReleases[0]?.version),
      __REMOTEARC_RELEASES__: JSON.stringify(changelogReleases),
    },
  };
});
