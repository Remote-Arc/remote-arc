import { DurableObject } from "cloudflare:workers";
import { runStudioJob } from "./service.js";
import type { StudioEnvironment } from "./ports.js";
/** Cloudflare job transport is reusable by either the shared or standalone deployment. */
export function createStudioRuntime<Bindings>(
  resolve: (bindings: Bindings) => StudioEnvironment,
) {
  return class extends DurableObject<Bindings> {
    async fetch(request: Request) {
      if (
        request.method !== "POST" ||
        new URL(request.url).pathname !== "/start"
      )
        return new Response(null, { status: 404 });
      const { jobId } = await request.json<{ jobId?: string }>();
      if (!jobId || !/^[A-Za-z0-9_-]{1,100}$/.test(jobId))
        return new Response(null, { status: 400 });
      const current = await this.ctx.storage.get<string>("jobId");
      if (current && current !== jobId)
        return new Response(null, { status: 409 });
      await this.ctx.storage.put("jobId", jobId);
      if ((await this.ctx.storage.getAlarm()) === null)
        await this.ctx.storage.setAlarm(Date.now() + 10);
      return Response.json({ queued: true });
    }
    async alarm() {
      const env = resolve(this.env),
        jobId = await this.ctx.storage.get<string>("jobId");
      if (!jobId) return;
      const job = await env.DB.prepare(
        "SELECT status FROM studio_jobs WHERE id=?1",
      )
        .bind(jobId)
        .first<{ status: string }>();
      if (job?.status === "running") {
        await env.DB.prepare(
          "UPDATE studio_jobs SET status='unknown',error_code='STUDIO_INTERRUPTED',updated_at=?2 WHERE id=?1 AND status='running'",
        )
          .bind(jobId, new Date().toISOString())
          .run();
        await this.ctx.storage.deleteAll();
        return;
      }
      if (job?.status === "queued") {
        await this.ctx.storage.setAlarm(Date.now() + 120000);
        await runStudioJob(env, jobId);
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
    }
  };
}
