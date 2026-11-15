import { useEffect, useState } from "react";

/** One choice from a fixed list, kept in the URL hash (#<prefix><id>) so a link can
 * open it and the back button is not filled with every click. */
export function useHashChoice<T extends string>(ids: readonly T[], prefix: string) {
  const fromHash = (): T | null => {
    if (typeof window === "undefined") return null;
    const id = window.location.hash.slice(1 + prefix.length);
    return window.location.hash.startsWith("#" + prefix) && ids.includes(id as T)
      ? (id as T)
      : null;
  };
  const [choice, setChoice] = useState<T>(() => fromHash() ?? ids[0]!);
  useEffect(() => {
    const onHash = () => {
      const next = fromHash();
      if (next) setChoice(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  const choose = (id: T) => {
    setChoice(id);
    const url = new URL(window.location.href);
    url.hash = prefix + id;
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };
  return [choice, choose] as const;
}
