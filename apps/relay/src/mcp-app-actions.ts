import { z } from "zod";
import { APP_CATALOG, APP_OPERATIONS, AppError, type AppOperation, type AppPermission, type AppProvider } from "./app-catalog.js";

// Every App operation is published up front inside tools/list: one variant per
// operation, each with its exact argument schema and description. Reads and
// writes live in separate tools so each tool's annotations are accurate.
export const APP_ACTION_TOOLS = { read: "run_app_read_action", write: "run_app_write_action" } as const;

export const appActionId = (operation: Pick<AppOperation, "provider" | "name">) => `${operation.provider}.${operation.name}`;

const variantDescription = (operation: AppOperation) =>
  `${APP_CATALOG[operation.provider].name}: ${operation.description.replace(/\.$/, "")}.`;

const variants = (permission: AppPermission) => APP_OPERATIONS
  .filter(operation => operation.permission === permission)
  .map(operation => z.object({
    action: z.literal(appActionId(operation)),
    arguments: operation.schema,
  }).strict().describe(variantDescription(operation)));

const actionSchema = (permission: AppPermission) => {
  const [first, ...rest] = variants(permission);
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
export const appActionCounts = {
  read: APP_OPERATIONS.filter(operation => operation.permission === "read").length,
  write: APP_OPERATIONS.filter(operation => operation.permission === "write").length,
};

/** Maps a typed action call onto the existing callApp input. */
export function appCallInput(permission: AppPermission, input: z.infer<typeof appReadActionSchema>) {
  const id = input.operation.action;
  const operation = APP_OPERATIONS.find(item => item.permission === permission && appActionId(item) === id);
  if (!operation) throw new AppError("unsupported_app_operation");
  return {
    provider: operation.provider as AppProvider,
    call: { connectionId: input.connectionId, operation: operation.name, arguments: input.operation.arguments as Record<string, unknown>, requestId: input.requestId },
  };
}
