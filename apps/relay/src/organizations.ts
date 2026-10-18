// Server-authoritative team management. Joining a team never grants access to
// personal devices, OAuth grants, local filesystem or task execution.
import { isTrustedDashboardMutation } from "./dashboard-origin.js";
export type OrganizationEnv = { DB: D1Database; APP_ORIGIN?: string; DASHBOARD_ORIGIN?: string; PUBLIC_ORIGIN: string };
type Role = "owner" | "admin" | "member";
type Membership = { role: Role; kind: "team" | "personal"; name: string };
const fail = (error: string, status = 400) => json({ error }, status);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "private, no-store" } });
const now = () => new Date().toISOString();
const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canManageOrganization(actor: Role, target: Role, action: "invite_admin" | "change_role" | "remove") {
  if (actor === "owner") return target !== "owner";
  if (actor === "admin") return action === "remove" && target === "member";
  return false;
}

async function membership(db: D1Database, orgId: string, userId: string) {
  return db.prepare(`SELECT m.role, o.kind, o.name FROM organization_members m
    JOIN organizations o ON o.id=m.organization_id
    WHERE m.organization_id=?1 AND m.user_id=?2 AND m.status='active'`)
    .bind(orgId, userId).first<Membership>();
}

async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 4096) throw new Error("request_too_large");
  const content = await request.text();
  if (content.length > 4096) throw new Error("request_too_large");
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_payload");
  return value as Record<string, unknown>;
}

export async function handleOrganizations(request: Request, env: OrganizationEnv, userId: string): Promise<Response> {
  const url = new URL(request.url);
  // The dashboard uses encodeURIComponent for organization ids (e.g. personal%3A...),
  // so decode each URL path segment before validating the organization identity.
  // Invalid percent escapes and encoded path separators must fail closed.
  let path: string[];
  try {
    path = url.pathname.split("/").filter(Boolean).slice(2).map(decodeURIComponent);
  } catch {
    return fail("not_found", 404);
  }
  if (path.some(part => part.includes("/"))) return fail("not_found", 404);
  const method = request.method;
  if (method !== "GET") {
    // Session cookies are not an API mutation credential for foreign origins.
    if (!isTrustedDashboardMutation(request, env))
      return fail("invalid_origin", 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      return fail("json_required", 415);
  }
  try {
    if (!path.length) {
      if (method === "GET") {
        const [organizations, invitations] = await Promise.all([
          env.DB.prepare(`SELECT o.id,o.name,o.kind,o.created_at,m.role,
            (SELECT COUNT(*) FROM organization_members x WHERE x.organization_id=o.id AND x.status='active') AS members,
            (SELECT COUNT(*) FROM organization_invitations i WHERE i.organization_id=o.id AND i.status='pending' AND i.expires_at>?2) AS pending
            FROM organization_members m JOIN organizations o ON o.id=m.organization_id
            WHERE m.user_id=?1 AND m.status='active' ORDER BY o.kind ASC,o.created_at ASC`)
            .bind(userId, now()).all(),
          env.DB.prepare(`SELECT i.id,i.organization_id,i.role,i.expires_at,o.name AS organization_name
            FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id
            JOIN users u ON lower(u.email)=lower(i.email)
            WHERE u.id=?1 AND i.status='pending' AND i.expires_at>?2
              AND NOT EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=i.organization_id AND m.user_id=u.id AND m.status='active')
            ORDER BY i.created_at DESC`).bind(userId, now()).all(),
        ]);
        return json({ organizations: organizations.results || [], invitations: invitations.results || [] });
      }
      if (method === "POST") {
        const input = await body(request);
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name || name.length > 80) return fail("invalid_organization_name");
        const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM organizations WHERE kind='team' AND id IN (SELECT organization_id FROM organization_members WHERE user_id=?1 AND role='owner')").bind(userId).first<{n:number}>();
        if ((count?.n || 0) >= 20) return fail("organization_limit_reached", 409);
        const id = "org:" + crypto.randomUUID();
        const created = now();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO organizations(id,name,kind,personal_owner_user_id,created_at) VALUES (?1,?2,'team',NULL,?3)").bind(id,name,created),
          env.DB.prepare("INSERT INTO organization_members(organization_id,user_id,role,status,created_at) VALUES (?1,?2,'owner','active',?3)").bind(id,userId,created),
        ]);
        return json({ organization: { id, name, kind:"team", role:"owner", members:1, pending:0, created_at:created } }, 201);
      }
      return fail("method_not_allowed", 405);
    }

    if (path[0] === "invitations" && path.length === 2 && ["accept","reject"].includes(path[1]!) && method === "POST")
      return fail("not_found", 404); // Must always identify an invitation ID.

    if (path[0] === "invitations" && path.length === 3 && method === "POST" && ["accept","reject"].includes(path[2]!)) {
      const invitationId = path[1]!;
      const action = path[2]!;
      if (!/^[\w:-]{8,120}$/.test(invitationId)) return fail("not_found", 404);
      const invited = await env.DB.prepare(`SELECT i.organization_id,i.role,i.status,i.expires_at
        FROM organization_invitations i JOIN users u ON lower(u.email)=lower(i.email)
        WHERE i.id=?1 AND u.id=?2`).bind(invitationId,userId)
        .first<{organization_id:string;role:string;status:string;expires_at:string}>();
      if (!invited || invited.status !== "pending" || invited.expires_at <= now()) return fail("invitation_unavailable", 404);
      if (action === "reject") {
        const result = await env.DB.prepare("UPDATE organization_invitations SET status='revoked' WHERE id=?1 AND status='pending'").bind(invitationId).run();
        return result.meta.changes ? json({ success:true }) : fail("invitation_unavailable", 409);
      }
      // Invitation acceptance is the only path that grants a team membership.
      // A revoked/expired invitation never activates anyone.
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO organization_members(organization_id,user_id,role,status,created_at)
          SELECT i.organization_id,?2,i.role,'active',?3 FROM organization_invitations i
          WHERE i.id=?1 AND i.status='pending' AND i.expires_at>?3`).bind(invitationId,userId,now()),
        env.DB.prepare(`UPDATE organization_invitations SET status='accepted',accepted_at=?3
          WHERE id=?1 AND status='pending' AND expires_at>?3
            AND EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=organization_invitations.organization_id
              AND m.user_id=?2 AND m.status='active')`).bind(invitationId,userId,now()),
      ]);
      const accepted = await membership(env.DB,invited.organization_id,userId);
      return accepted ? json({success:true,organization_id:invited.organization_id}) : fail("invitation_unavailable",409);
    }

    const orgId = path[0]!;
    if (!/^org:[a-f0-9-]{36}$/.test(orgId) && !/^personal:[\w-]{1,120}$/.test(orgId)) return fail("not_found",404);
    const actor = await membership(env.DB,orgId,userId);
    if (!actor) return fail("not_found",404);
    if (path.length === 1) {
      if (method === "GET") {
        const members = await env.DB.prepare(`SELECT m.user_id,m.role,m.status,m.created_at,u.name,u.email
          FROM organization_members m JOIN users u ON u.id=m.user_id
          WHERE m.organization_id=?1 AND m.status='active' ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.email`)
          .bind(orgId).all();
        const invites = actor.role !== "member" && actor.kind === "team"
          ? (await env.DB.prepare(`SELECT id,email,role,created_at,expires_at FROM organization_invitations
              WHERE organization_id=?1 AND status='pending' AND expires_at>?2 ORDER BY created_at DESC`)
              .bind(orgId,now()).all()).results : [];
        return json({ organization:{id:orgId,name:actor.name,kind:actor.kind,role:actor.role},members:members.results||[],invitations:invites||[] });
      }
      if (method === "PATCH") {
        if (actor.role === "member") return fail("forbidden",403);
        const input = await body(request);
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name || name.length > 80) return fail("invalid_organization_name");
        await env.DB.prepare("UPDATE organizations SET name=?2 WHERE id=?1").bind(orgId,name).run();
        return json({success:true,name});
      }
      return fail("method_not_allowed",405);
    }
    if (actor.kind !== "team") return fail("personal_organization_is_private",403);

    if (path[1] === "invitations") {
      if (path.length === 2 && method === "POST") {
        if (actor.role === "member") return fail("forbidden",403);
        const input = await body(request);
        const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        const role = input.role === "admin" ? "admin" : input.role === "member" ? "member" : "";
        if (!emailFormat.test(email) || email.length > 254 || !role) return fail("invalid_invitation");
        if (role === "admin" && actor.role !== "owner") return fail("owner_role_required",403);
        const existing = await env.DB.prepare(`SELECT 1 AS ok FROM organization_members m
          JOIN users u ON u.id=m.user_id WHERE m.organization_id=?1 AND lower(u.email)=?2 AND m.status='active'`)
          .bind(orgId,email).first();
        if (existing) return fail("already_member",409);
        const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM organization_invitations
          WHERE organization_id=?1 AND status='pending' AND expires_at>?2`).bind(orgId,now()).first<{n:number}>();
        if ((count?.n || 0) >= 100) return fail("pending_invitation_limit",409);
        const id = crypto.randomUUID();
        const created = now();
        const expiry = new Date(Date.now()+7*86400_000).toISOString();
        const result = await env.DB.prepare(`INSERT OR IGNORE INTO organization_invitations
          (id,organization_id,email,role,invited_by,status,created_at,expires_at)
          VALUES (?1,?2,?3,?4,?5,'pending',?6,?7)`).bind(id,orgId,email,role,userId,created,expiry).run();
        return result.meta.changes
          ? json({invitation:{id,email,role,expires_at:expiry},delivery:"in_app"},201)
          : fail("already_invited",409);
      }
      if (path.length === 3 && method === "DELETE") {
        if (actor.role === "member") return fail("forbidden",403);
        const invite = await env.DB.prepare("SELECT role FROM organization_invitations WHERE id=?1 AND organization_id=?2 AND status='pending'")
          .bind(path[2],orgId).first<{role: Role}>();
        if (!invite) return fail("invitation_unavailable",404);
        if (invite.role === "admin" && actor.role !== "owner") return fail("owner_role_required",403);
        await env.DB.prepare("UPDATE organization_invitations SET status='revoked' WHERE id=?1 AND organization_id=?2 AND status='pending'").bind(path[2],orgId).run();
        return json({success:true});
      }
      return fail("method_not_allowed",405);
    }

    if (path[1] === "members" && path.length === 3) {
      const targetId = path[2]!;
      const target = await membership(env.DB,orgId,targetId);
      if (!target) return fail("member_not_found",404);
      if (method === "PATCH") {
        if (!canManageOrganization(actor.role,target.role,"change_role")) return fail("owner_role_required",403);
        const input = await body(request);
        if (input.role !== "member" && input.role !== "admin") return fail("invalid_role");
        await env.DB.prepare("UPDATE organization_members SET role=?3 WHERE organization_id=?1 AND user_id=?2 AND role!='owner'")
          .bind(orgId,targetId,input.role).run();
        return json({success:true});
      }
      if (method === "DELETE") {
        if (targetId === userId && target.role === "owner") return fail("owner_cannot_leave",403);
        if (targetId !== userId && !canManageOrganization(actor.role,target.role,"remove")) return fail("forbidden",403);
        await env.DB.prepare("DELETE FROM organization_members WHERE organization_id=?1 AND user_id=?2 AND role!='owner'")
          .bind(orgId,targetId).run();
        return json({success:true});
      }
    }
    return fail("not_found",404);
  } catch (error) {
    if (error instanceof SyntaxError) return fail("invalid_json");
    if (error instanceof Error && ["invalid_payload","request_too_large"].includes(error.message)) return fail(error.message);
    throw error;
  }
}
