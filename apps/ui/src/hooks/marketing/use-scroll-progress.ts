import { useEffect, useState, type RefObject } from "react";

/**
 * How far the page has scrolled past the top of `ref`, from 0 (its top at the
 * top of the viewport or below) to 1 (scrolled by `span` of its height). It
 * updates once per frame while scrolling, is also written to the element as
 * `--scroll-progress` for CSS, and stays 0 for readers who ask for reduced motion.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, span = 0.85) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const next = motion.matches
        ? 0
        : Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height * span)));
      element.style.setProperty("--scroll-progress", next.toFixed(4));
      setProgress((previous) => (Math.abs(previous - next) < 0.0005 ? previous : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
    };
  }, [ref, span]);
  return progress;
}
