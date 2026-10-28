import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  newStudioDocument,
  newStudioScene,
  type StudioDocument,
} from "@rearc/studio/core";
import {
  handleStudio,
  runStudioJob,
  commitStudioDocument,
} from "../src/studio.js";
import { createStudioLocal } from "./studio-local.js";
import { activateArcTrial } from "../src/arc-trial.js";
import {
  ModelProviderError,
  type ModelAdapter,
} from "../src/model-provider-adapters.js";

const directory = mkdtempSync(
    path.join(process.env.STUDIO_TEST_DIR || tmpdir(), "studio-ai-"),
  ),
  local = createStudioLocal(directory),
  token = local.seedUser("director"),
  origin = "http://127.0.0.1:4331";
let calls = 0,
  wakes = 0,
  adapter: ModelAdapter;
local.env.ARC_CHAT_ENABLED = "1";
local.env.STUDIO_RUNTIME = {
  getByName: () => ({
    fetch: async () => {
      wakes++;
      return Response.json({ queued: true });
    },
  }),
} as unknown as DurableObjectNamespace;
const definition = {
  id: "arc-auto",
  provider: "openai" as const,
  model: "studio-test-model",
  maxOutputTokens: 4096,
  inputMicrosPerMillion: 100000,
  outputMicrosPerMillion: 500000,
};
local.env.MODEL_GATEWAY = {
  DB: local.env.DB,
  enabled: true,
  models: [definition],
  autoModelId: "arc-auto",
  adapters: {
    openai: async (request) => {
      calls++;
      return adapter(request);
    },
  },
};
const usage = {
  inputTokens: 100,
  outputTokens: 100,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};
async function api(route: string, method = "GET", input?: unknown) {
  const response = await handleStudio(
    new Request(origin + "/api/studio" + route, {
      method,
      headers: {
        cookie: "rl_session=" + token,
        origin,
        "content-type": "application/json",
      },
      ...(method !== "GET" ? { body: JSON.stringify(input) } : {}),
    }),
    local.env,
  );
  const data: any = await response.json();
  return { status: response.status, data };
}
async function start(
  id: string,
  revision: number,
  requestId: string,
  selectedSceneId: string | null = null,
) {
  const result = await api(`/projects/${id}/generate`, "POST", {
    baseRevision: revision,
    requestId,
    prompt: "Improve the selected scene",
    mode: "edit",
    selectedSceneId,
    modelId: "auto",
    skillIds: ["remotion-video"],
  });
  assert.equal(result.status, 202, JSON.stringify(result.data));
  return result.data.job;
}
const finish = (document: StudioDocument): ReturnType<ModelAdapter> =>
  Promise.resolve({
    value: {
      title: document.title,
      scenes: document.scenes,
      explanation: "Improved the selected scene.",
    },
    usage,
    providerRequestId: "test-result",
  });
try {
  // Studio can enable its model adapter while the Agent chat switch is disabled.
  local.env.STUDIO_AI_ENABLED = "1";
  local.env.ARC_CHAT_ENABLED = "0";
  await activateArcTrial(local.env, "director");
  const doc = newStudioDocument("AI project");
  doc.scenes.push({ ...newStudioScene(), title: "Preserve this scene" });
  const created = await api("/projects", "POST", { document: doc });
  assert.equal(created.status, 201);
  const id = created.data.project.id;
  adapter = async (request) => {
    const prompt = JSON.parse(request.user);
    assert.equal(prompt.referenceSkills[0].id, "remotion-video");
    assert(prompt.referenceSkills[0].content.includes("frame"));
    return finish({
      ...doc,
      scenes: doc.scenes.map((scene, index) => ({
        ...scene,
        title: index ? "Unrequested mutation" : "Improved title",
      })),
    });
  };
  const first = await start(id, 1, "first-request", doc.scenes[0]!.id);
  await runStudioJob(local.env, first.id);
  let status = await api(`/projects/${id}/jobs/${first.id}`);
  assert.equal(
    status.data.job.status,
    "completed",
    JSON.stringify(status.data),
  );
  assert.equal(status.data.project.revision, 2);
  assert.equal(status.data.project.document.scenes[0].title, "Improved title");
  assert.equal(
    status.data.project.document.scenes[1].title,
    "Preserve this scene",
    "Selected-scene edits cannot change adjacent scenes",
  );
  const replay = await api(`/projects/${id}/generate`, "POST", {
    baseRevision: 1,
    requestId: "first-request",
    prompt: "Improve the selected scene",
    mode: "edit",
    selectedSceneId: doc.scenes[0]!.id,
    modelId: "auto",
    skillIds: ["remotion-video"],
  });
  assert.equal(replay.status, 200);
  await runStudioJob(local.env, first.id);
  assert.equal(calls, 1, "Idempotent replay never repeats paid inference");
  const reservations = local.db
    .prepare("SELECT status,settlement_json FROM billing_reservations")
    .all();
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0]!.status, "completed");
  assert(
    JSON.parse(String(reservations[0]!.settlement_json)).actual.costMicros > 0,
    "Real billing SQL settled observed provider usage",
  );
  const skillVersions = JSON.parse(
    String(
      local.db
        .prepare("SELECT skill_versions_json FROM studio_jobs WHERE id=?")
        .get(first.id)!.skill_versions_json,
    ),
  );
  assert.match(skillVersions[0].version, /^[a-f0-9]{64}$/);
  const cancel = await start(id, 2, "cancel-request");
  adapter = async () => {
    assert.equal(
      (await api(`/projects/${id}/jobs/${cancel.id}`, "DELETE", {})).status,
      200,
    );
    return finish({ ...doc, title: "Do not apply" });
  };
  await runStudioJob(local.env, cancel.id);
  status = await api(`/projects/${id}/jobs/${cancel.id}`);
  assert.equal(status.data.job.status, "cancelled");
  assert.equal((await api("/projects/" + id)).data.project.revision, 2);
  await assert.rejects(
    () =>
      commitStudioDocument(
        local.env,
        "director",
        id,
        2,
        doc,
        "cancel race",
        cancel.id,
      ),
    /REVISION_CONFLICT/,
    "A cancellation also wins at the atomic commit boundary",
  );
  const unknown = await start(id, 2, "unknown-request");
  adapter = async () => {
    throw new ModelProviderError("MODEL_TIMEOUT", true);
  };
  await runStudioJob(local.env, unknown.id);
  assert.equal(
    (await api(`/projects/${id}/jobs/${unknown.id}`)).data.job.status,
    "unknown",
  );
  const callsBefore = calls;
  await runStudioJob(local.env, unknown.id);
  assert.equal(calls, callsBefore, "Unknown outcomes never dispatch again");
  const conflict = await start(id, 2, "conflict-request");
  const manual = await api("/projects/" + id, "POST", {
    baseRevision: 2,
    document: { ...doc, title: "Manual version" },
  });
  assert.equal(manual.status, 200);
  await runStudioJob(local.env, conflict.id);
  assert.equal(
    (await api(`/projects/${id}/jobs/${conflict.id}`)).data.job.status,
    "conflict",
  );
  assert.equal(calls, callsBefore, "Stale queued jobs fail before spending");
  const malformed = await start(id, 3, "invalid-request");
  adapter = async () => ({
    value: { title: "Bad", scenes: [], explanation: "bad" },
    usage,
    providerRequestId: "invalid",
  });
  await runStudioJob(local.env, malformed.id);
  assert.equal(
    (await api(`/projects/${id}/jobs/${malformed.id}`)).data.job.status,
    "failed",
  );
  assert.equal((await api("/projects/" + id)).data.project.revision, 3);
  assert.equal((await api(`/projects/${id}/jobs`)).data.jobs.length, 5);
  assert.equal(wakes, 5);
  const dispatchesBefore = calls;
  await local.env.DB.prepare(
    "UPDATE billing_workloads SET status='closed' WHERE id=?1",
  )
    .bind(id)
    .run();
  const closedAuthority = await start(id, 3, "closed-authority");
  await runStudioJob(local.env, closedAuthority.id);
  assert.equal(
    (await api(`/projects/${id}/jobs/${closedAuthority.id}`)).data.job.status,
    "failed",
  );
  assert.equal(
    calls,
    dispatchesBefore,
    "Closed project authority cannot dispatch or spend",
  );
  await local.env.DB.prepare(
    "UPDATE billing_workloads SET status='active',user_id='other-owner' WHERE id=?1",
  )
    .bind(id)
    .run()
    .catch(async () => {
      local.seedUser("other-owner");
      await local.env.DB.prepare(
        "UPDATE billing_workloads SET status='active',user_id='other-owner' WHERE id=?1",
      )
        .bind(id)
        .run();
    });
  const mismatchedOwner = await start(id, 3, "wrong-authority-owner");
  await runStudioJob(local.env, mismatchedOwner.id);
  assert.equal(
    (await api(`/projects/${id}/jobs/${mismatchedOwner.id}`)).data.job.status,
    "failed",
  );
  assert.equal(
    calls,
    dispatchesBefore,
    "A workload belonging to another identity cannot authorize spending",
  );
  console.log(
    "PASS Studio AI: real entitlement/budget/billing SQL, pinned skill content, scoped edits, idempotency, cancellation commit guard, unknown non-replay, pre-spend revision conflict and invalid output preservation. Provider calls use a deterministic test adapter; no paid API is called.",
  );
} finally {
  local.close();
  rmSync(directory, { recursive: true, force: true });
}
