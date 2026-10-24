import assert from "node:assert/strict";
import fs from "node:fs";
import { DOC_TOPICS, DOC_PATHS } from "../../../packages/docs/src/catalog.js";
import index from "../../../packages/docs/src/tool-index.generated.json" with { type: "json" };
import data from "../src/tool-reference-data.generated.json" with { type: "json" };
assert.equal(new Set(DOC_PATHS).size, DOC_PATHS.length);
for (const path of [
  "/docs/tools",
  "/docs/slack",
  "/docs/codex",
  "/docs/browser",
])
  assert(DOC_PATHS.includes(path), path);
for (const topic of DOC_TOPICS) {
  assert(
    topic.title.en &&
      topic.title.zh &&
      topic.description.en &&
      topic.description.zh,
    topic.slug,
  );
  for (const section of topic.sections || [])
    assert(
      section.heading.en &&
        section.heading.zh &&
        section.text.en &&
        section.text.zh,
      topic.slug,
    );
  for (const [link] of topic.links || []) {
    const path = link!.split(/[?#]/)[0]!;
    if (
      path.startsWith("/docs/") &&
      !["/docs/mcp", "/docs/long-running-work"].includes(path)
    )
      assert(DOC_PATHS.includes(path), topic.slug + ": " + path);
  }
}
assert.deepEqual(
  index.remote.map((tool) => tool.name),
  data.remote.map((tool) => tool.name),
);
assert.deepEqual(
  index.local.map((tool) => tool.name),
  data.local.map((tool) => tool.name),
);
for (const name of [
  "fleet_dispatch",
  "fleet_sync_workspace",
  "create_agent_goal",
  "get_goal_context",
  "submit_goal_decision",
  "browser_runner_act",
  "call_app",
])
  assert(
    data.remote.some((tool) => tool.name === name),
    "Missing public tool " + name,
  );
assert(
  !data.remote.some((tool) =>
    ["browser_list_tabs", "browser_read_page"].includes(tool.name),
  ),
  "Retired aliases must not inflate the public tool list",
);
const operations = data.apps.flatMap((app) =>
  app.operations.map((operation) => app.provider + ":" + operation.name),
);
assert.equal(new Set(operations).size, operations.length);
assert.equal(
  operations.length,
  index.apps.reduce((n, app) => n + app.operations.length, 0),
);
for (const app of data.apps)
  for (const operation of app.operations)
    assert(["read", "write"].includes(operation.permission));
for (const tool of [...data.remote, ...data.local])
  assert(tool.zh && tool.summary && tool.inputSchema, tool.name);
const architecture = DOC_TOPICS.find((topic) => topic.slug === "architecture")!
  .sections!.map((section) => section.text.en + section.text.zh)
  .join(" ");
assert(
  !architecture.includes(
    "Autonomous groups of custom AI teammates remain a future direction",
  ),
);
assert(architecture.includes("AI teams"));
const source = fs.readFileSync(
  new URL("../src/product-docs.tsx", import.meta.url),
  "utf8",
);
assert(!source.includes("0.4.4 candidate"));
assert(!source.includes("0.4.4 候选"));
assert(!source.includes("not part of the production tool contract"));
console.log(
  `PASS: ${DOC_TOPICS.length} bilingual topics, ${data.remote.length} public tools, ${operations.length} App operations and ${data.local.length} local tools; links and release boundaries are consistent`,
);
