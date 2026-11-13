/* Original basketball renderer: sphere-projected front-facing grooves, never arbitrary overlapping Bezier seams. */
(function (G) {
  const TAU = Math.PI * 2,
    cache = document.createElement("canvas");
  cache.width = cache.height = 720;
  const b = cache.getContext("2d", { willReadFrequently: true }),
    R = 354;
  const shade = b.createRadialGradient(235, 180, 5, 386, 384, 430);
  shade.addColorStop(0, "#efab57");
  shade.addColorStop(0.42, "#d77a2e");
  shade.addColorStop(0.78, "#a94c20");
  shade.addColorStop(1, "#542b1c");
  b.fillStyle = shade;
  b.beginPath();
  b.arc(360, 360, R, 0, TAU);
  b.fill();
  b.save();
  b.beginPath();
  b.arc(360, 360, R, 0, TAU);
  b.clip();
  for (let y = 12; y < 710; y += 9)
    for (let x = 10; x < 710; x += 9) {
      const xx = x + (Math.floor(y / 9) % 2) * 4.5,
        dy = (y - 360) / 354,
        dx = (xx - 360) / 354;
      if (dx * dx + dy * dy > 1) continue;
      const z = Math.sqrt(1 - dx * dx - dy * dy);
      b.fillStyle = "rgba(60,26,11," + (0.07 + 0.1 * (1 - z)) + ")";
      b.beginPath();
      b.arc(xx, y, 1.12 + 0.5 * z, 0, TAU);
      b.fill();
      b.fillStyle = "rgba(255,220,141,.07)";
      b.fillRect(xx - 0.3, y - 1.5, 1.8, 0.65);
    }
  b.restore();
  b.getImageData(0, 0, 720, 720);
  function project(p, yaw, pitch, roll) {
    let [x, y, z] = p;
    [x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    [y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
    return [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll), z];
  }
  function groove(ctx, fn, spin, r) {
    ctx.beginPath();
    let active = false;
    for (let n = 0; n <= 260; n++) {
      const p = project(fn((n / 260) * TAU), spin, 0.08, -0.16);
      if (p[2] >= 0) {
        if (!active) ctx.moveTo(p[0] * r, p[1] * r);
        else ctx.lineTo(p[0] * r, p[1] * r);
        active = true;
      } else active = false;
    }
    ctx.strokeStyle = "#422819";
    ctx.lineWidth = Math.max(2, r * 0.018);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.strokeStyle = "#160e0a";
    ctx.lineWidth = Math.max(1.1, r * 0.008);
    ctx.stroke();
  }
  G.BallArt = {
    draw(ctx, { x, y, r, spin = 0.12, sx = 1, sy = 1, alpha = 1, cut = 0, air = 1 }) {
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(x, y);
      ctx.scale(sx, sy);
      ctx.drawImage(cache, -r, -r, r * 2, r * 2);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.988, 0, TAU);
      ctx.clip();
      ctx.globalAlpha *= 1 - cut;
      for (const theta of [-Math.PI / 3, 0, Math.PI / 3])
        groove(
          ctx,
          (u) => [Math.sin(theta) * Math.cos(u), Math.sin(u), Math.cos(theta) * Math.cos(u)],
          spin,
          r,
        );
      groove(ctx, (u) => [Math.cos(u), 0, Math.sin(u)], spin, r);
      ctx.restore();
      if (cut > 0) {
        ctx.save();
        ctx.globalAlpha *= cut;
        const inner = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.01, 0, 0, r * 0.88);
        inner.addColorStop(0, "#1d3b48");
        inner.addColorStop(1, "#081622");
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.88, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#ee9f50";
        ctx.lineWidth = r * 0.045;
        ctx.stroke();
        for (let n = 0; n < 34; n++) {
          const a = n * 2.3999632297,
            rr = Math.sqrt((n + 0.6) / 35) * r * 0.75;
          const xx = Math.cos(a) * rr + Math.sin(air * 2 + n) * r * 0.022,
            yy = Math.sin(a) * rr + Math.cos(air * 1.7 + n * 2) * r * 0.022;
          ctx.strokeStyle = "#72d5e8";
          ctx.lineWidth = r * 0.017;
          ctx.beginPath();
          ctx.moveTo(xx - r * 0.013, yy);
          ctx.lineTo(xx + r * 0.013, yy + r * 0.012);
          ctx.stroke();
          ctx.fillStyle = "#89d0dc";
          for (const k of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(xx + k * r * 0.017, yy + k * r * 0.007, r * 0.011, 0, TAU);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      ctx.strokeStyle = "rgba(255,215,143,.34)";
      ctx.lineWidth = r * 0.006;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.99, 3.35, 5.4);
      ctx.stroke();
      ctx.restore();
    },
  };
})(window);
