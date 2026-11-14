import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/app/i18n.js";
import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
import { TaskSavedSteps, describeStepCondition } from "../src/features/tasks/task-saved-steps.js";

(globalThis as any).location = {
  hostname: "admin.remotearc.app", // Keeps client telemetry out of this isolated test.
  pathname: "/dashboard/connect/tasks",
  search: "",
};
(globalThis as any).window = { location: (globalThis as any).location };
(globalThis as any).document = { documentElement: {}, querySelector: () => null };
await loadLocale("en", "dashboard");
await loadLocale("zh", "dashboard");

// Every condition shape reads as one sentence in both languages.
{
  const en = createTranslator("en");
  const zh = createTranslator("zh");
  const cases: [Parameters<typeof describeStepCondition>[0], string, string][] = [
    [
      { step: 1, exit_code: 0 },
      "Runs only if step 1 exits with code 0.",
      "仅当第 1 步退出码为 0 时运行。",
    ],
    [
      { step: 2, exit_code: 1, not: true },
      "Runs only if step 2 does not exit with code 1.",
      "仅当第 2 步退出码不是 1 时运行。",
    ],
    [
      { step: 1, output_contains: "new rows" },
      "Runs only if step 1's output contains “new rows”.",
      "仅当第 1 步的输出包含“new rows”时运行。",
    ],
    [
      { step: 1, output_contains: "WARN", not: true },
      "Runs only if step 1's output does not contain “WARN”.",
      "仅当第 1 步的输出不包含“WARN”时运行。",
    ],
    [
      { step: 3, output_matches: "^changed: [1-9]" },
      "Runs only if step 3's output matches /^changed: [1-9]/.",
      "仅当第 3 步的输出匹配 /^changed: [1-9]/ 时运行。",
    ],
    [
      { step: 3, output_matches: "error", not: true },
      "Runs only if step 3's output does not match /error/.",
      "仅当第 3 步的输出不匹配 /error/ 时运行。",
    ],
  ];
  for (const [condition, english, chinese] of cases) {
    assert.equal(describeStepCondition(condition, en), english);
    assert.equal(describeStepCondition(condition, zh), chinese);
  }
  console.log("PASS: each run_if shape reads as one sentence in English and Chinese");
}

// Steps are numbered with their rules, and on_failure steps sit apart.
{
  const html = renderToStaticMarkup(
    <I18nProvider initialLanguage="en">
      <TaskSavedSteps
        steps={[
          { command: "node export.mjs", cwd: "/srv/store", accept_exit_codes: [0, 3] },
          { command: "node upload.mjs", run_if: { step: 1, exit_code: 0 } },
        ]}
        onFailure={[{ command: "git checkout -- exports/" }]}
      />
    </I18nProvider>,
  );
  assert.match(html, /<strong>Step 1<\/strong> · Shell command · executed verbatim · \/srv\/store/);
  assert.match(html, /Exit codes that count as success: 0, 3\./);
  assert.match(html, /<strong>Step 2<\/strong>/);
  assert.match(html, /Runs only if step 1 exits with code 0\./);
  assert.match(
    html,
    /class="taskSavedOnFailure"><p[^>]*>When a step or the acceptance check fails, these run once before the retry:<\/p>.*<strong>Cleanup 1<\/strong>.*git checkout -- exports\//,
  );

  const single = renderToStaticMarkup(
    <I18nProvider initialLanguage="en">
      <TaskSavedSteps steps={[{ command: "pnpm build" }]} />
    </I18nProvider>,
  );
  assert.doesNotMatch(single, /Step 1|taskSavedOnFailure/, "a single plain step stays unnumbered");
  assert.match(single, /<p class="taskSavedStepHead">Shell command · executed verbatim<\/p>/);
  console.log(
    "PASS: saved steps show their numbers, run conditions, success codes and cleanup steps",
  );
}
