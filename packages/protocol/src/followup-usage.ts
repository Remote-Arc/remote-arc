export const FOLLOWUP_USAGE_FILTERS = [
  { id: "all", en: "Monthly usage: all", zh: "本月用量：全部" },
  { id: "none", en: "No calls this month", zh: "本月未调用" },
  { id: "used", en: "Has calls this month", zh: "本月已有调用" },
  { id: "high", en: "High usage · 1,000+ calls", zh: "高用量 · 1,000 次以上" },
  { id: "near", en: "At least 80% of allowance", zh: "已用至少 80% 额度" },
  { id: "exhausted", en: "Allowance reached", zh: "本月额度已满" },
] as const;
export type FollowupUsageFilter = (typeof FOLLOWUP_USAGE_FILTERS)[number]["id"];
export const isFollowupUsageFilter = (value: string): value is FollowupUsageFilter =>
  FOLLOWUP_USAGE_FILTERS.some((item) => item.id === value);
export function matchesFollowupUsage(
  filter: FollowupUsageFilter,
  used: number,
  limit: number | null,
) {
  switch (filter) {
    case "all":
      return true;
    case "none":
      return used === 0;
    case "used":
      return used > 0;
    case "high":
      return used >= 1000;
    case "near":
      return limit !== null && limit > 0 && used * 100 >= limit * 80;
    case "exhausted":
      return limit !== null && limit > 0 && used >= limit;
  }
}
