import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
import assert from "node:assert/strict";
import { APP_WORKFLOW_EXAMPLES } from "../src/features/marketing/home/app-workflow-examples.ts";
import { APP_CATALOG, appOperation } from "../../relay/src/apps/app-catalog.ts";
import { appCallSchema } from "../../relay/src/apps/apps.ts";
import { appDiscoverySchema } from "../../relay/src/apps/app-discovery.ts";
assert.deepEqual(
  APP_WORKFLOW_EXAMPLES.map((example) => example.id),
  ["release", "knowledge"],
);
await Promise.all([loadLocale("en", "website"), loadLocale("zh", "website")]);
const en = createTranslator("en");
const zh = createTranslator("zh");
for (const example of APP_WORKFLOW_EXAMPLES) {
  assert(en(example.request) && zh(example.request) && en(example.result) && zh(example.result));
  assert(
    APP_CATALOG[example.connectionProvider],
    "Connection CTA must identify an implemented provider",
  );
  assert(
    example.brands.every((brand) =>
      Object.values(APP_CATALOG).some((provider) => provider.brand === brand.brand),
    ),
  );
  let writes = 0;
  for (const trace of example.traces) {
    assert(!JSON.stringify(trace.input).includes("credential"));
    if (trace.tool === "list_apps") {
      appDiscoverySchema.parse(trace.input);
      continue;
    }
    const input = appCallSchema.parse(trace.input),
      operation = appOperation(trace.provider, input.operation);
    const args = operation.schema.parse(input.arguments);
    if (trace.provider === "github" && operation.name === "pulls.list")
      assert.equal(new URL(operation.request(args).url).searchParams.get("state"), "closed");
    if (operation.permission === "write") {
      writes++;
      assert.doesNotMatch(en(trace.output) + " " + zh(trace.output), /pending_approval|等待审批/);
    }
  }
  assert.equal(
    writes,
    1,
    "Each simulated workflow performs the write requested in the user's prompt",
  );
}
console.log(
  "PASS: simulated App workflows validate against real operation schemas, complete authorized writes.",
);
