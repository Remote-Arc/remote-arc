import React, { useEffect, useState } from "react";
import "../../../styles/marketing/home/hero-slot-headline.css";

/** Steps through `count` frames every `interval` ms while the page is visible and motion is allowed. */
function useCycle(count: number, interval: number) {
  const [frame, setFrame] = useState(0);
  const [still, setStill] = useState(
    () =>
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setStill(motion.matches);
    const onVisibility = () => setVisible(!document.hidden);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    if (still || !visible) return;
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % count), interval);
    return () => window.clearInterval(timer);
  }, [count, interval, still, visible]);
  return frame;
}

/**
 * The hero headline: a fixed lead with its last words sliding up, one scenario at a
 * time. Every word shares one grid cell, so the line keeps the size of the longest and
 * the page never jumps. Screen readers get the whole sentence once.
 */
export function SlotHeadline({
  lead,
  words,
  accessible,
}: {
  lead: string;
  words: string[];
  accessible: string;
}) {
  const frame = useCycle(words.length, 2400);
  return (
    <div className="heroHeadlineGroup">
      <h1 className="heroHeadline">
        <span className="heroAccessible">{accessible}</span>
        <span aria-hidden="true">
          <span className="heroFixedLine">{lead}</span>
          <span className="heroTypeLine heroSlotLine">
            {words.map((word, index) => (
              <span
                className="heroSlotWord"
                data-state={
                  index === frame
                    ? "active"
                    : index === (frame + words.length - 1) % words.length
                      ? "leaving"
                      : "waiting"
                }
                key={word}
              >
                {word}
              </span>
            ))}
          </span>
        </span>
      </h1>
    </div>
  );
}
