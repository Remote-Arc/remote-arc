import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { assertCommandAllowed, findDangerousDelete, type DeleteGuardContext } from "../src/index.js";

// Shared with the Go port: packages/execution-core/execution/delete_guard_test.go.
const fixture = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("../../execution-core/execution/testdata/delete_guard_cases.json", import.meta.url)), "utf8"),
) as {
  contexts: Record<string, DeleteGuardContext>;
  cases: Array<{ context: string; command: string; block: boolean; reason?: string }>;
};

const failures: string[] = [];
for (const item of fixture.cases) {
  const reason = findDangerousDelete(item.command, fixture.contexts[item.context]!);
  if (item.block !== (reason !== null)) {
    failures.push(`${item.context} ${item.block ? "should block" : "should allow"}: ${item.command}\n    got: ${reason ?? "allowed"}`);
  } else if (reason && item.reason && !reason.toLowerCase().includes(item.reason.toLowerCase())) {
    failures.push(`${item.context} reason should mention "${item.reason}": ${item.command}\n    got: ${reason}`);
  }
}
if (failures.length) {
  process.stderr.write(failures.join("\n") + "\n");
  throw new Error(`${failures.length} of ${fixture.cases.length} delete-guard cases failed`);
}

// The public entry point keeps the Safety Guard message contract used by the relay.
let message = "";
try {
  assertCommandAllowed("rd /s /q \\", { platform: "win32", cwd: "D:\\work", home: "C:\\Users\\Ann", env: {} });
} catch (error) {
  message = error instanceof Error ? error.message : String(error);
}
if (!message.startsWith("Blocked by Remote Arc Safety Guard: deleting a drive") || !message.includes("safe-cleanup")) {
  throw new Error("Unexpected Safety Guard message: " + message);
}
assertCommandAllowed("rd /s /q D:\\work\\node_modules", { platform: "win32", cwd: "D:\\work", home: "C:\\Users\\Ann", env: {} });

process.stdout.write(`PASS: delete guard resolved ${fixture.cases.length} shared cases (roots, homes, protected folders, nested quoting, variables, pipelines)\n`);
