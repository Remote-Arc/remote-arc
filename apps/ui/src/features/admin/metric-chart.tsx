import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { ServiceMetricsPoint } from "@remotearc/protocol";
type Series = { key: Exclude<keyof ServiceMetricsPoint, "at">; label: string; color: string };
export function MetricChart({
  title,
  note,
  points,
  series,
  unit,
  locale,
}: {
  title: string;
  note: string;
  points: ServiceMetricsPoint[];
  series: Series[];
  unit: string;
  locale: string;
}) {
  const id = useId(),
    container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600),
    [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, Math.round(entries[0]?.contentRect.width || 600))),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = 220,
    left = 48,
    top = 20,
    bottom = 34,
    plotWidth = width - left - 12,
    plotHeight = height - top - bottom;
  const rawMax = Math.max(
    1,
    ...points.flatMap((point) => series.map((item) => point[item.key] || 0)),
  );
  const magnitude = 10 ** Math.floor(Math.log10(rawMax));
  const duration = series.some((item) => item.key === "p50Ms" || item.key === "p95Ms");
  const maximum = duration ? Math.ceil(rawMax / magnitude) * magnitude : Math.ceil(rawMax / 4) * 4;
  const first = Date.parse(points[0]?.at || ""),
    last = Date.parse(points.at(-1)?.at || "");
  const x = (index: number) =>
    left +
    (last > first ? (Date.parse(points[index]!.at) - first) / (last - first) : 0.5) * plotWidth;
  const y = (value: number) => top + plotHeight * (1 - value / maximum);
  const number = (value: number) =>
    Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
      notation: value >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(value);
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
      timeZone: "UTC",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  const axisTime = (value: string) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
      timeZone: "UTC",
      hour12: false,
      ...(last - first > 86400000
        ? ({ month: "2-digit", day: "2-digit" } as const)
        : ({ hour: "2-digit", minute: "2-digit" } as const)),
    }).format(new Date(value));
  const selected = points[Math.min(active ?? points.length - 1, points.length - 1)];
  const paths = (key: Series["key"]) => {
    const segments: string[] = [];
    let path = "";
    points.forEach((point, index) => {
      const value = point[key];
      if (value === null) {
        if (path) segments.push(path);
        path = "";
      } else path += `${path ? " L" : "M"}${x(index)},${y(value)}`;
    });
    if (path) segments.push(path);
    return segments;
  };
  const ticks = width < 460 ? 3 : 5;
  return (
    <figure className="metricChart" aria-labelledby={id}>
      <figcaption>
        <h3 id={id}>{title}</h3>
        <p>{note}</p>
      </figcaption>
      <div className="metricChartValues" aria-live="polite">
        {series.map((item) => (
          <span key={item.key} style={{ "--series-color": item.color } as CSSProperties}>
            <i />
            {item.label}{" "}
            <strong>
              {selected?.[item.key] === null || selected?.[item.key] === undefined
                ? "—"
                : number(selected[item.key]!)}
            </strong>
          </span>
        ))}
        <small>{selected ? time(selected.at) + " UTC" : "—"}</small>
      </div>
      <div ref={container} className="metricPlot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={title + " · UTC"}
          tabIndex={0}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setActive(
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  Math.round(
                    ((((event.clientX - box.left) * width) / box.width - left) / plotWidth) *
                      (points.length - 1),
                  ),
                ),
              ),
            );
          }}
          onPointerLeave={() => setActive(null)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
            event.preventDefault();
            if (event.key === "Escape") setActive(null);
            else
              setActive((index) =>
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? points.length - 1
                    : Math.max(
                        0,
                        Math.min(
                          points.length - 1,
                          (index ?? points.length - 1) + (event.key === "ArrowLeft" ? -1 : 1),
                        ),
                      ),
              );
          }}
        >
          <text x={left} y={12} className="metricUnit">
            {unit}
          </text>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - 12}
                y1={y(maximum * fraction)}
                y2={y(maximum * fraction)}
                className="metricGridline"
              />
              <text x={left - 8} y={y(maximum * fraction) + 4} textAnchor="end">
                {number(maximum * fraction)}
              </text>
            </g>
          ))}
          {Array.from({ length: ticks }, (_, i) =>
            Math.round((i * (points.length - 1)) / (ticks - 1)),
          ).map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 10}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            >
              {axisTime(points[index]!.at)}
            </text>
          ))}
          {series.flatMap((item) =>
            paths(item.key).map((path, index) => (
              <path
                key={item.key + index}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )),
          )}
          {active !== null && selected && (
            <g>
              <line
                x1={x(Math.min(active, points.length - 1))}
                x2={x(Math.min(active, points.length - 1))}
                y1={top}
                y2={top + plotHeight}
                className="metricCrosshair"
              />
              {series.map((item) =>
                selected[item.key] === null ? null : (
                  <circle
                    key={item.key}
                    cx={x(Math.min(active, points.length - 1))}
                    cy={y(selected[item.key]!)}
                    r={4}
                    fill={item.color}
                  />
                ),
              )}
            </g>
          )}
        </svg>
      </div>
    </figure>
  );
}
