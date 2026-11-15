import { useEffect, useRef, useState } from "react";

/** Copies text and remembers which item was copied last, for a short "Copied" label. */
export function useCopiedText(resetMs = 1800) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), resetMs);
    } catch {
      setCopied(null);
    }
  };
  return [copied, copy] as const;
}
