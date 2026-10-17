import { execFileSync } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function waitForProductionCi({
  sha, repository, getMaster, listRuns, wait = pause, now = Date.now,
  timeoutMs = 15 * 60_000, pollMs = 15_000, log = console.log,
}) {
  if (!/^[0-9a-f]{40}$/.test(sha || "")) throw new Error("A full deployment SHA is required.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "")) throw new Error("A GitHub repository is required.");
  const deadline = now() + timeoutMs;
  let previous = "";
  while (true) {
    if ((await getMaster()) !== sha) throw new Error("Master advanced since this release was requested. Start a new release.");
    const payload = await listRuns();
    if (!Array.isArray(payload?.workflow_runs)) throw new Error("Malformed CI response; refusing production deployment.");
    const candidates = payload.workflow_runs.filter(run => run.head_sha === sha && run.event === "push" && run.head_branch === "master");
    if (candidates.some(run => !Number.isSafeInteger(run.id))) throw new Error("Malformed CI run identity.");
    const run = candidates.sort((a, b) => b.id - a.id)[0];
    if (run?.status === "completed") {
      if (run.conclusion !== "success") throw new Error("CI failed (" + run.conclusion + "): https://github.com/" + repository + "/actions/runs/" + run.id);
      // Fence a master change during the final API read as well.
      if ((await getMaster()) !== sha) throw new Error("Master advanced during CI verification. Start a new release.");
      log("Verified production candidate: " + sha);
      return run.id;
    }
    if (run && !["queued", "in_progress", "waiting", "pending", "requested"].includes(run.status)) {
      throw new Error("Unknown CI state; refusing production deployment.");
    }
    if (now() >= deadline) throw new Error("Timed out waiting for successful CI for the exact master SHA. Retry after CI completes.");
    const state = run ? run.id + ":" + run.status : "not-created";
    if (state !== previous) {
      log(run ? "Waiting for exact-SHA CI: https://github.com/" + repository + "/actions/runs/" + run.id + " (" + run.status + ")" : "Waiting for the master push CI run to appear.");
      previous = state;
    }
    await wait(Math.min(pollMs, Math.max(0, deadline - now())));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await waitForProductionCi({
      sha: process.env.GITHUB_SHA, repository: process.env.GITHUB_REPOSITORY,
      getMaster: () => execFileSync("git", ["ls-remote", "origin", "refs/heads/master"], {encoding:"utf8",timeout:30_000}).trim().split(/\s+/)[0],
      listRuns: () => JSON.parse(execFileSync("gh", ["api", "/repos/" + process.env.GITHUB_REPOSITORY + "/actions/workflows/ci.yml/runs?head_sha=" + process.env.GITHUB_SHA + "&event=push&branch=master&per_page=30"], {encoding:"utf8",timeout:30_000})),
    });
  } catch (error) { console.error("::error::" + error.message); process.exitCode = 1; }
}
