import { useEffect, useRef } from "react";

export type ScrollRevealTargets = {
  /** Elements that fade up on their own as they enter the viewport. */
  items: string;
  /** Containers whose direct children fade up one after another. */
  groups: string;
  /**
   * Large product panels. Where the browser supports scroll-driven animation
   * they are left to CSS (the root gets `data-scroll-driven`); elsewhere they
   * reveal like items.
   */
  stages?: string;
};

/**
 * Marks the matching elements inside the returned ref and reveals each one as
 * it scrolls into view. Anything already on screen when the page loads is shown
 * at once, so the first paint never waits for an animation. With reduced motion,
 * or without IntersectionObserver, nothing is hidden at all.
 */
export function useScrollReveal<T extends HTMLElement>(targets: ScrollRevealTargets) {
  const ref = useRef<T>(null);
  const { items, groups, stages = "" } = targets;
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const show = (element: Element) => element.setAttribute("data-revealed", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    const marked: Element[] = [];
    const mark = (selector: string, kind: "item" | "group") => {
      for (const element of root.querySelectorAll(selector)) {
        if (element.hasAttribute("data-reveal")) continue;
        element.setAttribute("data-reveal", kind);
        marked.push(element);
      }
    };
    const scrollDriven =
      typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: view()") === true;
    mark(groups, "group");
    mark(items, "item");
    if (stages && !scrollDriven) mark(stages, "item");
    if (scrollDriven) root.setAttribute("data-scroll-driven", "");
    for (const element of marked) {
      if (element.getBoundingClientRect().top < window.innerHeight) show(element);
      else observer.observe(element);
    }
    root.setAttribute("data-reveal-ready", "");
    return () => {
      observer.disconnect();
      root.removeAttribute("data-reveal-ready");
      root.removeAttribute("data-scroll-driven");
      for (const element of marked) {
        element.removeAttribute("data-reveal");
        element.removeAttribute("data-revealed");
      }
    };
  }, [items, groups, stages]);
  return ref;
}
