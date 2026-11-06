import {
  domainLabels,
  type FailureGroup,
  type HealthSnapshot,
  type MonitoringSnapshot,
} from "./service-health-model.js";

type Tr = (en: string, zh: string) => string;

export type VerdictLevel = "ok" | "watch" | "broken" | "unknown";
export type ProblemTarget = "infrastructure" | "devices" | "group";
export type Problem = {
  key: string;
  level: "watch" | "broken";
  title: string;
  detail: string;
  target: ProblemTarget;
  group?: FailureGroup;
};
export type Verdict = {
  level: VerdictLevel;
  headline: string;
  summary: string;
  problems: Problem[];
  /** Recorded failures that are expected product limits, not faults. */
  expected: number;
};

// Show at most this many error codes in the ranked list; the rest stay below.
export const VERDICT_GROUP_LIMIT = 3;

const plural = (count: number, en: string, zh: string, tr: Tr) =>
  count.toLocaleString() + tr(" " + en + (count === 1 ? "" : "s"), " " + zh);

/**
 * One answer to "is anything wrong, and where?" from data the page already
 * loads. Platform errors right now are "broken"; device trouble and error codes
 * marked for investigation are "watch"; expected limits never raise the level.
 */
export function healthVerdict(
  health: HealthSnapshot | null,
  monitoring: MonitoringSnapshot | null,
  tr: Tr,
): Verdict {
  const problems: Problem[] = [];
  if (health) {
    const { errors15m, errors1h, errors24h } = health.worker;
    if (errors15m > 0)
      problems.push({
        key: "platform-now",
        level: "broken",
        title: tr("The platform is returning server errors now", "平台正在返回服务器错误"),
        detail:
          plural(errors15m, "error", "次", tr) +
          tr(" in the last 15 minutes · ", " · 最近 15 分钟 · ") +
          plural(errors1h, "error", "次", tr) +
          tr(" in the last hour", " · 最近 1 小时"),
        target: "infrastructure",
      });
    else if (errors1h > 0)
      problems.push({
        key: "platform-recent",
        level: "watch",
        title: tr("Server errors in the last hour", "最近 1 小时出现过服务器错误"),
        detail:
          plural(errors1h, "error", "次", tr) +
          tr(", none in the last 15 minutes · ", "，最近 15 分钟没有 · 24 小时共 ") +
          plural(errors24h, "error", "次", tr) +
          tr(" in 24 hours", ""),
        target: "infrastructure",
      });
    const deps = [
      ["D1", health.dependencies.d1.status],
      ["Durable Objects", health.dependencies.durableObjects.status],
    ].filter(([, status]) => status !== "operational" && status !== "healthy");
    if (deps.length)
      problems.push({
        key: "dependencies",
        level: "broken",
        title: tr("A platform dependency is degraded", "平台依赖服务异常"),
        detail: deps.map(([name, status]) => name + " · " + status).join(" / "),
        target: "infrastructure",
      });
    const devices = health.deviceExecution;
    if (devices?.coverage === "observed" && devices.affectedDevices > 0)
      problems.push({
        key: "devices",
        level: "watch",
        title: tr("Computers are not completing calls", "有电脑没能完成调用"),
        detail:
          plural(devices.affectedDevices, "computer", "台电脑", tr) +
          tr(" affected in 15 minutes · ", "受影响（15 分钟内）· ") +
          plural(devices.timeouts, "timeout", "次超时", tr) +
          " · " +
          plural(devices.offlineCalls, "offline call", "次离线", tr),
        target: "devices",
      });
  }
  const groups = monitoring?.groups || [];
  const attention = groups
    .filter((group) => group.definition.attention)
    .sort((a, b) => b.affectedUsers - a.affectedUsers || b.total - a.total);
  for (const group of attention.slice(0, VERDICT_GROUP_LIMIT)) {
    const domain = domainLabels[group.domain];
    problems.push({
      key: "group:" + group.domain + ":" + group.code + ":" + group.category,
      level: "watch",
      title: tr(group.definition.meaningEn || group.definition.meaning, group.definition.meaning),
      detail:
        (domain ? tr(...domain) : group.domain) +
        " · " +
        group.code +
        " · " +
        plural(group.total, "time", "次", tr) +
        " · " +
        plural(group.affectedUsers, "account", "位用户", tr),
      target: "group",
      group,
    });
  }
  const expected = groups
    .filter((group) => !group.definition.attention)
    .reduce((sum, group) => sum + group.total, 0);
  const more = attention.length - VERDICT_GROUP_LIMIT;
  const level: VerdictLevel =
    !health && !monitoring
      ? "unknown"
      : problems.some((item) => item.level === "broken")
        ? "broken"
        : problems.length
          ? "watch"
          : "ok";
  const headline = {
    ok: tr("Everything is working", "一切正常"),
    watch: tr("Working, with problems to look at", "服务可用，但有问题需要查看"),
    broken: tr("Something is broken right now", "现在有故障"),
    unknown: tr("Health could not be checked", "暂时无法检查服务状态"),
  }[level];
  const summary =
    level === "unknown"
      ? tr(
          "Refresh in a moment. If it keeps failing, check admin access.",
          "请稍后刷新；如果持续失败，请检查管理员权限。",
        )
      : level === "ok"
        ? tr(
            "No server errors in the last hour, computers are answering, and no error needs investigation.",
            "最近 1 小时没有服务器错误，电脑响应正常，也没有需要排查的错误。",
          )
        : plural(problems.length, "problem", "个问题", tr) +
          tr(", most urgent first.", "，按紧急程度排列。") +
          (more > 0
            ? tr(` ${more} more error codes are listed below.`, `另有 ${more} 个错误码见下方列表。`)
            : "");
  return { level, headline, summary, problems, expected };
}
