import { useState } from "react";

export type RunMode = "arc" | "connect";
export function useRunMode() {
  const [mode, setMode] = useState<RunMode>(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("mode") === "arc"
      ? "arc"
      : "connect",
  );
  return [
    mode,
    (next: RunMode) => {
      setMode(next);
      const url = new URL(window.location.href);
      url.searchParams.set("mode", next);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    },
  ] as const;
}
