import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(?:tsx?|mjs)$/.test(entry.name)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\(|import\s*)["']([^"']+)["']/g,
      )) {
        const id = match[1];
        assert(
          !id.startsWith("@remotearc/"),
          `${file}: Studio must not import Remote Arc packages`,
        );
        if (id.startsWith("."))
          assert(
            path.resolve(path.dirname(file), id).startsWith(root),
            `${file}: import crosses the Studio application boundary`,
          );
      }
    }
  }
}
for (const directory of ["core", "src", "server"])
  scan(path.join(root, directory));
const schema = readFileSync(
  path.join(root, "migrations/0001_studio.sql"),
  "utf8",
);
assert(
  !/REFERENCES\s+(?:users|organizations|arc_|automations)/i.test(schema),
  "Studio schema cannot depend on host account or Agent tables",
);
const service = readFileSync(path.join(root, "server/service.ts"), "utf8");
assert(
  !/\b(?:arc_chat_sessions|ARC_RUNTIME|ArcEnv|prepareArcBudget|arcGateway)\b/.test(
    service,
  ),
  "Studio service must use ports, never Agent internals",
);
console.log(
  "PASS Studio architecture boundaries: isolated source imports, own schema, host ports and no Agent runtime dependency.",
);
