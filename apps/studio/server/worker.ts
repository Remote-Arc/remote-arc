import { handleStudio, resumeStudioJobs } from "./service.js";
import type { StudioEnvironment } from "./ports.js";
/** A separate deployment supplies its own account/inference adapters at composition time. */
export function createStudioWorker<Bindings>(
  resolve: (bindings: Bindings) => StudioEnvironment,
) {
  return {
    async fetch(request: Request, bindings: Bindings): Promise<Response> {
      if (!new URL(request.url).pathname.startsWith("/api/studio/"))
        return Response.json({ error: "not_found" }, { status: 404 });
      return handleStudio(request, resolve(bindings));
    },
    async scheduled(
      _event: ScheduledController,
      bindings: Bindings,
      ctx: ExecutionContext,
    ) {
      ctx.waitUntil(resumeStudioJobs(resolve(bindings)));
    },
  };
}
