import ts from "typescript";

/** Read actual registrations independently of layout, comments and quote style. */
export function registeredToolNames(source) {
  const file = ts.createSourceFile(
    "mcp.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names = new Set();
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      let name;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "server" &&
        callee.name.text === "registerTool"
      ) {
        name = node.arguments[0];
      } else if (
        ts.isIdentifier(callee) &&
        callee.text === "registerMcpTool" &&
        node.arguments[0] &&
        ts.isIdentifier(node.arguments[0]) &&
        node.arguments[0].text === "server"
      ) {
        name = node.arguments[1];
      }
      if (name && ts.isStringLiteral(name)) names.add(name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return names;
}
