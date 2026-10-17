import { WorkerEntrypoint } from "cloudflare:workers";
import { handleAdminServiceRequest, type AdminServiceEnv } from "./admin-service.js";

// Not dispatched through the public fetch handler. Only Workers explicitly
// bound to this named entrypoint can call it; real session/RBAC still applies.
export class AdminApiService extends WorkerEntrypoint<AdminServiceEnv> {
  async fetch(request: Request): Promise<Response> {
    try { return await handleAdminServiceRequest(request, this.env); }
    catch { return Response.json({ error: "admin_service_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } }); }
  }
}
