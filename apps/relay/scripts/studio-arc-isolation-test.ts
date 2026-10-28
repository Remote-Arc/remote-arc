import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { newStudioDocument } from "@remotearc/protocol/studio";
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
      throw Error("No provider calls are expected");
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
  const internal = await local.env.DB.prepare(
    "SELECT session_id FROM studio_projects WHERE id=?1",
  )
    .bind(project.id)
    .first<{ session_id: string }>();
  assert(internal);
  const sessions = await handleArcChat(request("/api/arc/sessions"), local.env);
  assert.equal(sessions.status, 200);
  assert.deepEqual(
    ((await sessions.json()) as any).sessions,
    [],
    "Studio projects do not appear as empty Arc chats",
  );
  for (const method of ["GET", "DELETE"]) {
    const result = await handleArcChat(
      request("/api/arc/sessions/" + internal.session_id, method),
      local.env,
    );
    assert.equal(
      result.status,
      404,
      "The ordinary chat API cannot read or delete Studio billing authority",
    );
  }
  const message = await handleArcChat(
    request(`/api/arc/sessions/${internal.session_id}/messages`, "POST", {
      text: "unwanted chat",
      requestId: "message",
    }),
    local.env,
  );
  assert.equal(
    message.status,
    404,
    "The chat API cannot send a message into a Studio session",
  );
  const projectStillExists = await handleStudio(
    request("/api/studio/projects/" + project.id),
    local.env,
  );
  assert.equal(projectStillExists.status, 200);
  // Populate real rows above the chat cap; the API must still admit ordinary conversations.
  await local.env.DB.batch(
    Array.from({ length: 100 }, (_, i) =>
      local.env.DB.prepare(
        "INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at,workspace) SELECT ?1,user_id,organization_id,title_ciphertext,model_id,created_at,updated_at,'studio' FROM arc_chat_sessions WHERE id=?2",
      ).bind(`studio-cap-${i}`, internal.session_id),
    ),
  );
  const chat = await handleArcChat(
    request("/api/arc/sessions", "POST", { modelId: "auto" }),
    local.env,
  );
  assert.equal(
    chat.status,
    201,
    "Studio sessions do not consume the 100-chat limit",
  );
  const channelChat = await createArcConversation(
    local.env,
    "creator",
    "channel-chat",
    "Channel conversation",
  );
  assert.equal(
    channelChat.id,
    "channel-chat",
    "Channel adapters use the same isolated chat limit",
  );
  const list = await handleArcChat(request("/api/arc/sessions"), local.env);
  assert.equal(((await list.json()) as any).sessions.length, 2);
  const before = await local.env.DB.prepare(
    "SELECT deleted_at FROM arc_chat_sessions WHERE id=?1",
  )
    .bind(internal.session_id)
    .first<{ deleted_at: string | null }>();
  assert.equal(
    before?.deleted_at,
    null,
    "Billing authority remains live and owned",
  );
  console.log(
    "PASS Studio/Arc isolation: internal sessions are hidden and inaccessible to chat APIs, preserve billing authority, and do not consume web/channel chat limits.",
  );
} finally {
  local.close();
  rmSync(directory, { recursive: true, force: true });
}
