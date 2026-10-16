import { useEffect, useRef, useState } from "react";

// One clock for the story and its CSS: background tabs, offscreen demos and
// reduced-motion users never keep an animation loop running.
export function useMarketingPlayback(stepCount: number, intervalMs = 2400) {
  const preference = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ref = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(preference);
  const [step, setStep] = useState(() => preference() ? stepCount - 1 : 0);
  const [playing, setPlaying] = useState(() => !preference());
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        setPlaying(false);
        setStep(stepCount - 1);
      }
    };
    const updateVisibility = () => setVisible(document.visibilityState === "visible");
    updatePreference();
    updateVisibility();
    media.addEventListener("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      entries => setInView(entries.some(entry => entry.isIntersecting)),
      { threshold: 0.12 },
    );
    if (ref.current && observer) observer.observe(ref.current);
    else setInView(true);
    return () => {
      media.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, [stepCount]);

  const running = playing && !reducedMotion && visible && inView;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setStep(value => (value + 1) % stepCount),
      step === stepCount - 1 ? intervalMs * 1.7 : intervalMs);
    return () => window.clearTimeout(timer);
  }, [running, step, stepCount, intervalMs]);

  return { ref, step, setStep, playing, setPlaying, running, reducedMotion };
}
