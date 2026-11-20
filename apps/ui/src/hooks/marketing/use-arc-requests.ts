import { useEffect, useRef, useState } from "react";

const BEAT_MS = 3200;
const TRAVEL_MS = 1500;

/**
 * Plays one request at a time along the hero arc while `running`: every beat
 * the next route starts, `travel` runs from 0 to 1 as the request goes out to
 * Remote Arc and on to its target, and the route joins the log when it lands.
 * When not running nothing moves and the log keeps the routes it has shown.
 */
export function useArcRequests(routeCount: number, running: boolean, logSize = 3) {
  const [route, setRoute] = useState(0);
  // Where a paused loop picks up again.
  const nextRoute = useRef(0);
  const [travel, setTravel] = useState<number | null>(null);
  // Newest first; it starts full so the log never renders empty.
  const [log, setLog] = useState(() =>
    Array.from(
      { length: logSize },
      (_, index) => (routeCount - 1 - index + routeCount) % routeCount,
    ),
  );

  useEffect(() => {
    if (!running) {
      setTravel(null);
      return;
    }
    let frame = 0;
    const play = () => {
      const current = nextRoute.current % routeCount;
      nextRoute.current = current + 1;
      setRoute(current);
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / TRAVEL_MS);
        setTravel(t);
        if (t < 1) frame = requestAnimationFrame(step);
        else setLog((previous) => [current, ...previous].slice(0, logSize));
      };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(step);
    };
    play();
    const timer = window.setInterval(play, BEAT_MS);
    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, [running, routeCount, logSize]);

  return { route, travel, log };
}
