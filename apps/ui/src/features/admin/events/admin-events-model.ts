import type { MessageKey } from "../../../locales/locale-catalog.js";
import type { Translate } from "../../../locales/locale-catalog.js";
export type { Translate } from "../../../locales/locale-catalog.js";
export type SceneId = "login" | "devices" | "payment" | "tasks";
export type Step = {
  key: string;
  count: number;
  rate: number | null;
  previousRate: number | null;
  dropoff: number;
};
export type Orders = {
  total: number;
  ready: number;
  paid: number;
  fulfilled: number;
  pending: number;
  refunded: number;
  unattributed: number;
};
export type Scene = {
  id: string;
  total: number;
  completed: number;
  rate: number | null;
  pending: number;
  failed: number;
  unfinished: number;
  incompleteEvidence: number;
  steps: Step[];
  historyUnmeasured?: number;
  cancelled?: number;
  unknown?: number;
  orders?: Orders;
};
export type Summary = {
  newUsers: number;
  activeUsers: number;
  payingUsers: number;
  paidCents: number;
  newPaired: number;
  newUsed: number;
  newPaid: number;
};
export type RetentionCell = {
  day: number;
  status: "ready" | "observing" | "not_collected";
  returned: number;
  eligible: number;
  rate: number | null;
};
export type Analytics = {
  checkedAt: string;
  days: number;
  from: string;
  to: string;
  timezone: string;
  previousFrom: string;
  previousTo: string;
  summary: Summary;
  scenes: Scene[];
  loginMethods: Scene[];
  previous: { summary: Summary; scenes: Scene[]; loginMethods: Scene[] };
  trend: { day: string; newUsers: number; activeUsers: number; payingUsers: number }[];
  retention: RetentionCell[];
  cohorts: { day: string; users: number; cells: RetentionCell[] }[];
  coverage: {
    flowSince: string | null;
    activityCompleteFrom: string | null;
    oldestEvent: string | null;
    recordedEvents: number | null;
    includesInternalAccounts: boolean;
  };
};
export function percent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? (value * 100).toFixed(1).replace(/\.0$/, "") + "%"
    : "—";
}
export function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}
export function percentagePoints(
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  return typeof current === "number" && typeof previous === "number"
    ? Math.round((current - previous) * 1000) / 10
    : null;
}
export function sceneName(id: string, tr: Translate) {
  return (
    (
      {
        login: tr("admin.events.adminEventsModel.signIn"),
        devices: tr("admin.events.adminEventsModel.connectADevice"),
        payment: tr("admin.events.adminEventsModel.purchase"),
        tasks: tr("admin.events.adminEventsModel.runATask"),
        email_login: tr("admin.events.adminEventsModel.emailCode"),
        google_login: tr("admin.events.adminEventsModel.googleSignIn"),
      } as Record<string, string>
    )[id] || id
  );
}
export function stepName(scene: string, key: string, tr: Translate) {
  const labels: Record<string, Record<string, MessageKey>> = {
    login: {
      started: "admin.events.adminEventsModel.startedSignIn",
      verification: "admin.events.adminEventsModel.enteredVerification",
      verified: "admin.events.adminEventsModel.identityVerified",
      completed: "admin.events.adminEventsModel.signedIn",
    },
    email_login: {
      started: "admin.events.adminEventsModel.codeRequested",
      delivered: "admin.events.adminEventsModel.emailAcceptedBySender",
      verification: "admin.events.adminEventsModel.codeSubmitted",
      verified: "admin.events.adminEventsModel.codeVerified",
      completed: "admin.events.adminEventsModel.signedIn",
    },
    google_login: {
      started: "admin.events.adminEventsModel.startedGoogleSignIn",
      callback: "admin.events.adminEventsModel.returnedFromGoogle",
      verified: "admin.events.adminEventsModel.identityVerified",
      completed: "admin.events.adminEventsModel.signedIn",
    },
    devices: {
      started: "admin.events.adminEventsModel.pairingStarted",
      approved: "admin.events.adminEventsModel.connectionApproved",
      online: "admin.events.adminEventsModel.deviceConnected",
    },
    payment: {
      entered: "admin.events.adminEventsModel.openedPurchasePage",
      ordered: "admin.events.adminEventsModel.orderCreated",
      paid: "admin.events.adminEventsModel.paymentConfirmed",
      fulfilled: "admin.events.adminEventsModel.accessDelivered",
    },
    tasks: {
      started: "admin.events.adminEventsModel.taskCreated",
      succeeded: "admin.events.adminEventsModel.taskSucceeded",
    },
  };
  const label = labels[scene]?.[key];
  return label ? tr(label) : key;
}
export function biggestDrop(scene: Scene | undefined) {
  return (
    scene?.steps
      .slice(1)
      .reduce<Step | null>(
        (best, step) => (step.dropoff > (best?.dropoff || 0) ? step : best),
        null,
      ) || null
  );
}
export function retentionState(cell: RetentionCell | undefined, tr: Translate) {
  return !cell
    ? tr("admin.events.adminEventsModel.unavailable")
    : cell.status === "observing"
      ? tr("admin.events.adminEventsModel.stillObserving")
      : cell.status === "not_collected"
        ? tr("admin.events.adminEventsModel.notCollected")
        : !cell.eligible
          ? tr("admin.events.adminEventsModel.noEligibleUsers")
          : "";
}
export function validAnalytics(value: unknown): value is Analytics {
  if (!value || typeof value !== "object") return false;
  const data = value as Analytics,
    number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const fraction = (value: unknown) => value === null || (number(value) && Number(value) <= 1);
  const summary = (value: Summary) =>
    !!value &&
    [
      "newUsers",
      "activeUsers",
      "payingUsers",
      "paidCents",
      "newPaired",
      "newUsed",
      "newPaid",
    ].every((key) => number(value[key as keyof Summary]));
  const scene = (value: Scene) =>
    !!value &&
    number(value.total) &&
    number(value.completed) &&
    number(value.pending) &&
    number(value.unfinished) &&
    fraction(value.rate) &&
    Array.isArray(value.steps) &&
    value.steps.every(
      (step, index) =>
        typeof step.key === "string" &&
        number(step.count) &&
        step.count <= value.total &&
        (!index || step.count <= value.steps[index - 1]!.count) &&
        fraction(step.rate) &&
        fraction(step.previousRate),
    );
  return (
    typeof data.checkedAt === "string" &&
    Number.isFinite(Date.parse(data.checkedAt)) &&
    summary(data.summary) &&
    summary(data.previous?.summary) &&
    Array.isArray(data.scenes) &&
    ["login", "devices", "payment", "tasks"].every((id) =>
      data.scenes.some((value) => value.id === id && scene(value)),
    ) &&
    Array.isArray(data.loginMethods) &&
    data.loginMethods.every(scene) &&
    Array.isArray(data.previous.scenes) &&
    data.previous.scenes.every(scene) &&
    Array.isArray(data.previous.loginMethods) &&
    Array.isArray(data.retention) &&
    data.retention.every(
      (cell) =>
        [1, 7, 30].includes(cell.day) &&
        fraction(cell.rate) &&
        number(cell.eligible) &&
        number(cell.returned),
    ) &&
    Array.isArray(data.cohorts) &&
    data.cohorts.every(
      (row) => typeof row.day === "string" && number(row.users) && Array.isArray(row.cells),
    ) &&
    Array.isArray(data.trend) &&
    data.trend.every(
      (row) =>
        typeof row.day === "string" &&
        number(row.newUsers) &&
        number(row.activeUsers) &&
        number(row.payingUsers),
    ) &&
    !!data.coverage
  );
}
