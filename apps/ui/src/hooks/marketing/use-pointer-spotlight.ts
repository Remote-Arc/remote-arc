import { useEffect, type RefObject } from "react";

/**
 * Lets cards inside `root` follow the pointer with a soft light: the card under
 * the pointer gets `--spot-x` and `--spot-y` (pixels from its top left), which
 * its CSS uses to place a radial highlight. Touch input and reduced motion skip
 * it, and nothing is written until the pointer actually moves over a card.
 */
export function usePointerSpotlight(root: RefObject<HTMLElement | null>, selector: string) {
  useEffect(() => {
    const element = root.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;
    const paint = () => {
      frame = 0;
      if (!pending) return;
      pending.card.style.setProperty("--spot-x", pending.x + "px");
      pending.card.style.setProperty("--spot-y", pending.y + "px");
      pending = null;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return;
      const card = event.target.closest<HTMLElement>(selector);
      if (!card || !element.contains(card)) return;
      const box = card.getBoundingClientRect();
      pending = { card, x: event.clientX - box.left, y: event.clientY - box.top };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    element.addEventListener("pointermove", move, { passive: true });
    return () => {
      element.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, [root, selector]);
}
