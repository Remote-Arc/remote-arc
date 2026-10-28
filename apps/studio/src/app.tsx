import { useEffect, useState } from "react";
import { Studio } from "./studio.js";
import { StudioPreferences } from "./preferences.js";
import { StudioAccountContext } from "./account.js";
import type { StudioIdentity, StudioAccountLinks } from "../core/document.js";
import "./brand.css";
export function StudioApp() {
  const [session, setSession] = useState<{
    user: StudioIdentity | null;
    links: StudioAccountLinks;
  }>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/studio/session", {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw Error("session");
        const value = await response.json();
        if (!cancelled) {
          setSession(value);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  if (error && !session)
    return (
      <main className="studio-connection-error">
        <h1>ReArc Studio</h1>
        <p>Unable to connect. / 暂时无法连接。</p>
        <button onClick={() => location.reload()}>Retry / 重试</button>
      </main>
    );
  return (
    <StudioPreferences>
      <StudioAccountContext.Provider
        value={
          session?.links || { login: "/auth/login", account: null, home: null }
        }
      >
        <Studio key={session?.user?.id || "guest"} user={session?.user} />
      </StudioAccountContext.Provider>
    </StudioPreferences>
  );
}
