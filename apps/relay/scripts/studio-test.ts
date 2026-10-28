import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  newStudioDocument,
  newStudioScene,
  parseStudioDocument,
  studioDuration,
  studioSceneAt,
} from "@rearc/studio/core";
import { handleStudio, commitStudioDocument } from "../src/studio.js";
import { safeReturnTo } from "../src/auth.js";
import { createStudioLocal } from "./studio-local.js";

const directory = mkdtempSync(
  path.join(process.env.STUDIO_TEST_DIR || tmpdir(), "studio-test-"),
);
const local = createStudioLocal(directory),
  token = local.seedUser("alice"),
  other = local.seedUser("bob"),
  origin = "http://127.0.0.1:4331";
async function call(
  route: string,
  method = "GET",
  input?: unknown,
  options: {
    token?: string;
    origin?: string;
    type?: string;
    raw?: BodyInit;
  } = {},
) {
  const response = await handleStudio(
    new Request(origin + "/api/studio" + route, {
      method,
      headers: {
        cookie: "rl_session=" + (options.token ?? token),
        ...(method === "GET"
          ? {}
          : {
              origin: options.origin ?? origin,
              "content-type": options.type || "application/json",
            }),
        ...(options.raw
          ? { "x-file-name": encodeURIComponent("test.png") }
          : {}),
      },
      ...(method === "GET"
        ? {}
        : { body: options.raw ?? JSON.stringify(input) }),
    }),
    local.env,
  );
  return {
    status: response.status,
    response,
    data: await response
      .clone()
      .json()
      .catch(() => null),
  };
}
try {
  const authRequest = new Request(
    "https://mcp.remotearc.app/auth/google/callback",
  );
  const authEnv = {
    ...local.env,
    STUDIO_ORIGIN: "https://studio.remotearc.app",
    PUBLIC_ORIGIN: "https://mcp.remotearc.app",
  };
  assert.equal(
    safeReturnTo(
      "https://studio.remotearc.app/?project=example",
      authRequest,
      authEnv,
    ),
    "https://studio.remotearc.app/?project=example",
  );
  assert.equal(
    safeReturnTo(
      "https://studio.remotearc.app.attacker.example/",
      authRequest,
      authEnv,
    ),
    "https://mcp.remotearc.app/",
  );
  const base = newStudioDocument("A real project", "Brief"),
    initialScene = base.scenes[0]!;
  assert.equal(studioDuration(base), 180);
  assert.equal(studioSceneAt(base, 99999).frame, 179);
  assert.throws(
    () =>
      parseStudioDocument({ ...base, scenes: [initialScene, initialScene] }),
    /INVALID_DOCUMENT/,
  );
  assert.throws(() =>
    parseStudioDocument({
      ...base,
      theme: { ...base.theme, accent: "url(javascript:bad)" },
    }),
  );
  assert.throws(() =>
    parseStudioDocument({
      ...base,
      scenes: Array.from({ length: 7 }, (_, index) => ({
        ...initialScene,
        id: "scene" + index,
        durationFrames: 900,
      })),
    }),
  );
  assert.equal(
    (await call("/projects", "GET", undefined, { token: "missing" })).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/projects",
        "POST",
        { document: base },
        { origin: "https://attacker.example" },
      )
    ).status,
    403,
  );
  const created = await call("/projects", "POST", { document: base });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.project.id;
  assert.equal((await call("/projects")).data.projects.length, 1);
  assert.equal(
    (await call("/projects/" + id, "GET", undefined, { token: other })).status,
    404,
    "Project ownership is checked inside the API",
  );
  const row = local.db
    .prepare("SELECT document_ciphertext FROM studio_projects WHERE id=?")
    .get(id)!;
  assert(
    !String(row.document_ciphertext).includes("A real project"),
    "Content is encrypted at rest",
  );
  const next = {
    ...base,
    title: "Changed",
    scenes: [initialScene, { ...newStudioScene(), durationFrames: 60 }],
  };
  const saved = await call("/projects/" + id, "POST", {
    baseRevision: 1,
    document: next,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.project.revision, 2);
  const stale = await call("/projects/" + id, "POST", {
    baseRevision: 1,
    document: base,
  });
  assert.equal(stale.status, 409);
  const parallel = await Promise.allSettled([
    commitStudioDocument(
      local.env,
      "alice",
      id,
      2,
      { ...next, title: "First" },
      "first",
    ),
    commitStudioDocument(
      local.env,
      "alice",
      id,
      2,
      { ...next, title: "Second" },
      "second",
    ),
  ]);
  assert.equal(
    parallel.filter((value) => value.status === "fulfilled").length,
    1,
    "Only one concurrent writer commits",
  );
  assert.equal(
    (await call("/projects/" + id + "/versions")).data.versions.length,
    3,
  );
  const restored = await call("/projects/" + id + "/restore", "POST", {
    baseRevision: 3,
    revision: 1,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.project.revision, 4);
  assert.equal(restored.data.project.document.title, base.title);
  const missing = {
    ...base,
    scenes: [{ ...initialScene, mediaAssetId: "someone-elses-asset" }],
  };
  assert.equal(
    (
      await call("/projects/" + id, "POST", {
        baseRevision: 4,
        document: missing,
      })
    ).status,
    400,
  );
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const uploaded = await call("/projects/" + id + "/assets", "POST", null, {
    type: "image/png",
    raw: png,
  });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const assetId = uploaded.data.asset.id;
  assert.equal(
    (await call("/projects/" + id + "/assets")).data.assets.length,
    1,
  );
  assert.equal((await call(`/projects/${id}/assets/${assetId}`)).status, 200);
  assert.equal(
    (
      await call(`/projects/${id}/assets/${assetId}`, "GET", undefined, {
        token: other,
      })
    ).status,
    404,
    "Private asset access follows project ownership",
  );
  assert.equal(
    (
      await call("/projects/" + id + "/assets", "POST", null, {
        type: "image/svg+xml",
        raw: "<svg/>",
      })
    ).status,
    415,
  );
  const withAsset = {
    ...base,
    scenes: [{ ...initialScene, mediaAssetId: assetId }],
  };
  assert.equal(
    (
      await call("/projects/" + id, "POST", {
        baseRevision: 4,
        document: withAsset,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/projects/" + id + "/generate", "POST", {
        baseRevision: 5,
        requestId: "r1",
        prompt: "test",
      })
    ).status,
    503,
    "Missing model configuration is explicit",
  );
  assert.equal((await call("/config")).data.generationAvailable, false);
  assert.equal((await call("/projects/" + id, "DELETE", {})).status, 200);
  assert.equal((await call("/projects/" + id)).status, 404);
  assert.equal((await call("/projects")).data.projects.length, 0);
  assert.equal(
    local.db
      .prepare("SELECT COUNT(*) n FROM studio_versions WHERE project_id=?")
      .get(id)!.n,
    0,
  );
  assert.equal(
    local.db
      .prepare("SELECT COUNT(*) n FROM studio_assets WHERE project_id=?")
      .get(id)!.n,
    0,
  );
  console.log(
    "PASS Studio: schema bounds, real SQL migrations, auth/CSRF/ownership, encrypted storage, atomic revision races, version restore, private assets, unavailable AI and deletion.",
  );
} finally {
  local.close();
  rmSync(directory, { recursive: true, force: true });
}
