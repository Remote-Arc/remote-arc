import assert from "node:assert/strict";
import { format } from "prettier";
import { registeredToolNames } from "./runtime-surface.mjs";

const source = `
server.registerTool("read_file", {description: "Read a permitted file from a paired computer and return its contents with bounded output and explicit device permissions."}, async () => ({}));
registerMcpTool(server, "list_devices", {description: "Return the computers paired with the current account, their online state, and the device permissions available to this caller."}, async () => ({}));
`;
const expected = ["list_devices", "read_file"];
assert.deepEqual([...registeredToolNames(source)].sort(), expected);
const formatted = await format(source, { parser: "typescript", printWidth: 100 });
assert.deepEqual(
  [...registeredToolNames(formatted)].sort(),
  expected,
  "Prettier line wrapping must preserve the registered public tool inventory",
);

assert.deepEqual(
  [
    ...registeredToolNames(`
// registerMcpTool(server, "comment_only", {}, handler);
const example = 'server.registerTool("example_only", {}, handler)';
other.registerTool("other_server", {}, handler);
registerMcpTool(other, "other_wrapper", {}, handler);
server.registerTool(dynamicName, {}, handler);
registerMcpTool(server, dynamicName, {}, handler);
registerMcpTool(
  /* authenticated MCP server */ server,
  'read_file',
  {},
  handler,
);
server.registerTool('read_file', {}, handler);
registerMcpTool<{ input: string }>(server, 'typed_tool', {}, handler);
`),
  ].sort(),
  ["read_file", "typed_tool"],
  "Only actual literal registrations on the MCP server count; duplicates are deduplicated",
);

console.log(
  "PASS: public MCP tool inventory survives formatting and ignores comments, examples and unrelated calls",
);
