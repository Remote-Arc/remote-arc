import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import "../../../styles/marketing/home/request-volume.css";

// Traffic snapshot supplied by the owner, 2026-11-02. This is a projection,
// not a measured rolling month or a count of user tool calls/completed tasks.
export const REQUEST_TRAFFIC = { daily: 265_250, days: 30, asOf: "2026-11-02" } as const;
const monthly = REQUEST_TRAFFIC.daily * REQUEST_TRAFFIC.days;
const countFormat = new Intl.NumberFormat("en-US");
const monthlyLabel = countFormat.format(monthly);

export function RequestVolume() {
  const { tr } = useI18n(),
    ref = useRef<HTMLElement>(null);
  const [count, setCount] = useState(0),
    [entered, setEntered] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      started = false,
      finished = false;
    const finish = () => {
      finished = true;
      window.cancelAnimationFrame(frame);
      setCount(monthly);
      setEntered(true);
    };
    const start = () => {
      if (started) return;
      started = true;
      setEntered(true);
      if (motion.matches) {
        finish();
        return;
      }
      const at = performance.now();
      const tick = (time: number) => {
        const progress = Math.min(1, (time - at) / 3200);
        setCount(monthly * progress * progress * (3 - 2 * progress));
        if (progress < 1 && !finished) frame = requestAnimationFrame(tick);
        else finish();
      };
      frame = requestAnimationFrame(tick);
    };
    const preference = () => {
      if (motion.matches) finish();
    };
    const visibility = () => {
      if (document.hidden && started) finish();
    };
    motion.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                start();
                observer?.disconnect();
              }
            },
            { threshold: 0.25 },
          );
    if (motion.matches) finish();
    else if (observer && ref.current) observer.observe(ref.current);
    else start();
    return () => {
      finished = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      motion.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <section
      ref={ref}
      className="homeRequestVolume"
      id="request-volume"
      data-entered={entered}
      data-monthly-estimate={monthly}
      aria-label={tr("marketing.home.requestVolume.estimatedMonthlyServerRequests")}
    >
      <div className="requestVolumeIntro">
        <h2>{tr("marketing.home.requestVolume.remoteArcServes")}</h2>
        <p className="requestVolumeNote">{tr("marketing.home.requestVolume.dayEstimateKDayNov")}</p>
      </div>
      <div className="requestVolumeMetric">
        <span className="requestVolumeAccessible">
          {tr("marketing.home.requestVolume.serverRequestsPerMonthEstimated", { monthlyLabel })}
        </span>
        <div className="requestVolumeNumber" aria-hidden="true">
          <span className="requestVolumeApprox">~</span>
          <span data-request-count>{countFormat.format(Math.floor(count))}</span>
        </div>
        <span className="requestVolumeLabel">
          {tr("marketing.home.requestVolume.serverRequestsMonth")}
        </span>
      </div>
    </section>
  );
}
