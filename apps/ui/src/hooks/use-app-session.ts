import { useEffect, useState } from "react";
import { canonicalErrorEnvelope } from "../../../../packages/protocol/src/error-codes.js";
import type { Device, ProductStatus, User } from "../types/app-types.js";

export function useAppSession(isAdminHost: boolean) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  async function loadMe(background = false) {
    try {
      const response = await fetch("/api/me", { headers: { accept: "application/json" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        if (!background || response.status === 401) setUser(null);
        return;
      }
      const payload = (await response.json().then(canonicalErrorEnvelope)) as { user: User };
      setUser((previous) =>
        background && previous?.id !== payload.user?.id ? null : payload.user,
      );
    } catch {
      if (!background) setUser(null);
    }
  }

  async function loadAll() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) return;
      const payload = (await response.json().then(canonicalErrorEnvelope)) as ProductStatus;
      setDevices(payload.devices);
      setStatus(payload);
    } catch {
      // Keep the last known dashboard state during a temporary network interruption.
    }
  }

  async function signOut() {
    const response = await fetch("/auth/logout", { method: "POST" });
    if (!response.ok && response.status !== 401) throw new Error("sign_out_unconfirmed");
    setUser(null);
    setDevices([]);
    setStatus(null);
  }

  useEffect(() => {
    void loadMe();
  }, []);
  useEffect(() => {
    if (!user || isAdminHost) return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void loadAll();
        void loadMe(true);
      }
    };
    void loadAll();
    const timer = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [user?.id, isAdminHost]);

  return { user, devices, status, loadMe, loadAll, signOut };
}
