import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import type { MessageKey } from "../../locales/locale-catalog.js";
import {
  ADMIN_PLAN_FILTERS,
  type AdminPlanFilter,
} from "../../../../../packages/protocol/src/admin-activation.js";
import "../../styles/admin/admin-fleet-filters.css";

/** Finds accounts that run, or want, several computers, and narrows them to a
 * plan. Mirrors the min_computers, platform, limit_refused and plan parameters of
 * /api/admin/operations. */
export type FleetFilter = {
  minComputers: number;
  platform: "" | "linux" | "darwin" | "win32";
  limitRefused: boolean;
  plan: AdminPlanFilter;
};

export const DEFAULT_FLEET_FILTER: FleetFilter = {
  minComputers: 0,
  platform: "",
  limitRefused: false,
  plan: "all",
};

const COMPUTER_MINIMUMS = [2, 3, 5, 10] as const;
const PLAN_LABELS = {
  all: "admin.adminFleetFilters.anyPlan",
  paid: "admin.adminFleetFilters.paidPlans",
  pro: "admin.adminFleetFilters.planPro",
  max: "admin.adminFleetFilters.planMax",
  plus: "admin.adminFleetFilters.planPlus",
  free: "admin.adminFleetFilters.planFree",
  admin: "admin.adminFleetFilters.planAdmin",
} as const satisfies Record<AdminPlanFilter, MessageKey>;

export function fleetFilterParams(filter: FleetFilter): Record<string, string> {
  return {
    ...(filter.minComputers > 0 ? { min_computers: String(filter.minComputers) } : {}),
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...(filter.limitRefused ? { limit_refused: "1" } : {}),
    ...(filter.plan !== "all" ? { plan: filter.plan } : {}),
  };
}

export function FleetFilterControls({
  value,
  onChange,
}: {
  value: FleetFilter;
  onChange: (next: FleetFilter) => void;
}) {
  const { tr } = useI18n();
  return (
    <>
      <label>
        {tr("admin.adminFleetFilters.plan")}
        <select
          aria-label={tr("admin.adminFleetFilters.plan")}
          value={value.plan}
          onChange={(e) => onChange({ ...value, plan: e.target.value as AdminPlanFilter })}
        >
          {ADMIN_PLAN_FILTERS.map((plan) => (
            <option key={plan} value={plan}>
              {tr(PLAN_LABELS[plan])}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("admin.adminFleetFilters.computers")}
        <select
          aria-label={tr("admin.adminFleetFilters.computers")}
          value={value.minComputers}
          onChange={(e) => onChange({ ...value, minComputers: Number(e.target.value) })}
        >
          <option value={0}>{tr("admin.adminFleetFilters.anyNumber")}</option>
          {COMPUTER_MINIMUMS.map((count) => (
            <option key={count} value={count}>
              {tr("admin.adminFleetFilters.atLeast", { count })}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("admin.adminFleetFilters.platform")}
        <select
          aria-label={tr("admin.adminFleetFilters.platform")}
          value={value.platform}
          onChange={(e) =>
            onChange({ ...value, platform: e.target.value as FleetFilter["platform"] })
          }
        >
          <option value="">{tr("admin.adminFleetFilters.anyPlatform")}</option>
          <option value="linux">Linux</option>
          <option value="darwin">macOS</option>
          <option value="win32">Windows</option>
        </select>
      </label>
      <label>
        {tr("admin.adminFleetFilters.limitRefusals")}
        <select
          aria-label={tr("admin.adminFleetFilters.limitRefusals")}
          value={value.limitRefused ? "1" : ""}
          onChange={(e) => onChange({ ...value, limitRefused: e.target.value === "1" })}
        >
          <option value="">{tr("admin.adminFleetFilters.anyRefusals")}</option>
          <option value="1">{tr("admin.adminFleetFilters.refusedAComputer")}</option>
        </select>
      </label>
    </>
  );
}

/** Pairing attempts refused at the plan limit in the last 30 days (a retry
 * counts again); nothing when none. */
export function PairingRefusalBadge({ count }: { count: number | null | undefined }) {
  const { tr } = useI18n();
  if (!count) return null;
  return (
    <span
      className="opsQuotaState opsPairingRefusals"
      title={tr("admin.adminFleetFilters.refusalsExplanation")}
    >
      {tr("admin.adminFleetFilters.refusals", { count })}
    </span>
  );
}
