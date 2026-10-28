/** Composition root: Relay delegates Studio requests to an independent domain. */
import {
  handleStudio as handle,
  runStudioJob as run,
  resumeStudioJobs as resume,
  commitStudioDocument as commit,
} from "@rearc/studio/server";
import { studioEnvironment, type StudioEnv } from "./studio-platform.js";
export type { StudioEnv } from "./studio-platform.js";
export { StudioError } from "@rearc/studio/server";
export const handleStudio = (request: Request, env: StudioEnv) =>
  handle(request, studioEnvironment(env));
export const runStudioJob = (env: StudioEnv, id: string) =>
  run(studioEnvironment(env), id);
export const resumeStudioJobs = (env: StudioEnv, at?: number) =>
  resume(studioEnvironment(env), at);
export const commitStudioDocument = (
  env: StudioEnv,
  ...args: Parameters<typeof commit> extends [unknown, ...infer Rest]
    ? Rest
    : never
) => commit(studioEnvironment(env), ...args);
