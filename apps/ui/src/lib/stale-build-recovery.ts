/**
 * A page opened before a deploy still asks for the previous build's lazy
 * chunks. Those files are gone, and the asset fallback answers with the HTML
 * shell instead of a 404, so the dynamic import fails and the lazy view cannot
 * render. One reload picks up the current build. The guard below stops a page
 * that keeps failing from reloading in a loop.
 */
const RELOAD_KEY = "remote-arc-stale-build-reload";
const RELOAD_WINDOW_MS = 30_000;

type ReloadStore = Pick<Storage, "getItem" | "setItem">;

/** Messages browsers give when a module or chunk from another build cannot load. */
const STALE_BUILD_MESSAGE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/i;

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return STALE_BUILD_MESSAGE.test(message);
}

/** True once per window: the caller may reload now. False when this page already
 * reloaded for a stale build moments ago, or when storage is unavailable. */
export function claimStaleBuildReload(store: ReloadStore | null, now = Date.now()): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(RELOAD_KEY) || 0);
    if (Number.isFinite(last) && now - last >= 0 && now - last < RELOAD_WINDOW_MS) return false;
    store.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function sessionStore(win: Window): ReloadStore | null {
  try {
    return win.sessionStorage;
  } catch {
    return null;
  }
}

/** Reloads once when the current page can no longer load its own lazy chunks.
 * Returns true when a reload was started. */
export function reloadForStaleBuild(win: Window = window): boolean {
  if (!claimStaleBuildReload(sessionStore(win))) return false;
  win.location.reload();
  return true;
}

/** Vite dispatches vite:preloadError when a lazy chunk or its preload fails.
 * Cancelling the event stops Vite from rethrowing while the page reloads; when
 * no reload is allowed, the error reaches the app error boundary instead. */
export function installStaleBuildRecovery(win: Window = window) {
  win.addEventListener("vite:preloadError", (event) => {
    if (reloadForStaleBuild(win)) event.preventDefault();
  });
}
