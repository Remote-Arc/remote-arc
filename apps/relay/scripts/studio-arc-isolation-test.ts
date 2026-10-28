import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newStudioDocument } from "@rearc/studio/core";
import { createStudioLocal } from "./studio-local.js";
import { handleStudio } from "../src/studio.js";
import { handleArcChat, createArcConversation } from "../src/arc-chat.js";
import { activateArcTrial } from "../src/arc-trial.js";
const directory = mkdtempSync(
  path.join(process.env.STUDIO_TEST_DIR || tmpdir(), "studio-isolation-"),
);
const local = createStudioLocal(directory),
  token = local.seedUser("creator"),
  origin = "http://127.0.0.1:4331";
local.env.ARC_CHAT_ENABLED = "1";
local.env.ARC_CREDITS_ENABLED = "1";
local.env.ARC_RUNTIME = {} as DurableObjectNamespace;
local.env.MODEL_GATEWAY = {
  DB: local.env.DB,
  enabled: true,
  models: [
    {
      id: "arc-auto",
      provider: "openai",
      model: "fixture",
      maxOutputTokens: 4096,
      inputMicrosPerMillion: 1000,
      outputMicrosPerMillion: 1000,
    },
  ],
  autoModelId: "arc-auto",
  adapters: {
    openai: async () => {
      throw Error("No provider calls expected");
    },
  },
};
const request = (url: string, method = "GET", data?: unknown) =>
  new Request(origin + url, {
    method,
    headers: {
      cookie: "rl_session=" + token,
      origin,
      "content-type": "application/json",
    },
    ...(method === "POST" ? { body: JSON.stringify(data || {}) } : {}),
  });
try {
  await activateArcTrial(local.env, "creator");
  const created = await handleStudio(
    request("/api/studio/projects", "POST", {
      document: newStudioDocument("Private video"),
    }),
    local.env,
  );
  assert.equal(created.status, 201);
  const project = ((await created.json()) as any).project;
  assert.equal(
    (
      await local.env.DB.prepare(
        "SELECT COUNT(*) AS total FROM arc_chat_sessions",
      ).first<{ total: number }>()
    )?.total,
    0,
    "Creating Studio projects never creates an Agent session",
  );
  const workload = await local.env.DB.prepare(
    "SELECT * FROM billing_workloads WHERE id=?1",
  )
    .bind(project.id)
    .first<{ user_id: string; product: string; status: string }>();
  assert.equal(workload?.user_id, "creator");
  assert.equal(workload?.product, "studio");
  assert.equal(workload?.status, "active");
  const sessions = await handleArcChat(request("/api/arc/sessions"), local.env);
  assert.equal(sessions.status, 200);
  assert.deepEqual(((await sessions.json()) as any).sessions, []);
  for (const method of ["GET", "DELETE"]) {
    const result = await handleArcChat(
      request("/api/arc/sessions/" + project.id, method),
      local.env,
    );
    assert.equal(
      result.status,
      404,
      "Chat APIs cannot access a Studio project",
    );
  }
  const message = await handleArcChat(
    request(`/api/arc/sessions/${project.id}/messages`, "POST", {
      text: "unwanted chat",
      requestId: "message",
    }),
    local.env,
  );
  assert.equal(message.status, 404);
  assert.equal(
    (
      await handleStudio(
        request("/api/studio/projects/" + project.id),
        local.env,
      )
    ).status,
    200,
  );
  const chat = await handleArcChat(
    request("/api/arc/sessions", "POST", { modelId: "auto" }),
    local.env,
  );
  assert.equal(chat.status, 201);
  const channel = await createArcConversation(
    local.env,
    "creator",
    "channel-chat",
    "Channel conversation",
  );
  assert.equal(channel.id, "channel-chat");
  const list = await handleArcChat(request("/api/arc/sessions"), local.env);
  assert.equal(((await list.json()) as any).sessions.length, 2);
  const deleted = await handleStudio(
    request("/api/studio/projects/" + project.id, "DELETE"),
    local.env,
  );
  assert.equal(deleted.status, 200);
  const closed = await local.env.DB.prepare(
    "SELECT status FROM billing_workloads WHERE id=?1",
  )
    .bind(project.id)
    .first<{ status: string }>();
  assert.equal(
    closed?.status,
    "closed",
    "Deletion closes model spending authority atomically",
  );
  assert.equal(
    (
      await local.env.DB.prepare(
        "SELECT COUNT(*) AS total FROM arc_chat_sessions WHERE deleted_at IS NULL",
      ).first<{ total: number }>()
    )?.total,
    2,
    "Deleting Studio projects leaves ordinary chats untouched",
  );
  console.log(
    "PASS Studio/Arc independence: no chat sessions created; project-owned billing workloads; chat APIs cannot access projects; web/channel chats unchanged; project deletion revokes workload authority.",
  );
} finally {
  local.close();
  rmSync(directory, { recursive: true, force: true });
}
