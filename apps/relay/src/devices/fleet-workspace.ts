import type { FleetSelection } from "./fleet-scheduler.js";

export type GitWorkspaceRequest = {
  repository: string;
  revision: string;
  platform?: "linux" | "darwin" | "win32";
};

export function planFleetGitWorkspace(
  request: GitWorkspaceRequest,
  selected: FleetSelection,
  trustedRoot: string,
) {
  const repository = request.repository.trim();
  const revision = request.revision.toLowerCase();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/.test(repository) ||
      repository.includes("..") || repository.endsWith(".") || repository.endsWith("-")) {
    throw new Error("Fleet workspace requires a canonical GitHub owner/repository.");
  }
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Fleet workspace requires an immutable 40-character commit SHA.");
  }
  if (!trustedRoot || /[\r\n\0]/.test(trustedRoot)) {
    throw new Error("No safe trusted workspace root is available.");
  }
  const folder = "ra-fleet-" + repository.replaceAll("/", "-").replaceAll(".", "_") + "-" + revision.slice(0, 12);
  const windows = selected.platform === "win32";
  const path = trustedRoot.replace(/[\\/]+$/, "") + (windows ? "\\" : "/") + folder;
  const origin = "https://github.com/" + repository + ".git";

  if (windows) {
    // The Windows agent executes through cmd.exe. No shell metacharacters,
    // environment substitutions, or quotes may enter its command line.
    if (!/^[A-Za-z]:\\[^"&|<>^%!\r\n]*$/.test(trustedRoot)) {
      throw new Error("Windows Fleet Git checkout needs a trusted local drive root.");
    }
    const quoted = '"' + path + '"';
    const remote = '"' + origin + '"';
    const verified = `git -C ${quoted} rev-parse HEAD | findstr /x ${revision} >nul && git -C ${quoted} config --get remote.origin.url | findstr /x ${remote} >nul && git -C ${quoted} diff --quiet && git -C ${quoted} diff --cached --quiet`;
    const download = `git clone --no-checkout --depth=1 ${remote} ${quoted} && git -C ${quoted} fetch --depth=1 origin ${revision} && git -C ${quoted} checkout --quiet --detach ${revision}`;
    return { path, origin, revision, command: `if exist ${quoted} (${verified}) else (${download})`, cwd: trustedRoot };
  }
  const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
  const dest = quote(path), src = quote(origin);
  // Never overwrite a pre-existing checkout; reject local modifications.
  // We use a new unique leaf directly below an already trusted root.
  const verify = `test -d ${dest} && test "$(git -C ${dest} rev-parse HEAD)" = ${revision} && test "$(git -C ${dest} config --get remote.origin.url)" = ${src} && test -z "$(git -C ${dest} status --porcelain)"`;
  const download = `git clone --no-checkout --depth=1 ${src} ${dest} && git -C ${dest} fetch --depth=1 origin ${revision} && git -C ${dest} checkout --quiet --detach ${revision}`;
  return { path, origin, revision, cwd: trustedRoot,
    command: `if [ -e ${dest} ]; then ${verify}; else ${download}; fi` };
}
