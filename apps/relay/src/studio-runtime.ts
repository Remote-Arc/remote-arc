import { createStudioRuntime } from "@rearc/studio/runtime";
import { studioEnvironment } from "./studio-platform.js";
export class StudioRuntime extends createStudioRuntime(studioEnvironment) {}
