import assert from "node:assert/strict";
import fs from "node:fs";
import { DOC_TOPICS, DOC_PATHS } from "../../../packages/docs/src/catalog.js";
import { REFERENCE_TOPICS, referenceLink } from "../../../packages/docs/src/reference-docs.js";
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
  "browser_runner_wait",
  "find_skills",
  "read_skill",
  "list_agent_sessions",
  "fleet_dispatch",
  "fleet_sync_workspace",
  "create_agent_goal",
  "get_goal_context",
  "submit_goal_decision",
  "browser_runner_act",
  "list_apps",
  "run_app_read_action",
  "run_app_write_action",
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
assert(!data.remote.some(tool => tool.name === "github_issues_create" || tool.name === "gmail_drafts_create"),
  "Static provider actions should be discovered via list_apps, not advertised as hundreds of top-level tools");
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
    "Autonomous groups of custom AI agents remain a future direction",
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

// Documentation stays on the website: reviewed repository documents are hosted
// under /docs and internal links resolve there or render as plain text.
const repoRoot = new URL("../../../", import.meta.url);
const hostedGlobs = fs.readFileSync(new URL("apps/ui/src/reference-doc.tsx", repoRoot), "utf8");
for (const topic of REFERENCE_TOPICS) {
  for (const source of [topic.reference!.en, topic.reference!.zh].filter(Boolean) as string[]) {
    assert.ok(fs.existsSync(new URL(source, repoRoot)), source + " must exist");
    assert.ok(hostedGlobs.includes('"../../../' + source + '"') || (source.startsWith("docs/feature-map/") && hostedGlobs.includes('"../../../docs/feature-map/*.md"')), source + " must be in the reference document bundle");
  }
}
assert.equal(referenceLink("docs/feature-map/README.md", "verified-inbox.md"), "/docs/feature-map-verified-inbox");
assert.equal(referenceLink("benchmarks/README.md", "RESULTS-2026-10-09-f68ab09.md#hosts"), "/docs/benchmark-baseline#hosts");
assert.equal(referenceLink("docs/feature-map/ai-teams.md", "../execution-isolation.md"), "/docs/execution-isolation");
assert.equal(referenceLink("benchmarks/README.md", "../docs/go-persistence-validation.md"), null, "Unpublished files render as plain text");
assert.equal(referenceLink("SECURITY.md", "https://docs.docker.com/engine/security/"), "https://docs.docker.com/engine/security/");
for (const file of ["apps/ui/src/product-docs.tsx", "apps/ui/src/architecture-deep-dive.tsx", "apps/ui/src/marketing-pages.tsx", "apps/ui/src/blog-pages.tsx", "apps/relay/src/seo.ts", "packages/docs/src/platform-docs.ts"]) {
  assert.doesNotMatch(fs.readFileSync(new URL(file, repoRoot), "utf8"), /github\.com\/[^"'\s]+\/(?:blob|tree)\//, file + " must link to hosted documents, not GitHub");
}
