import assert from "node:assert/strict";
import {
  ARC_APEX,
  arcGeometry,
  arcPath,
  arcPoint,
  globeLines,
  ringGeometry,
  routePath,
  routePoint,
  routeStreak,
} from "../src/lib/arc-horizon.ts";

// At rest the apex sits a sixth of the way down the stage, on the centre line.
for (const narrow of [false, true]) {
  const rest = arcGeometry(0, narrow);
  const apex = arcPoint(rest, ARC_APEX);
  assert.equal(Math.round(apex.x), 500);
  assert.equal(Math.round(apex.y), 160);

  // Scrolling grows the arc upward: the apex climbs above the stage and the arc
  // widens, while its centre stays where it was.
  const half = arcGeometry(0.5, narrow);
  const full = arcGeometry(1, narrow);
  assert.equal(half.cy, rest.cy);
  assert.ok(arcPoint(half, ARC_APEX).y < 0, "half-way, the apex has left the stage");
  assert.ok(arcPoint(full, ARC_APEX).y < arcPoint(half, ARC_APEX).y, "it keeps climbing");
  assert.ok(full.rx > half.rx && half.rx > rest.rx, "and widens");
  // Progress outside 0–1 is clamped, so overscroll cannot flip or shrink it.
  assert.deepEqual(arcGeometry(-1, narrow), rest);
  assert.deepEqual(arcGeometry(4, narrow), full);
}

// A path runs from its first angle to its last.
const arc = arcGeometry(0);
const path = arcPath(arc, 180, 0, 4);
const start = arcPoint(arc, 180);
const end = arcPoint(arc, 0);
assert.ok(path.startsWith(`M${start.x.toFixed(1)} ${start.y.toFixed(1)}`));
assert.ok(path.endsWith(`L${end.x.toFixed(1)} ${end.y.toFixed(1)}`));
assert.equal(path.split("L").length, 5, "one move and four lines");

// The inner ring sits under the rim's top and the surface lines meet at the apex.
const ring = ringGeometry(arc);
assert.ok(arcPoint(ring, ARC_APEX).y > arcPoint(arc, ARC_APEX).y, "the ring is below the rim");
for (const meridian of globeLines(arc).meridians) {
  const top = arcPoint(meridian, ARC_APEX);
  assert.ok(Math.abs(top.y - arcPoint(arc, ARC_APEX).y) < 1e-9, "meridians meet at the apex");
}

// A request to an app climbs to the apex at half-way and lands on the rim.
const close = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
const ai = { ring: "rim" as const, angle: 137 };
const app = { ring: "rim" as const, angle: 43 };
const computer = { ring: "ring" as const, angle: 70 };
assert.ok(close(routePoint(arc, ai, app, 0), arcPoint(arc, 137)));
assert.ok(close(routePoint(arc, ai, app, 0.5), arcPoint(arc, ARC_APEX)));
assert.ok(close(routePoint(arc, ai, app, 1), arcPoint(arc, 43)));
// A request to a computer also passes the apex at half-way, then leaves it on
// one curve: heading the way it was going along the rim (no corner), ending
// on the computer, and never climbing back above the apex.
assert.ok(close(routePoint(arc, ai, computer, 0.5), arcPoint(arc, ARC_APEX)));
const justAfter = routePoint(arc, ai, computer, 0.51);
const apexPoint = arcPoint(arc, ARC_APEX);
assert.ok(justAfter.x > apexPoint.x, "it keeps moving right, as it was along the rim");
assert.ok(
  Math.abs(justAfter.y - apexPoint.y) < Math.abs(justAfter.x - apexPoint.x),
  "it leaves level, not straight down",
);
for (let step = 50; step <= 100; step += 5)
  assert.ok(routePoint(arc, ai, computer, step / 100).y >= apexPoint.y - 1e-9, "no climbing back");
assert.ok(close(routePoint(arc, ai, computer, 1), arcPoint(ring, 70)));
assert.ok(close(routePoint(arc, ai, computer, 3), arcPoint(ring, 70)), "travel is clamped");
// From the right the curve leaves to the left.
const fromRight = { ring: "rim" as const, angle: 43 };
assert.ok(routePoint(arc, fromRight, computer, 0.51).x < apexPoint.x);

// The whole route is one path, and the streak runs up to the request with its
// pieces brightening from the tail to the head.
assert.ok(routePath(arc, ai, computer).startsWith("M"));
const streak = routeStreak(arc, ai, computer, 0.7);
assert.equal(streak.length, 14);
assert.equal(streak.at(-1)!.share, 1);
assert.ok(streak.every((piece, index) => index === 0 || piece.share > streak[index - 1]!.share));
const head = routePoint(arc, ai, computer, 0.7);
assert.ok(streak.at(-1)!.d.endsWith(`L${head.x.toFixed(1)} ${head.y.toFixed(1)}`));

console.log(
  "PASS: the hero globe rests with its apex at the top centre, grows upward with scroll, and routes requests through the apex to apps along the rim and to computers on one smooth curve",
);
