import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createStandaloneStudio } from "./local.js";
import { handleStudio, runStudioJob } from "../server/service.js";
import { newStudioDocument } from "../core/document.js";

const directory = mkdtempSync(
    path.join(process.env.STUDIO_TEST_DIR || tmpdir(), "studio-independent-"),
  ),
  origin = "http://127.0.0.1:4331";
const local = createStandaloneStudio(directory, origin);
async function call(route: string, method = "GET", data?: unknown) {
  return handleStudio(
    new Request(origin + "/api/studio" + route, {
      method,
      headers: { origin, "content-type": "application/json" },
      ...(method !== "GET" ? { body: JSON.stringify(data || {}) } : {}),
    }),
    local.env,
  );
}
try {
  const large = "中英文 encryption ".repeat(9000);
  const encrypted = await local.env.STUDIO_SERVICES.vault.seal(
    large,
    "studio:owner:project",
  );
  assert.equal(
    await local.env.STUDIO_SERVICES.vault.unseal(
      encrypted,
      "studio:owner:project",
    ),
    large,
  );
  await assert.rejects(
    () =>
      local.env.STUDIO_SERVICES.vault.unseal(
        encrypted,
        "studio:another:project",
      ),
    "Ciphertext is bound to its owner and project",
  );
  const tables = (
    local.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[]
  )
    .map((row) => row.name)
    .sort();
  assert.deepEqual(
    tables,
    ["studio_assets", "studio_jobs", "studio_projects", "studio_versions"],
    "Studio runs without users, organizations, Agent, billing or chat tables",
  );
  const created = await call("/projects", "POST", {
    document: newStudioDocument("Independent project"),
  });
  assert.equal(created.status, 201);
  const project = ((await created.json()) as any).project;
  const config = await call("/config");
  assert.equal(config.status, 200);
  assert.equal(((await config.json()) as any).generationAvailable, false);
  const identity = await call("/session");
  assert.equal(((await identity.json()) as any).user.id, "local-creator");
  // A different model adapter can be plugged in with no host/Agent services at all.
  let dispatches = 0;
  local.env.STUDIO_SERVICES.storyboard = {
    catalog: () => ({
      models: [
        { id: "independent-model", label: "Test model", configured: true },
      ],
      available: true,
    }),
    async generate(input, validate) {
      dispatches++;
      assert.equal(input.projectId, project.id);
      assert.equal(input.ownerId, "local-creator");
      const next = structuredClone(project.document);
      next.scenes[0].title = "Independent model result";
      return validate({
        title: next.title,
        scenes: next.scenes,
        explanation: "A separate provider produced this storyboard.",
      });
    },
  };
  local.env.STUDIO_RUNTIME = {
    getByName: () => ({ fetch: async () => Response.json({ queued: true }) }),
  } as unknown as DurableObjectNamespace;
  const queued = await call(`/projects/${project.id}/generate`, "POST", {
    baseRevision: 1,
    requestId: "independent-run",
    prompt: "Change the headline",
    mode: "edit",
    selectedSceneId: null,
    modelId: "independent-model",
    skillIds: [],
  });
  assert.equal(queued.status, 202);
  const job = ((await queued.json()) as any).job;
  await runStudioJob(local.env, job.id);
  await runStudioJob(local.env, job.id);
  assert.equal(dispatches, 1);
  const edited = ((await (await call(`/projects/${project.id}`)).json()) as any)
    .project;
  assert.equal(edited.revision, 2);
  assert.equal(edited.document.scenes[0].title, "Independent model result");
  assert.equal(
    local.db.prepare("SELECT status FROM studio_jobs WHERE id=?").get(job.id)
      ?.status,
    "completed",
  );
  local.env.STUDIO_SERVICES.identity = async () => ({
    id: "someone-else",
    name: null,
    email: "someone@localhost",
  });
  assert.equal(
    (await call(`/projects/${project.id}`)).status,
    404,
    "Swapping account adapters retains owner isolation",
  );
  local.env.STUDIO_SERVICES.identity = async () => null;
  assert.equal(
    (await call("/projects")).status,
    401,
    "No default authenticated fallback exists in the service",
  );
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert(
    Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }).every((name) => !/^@remotearc\//.test(name)),
    "The package has no Remote Arc workspace dependency",
  );
  console.log(
    "PASS independent Studio: only four owned tables, project CRUD, encrypted snapshots, swappable identity, alternate storyboard provider, idempotent jobs and no Agent/account database.",
  );
} finally {
  local.close();
  rmSync(directory, { recursive: true, force: true });
}
