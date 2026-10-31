import { z } from "zod";
import { APP_CATALOG, APP_OPERATIONS, AppError, type AppOperation, type AppPermission, type AppProvider } from "../apps/app-catalog.js";

// Every App operation is named up front in tools/list: each tool's action enum
// lists every operation ID it can run, so nothing runs that is not listed.
// Argument schemas are not inlined (they were ~80% of tools/list); list_apps
// returns them by action ID, and an invalid call returns the exact schema.
// ChatGPT gets the typed form instead: one variant per operation with its
// description and exact arguments, as its app review requires. Both forms
// share the call shape {action, arguments}. Reads and writes live in separate
// tools so each tool's annotations are accurate.
export const APP_ACTION_TOOLS = { read: "run_app_read_action", write: "run_app_write_action" } as const;

export const appActionId = (operation: Pick<AppOperation, "provider" | "name">) => `${operation.provider}.${operation.name}`;

const actionIds = (permission: AppPermission, excludeRunway = false) => APP_OPERATIONS
  .filter(operation => operation.permission === permission && !(excludeRunway && operation.provider === "runway"))
  .map(appActionId);

const actionSchema = (permission: AppPermission, excludeRunway = false) => {
  const [first, ...rest] = actionIds(permission, excludeRunway);
  return z.object({
    connectionId: z.string().uuid().describe("ID of the user's own connected account for this action's provider, from list_apps."),
    requestId: z.string().regex(/^[\w-]{8,100}$/).describe(permission === "write"
      ? "Stable idempotency key. Reuse it unchanged on retries; never retry an uncertain write under a new ID."
      : "Stable request key, 8–100 letters, digits, '_' or '-'."),
    operation: z.object({
      action: z.enum([first!, ...rest]).describe("Action ID, provider.operation."),
      arguments: z.object({}).catchall(z.unknown())
        .describe("The action's arguments, matching the inputSchema list_apps returns for this action ID."),
    }).strict().describe("The single operation to run and its arguments."),
  }).strict();
};

const variantDescription = (operation: AppOperation) =>
  `${APP_CATALOG[operation.provider].name}: ${operation.description.replace(/\.$/, "")}.`;

const typedActionSchema = (permission: AppPermission) => {
  const [first, ...rest] = APP_OPERATIONS
    .filter(operation => operation.permission === permission)
    .map(operation => z.object({
      action: z.literal(appActionId(operation)),
      arguments: operation.schema,
    }).strict().describe(variantDescription(operation)));
  return z.object({
    connectionId: z.string().uuid().describe("ID of the user's own connected account for this action's provider, from list_apps."),
    requestId: z.string().regex(/^[\w-]{8,100}$/).describe(permission === "write"
      ? "Stable idempotency key. Reuse it unchanged on retries; never retry an uncertain write under a new ID."
      : "Stable request key, 8–100 letters, digits, '_' or '-'."),
    operation: z.discriminatedUnion("action", [first!, ...rest]).describe("The single operation to run and its exact arguments."),
  }).strict();
};

export const appReadActionSchema = actionSchema("read");
export const appWriteActionSchema = actionSchema("write");
// Shared MCP server; Claude OAuth clients exclude Runway from typed actions.
export const claudeAppReadActionSchema = actionSchema("read", true);
export const claudeAppWriteActionSchema = actionSchema("write", true);
export const chatgptAppReadActionSchema = typedActionSchema("read");
export const chatgptAppWriteActionSchema = typedActionSchema("write");
export const appActionCounts = {
  read: actionIds("read").length,
  write: actionIds("write").length,
};
// Counts quoted in Claude tool descriptions, derived from the published schemas.
export const claudeAppActionCounts = { read: actionIds("read", true).length, write: actionIds("write", true).length };
export const claudeAppProviderCount = new Set(APP_OPERATIONS.filter(operation => operation.provider !== "runway").map(operation => operation.provider)).size;

/** Arguments that do not match the action's schema, with that schema so the caller can retry. */
export class AppArgumentsError extends Error {
  constructor(readonly action: string, readonly issues: string[], readonly inputSchema: unknown) {
    super("Invalid arguments for " + action);
  }
}

/** Maps an action call onto the existing callApp input after checking its arguments. */
export function appCallInput(permission: AppPermission, input: z.infer<typeof appReadActionSchema>) {
  const id = input.operation.action;
  const operation = APP_OPERATIONS.find(item => item.permission === permission && appActionId(item) === id);
  if (!operation) throw new AppError("unsupported_app_operation");
  const checked = operation.schema.safeParse(input.operation.arguments);
  if (!checked.success) {
    throw new AppArgumentsError(id,
      checked.error.issues.slice(0, 10).map(issue => (issue.path.length ? issue.path.join(".") + ": " : "") + issue.message),
      z.toJSONSchema(operation.schema));
  }
  return {
    provider: operation.provider as AppProvider,
    call: { connectionId: input.connectionId, operation: operation.name, arguments: input.operation.arguments as Record<string, unknown>, requestId: input.requestId },
  };
}
