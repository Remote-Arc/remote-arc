import type { Translate } from "../../locales/locale-catalog.js";
import {
  domainLabels,
  type FailureGroup,
  type HealthSnapshot,
  type MonitoringSnapshot,
} from "./service-health-model.js";

type Tr = Translate;

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

const units = {
  error: [
    "admin.serviceHealthVerdict.unit.error.one",
    "admin.serviceHealthVerdict.unit.error.many",
  ],
  computer: [
    "admin.serviceHealthVerdict.unit.computer.one",
    "admin.serviceHealthVerdict.unit.computer.many",
  ],
  timeout: [
    "admin.serviceHealthVerdict.unit.timeout.one",
    "admin.serviceHealthVerdict.unit.timeout.many",
  ],
  "offline-call": [
    "admin.serviceHealthVerdict.unit.offline-call.one",
    "admin.serviceHealthVerdict.unit.offline-call.many",
  ],
  time: ["admin.serviceHealthVerdict.unit.time.one", "admin.serviceHealthVerdict.unit.time.many"],
  account: [
    "admin.serviceHealthVerdict.unit.account.one",
    "admin.serviceHealthVerdict.unit.account.many",
  ],
  problem: [
    "admin.serviceHealthVerdict.unit.problem.one",
    "admin.serviceHealthVerdict.unit.problem.many",
  ],
} as const;

const plural = (count: number, unit: keyof typeof units, tr: Tr) =>
  count.toLocaleString() + tr(units[unit][count === 1 ? 0 : 1]);

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
        title: tr("admin.serviceHealthVerdict.thePlatformIsReturningServerErrors"),
        detail:
          plural(errors15m, "error", tr) +
          tr("admin.serviceHealthVerdict.inTheLastMinutes") +
          plural(errors1h, "error", tr) +
          tr("admin.serviceHealthVerdict.inTheLastHour"),
        target: "infrastructure",
      });
    else if (errors1h > 0)
      problems.push({
        key: "platform-recent",
        level: "watch",
        title: tr("admin.serviceHealthVerdict.serverErrorsInTheLastHour"),
        detail:
          plural(errors1h, "error", tr) +
          tr("admin.serviceHealthVerdict.noneInTheLastMinutes") +
          plural(errors24h, "error", tr) +
          tr("admin.serviceHealthVerdict.inHours"),
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
        title: tr("admin.serviceHealthVerdict.aPlatformDependencyIsDegraded"),
        detail: deps.map(([name, status]) => name + " · " + status).join(" / "),
        target: "infrastructure",
      });
    const devices = health.deviceExecution;
    if (devices?.coverage === "observed" && devices.affectedDevices > 0)
      problems.push({
        key: "devices",
        level: "watch",
        title: tr("admin.serviceHealthVerdict.computersAreNotCompletingCalls"),
        detail:
          plural(devices.affectedDevices, "computer", tr) +
          tr("admin.serviceHealthVerdict.affectedInMinutes") +
          plural(devices.timeouts, "timeout", tr) +
          " · " +
          plural(devices.offlineCalls, "offline-call", tr),
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
        (domain ? tr(domain) : group.domain) +
        " · " +
        group.code +
        " · " +
        plural(group.total, "time", tr) +
        " · " +
        plural(group.affectedUsers, "account", tr),
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
    ok: tr("admin.serviceHealthVerdict.everythingIsWorking"),
    watch: tr("admin.serviceHealthVerdict.workingWithProblemsToLookAt"),
    broken: tr("admin.serviceHealthVerdict.somethingIsBrokenRightNow"),
    unknown: tr("admin.serviceHealthVerdict.healthCouldNotBeChecked"),
  }[level];
  const summary =
    level === "unknown"
      ? tr("admin.serviceHealthVerdict.refreshInAMomentIfIt")
      : level === "ok"
        ? tr("admin.serviceHealthVerdict.noServerErrorsInTheLast")
        : plural(problems.length, "problem", tr) +
          tr("admin.serviceHealthVerdict.mostUrgentFirst") +
          (more > 0 ? tr("admin.serviceHealthVerdict.moreErrorCodesAreListedBelow", { more }) : "");
  return { level, headline, summary, problems, expected };
}
