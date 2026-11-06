import assert from "node:assert/strict";
import ts from "typescript";
import { appModules, readAppModule } from "./app-source.mjs";

// main.tsx stays an entry point: imports, routing and mounting. New pages and
// features belong in their own modules, not back in this file.
const entry = readAppModule("main.tsx");
const lines = entry.split(/\r?\n/).length;
assert.ok(lines <= 300, `main.tsx has ${lines} lines; move new code into its own module`);
assert.ok(!/^(export )?function Dashboard\b/m.test(entry), "Dashboard lives in dashboard.tsx");
// The Dashboard shell only lays out tabs; state lives in dashboard/use-*.ts
// hooks and each tab or panel in its own dashboard/ module.
// Count syntax rather than physical lines: formatting must not encourage
// compressing a large component onto one line to evade the architecture guard.
const syntaxSize = (source) => {
  const tree = ts.createSourceFile(
    "module.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let size = 0;
  const visit = (node) => {
    if (node.kind !== ts.SyntaxKind.JsxText && node.kind !== ts.SyntaxKind.ParenthesizedExpression)
      size++;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return size;
};
assert.equal(syntaxSize("const x = {a: 1};"), syntaxSize("const x = {\n a: 1,\n};"));
assert(
  syntaxSize("const x = 1;".repeat(600)) > 3000,
  "Minification must not bypass the size guard",
);
assert.ok(
  syntaxSize(readAppModule("features/dashboard/dashboard.tsx")) <= 2400,
  "Dashboard shell exceeds its syntax budget; move tab content into dashboard/",
);
for (const name of appModules.filter(
  (name) =>
    (name.startsWith("features/dashboard/") && name !== "features/dashboard/dashboard.tsx") ||
    name.startsWith("hooks/dashboard/"),
)) {
  assert.ok(
    syntaxSize(readAppModule(name)) <= 3000,
    `${name} exceeds its syntax budget; split it by tab, panel or concern`,
  );
}
assert.match(
  entry,
  /installUiPreviewFetchMock\(MCP_ENDPOINT\);/,
  "The preview mock must install before the app renders",
);
assert.ok(
  entry.indexOf("installUiPreviewFetchMock(MCP_ENDPOINT);") < entry.indexOf("createRoot("),
  "The preview mock must install before the app renders",
);

// Stylesheet order defines the cascade. New shell modules are imported after
// every existing stylesheet and must not bring their own.
for (const name of appModules.filter((name) => name !== "main.tsx")) {
  assert.ok(
    !/^import ["'][^"']+\.css["'];?$/m.test(readAppModule(name)),
    `${name} must not import a stylesheet directly`,
  );
}
console.log(
  `PASS: main.tsx is a ${lines}-line entry point and shell modules leave the stylesheet order to it`,
);
