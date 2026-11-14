import { useEffect, useState } from "react";

const REFRESH_MS = 60 * 60 * 1000;

let current: { version: string | null; at: number } | null = null;
let pending: Promise<string | null> | null = null;

function load(): Promise<string | null> {
  if (current && Date.now() - current.at < REFRESH_MS) return Promise.resolve(current.version);
  if (!pending)
    pending = fetch("/api/browser-extension/version", { credentials: "omit" })
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as { version?: unknown };
        return typeof body.version === "string" && /^\d+(\.\d+){0,3}$/.test(body.version)
          ? body.version
          : null;
      })
      .catch(() => null)
      .then((version) => {
        current = { version, at: Date.now() };
        return version;
      })
      .finally(() => {
        pending = null;
      });
  return pending;
}

/**
 * The Remote Arc Browser version live on Chrome Web Store, which Chrome
 * installs when it updates the extension. Asked only while a browser is
 * paired; null until known or when the store could not be checked, so the
 * Dashboard never asks for an update people cannot install yet.
 */
export function useBrowserExtensionVersion(enabled: boolean) {
  const [version, setVersion] = useState<string | null>(current?.version ?? null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void load().then((value) => {
      if (active) setVersion(value);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  return enabled ? version : null;
}
