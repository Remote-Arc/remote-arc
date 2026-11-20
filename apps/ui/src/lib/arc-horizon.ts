// Geometry for the home hero's arc: the upper half of an ellipse whose centre
// sits below the stage, drawn in a 0–1000 square that the stage stretches to
// its own size. Angles are in degrees, 0 on the right and 90 at the top.

export type ArcGeometry = { cx: number; cy: number; rx: number; ry: number };
export type ArcPoint = { x: number; y: number };

/** The angle of the arc's highest point, where Remote Arc sits. */
export const ARC_APEX = 90;

/**
 * The arc for a stage, at `progress` from 0 (resting) to 1 (fully grown). It
 * grows mostly upward: the centre stays put while the vertical radius more
 * than doubles, so the top sweeps out of the stage and the inside fills it.
 * Narrow stages get their own flatter arc so the outer tiles stay on screen.
 */
export function arcGeometry(progress: number, narrow = false): ArcGeometry {
  // Linear, so the arc and the words leaving above it stay in step.
  const p = Math.min(1, Math.max(0, progress));
  // Narrow stages are nearly square, so their arc is flatter for the same look.
  const base = narrow ? { rx: 620, ry: 900, cy: 1060 } : { rx: 560, ry: 1400, cy: 1560 };
  // The apex rests about a sixth of the way down the stage (cy - ry = 160).
  return { cx: 500, cy: base.cy, rx: base.rx * (1 + 0.5 * p), ry: base.ry * (1 + 1.2 * p) };
}

export function arcPoint(arc: ArcGeometry, angle: number): ArcPoint {
  const radians = (angle * Math.PI) / 180;
  return { x: arc.cx + arc.rx * Math.cos(radians), y: arc.cy - arc.ry * Math.sin(radians) };
}

/** An SVG path along the arc from one angle to another. */
export function arcPath(arc: ArcGeometry, from: number, to: number, steps = 24): string {
  const points: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const { x, y } = arcPoint(arc, from + ((to - from) * index) / steps);
    points.push((index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1));
  }
  return points.join(" ");
}

/**
 * The globe's inner latitude, where the computers sit: the same arc scaled in,
 * so it grows with the rim as the page scrolls.
 */
export function ringGeometry(rim: ArcGeometry): ArcGeometry {
  return { cx: rim.cx, cy: rim.cy, rx: rim.rx * 0.78, ry: rim.ry * 0.8 };
}

/**
 * The globe's surface lines: latitudes are the rim scaled in, meridians share
 * its height and narrow towards the middle, so they all meet at the apex.
 */
export function globeLines(rim: ArcGeometry): {
  latitudes: ArcGeometry[];
  meridians: ArcGeometry[];
} {
  return {
    latitudes: [0.9, 0.84, 0.7, 0.62].map((f) => ({ ...rim, rx: rim.rx * f, ry: rim.ry * f })),
    meridians: [0.18, 0.38, 0.6, 0.82].map((f) => ({ ...rim, rx: rim.rx * f })),
  };
}

/** A place a request starts or ends: an angle on the rim or on the inner ring. */
export type RouteStop = { ring: "rim" | "ring"; angle: number };

/**
 * Where a request is at `t` (0–1). It climbs the rim to the apex in the first
 * half. A rim target is then reached along the rim. A ring target is reached
 * on one smooth curve: it leaves the apex in the rim's own direction, so there
 * is no corner, and bends down onto the computer.
 */
export function routePoint(rim: ArcGeometry, from: RouteStop, to: RouteStop, t: number): ArcPoint {
  const clamped = Math.min(1, Math.max(0, t));
  const along = (a: number, b: number, share: number) => arcPoint(rim, a + (b - a) * share);
  if (clamped < 0.5) return along(from.angle, ARC_APEX, clamped * 2);
  const share = (clamped - 0.5) * 2;
  if (to.ring === "rim") return along(ARC_APEX, to.angle, share);
  const start = arcPoint(rim, ARC_APEX);
  const end = arcPoint(ringGeometry(rim), to.angle);
  // Moving right along the rim when coming from the left, and the other way round.
  const forward = from.angle > ARC_APEX ? 1 : -1;
  const c1 = { x: start.x + forward * 140, y: start.y };
  const c2 = { x: end.x, y: start.y + (end.y - start.y) * 0.35 };
  const u = 1 - share;
  const blend = (p0: number, p1: number, p2: number, p3: number) =>
    u * u * u * p0 + 3 * u * u * share * p1 + 3 * u * share * share * p2 + share ** 3 * p3;
  return {
    x: blend(start.x, c1.x, c2.x, end.x),
    y: blend(start.y, c1.y, c2.y, end.y),
  };
}

/** The whole route as one path, from the AI to its target. */
export function routePath(rim: ArcGeometry, from: RouteStop, to: RouteStop, steps = 64): string {
  const points: string[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const { x, y } = routePoint(rim, from, to, index / steps);
    points.push((index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1));
  }
  return points.join(" ");
}

/**
 * The streak of light behind a request at `t`: the route from `t - span` to
 * `t`, cut into short pieces, each with its share of the way from the tail
 * (0) to the head (1), so the streak can taper and fade towards its tail.
 */
export function routeStreak(
  rim: ArcGeometry,
  from: RouteStop,
  to: RouteStop,
  t: number,
  span = 0.16,
  pieces = 14,
): { d: string; share: number }[] {
  const start = Math.max(0, t - span);
  const at = (index: number) => routePoint(rim, from, to, start + ((t - start) * index) / pieces);
  return Array.from({ length: pieces }, (_, index) => {
    const a = at(index);
    const b = at(index + 1);
    return {
      d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      share: (index + 1) / pieces,
    };
  });
}
