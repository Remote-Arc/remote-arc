#!/usr/bin/env node
// Reports a public workflow's result to the private commit it was exported from,
// as a commit status on the private repository. A sync/pr-<number> branch mirrors a
// private pull request, and each exported commit names its source in a
// `Source-Commit: <sha>` line, so the private pull request shows the result.
//
//   node scripts/report-public-status.mjs --context public-client-mcp \
//     --passed "Real MCP clients qualified" --failed "Real MCP client qualification failed"
//
// Environment: MESSAGE (head commit message), FAILED ("true" when any needed job
// failed or was cancelled), PRIVATE_REPOSITORY, GITHUB_REPOSITORY_OWNER and
// TARGET_URL. `gh` must be signed in with the export App's token.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SOURCE_COMMIT = /^Source-Commit: ([0-9a-f]{40})$/gm;

/** The status to report, or null when the commit names no source commit. */
export function publicStatus({ message = "", failed, context, passed, failedText }) {
  const sources = [...message.matchAll(SOURCE_COMMIT)];
  if (sources.length === 0) return null;
  return {
    source: sources.at(-1)[1],
    state: failed ? "failure" : "success",
    context,
    description: failed ? failedText : passed,
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing ${name}`);
  return args[index + 1];
}

function main(args, env) {
  const status = publicStatus({
    message: env.MESSAGE,
    failed: env.FAILED === "true",
    context: option(args, "--context"),
    passed: option(args, "--passed"),
    failedText: option(args, "--failed"),
  });
  if (!status) {
    console.log("No Source-Commit line in the head commit; nothing to report.");
    return;
  }
  for (const name of ["PRIVATE_REPOSITORY", "GITHUB_REPOSITORY_OWNER", "TARGET_URL"])
    if (!env[name]) throw new Error(`Missing ${name}`);
  execFileSync(
    "gh",
    [
      "api",
      `repos/${env.GITHUB_REPOSITORY_OWNER}/${env.PRIVATE_REPOSITORY}/statuses/${status.source}`,
      "-f",
      `state=${status.state}`,
      "-f",
      `context=${status.context}`,
      "-f",
      `description=${status.description}`,
      "-f",
      `target_url=${env.TARGET_URL}`,
    ],
    { stdio: "inherit" },
  );
  console.log(`Reported ${status.context}=${status.state} on ${status.source}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2), process.env);
