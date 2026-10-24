import fs from "node:fs";
import { z } from "zod";
import { createRemoteLinkMcp } from "../src/mcp.js";
import { APP_CATALOG, APP_OPERATIONS } from "../src/app-catalog.js";
import { RemoteArcExecutionCore } from "../../../packages/execution-core-ts/src/core.js";
import {
  TOOL_COPY,
  toolGroup,
} from "../../../packages/docs/src/tool-reference-meta.js";

// Read tool definitions only. No account, live service, model or device is used.
const env = {
  PUBLIC_ORIGIN: "https://mcp.remotearc.app",
  ENABLE_APPS: "1",
  ENABLE_BROWSER_RUNNER: "1",
  ENABLE_EXPERIMENTAL_AGENT_GOALS: "1",
  DB: {
    prepare() {
      throw Error("Tool reference generation must not access account data");
    },
  },
  REGISTRY: {},
};
const identity = {
  userId: "public-tool-catalog",
  clientId: "public-tool-catalog",
  grantId: null,
  resource: env.PUBLIC_ORIGIN + "/mcp",
  scope:
    "devices:read computer:read computer:write browser:read browser:interact apps:read apps:write automation:read automation:write agent:read agent:write",
};
const response = await createRemoteLinkMcp(env as never, identity).fetch(
  new Request(env.PUBLIC_ORIGIN + "/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  }),
);
const text = await response.text();
const payload = JSON.parse(
  text.trim().startsWith("{")
    ? text
    : text
        .split("\n")
        .find((line) => line.startsWith("data: "))!
        .slice(6),
);
if (!response.ok || payload.error || !Array.isArray(payload.result?.tools))
  throw Error("Unable to enumerate public MCP tools");
const readOnly = new Set([
  "list_directory",
  "browse_directories",
  "read_file",
  "read_binary_file",
  "get_file_info",
  "list_processes",
  "list_undo_actions",
  "process_status",
  "process_output",
  "list_managed_processes",
  "remote_arc_status",
]);
const localModes = Object.fromEntries(
  ["safe", "developer", "full"].map((mode) => [
    mode,
    new RemoteArcExecutionCore(mode as never)
      .listTools()
      .map((tool) => tool.name),
  ]),
);
const local = [
  {
    name: "remote_arc_status",
    description: "Show the local permission mode and native execution backend.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  ...new RemoteArcExecutionCore("full").listTools(),
];
const metadata = (name: string) => {
  const copy = TOOL_COPY[name];
  if (!copy) throw Error("Add bilingual documentation for tool " + name);
  return { group: toolGroup(name), summary: copy.summary, zh: copy.zh };
};
const remote = payload.result.tools
  .map((tool: any) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    scopes: [
      ...new Set(
        (tool.securitySchemes || tool._meta?.securitySchemes || []).flatMap(
          (scheme: any) => scheme.scopes || [],
        ),
      ),
    ],
    readOnly: tool.annotations?.readOnlyHint === true,
    ...metadata(tool.name),
  }))
  .sort((a: any, b: any) => a.name.localeCompare(b.name, "en"));
const localTools = local
  .map((tool) => ({
    ...tool,
    title: tool.name,
    readOnly: readOnly.has(tool.name),
    modes: ["safe", "developer", "full"].filter(
      (mode) =>
        tool.name === "remote_arc_status" ||
        localModes[mode]!.includes(tool.name),
    ),
    ...metadata(tool.name),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
const apps = Object.entries(APP_CATALOG)
  .map(([provider, definition]) => ({
    provider,
    name: definition.name,
    category: definition.category,
    operations: APP_OPERATIONS.filter(
      (operation) => operation.provider === provider,
    )
      .map((operation) => ({
        name: operation.name,
        description: operation.description,
        permission: operation.permission,
        inputSchema: z.toJSONSchema(operation.schema),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
const catalog = { schemaVersion: 1, remote, apps, local: localTools };
const index = {
  remote: remote.map(({ name, title, group, scopes }: any) => ({
    name,
    title,
    group,
    scopes,
  })),
  apps: apps.map(({ provider, name, category, operations }) => ({
    provider,
    name,
    category,
    operations: operations.map((operation) => operation.name),
  })),
  local: localTools.map(({ name, modes, group }) => ({ name, modes, group })),
};
const outputs: [[string, unknown], [string, unknown]] = [
  ["../../ui/src/tool-reference-data.generated.json", catalog],
  ["../../../packages/docs/src/tool-index.generated.json", index],
];
let changed = false;
for (const [path, value] of outputs) {
  const url = new URL(path, import.meta.url),
    expected = JSON.stringify(value, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (
      !fs.existsSync(url) ||
      fs.readFileSync(url, "utf8").replace(/\r\n/g, "\n") !== expected
    ) {
      changed = true;
      console.error(path + " is stale; run pnpm docs:tools");
    }
  } else fs.writeFileSync(url, expected);
}
console.log(
  `${remote.length} Remote MCP tools · ${apps.length} apps / ${APP_OPERATIONS.length} operations · ${localTools.length} local MCP tools`,
);
if (changed) process.exitCode = 1;
