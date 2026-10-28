/** The only bridge from the standalone Studio domain to Remote Arc accounts. */
import { getSessionUser } from "./auth.js";
import { seal, unseal } from "./app-oauth.js";
import { arcAutoId, arcGateway, prepareArcBudget } from "./arc-chat-model.js";
import { readArcSkill, listArcSkills } from "./arc-skills.js";
import { runModelGateway } from "./model-gateway.js";
import type { ArcEnv } from "./arc-chat.js";
import type {
  StudioBindings,
  StudioEnvironment,
  StudioServices,
} from "@rearc/studio/ports";

export type StudioEnv = ArcEnv &
  StudioBindings & {
    MARKETING_ORIGIN?: string;
    STUDIO_AI_ENABLED?: string;
    STUDIO_MODELS?: string;
    STUDIO_AUTO_MODEL_ID?: string;
  };
export function studioEnvironment(env: StudioEnv): StudioEnvironment {
  const modelEnv = {
    ...env,
    ARC_CHAT_ENABLED: env.STUDIO_AI_ENABLED ?? env.ARC_CHAT_ENABLED,
    ARC_MODELS: env.STUDIO_MODELS ?? env.ARC_MODELS,
    ARC_AUTO_MODEL_ID: env.STUDIO_AUTO_MODEL_ID ?? env.ARC_AUTO_MODEL_ID,
  };
  const services: StudioServices = {
    identity: async (request) => {
      const user = await getSessionUser(request, env);
      return user ? { id: user.id, email: user.email, name: user.name } : null;
    },
    links: {
      login: "/auth/login",
      account: env.DASHBOARD_ORIGIN || null,
      home: env.MARKETING_ORIGIN || null,
    },
    vault: {
      seal: (value, context) => seal(env, value, context),
      unseal: (ciphertext, context) => unseal(env, ciphertext, context),
    },
    skills: {
      defaultIds: ["remotion-video"],
      list: async (ownerId) =>
        (await listArcSkills(env, ownerId)).skills
          .filter(
            (skill) =>
              ["remotion-video", "hyperframes-video", "video-creator"].includes(
                skill.id,
              ) || skill.origin === "imported",
          )
          .map(({ id, name, description }) => ({ id, name, description })),
      read: async (ownerId, id) => {
        const skill = await readArcSkill(env, ownerId, id);
        return {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          content: skill.content,
        };
      },
    },
    storyboard: {
      catalog: () => {
        const gateway = arcGateway(modelEnv),
          auto = arcAutoId(modelEnv);
        return {
          models:
            gateway?.models
              .filter((model) => model.provider !== "workers_ai")
              .map((model) => ({
                id: model.id === auto ? "auto" : model.id,
                label: model.id === auto ? "Auto" : model.label || model.model,
                configured: Boolean(gateway.adapters[model.provider]),
              })) || [],
          available: Boolean(
            gateway?.models.some(
              (model) => model.id === auto && gateway.adapters[model.provider],
            ),
          ),
        };
      },
      generate: async (request, validate) => {
        // Project ID is an account-owned billing workload; no chat session exists.
        const access = await prepareArcBudget(
          modelEnv,
          request.ownerId,
          "personal:" + request.ownerId,
          request.projectId,
          request.modelId,
        );
        const result = await runModelGateway(
          access.gateway,
          {
            context: {
              userId: request.ownerId,
              organizationId: "personal:" + request.ownerId,
              taskId: request.projectId,
              runId: request.jobId,
              operationId: "studio-compose",
              lane: "arc_hosted",
            },
            modelId: access.definition.id,
            maxOutputTokens: Math.min(4096, access.definition.maxOutputTokens),
            timeoutMs: request.timeoutMs,
            schema: request.schema,
            system: request.system,
            user: request.user,
          },
          validate,
        );
        return result.value;
      },
    },
    lifecycle: {
      created: (owner, project, at) => [
        env.DB.prepare(
          "INSERT INTO billing_workloads(id,user_id,organization_id,product,status,created_at,updated_at) SELECT id,user_id,?3,'studio','active',?4,?4 FROM studio_projects WHERE id=?1 AND user_id=?2",
        ).bind(project, owner, "personal:" + owner, at),
      ],
      deleted: (owner, project, at) => [
        env.DB.prepare(
          "UPDATE billing_workloads SET status='closed',updated_at=?3 WHERE id=?1 AND user_id=?2 AND product='studio'",
        ).bind(project, owner, at),
      ],
    },
  };
  return {
    DB: env.DB,
    STUDIO_ORIGIN: env.STUDIO_ORIGIN,
    STUDIO_MEDIA: env.STUDIO_MEDIA,
    STUDIO_RUNTIME: env.STUDIO_RUNTIME,
    STUDIO_ALLOWED_ORIGINS: [
      env.STUDIO_ORIGIN,
      env.DASHBOARD_ORIGIN,
      env.APP_ORIGIN || env.PUBLIC_ORIGIN,
    ].filter((origin): origin is string => Boolean(origin)),
    STUDIO_SERVICES: services,
  };
}
