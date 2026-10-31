/**
 * The former independent Admin host and legacy dashboard both used this origin.
 * Before the rollback, browsers could retain an Admin-scoped service worker.
 * Keep recovery confined to admin.remotearc.app: do not alter user devices,
 * browser sessions, or any other Remote Arc subdomain.
 */
import {currentProductWorker, PRODUCT_CACHE} from '../../config/pwa-config.js';

type LegacyServiceWorker = {
  scope: string;
  active?: {scriptURL: string} | null;
  waiting?: {scriptURL: string} | null;
  installing?: {scriptURL: string} | null;
  unregister(): Promise<boolean>;
};
export type AdminClientRecovery = {
  hostname: string;
  origin: string;
  getRegistrations?: () => Promise<readonly LegacyServiceWorker[]>;
  controlled?: boolean;
  cacheKeys?: () => Promise<string[]>;
  deleteCache?: (key: string) => Promise<boolean>;
  getAttempt?: () => string | null;
  setAttempt?: (value: string) => void;
  reload?: () => void;
};

export async function recoverLegacyAdminClient(input: AdminClientRecovery): Promise<boolean> {
  if (input.hostname !== "admin.remotearc.app") return false;
  let unregistered = 0;
  try {
    const registrations = await input.getRegistrations?.() ?? [];
    for (const registration of registrations) {
      if (new URL(registration.scope).origin !== input.origin) continue;
      const workers = [registration.active, registration.waiting, registration.installing].filter(Boolean);
      if (workers.length && workers.every(worker => currentProductWorker(worker!.scriptURL, input.origin))) continue;
      if (await registration.unregister()) unregistered++;
    }
  } catch {
    // Recovery must not block a working Admin console.
  }

  try {
    const keys = await input.cacheKeys?.() ?? [];
    for (const key of keys) {
      if (key.startsWith("remote-arc-") && key !== PRODUCT_CACHE) await input.deleteCache?.(key);
    }
  } catch {
    // Cache Storage may be disabled or unavailable; login still works.
  }

  // Removing a registration does not detach the active controller of this page.
  // Reload once, and only once per tab, if an old controller was still active.
  if (unregistered > 0 && input.controlled && input.reload && input.getAttempt && input.setAttempt) {
    try {
      if (input.getAttempt?.() !== "1") {
        input.setAttempt?.("1");
        input.reload();
        return true;
      }
    } catch {
      // SessionStorage is optional; never enter a reload loop.
    }
  }
  return false;
}

export function recoverAdminBrowser(): Promise<boolean> {
  const sw = navigator.serviceWorker;
  return recoverLegacyAdminClient({
    hostname: location.hostname,
    origin: location.origin,
    getRegistrations: sw ? () => sw.getRegistrations() : undefined,
    controlled: Boolean(sw?.controller),
    cacheKeys: typeof caches === "undefined" ? undefined : () => caches.keys(),
    deleteCache: typeof caches === "undefined" ? undefined : (key) => caches.delete(key),
    getAttempt: () => sessionStorage.getItem("ra-admin-recovery-v1"),
    setAttempt: value => sessionStorage.setItem("ra-admin-recovery-v1", value),
    reload: () => location.reload(),
  });
}
