// Keeps ARCHITECTURE.md, README.md and the website overview honest about facts
// the source can prove. Prose still needs review; this catches silent drift.
import { existsSync, readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const architecture = read("ARCHITECTURE.md");
const readme = read("README.md");
const overview = read("apps/ui/src/features/docs/docs-system-overview.tsx");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const tools = JSON.parse(read("packages/docs/src/tool-index.generated.json"));
const toolCount = tools.remote.length;
expect(readme.includes(`registers ${toolCount} tools`), `README must state the ${toolCount} registered MCP tools`);
expect(read("docs/connect-tool-inventory.md").includes(`注册 ${toolCount} 个远程 MCP 工具`), `docs/connect-tool-inventory.md must state ${toolCount} tools`);
for (const tool of tools.remote) expect(readme.includes(tool.name), `README tool list is missing ${tool.name}`);

const plans = read("packages/protocol/src/index.ts").match(/export const ARC_PLANS = \[([\s\S]*?)\] as const/)?.[1] ?? "";
expect(Boolean(plans), "packages/protocol must export ARC_PLANS");
for (const [, label] of plans.matchAll(/\{id:'[^']+',label:'([^']+)'/g)) {
  expect(readme.includes(`**${label}**`), `README plan summary is missing ${label}`);
}

const wrangler = read("apps/relay/wrangler.jsonc");
for (const [, host] of wrangler.matchAll(/"pattern":\s*"([^"]+)"/g)) {
  if (host.startsWith("www.")) continue;
  expect(architecture.includes("`" + host + "`"), `ARCHITECTURE.md hosts table is missing ${host}`);
}

const release = read(".github/workflows/deploy-cloudflare.yml").match(/^name:\s*"([^"]+)"/m)?.[1];
expect(Boolean(release), "deploy-cloudflare.yml must declare a name");
for (const [name, text] of [["ARCHITECTURE.md", architecture], ["README.md", readme]]) {
  expect(text.includes(release), `${name} must name the ${release} workflow`);
}

// Every relay source file the code map names must still exist.
// Relay modules live in domain folders, so a bare file name may sit in any of them.
const relayFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? relayFiles(new URL(entry.name + "/", dir)) : [entry.name]);
const relayNames = new Set(relayFiles(new URL("apps/relay/src/", root)));
for (const [, file] of architecture.matchAll(/`([a-z0-9-]+\.ts)`/g)) {
  expect(relayNames.has(file), `ARCHITECTURE.md names missing relay file ${file}`);
}
for (const [, folder] of architecture.matchAll(/`src\/([a-z]+)\/`/g)) {
  expect(existsSync(new URL("apps/relay/src/" + folder, root)), `ARCHITECTURE.md names missing relay folder src/${folder}/`);
}
for (const [, path] of architecture.matchAll(/`((?:apps|packages|skills|scripts)\/[A-Za-z0-9_./-]+)`/g)) {
  expect(existsSync(new URL(path.replace(/\/$/, ""), root)), `ARCHITECTURE.md names missing path ${path}`);
}
expect(overview.includes("/docs/architecture"), "Website overview must link to the architecture guide");

if (failures.length) {
  console.error("Architecture documentation drifted from the source:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`architecture docs in sync: ${toolCount} tools, plans, hosts and code map`);
