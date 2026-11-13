import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * What the Overview showed on this browser last time, so its loading
 * placeholders take the same space as the content that replaces them.
 * It holds counts and pixel heights only, never names or activity.
 */
export type OverviewLayoutHint = {
  /** Viewport width the heights were measured at. */
  width: number;
  rows: { attention: number; devices: number; activity: number };
  heights: {
    banner: number;
    bannerGap: number;
    attention: number;
    devices: number;
    activity: number;
  };
};

/** Counts the Overview knows from its data once it has loaded. */
export type OverviewLiveLayout = { devices: number; activity: number };

type OverviewLayoutRefs = {
  /** The usage banner; empty when it is not shown. */
  banner: RefObject<HTMLElement | null>;
  attention: RefObject<HTMLDivElement | null>;
  devices: RefObject<HTMLDivElement | null>;
  activity: RefObject<HTMLDivElement | null>;
};

// A browser with no record: one attention row, one device row, no activity.
const NO_RECORD: OverviewLayoutHint = {
  width: 0,
  rows: { attention: 1, devices: 0, activity: 0 },
  heights: { banner: 0, bannerGap: 0, attention: 0, devices: 0, activity: 0 },
};

const storageKey = (userId: string) => "remotearc.overview.layout:" + userId;

// Counts are whole numbers; pixel heights keep two decimals so a restored
// list matches a fractional layout.
const clamp = (value: unknown, max: number, step = 1) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.round(value / step) * step))
    : 0;
const count = (value: unknown, max: number) => clamp(value, max);
const pixels = (value: unknown) => clamp(value, 4_000, 0.01);

function readHint(userId: string): OverviewLayoutHint {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return NO_RECORD;
    const value = JSON.parse(raw) as Partial<OverviewLayoutHint>;
    const rows: Partial<OverviewLayoutHint["rows"]> = value.rows ?? {};
    const heights: Partial<OverviewLayoutHint["heights"]> = value.heights ?? {};
    return {
      width: count(value.width, 10_000),
      rows: {
        attention: count(rows.attention, 6),
        devices: count(rows.devices, 5),
        activity: count(rows.activity, 20),
      },
      heights: {
        banner: pixels(heights.banner),
        bannerGap: pixels(heights.bannerGap),
        attention: pixels(heights.attention),
        devices: pixels(heights.devices),
        activity: pixels(heights.activity),
      },
    };
  } catch {
    return NO_RECORD;
  }
}

function measure(refs: OverviewLayoutRefs, live: OverviewLiveLayout): OverviewLayoutHint {
  const height = (element: Element | null | undefined) =>
    pixels(element?.getBoundingClientRect().height);
  const banner = refs.banner.current;
  return {
    width: window.innerWidth,
    rows: {
      attention: refs.attention.current?.childElementCount ?? 0,
      devices: live.devices,
      activity: live.activity,
    },
    heights: {
      banner: height(banner),
      bannerGap: banner ? pixels(parseFloat(getComputedStyle(banner).marginBottom)) : 0,
      attention: height(refs.attention.current),
      devices: height(refs.devices.current),
      activity: height(refs.activity.current),
    },
  };
}

/**
 * Reads the layout the Overview had last time and records the current one
 * after each render once `live` is known (pass null while loading).
 * `exact` holds the recorded heights only when the viewport width is unchanged.
 */
export function useOverviewLayoutHint(userId: string, live: OverviewLiveLayout | null) {
  const [hint] = useState(() => readHint(userId));
  const refs: OverviewLayoutRefs = {
    banner: useRef<HTMLElement>(null),
    attention: useRef<HTMLDivElement>(null),
    devices: useRef<HTMLDivElement>(null),
    activity: useRef<HTMLDivElement>(null),
  };
  const written = useRef("");

  // Runs after every render: the lists change with each background refresh.
  useEffect(() => {
    if (!live) return;
    const next = JSON.stringify(measure(refs, live));
    if (next === written.current) return;
    written.current = next;
    try {
      localStorage.setItem(storageKey(userId), next);
    } catch {
      /* Without storage the next visit uses the default layout. */
    }
  });

  return {
    hint,
    exact: hint.width > 0 && hint.width === window.innerWidth ? hint.heights : null,
    refs,
  };
}
