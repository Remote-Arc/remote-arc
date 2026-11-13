import type { MessageKey, Translate } from "../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { ProductIcon } from "../../components/product-icon.js";
import { AdminUserUsageInsights } from "./user-usage-insights.js";
import {
  ACTIVATION_STAGES,
  type ActivationEvidence,
  type ActivationSort,
  type ActivationStage,
} from "../../../../../packages/protocol/src/admin-activation.js";
import { UserActivationBadge, UserActivationEvidence } from "./user-activation.js";
import {
  DEFAULT_FLEET_FILTER,
  FleetFilterControls,
  PairingRefusalBadge,
  fleetFilterParams,
} from "./admin-fleet-filters.js";
import "../../styles/admin/admin-operations.css";

type DeviceCapacityGrant = {
  id: string;
  user_id: string;
  email: string;
  extra_devices: number;
  reason: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
type PlusGrant = {
  id: string;
  email: string;
  expires_at: string | null;
  revoked_at: string | null;
  reason: string;
  created_at: string;
  plan: string;
};

type Account = ActivationEvidence & {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
  created_at: string;
  used: number;
  extra: number;
  allowance: number | null;
  device_count: number;
  computer_count: number;
  computer_limit: number | null;
  online_devices: number;
  online_computers: number | null;
  agent_versions: string[];
  last_activity: string | null;
  has_plus_grant: number;
  linked_login: "google" | "email_only";
  first_mcp_client: string | null;
  live_agent_versions: string[];
  live_status_verified: boolean;
  connect_trial_ends_at?: string | null;
  slow_lane_calls?: number;
  /** The plan that sets the Connect allowance, including paid subscriptions. */
  plan_label?: string;
  /** Computers refused at the plan limit in the last 30 days; null when unknown. */
  pairing_limit_refusals?: number | null;
};

/** Free accounts past their limit: the one-time 7-day trial, then the slow lane. */
function overflowState(user: Account, checkedAt: string | undefined) {
  // A paid or unlimited account is no longer bound by the Free allowance.
  if (!user.connect_trial_ends_at || user.allowance === null) return null;
  if (checkedAt && user.connect_trial_ends_at > checkedAt) return "trial" as const;
  return user.allowance !== null && user.used >= user.allowance ? ("slow" as const) : null;
}
type Computer = {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  arch: string | null;
  last_seen: string | null;
  created_at: string;
  online: boolean;
  statusVerified: boolean;
  agent_version: string | null;
  background_agent_version: string | null;
  recovery_bundle_version: string | null;
};
type Hour = { hour: string; calls: number; users: number };
type OperationsData = {
  checkedAt: string;
  month: string;
  page: number;
  pageSize: number;
  creditsReady: boolean;
  // Null means not read for this view, or its section is unavailable.
  totals: {
    users: number | null;
    devices: number | null;
    online: number | null;
    auditRows: number | null;
    auditLast7d: number | null;
    monthlyCalls: number | null;
  };
  unavailable?: OperationsSection[];
  limits: { free: number; plus: number };
  users: Account[];
  devices: Computer[];
  activity: Hour[] | null;
  filteredTotal: number;
  activationCounts: Record<ActivationStage, number>;
  billing: {
    actualUsd: number | null;
    source: string;
    billingUrl: string;
    note: string;
    services: string[];
  };
};
type LiveBilling = {
  connected: boolean;
  total: number;
  currency: string;
  from: string;
  to: string;
  source: string;
  services: Array<{ name: string; cost: number }>;
  note: string;
};
type Section = "users" | "devices" | "activity" | "costs";
type OperationsSection = "users" | "devices" | "totals" | "activity";
const relative = (value: string | null, tr: Translate) => {
  if (!value) return "—";
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return "—";
  if (diff < 60_000) return tr("admin.adminOperations.justNow");
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
};
const fmt = (v: number) => new Intl.NumberFormat("en").format(v);
const count = (v: number | null | undefined) => (v == null ? "—" : fmt(v));
const sectionNames: Record<OperationsSection, MessageKey> = {
  users: "admin.adminOperations.unavailableUsers",
  devices: "admin.adminOperations.unavailableDevices",
  totals: "admin.adminOperations.unavailableTotals",
  activity: "admin.adminOperations.unavailableActivity",
};

export function AdminOperations({
  readOnly = false,
  embedded = false,
}: { readOnly?: boolean; embedded?: boolean } = {}) {
  const { tr, locale } = useI18n();
  const [section, setSection] = useState<Section>("users");
  const [liveBilling, setLiveBilling] = useState<LiveBilling | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [arcBilling, setArcBilling] = useState<{
    month: string;
    paidRevenueUsd: number;
    modelRatedCostUsd: number;
    heldModelMaximumUsd: number;
    creditsPending: number;
    unresolvedPayments: Array<{ id: string; error_code: string | null }>;
  } | null>(null);
  const [arcBillingError, setArcBillingError] = useState(""),
    [arcBillingLoading, setArcBillingLoading] = useState(false);
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ActivationSort>("usage");
  const [activation, setActivation] = useState<ActivationStage | "all">("all");
  const [fleet, setFleet] = useState(DEFAULT_FLEET_FILTER);
  const [appliedQuery, setAppliedQuery] = useState("");
  const requestSequence = useRef(0);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const userDetailDialog = useRef<HTMLDialogElement>(null);
  const userDetailTitle = useId();
  const [credit, setCredit] = useState("500");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [deviceGrants, setDeviceGrants] = useState<DeviceCapacityGrant[]>([]);
  const [deviceExtra, setDeviceExtra] = useState("2");
  const [deviceDuration, setDeviceDuration] = useState("30");
  const [deviceUntil, setDeviceUntil] = useState("");
  const [deviceReason, setDeviceReason] = useState("Additional computers for customer support");
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState("");
  const [plusGrants, setPlusGrants] = useState<PlusGrant[]>([]);
  const [plusDuration, setPlusDuration] = useState("30");
  const [plusCustomUntil, setPlusCustomUntil] = useState("");
  const [plusReason, setPlusReason] = useState("Admin-issued Plus access");
  const [plusBusy, setPlusBusy] = useState(false);
  const [plusNotice, setPlusNotice] = useState("");
  const pendingCreditRequest = useRef<{ key: string; requestId: string } | null>(null);

  async function refresh(pageToLoad = page) {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const parameters = new URLSearchParams({
        page: String(pageToLoad),
        activation,
        sort,
        query: appliedQuery,
        ...fleetFilterParams(fleet),
        auditTotals: section === "costs" ? "1" : "0",
        // Only the Activity tab reads the chart history.
        activity: section === "activity" ? "1" : "0",
      });
      const res = await fetch("/api/admin/operations?" + parameters, {
        credentials: "same-origin",
      });
      if (!res.ok)
        throw new Error(
          tr("admin.adminOperations.adminMetricsCouldNotBeLoaded") + " · " + res.status,
        );
      const result = (await res.json().then(canonicalErrorEnvelope)) as OperationsData;
      if (sequence !== requestSequence.current) return;
      setData(result);
      setError("");
    } catch (cause) {
      if (sequence === requestSequence.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    void refresh(page);
    return () => {
      requestSequence.current++;
    };
  }, [page, activation, sort, appliedQuery, fleet, section === "costs", section === "activity"]);
  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery === appliedQuery) return;
    const timer = setTimeout(() => {
      setPage(0);
      setSelectedUser(null);
      setAppliedQuery(nextQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, appliedQuery]);

  const filtered = data?.users || [];
  const missing = data?.unavailable || [];
  const chosen = data?.users.find((u) => u.id === selectedUser) || null;
  const userDetailBusy = saving || deviceBusy || plusBusy;
  useEffect(() => {
    const dialog = userDetailDialog.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [chosen?.id]);
  const activeDeviceGrants = deviceGrants.filter(
    (g) => !g.revoked_at && (!g.expires_at || Date.parse(g.expires_at) > Date.now()),
  );
  const activeDeviceExtra = activeDeviceGrants.reduce((total, g) => total + g.extra_devices, 0);
  const activePlusGrant =
    plusGrants.find(
      (g) => !g.revoked_at && (!g.expires_at || Date.parse(g.expires_at) > Date.now()),
    ) || null;
  useEffect(() => {
    let cancelled = false;
    setDeviceGrants([]);
    setDeviceNotice("");
    if (!chosen?.email || readOnly) return;
    void fetch("/api/admin/device-capacity?email=" + encodeURIComponent(chosen.email), {
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load device capacity grants");
        return response.json().then(canonicalErrorEnvelope) as Promise<{
          grants: DeviceCapacityGrant[];
        }>;
      })
      .then((payload) => {
        if (!cancelled) setDeviceGrants(payload.grants || []);
      })
      .catch((error) => {
        if (!cancelled) setDeviceNotice(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [chosen?.email, readOnly]);
  useEffect(() => {
    let cancelled = false;
    setPlusGrants([]);
    setPlusNotice("");
    if (!chosen?.email || readOnly) return;
    void fetch("/api/admin/plan-grants?email=" + encodeURIComponent(chosen.email), {
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load Plus grant history");
        return response.json().then(canonicalErrorEnvelope) as Promise<{ grants: PlusGrant[] }>;
      })
      .then((payload) => {
        if (!cancelled) setPlusGrants(payload.grants || []);
      })
      .catch((error) => {
        if (!cancelled) setPlusNotice(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [chosen?.email, readOnly]);
  const userNames = new Map((data?.users || []).map((u) => [u.id, u.email]));
  const hours = useMemo(() => {
    if (!data) return [];
    const amounts = new Map((data.activity || []).map((x) => [x.hour, x.calls]));
    const ending = Math.floor(Date.parse(data.checkedAt) / 3600_000) * 3600_000;
    return Array.from({ length: 48 }, (_, i) => {
      const instant = new Date(ending - (47 - i) * 3600_000);
      return {
        hour: instant.toISOString().slice(0, 13),
        calls: amounts.get(instant.toISOString().slice(0, 13)) || 0,
      };
    });
  }, [data]);
  const peak = Math.max(1, ...hours.map((h) => h.calls));
  const quietWindow = useMemo(() => {
    const list = data?.activity || [];
    // The chart covers 48 hours, so each hour of the day appears at most twice.
    const days = new Set(list.map((item) => item.hour.slice(0, 10)));
    if (days.size < 2 || list.reduce((sum, item) => sum + item.calls, 0) < 100) return null;
    const totals = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
    list.forEach((item) => {
      const index = Number(item.hour.slice(11, 13));
      if (index >= 0 && index < 24) totals[index]!.calls += item.calls;
    });
    return totals
      .sort((a, b) => a.calls - b.calls)
      .slice(0, 3)
      .map((x) => {
        const utc = new Date();
        utc.setUTCHours(x.hour, 0, 0, 0);
        const local = new Intl.DateTimeFormat(locale === "zh" ? "zh-NZ" : "en-NZ", {
          timeZone: "Pacific/Auckland",
          hour: "2-digit",
          hour12: false,
        }).format(utc);
        return local + ":00";
      });
  }, [data, locale]);
  async function loadBilling() {
    if (billingLoading) return;
    setBillingLoading(true);
    setBillingError("");
    try {
      const response = await fetch("/api/admin/billing", { credentials: "same-origin" });
      const result = (await response.json().then(canonicalErrorEnvelope)) as LiveBilling & {
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Billing read unavailable");
      setLiveBilling(result);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : String(error));
      setLiveBilling(null);
    } finally {
      setBillingLoading(false);
    }
  }
  async function loadArcBilling() {
    if (readOnly || arcBillingLoading) return;
    setArcBillingLoading(true);
    setArcBillingError("");
    try {
      const response = await fetch("/api/admin/arc-billing", { credentials: "same-origin" });
      if (!response.ok) throw Error();
      setArcBilling(await response.json().then(canonicalErrorEnvelope));
    } catch {
      setArcBillingError(tr("admin.adminOperations.arcBillingDataIsTemporarilyUnavailable"));
    } finally {
      setArcBillingLoading(false);
    }
  }
  async function grantCredits() {
    if (readOnly || !chosen || !data || saving) return;
    const amount = Number(credit);
    if (
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      amount > 100000 ||
      reason.trim().length < 5
    ) {
      setNotice(tr("admin.adminOperations.enterCallsAndAReasonAt"));
      return;
    }
    if (
      !window.confirm(
        tr("admin.adminOperations.giveCallsFor", {
          email: chosen.email,
          amount: fmt(amount),
          month: data.month,
        }),
      )
    )
      return;
    const fingerprint = [chosen.id, data.month, amount, reason.trim()].join("|");
    if (!pendingCreditRequest.current || pendingCreditRequest.current.key !== fingerprint) {
      pendingCreditRequest.current = { key: fingerprint, requestId: crypto.randomUUID() };
    }
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/call-credits", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: chosen.id,
          amount,
          reason: reason.trim(),
          month: data.month,
          requestId: pendingCreditRequest.current!.requestId,
        }),
      });
      const payload = (await response.json().then(canonicalErrorEnvelope)) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to grant credits");
      pendingCreditRequest.current = null;
      setReason("");
      setNotice(tr("admin.adminOperations.monthlyBonusGrantedAndRecorded"));
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function refreshDeviceGrants(email: string) {
    const response = await fetch("/api/admin/device-capacity?email=" + encodeURIComponent(email), {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Failed to refresh extra device capacity");
    const payload = (await response.json().then(canonicalErrorEnvelope)) as {
      grants: DeviceCapacityGrant[];
    };
    setDeviceGrants(payload.grants || []);
  }
  async function addDeviceCapacity() {
    if (!chosen || readOnly || deviceBusy || chosen.role === "admin") return;
    const amount = Number(deviceExtra),
      reason = deviceReason.trim();
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 20) {
      setDeviceNotice(tr("admin.adminOperations.chooseAdditionalComputers"));
      return;
    }
    if (reason.length < 3 || reason.length > 500) {
      setDeviceNotice(tr("admin.adminOperations.enterAReasonCharacters"));
      return;
    }
    let expiresAt: string | null = null;
    if (deviceDuration === "custom") {
      const timestamp = Date.parse(deviceUntil);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        setDeviceNotice(tr("admin.adminOperations.chooseAFutureExpiry"));
        return;
      }
      expiresAt = new Date(timestamp).toISOString();
    } else if (deviceDuration !== "never") {
      expiresAt = new Date(Date.now() + Number(deviceDuration) * 86400000).toISOString();
    }
    if (
      !window.confirm(
        tr("admin.adminOperations.addComputersForUntil", {
          amount,
          email: chosen.email,
          expiresAt: expiresAt || tr("admin.adminOperations.manualRevocation"),
        }),
      )
    )
      return;
    setDeviceBusy(true);
    setDeviceNotice("");
    try {
      const response = await fetch("/api/admin/device-capacity", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: chosen.email,
          extra_devices: amount,
          expires_at: expiresAt,
          reason,
        }),
      });
      const payload = (await response.json().then(canonicalErrorEnvelope)) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not add devices");
      await Promise.all([refreshDeviceGrants(chosen.email), refresh()]);
      setDeviceNotice(tr("admin.adminOperations.extraComputersGrantedAndAudited"));
    } catch (error) {
      setDeviceNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setDeviceBusy(false);
    }
  }
  async function revokeDeviceCapacity(id: string) {
    if (!chosen || readOnly || deviceBusy) return;
    if (!window.confirm(tr("admin.adminOperations.revokeThisExtraComputerAllocation"))) return;
    setDeviceBusy(true);
    setDeviceNotice("");
    try {
      const response = await fetch(
        "/api/admin/device-capacity/" + encodeURIComponent(id) + "/revoke",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const payload = (await response.json().then(canonicalErrorEnvelope)) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not revoke devices");
      await Promise.all([refreshDeviceGrants(chosen.email), refresh()]);
      setDeviceNotice(tr("admin.adminOperations.extraComputerCapacityRevoked"));
    } catch (error) {
      setDeviceNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setDeviceBusy(false);
    }
  }
  async function refreshPlusGrants(email: string) {
    const response = await fetch("/api/admin/plan-grants?email=" + encodeURIComponent(email), {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Failed to refresh Plus grants");
    const payload = (await response.json().then(canonicalErrorEnvelope)) as { grants: PlusGrant[] };
    setPlusGrants(payload.grants || []);
  }
  async function grantPlus() {
    if (!chosen || readOnly || plusBusy || activePlusGrant) return;
    const reason = plusReason.trim();
    if (reason.length < 3 || reason.length > 500) {
      setPlusNotice(tr("admin.adminOperations.enterAReasonCharacters2"));
      return;
    }
    let expiresAt: string | null = null;
    if (plusDuration === "custom") {
      const timestamp = Date.parse(plusCustomUntil);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        setPlusNotice(tr("admin.adminOperations.chooseAFutureExpiry"));
        return;
      }
      expiresAt = new Date(timestamp).toISOString();
    } else if (plusDuration !== "never") {
      expiresAt = new Date(Date.now() + Number(plusDuration) * 86400000).toISOString();
    }
    if (
      !window.confirm(
        tr("admin.adminOperations.grantPlusToUntil", {
          email: chosen.email,
          expiresAt: expiresAt || tr("admin.adminOperations.manualRevocation"),
        }),
      )
    )
      return;
    setPlusBusy(true);
    setPlusNotice("");
    try {
      const response = await fetch("/api/admin/plan-grants", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: chosen.email, plan: "plus", reason, expires_at: expiresAt }),
      });
      const payload = (await response.json().then(canonicalErrorEnvelope)) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Plus grant failed");
      await Promise.all([refreshPlusGrants(chosen.email), refresh()]);
      setPlusNotice(tr("admin.adminOperations.plusGrantedTheExpiryAndAdministrator"));
    } catch (err) {
      setPlusNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setPlusBusy(false);
    }
  }
  async function revokePlus() {
    if (!chosen || !activePlusGrant || readOnly || plusBusy) return;
    if (
      !window.confirm(tr("admin.adminOperations.revokeThisPlusGrantFor", { email: chosen.email }))
    )
      return;
    setPlusBusy(true);
    setPlusNotice("");
    try {
      const response = await fetch(
        "/api/admin/plan-grants/" + encodeURIComponent(activePlusGrant.id) + "/revoke",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const payload = (await response.json().then(canonicalErrorEnvelope)) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Revoke failed");
      await Promise.all([refreshPlusGrants(chosen.email), refresh()]);
      setPlusNotice(tr("admin.adminOperations.plusGrantRevoked"));
    } catch (err) {
      setPlusNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setPlusBusy(false);
    }
  }

  const tabs: Array<[Section, MessageKey]> = [
    ["users", "admin.adminOperations.section.users"],
    ["devices", "admin.adminOperations.section.devices"],
    ["activity", "admin.adminOperations.section.activity"],
    ["costs", "admin.adminOperations.section.costs"],
  ];
  return (
    <section className="opsWrap">
      <div className="opsHeadline">
        <div>
          {!embedded && (
            <>
              <span className="eyebrow">{tr("admin.adminOperations.operationsAdminOnly")}</span>
              <h2>{tr("admin.adminOperations.usersDevicesCapacity")}</h2>
            </>
          )}
          <p>{tr("admin.adminOperations.liveSessionsUsageRecentDemandAnd")}</p>
        </div>
        <div className="opsFresh">
          <small>
            {data
              ? tr("admin.adminOperations.lastChecked") +
                " " +
                new Date(data.checkedAt).toLocaleTimeString()
              : ""}
          </small>
          <button className="ghostButton" onClick={() => void refresh()} disabled={loading}>
            {tr("admin.adminOperations.refresh")}
          </button>
        </div>
      </div>
      {error && (
        <div className="opsNotice" role="alert">
          {error}
        </div>
      )}
      {!error && missing.length > 0 && (
        <div className="opsNotice" role="alert">
          {tr("admin.adminOperations.someDataCouldNotBeLoaded") +
            missing.map((key) => tr(sectionNames[key])).join(" · ") +
            tr("admin.adminOperations.refreshToTryAgain")}
        </div>
      )}
      <div className="opsStats">
        <div>
          <span>{tr("admin.adminOperations.registeredUsers")}</span>
          <strong>{count(data?.totals.users)}</strong>
        </div>
        <div>
          <span>{tr("admin.adminOperations.pairedDevices")}</span>
          <strong>{count(data?.totals.devices)}</strong>
        </div>
        <div>
          <span>{tr("admin.adminOperations.onlineNow")}</span>
          <strong>{count(data?.totals.online)}</strong>
          <small>{tr("admin.adminOperations.verifiedAgainstDeviceConnections")}</small>
        </div>
        <div>
          <span>{tr("admin.adminOperations.toolCallsThisMonth")}</span>
          <strong>{count(data?.totals.monthlyCalls)}</strong>
        </div>
      </div>
      <nav className="opsTabs" aria-label={tr("admin.adminOperations.operationalViews")}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            onClick={() => setSection(id)}
          >
            {tr(label)}
          </button>
        ))}
      </nav>

      {section === "users" && (
        <div className="opsContent">
          <div className="opsToolbar">
            <div>
              <h3>{tr("admin.adminOperations.userManagement")}</h3>
              <p>{tr("admin.adminOperations.selectAUserToInspectUsage")}</p>
            </div>
            <div className="opsUsageControls">
              <label>
                {tr("admin.adminOperations.activationStage")}
                <select
                  aria-label={tr("admin.adminOperations.activationStage")}
                  value={activation}
                  onChange={(e) => {
                    setActivation(e.target.value as ActivationStage | "all");
                    setPage(0);
                    setSelectedUser(null);
                  }}
                >
                  <option value="all">{tr("admin.adminOperations.allStages")}</option>
                  {ACTIVATION_STAGES.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {tr(stage.en, stage.zh)}
                      {data ? ` (${data.activationCounts?.[stage.id] || 0})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("admin.adminOperations.sortUsers")}
                <select
                  aria-label={tr("admin.adminOperations.sortUsers")}
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as ActivationSort);
                    setPage(0);
                    setSelectedUser(null);
                  }}
                >
                  <option value="usage">{tr("admin.adminOperations.highestUsageFirst")}</option>
                  <option value="recent">{tr("admin.adminOperations.newestRegistered")}</option>
                  <option value="activation_asc">
                    {tr("admin.adminOperations.activationEarlyStagesFirst")}
                  </option>
                  <option value="activation_desc">
                    {tr("admin.adminOperations.activationLaterStagesFirst")}
                  </option>
                </select>
              </label>
              <FleetFilterControls
                value={fleet}
                onChange={(next) => {
                  setFleet(next);
                  setPage(0);
                  setSelectedUser(null);
                }}
              />
              <label>
                {tr("admin.adminOperations.searchUsers")}
                <input
                  placeholder={tr("admin.adminOperations.searchNameOrEmail")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
          </div>
          <p className="opsHelp opsActivationHelp">
            {tr("admin.adminOperations.activationFilteringSearchAndSortingCover")}
          </p>
          <div className="opsResultStatus" role="status" aria-live="polite">
            {loading
              ? tr("admin.adminOperations.loadingUsers")
              : tr("admin.adminOperations.matchingUsers", {
                  filteredTotal: data?.filteredTotal || 0,
                })}
          </div>
          <div
            className="opsUsagePulse"
            aria-label={tr("admin.adminOperations.usageStatusOnThisPage")}
          >
            <div>
              <strong>
                {filtered.filter((u) => u.allowance !== null && u.used >= u.allowance).length}
              </strong>
              <span>{tr("admin.adminOperations.atLimit")}</span>
            </div>
            <div>
              <strong>
                {
                  filtered.filter(
                    (u) =>
                      u.allowance !== null && u.used < u.allowance && u.used >= u.allowance * 0.8,
                  ).length
                }
              </strong>
              <span>{tr("admin.adminOperations.orMore")}</span>
            </div>
            <div>
              <strong>{filtered.filter((u) => u.extra > 0).length}</strong>
              <span>{tr("admin.adminOperations.withBonusCalls")}</span>
            </div>
            <div>
              <strong>
                {filtered.filter((u) => overflowState(u, data?.checkedAt) === "trial").length}
              </strong>
              <span>{tr("admin.adminOperations.inConnectTrial")}</span>
            </div>
            <small>{tr("admin.adminOperations.filteredUsersOnThisPageNot")}</small>
          </div>
          <div className="opsTableScroll">
            <table className="opsTable opsUsersTable">
              <thead>
                <tr>
                  <th>{tr("admin.adminOperations.account")}</th>
                  <th>{tr("admin.adminOperations.activation")}</th>
                  <th>{tr("admin.adminOperations.plan")}</th>
                  <th>{tr("admin.adminOperations.callsThisMonth")}</th>
                  <th title={tr("admin.adminOperations.onlineBoundDevices")}>
                    {tr("admin.adminOperations.devices")}
                  </th>
                  <th>{tr("admin.adminOperations.loginMcpClient")}</th>
                  <th>{tr("admin.adminOperations.agentVersion")}</th>
                  <th>{tr("admin.adminOperations.lastActivity")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className={u.id === selectedUser ? "selected" : ""}>
                    <td>
                      <strong>{u.name || u.email.split("@")[0]}</strong>
                      <small>{u.email}</small>
                    </td>
                    <td>
                      <UserActivationBadge evidence={u} />
                      <small>
                        {u.first_success_at
                          ? tr("admin.adminOperations.successRecorded")
                          : u.mcp_connections > 0
                            ? tr("admin.adminOperations.oauthRecorded")
                            : tr("admin.adminOperations.noSuccessRecorded")}
                      </small>
                    </td>
                    <td>
                      {u.plan_label ??
                        (u.role === "admin"
                          ? "Admin"
                          : u.plan === "plus" || u.has_plus_grant
                            ? "Plus"
                            : "Free")}
                    </td>
                    <td>
                      <strong>
                        {fmt(u.used)} / {u.allowance === null ? "∞" : fmt(u.allowance)}
                      </strong>
                      <div className="opsMeter">
                        <i
                          style={{
                            width: u.allowance
                              ? Math.min(100, (u.used / u.allowance) * 100) + "%"
                              : "0%",
                          }}
                        />
                      </div>
                      {overflowState(u, data?.checkedAt) === "trial" && (
                        <span className="opsQuotaState trial">
                          {tr("admin.adminOperations.connectTrialUntil", {
                            date: new Date(u.connect_trial_ends_at!).toLocaleDateString(),
                          })}
                        </span>
                      )}
                      {overflowState(u, data?.checkedAt) === "slow" && (
                        <span className="opsQuotaState slow">
                          {tr("admin.adminOperations.connectSlowLane", {
                            calls: fmt(u.slow_lane_calls || 0),
                          })}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={
                          "opsDeviceCount" +
                          (u.live_status_verified && u.online_computers ? " hasOnline" : "")
                        }
                        title={tr(
                          u.live_status_verified
                            ? "admin.adminOperations.onlineBoundDevices"
                            : "admin.adminOperations.liveStatusUnverified",
                        )}
                        aria-label={tr("admin.adminOperations.deviceCountLabel", {
                          online:
                            u.live_status_verified && u.online_computers != null
                              ? fmt(u.online_computers)
                              : "—",
                          total: u.computer_count == null ? "—" : fmt(u.computer_count),
                        })}
                      >
                        <i aria-hidden="true" />
                        <span className="opsDeviceOnline">
                          {u.live_status_verified && u.online_computers != null
                            ? fmt(u.online_computers)
                            : "—"}
                        </span>
                        <span className="opsDeviceDivider" aria-hidden="true">
                          /
                        </span>
                        <span className="opsDeviceTotal">
                          {u.computer_count == null ? "—" : fmt(u.computer_count)}
                        </span>
                      </span>
                      <PairingRefusalBadge count={u.pairing_limit_refusals} />
                    </td>
                    <td>
                      <strong>{u.linked_login === "google" ? "Google" : "Email"}</strong>
                      <small>
                        {u.first_mcp_client
                          ? tr("admin.adminOperations.reportedClient") + u.first_mcp_client
                          : tr("admin.adminOperations.noMcpConnectionRecorded")}
                      </small>
                    </td>
                    <td>
                      <small>{u.agent_versions?.length ? u.agent_versions.join(", ") : "—"}</small>
                    </td>
                    <td>{relative(u.last_activity, tr)}</td>
                    <td>
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => {
                          setSelectedUser(u.id);
                          setNotice("");
                        }}
                      >
                        {tr("admin.adminOperations.details")}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      {missing.includes("users")
                        ? tr("admin.adminOperations.theUserListCouldNotBeLoaded")
                        : tr("admin.adminOperations.noUsersMatchTheseFilters")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {chosen && (
            <dialog
              ref={userDetailDialog}
              className="opsUserDetailDialog"
              aria-labelledby={userDetailTitle}
              onClose={() => setSelectedUser(null)}
              onCancel={(event) => {
                if (userDetailBusy) event.preventDefault();
              }}
            >
              <header>
                <h3 id={userDetailTitle}>{chosen.name || chosen.email}</h3>
                <button
                  type="button"
                  className="ghostButton"
                  disabled={userDetailBusy}
                  onClick={() => userDetailDialog.current?.close()}
                  aria-label={tr("admin.adminOperations.close")}
                >
                  <ProductIcon name="close" size={16} />
                </button>
              </header>
              <AdminUserUsageInsights
                key={chosen.id}
                userId={chosen.id}
                used={chosen.used}
                allowance={chosen.allowance}
                extra={chosen.extra}
              />
              <div className="opsUserDetail">
                <div>
                  <p>
                    {chosen.email} · {tr("admin.adminOperations.joined")}{" "}
                    {new Date(chosen.created_at).toLocaleDateString()}
                  </p>
                  <p>
                    {tr("admin.adminOperations.monthlyPlanQuota")}:{" "}
                    {chosen.allowance === null ? "∞" : fmt(chosen.allowance - chosen.extra)} ·{" "}
                    {tr("admin.adminOperations.extraGranted")}: {fmt(chosen.extra)}
                  </p>
                  <UserActivationEvidence evidence={chosen} />
                </div>
                <div className="opsPlusGrant">
                  <div>
                    <h4>{tr("admin.adminOperations.additionalComputerSlots")}</h4>
                    <p>{tr("admin.adminOperations.extraSlotsAddToThePlan")}</p>
                    <p>
                      <strong>
                        {tr("admin.adminOperations.activeExtraSlots")}: +{activeDeviceExtra}
                      </strong>
                      {" · "}
                      {tr("admin.adminOperations.computersCurrentlyRegistered")}:{" "}
                      {chosen.computer_count ?? chosen.device_count}
                    </p>
                  </div>
                  <label>
                    {tr("admin.adminOperations.addComputers")}
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={deviceExtra}
                      disabled={deviceBusy || readOnly || chosen.role === "admin"}
                      onChange={(e) => setDeviceExtra(e.target.value)}
                    />
                  </label>
                  <label>
                    {tr("admin.adminOperations.duration")}
                    <select
                      value={deviceDuration}
                      disabled={deviceBusy || readOnly}
                      onChange={(e) => setDeviceDuration(e.target.value)}
                    >
                      <option value="7">{tr("admin.adminOperations.days")}</option>
                      <option value="30">{tr("admin.adminOperations.days2")}</option>
                      <option value="90">{tr("admin.adminOperations.days3")}</option>
                      <option value="365">{tr("admin.adminOperations.days4")}</option>
                      <option value="never">{tr("admin.adminOperations.untilRevoked")}</option>
                      <option value="custom">{tr("admin.adminOperations.customExpiry")}</option>
                    </select>
                  </label>
                  {deviceDuration === "custom" && (
                    <label>
                      {tr("admin.adminOperations.expiresAtLocalTime")}
                      <input
                        type="datetime-local"
                        value={deviceUntil}
                        onChange={(e) => setDeviceUntil(e.target.value)}
                        disabled={deviceBusy || readOnly}
                      />
                    </label>
                  )}
                  <label>
                    {tr("admin.adminOperations.reasonAudited")}
                    <input
                      value={deviceReason}
                      maxLength={500}
                      onChange={(e) => setDeviceReason(e.target.value)}
                      disabled={deviceBusy || readOnly}
                    />
                  </label>
                  <div className="opsPlusGrantActions">
                    <button
                      type="button"
                      className="primaryButton"
                      disabled={deviceBusy || readOnly || chosen.role === "admin"}
                      onClick={() => void addDeviceCapacity()}
                    >
                      {deviceBusy
                        ? tr("admin.adminOperations.saving")
                        : tr("admin.adminOperations.grantExtraSlots")}
                    </button>
                  </div>
                  {activeDeviceGrants.length > 0 && (
                    <div className="opsCapacityHistory">
                      {activeDeviceGrants.map((g) => (
                        <div key={g.id}>
                          <span>
                            +{g.extra_devices} ·{" "}
                            {g.expires_at
                              ? new Date(g.expires_at).toLocaleDateString()
                              : tr("admin.adminOperations.untilRevoked2")}{" "}
                            · {g.reason}
                          </span>
                          <button
                            type="button"
                            className="ghostButton"
                            disabled={deviceBusy || readOnly}
                            onClick={() => void revokeDeviceCapacity(g.id)}
                          >
                            {tr("admin.adminOperations.revoke")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {deviceNotice && <p role="status">{deviceNotice}</p>}
                </div>
                <div className="opsPlusGrant">
                  <div>
                    <h4>{tr("admin.adminOperations.plusMembership")}</h4>
                    <p>{tr("admin.adminOperations.grantConnectPlusWithAChosen")}</p>
                    {activePlusGrant ? (
                      <p>
                        <strong>{tr("admin.adminOperations.activePlusGrant")}</strong> ·{" "}
                        {activePlusGrant.expires_at
                          ? new Date(activePlusGrant.expires_at).toLocaleString()
                          : tr("admin.adminOperations.untilRevoked3")}
                      </p>
                    ) : (
                      <p>{tr("admin.adminOperations.noActiveAdministratorPlusGrant")}</p>
                    )}
                  </div>
                  <label>
                    {tr("admin.adminOperations.duration2")}
                    <select
                      aria-label={tr("admin.adminOperations.plusDuration")}
                      value={plusDuration}
                      disabled={plusBusy || !!activePlusGrant}
                      onChange={(e) => setPlusDuration(e.target.value)}
                    >
                      <option value="7">{tr("admin.adminOperations.days")}</option>
                      <option value="30">{tr("admin.adminOperations.days2")}</option>
                      <option value="90">{tr("admin.adminOperations.days3")}</option>
                      <option value="365">{tr("admin.adminOperations.days4")}</option>
                      <option value="never">{tr("admin.adminOperations.untilRevoked")}</option>
                      <option value="custom">{tr("admin.adminOperations.customExpiry")}</option>
                    </select>
                  </label>
                  {plusDuration === "custom" && (
                    <label>
                      {tr("admin.adminOperations.expiresAtLocalTime")}
                      <input
                        type="datetime-local"
                        value={plusCustomUntil}
                        onChange={(e) => setPlusCustomUntil(e.target.value)}
                        disabled={plusBusy || !!activePlusGrant}
                      />
                    </label>
                  )}
                  <label>
                    {tr("admin.adminOperations.reasonAudited2")}
                    <input
                      value={plusReason}
                      onChange={(e) => setPlusReason(e.target.value)}
                      maxLength={500}
                      disabled={plusBusy || !!activePlusGrant}
                    />
                  </label>
                  <div className="opsPlusGrantActions">
                    <button
                      className="primaryButton"
                      type="button"
                      onClick={() => void grantPlus()}
                      disabled={
                        readOnly || plusBusy || !!activePlusGrant || chosen.role === "admin"
                      }
                    >
                      {plusBusy
                        ? tr("admin.adminOperations.saving")
                        : tr("admin.adminOperations.grantPlus")}
                    </button>
                    {activePlusGrant && (
                      <button
                        type="button"
                        className="ghostButton"
                        onClick={() => void revokePlus()}
                        disabled={readOnly || plusBusy}
                      >
                        {tr("admin.adminOperations.revokeGrant")}
                      </button>
                    )}
                  </div>
                  {plusNotice && <p role="status">{plusNotice}</p>}
                </div>
                <div className="opsCreditForm">
                  <label>
                    {tr("admin.adminOperations.addCallsThisMonth")}
                    <input
                      type="number"
                      min={1}
                      max={100000}
                      value={credit}
                      onChange={(e) => setCredit(e.target.value)}
                    />
                  </label>
                  <label>
                    {tr("admin.adminOperations.reasonAudited3")}
                    <input
                      maxLength={300}
                      placeholder={tr("admin.adminOperations.eGEarlyAccessFeedback")}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button
                    className="primaryButton"
                    disabled={readOnly || saving || chosen.role === "admin" || !data?.creditsReady}
                    onClick={() => void grantCredits()}
                  >
                    {saving
                      ? tr("admin.adminOperations.saving2")
                      : tr("admin.adminOperations.grantMonthlyCalls")}
                  </button>
                  {!data?.creditsReady && (
                    <small>{tr("admin.adminOperations.creditGrantsWillBeAvailableAfter")}</small>
                  )}
                  {notice && <small role="status">{notice}</small>}
                </div>
              </div>
            </dialog>
          )}
          <div className="opsPages">
            <button
              disabled={page === 0 || loading}
              onClick={() => {
                setPage((p) => Math.max(0, p - 1));
                setSelectedUser(null);
              }}
            >
              {tr("admin.adminOperations.previous")}
            </button>
            <span>
              {page + 1} /{" "}
              {Math.max(1, Math.ceil((data?.filteredTotal || 1) / (data?.pageSize || 30)))}
            </span>
            <button
              disabled={!data || loading || (page + 1) * data.pageSize >= data.filteredTotal}
              onClick={() => {
                setPage((p) => p + 1);
                setSelectedUser(null);
              }}
            >
              {tr("admin.adminOperations.next")}
            </button>
          </div>
        </div>
      )}

      {section === "devices" && (
        <div className="opsContent">
          <div className="opsToolbar">
            <div>
              <h3>{tr("admin.adminOperations.connectedComputers")}</h3>
              <p>{tr("admin.adminOperations.onlineIsCheckedFromActiveWebsocket")}</p>
            </div>
          </div>
          <div className="opsTableScroll">
            <table className="opsTable">
              <thead>
                <tr>
                  <th>{tr("admin.adminOperations.device")}</th>
                  <th>{tr("admin.adminOperations.owner")}</th>
                  <th>{tr("admin.adminOperations.platform")}</th>
                  <th>{tr("admin.adminOperations.status")}</th>
                  <th>{tr("admin.adminOperations.remotelinkVersion")}</th>
                  <th>{tr("admin.adminOperations.lastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.devices || []).map((device) => (
                  <tr key={device.id}>
                    <td>
                      <strong>{device.name}</strong>
                      <small>{device.id.slice(0, 8)}…</small>
                    </td>
                    <td>{userNames.get(device.user_id) || device.user_id.slice(0, 8) + "…"}</td>
                    <td>
                      {device.platform} {device.arch || ""}
                    </td>
                    <td>
                      <span className={device.online ? "opsOnline" : ""}>
                        {!device.statusVerified
                          ? tr("admin.adminOperations.unverified")
                          : device.online
                            ? tr("admin.adminOperations.online")
                            : tr("admin.adminOperations.offline")}
                      </span>
                    </td>
                    <td>
                      <strong>{device.agent_version || "—"}</strong>
                      {device.background_agent_version && (
                        <small>
                          {tr("admin.adminOperations.background")}:{" "}
                          {device.background_agent_version}
                        </small>
                      )}
                    </td>
                    <td>{relative(device.last_seen, tr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "activity" && (
        <div className="opsContent">
          <div className="opsToolbar">
            <div>
              <h3>{tr("admin.adminOperations.toolActivityLastHours")}</h3>
              <p>{tr("admin.adminOperations.hourlyAuditEventsUtcUseRepeated")}</p>
            </div>
          </div>
          <div
            className="opsChart"
            role="img"
            aria-label={tr("admin.adminOperations.hourlyToolCallActivity")}
          >
            {hours.map((h, i) => (
              <div className="opsChartBar" key={h.hour} title={h.hour + " UTC · " + h.calls}>
                <div style={{ height: Math.max(2, (h.calls / peak) * 100) + "%" }} />
                {(i % 6 === 0 || i === 47) && <small>{h.hour.slice(11)}h</small>}
              </div>
            ))}
          </div>
          <p className="opsHelp">
            {tr("admin.adminOperations.toolCallsInTheLastHours") +
              count(data?.activity ? hours.reduce((sum, h) => sum + h.calls, 0) : null)}
          </p>
          <p className="opsHelp">
            {quietWindow
              ? tr("admin.adminOperations.lowerActivityHoursInTheLastHours") +
                quietWindow.join(" · ") +
                tr("admin.adminOperations.treatAsAPlanningHintNot")
              : tr("admin.adminOperations.notEnoughActivityInTheLastHours")}
          </p>
          <p className="opsHelp">
            {tr("admin.adminOperations.countsDeriveFromRecordedAuditEvents")}
          </p>
        </div>
      )}

      {section === "costs" && (
        <div className="opsContent">
          <div className="opsToolbar">
            <div>
              <h3>{tr("admin.adminOperations.arcSubscriptionsModelUsage")}</h3>
              <p>{tr("admin.adminOperations.verifiedReceiptsRatedModelCostsAnd")}</p>
            </div>
            <button
              className="ghostButton"
              disabled={readOnly || arcBillingLoading}
              onClick={() => void loadArcBilling()}
            >
              {arcBillingLoading
                ? tr("admin.adminOperations.loading")
                : tr("admin.adminOperations.fetchArcBilling")}
            </button>
          </div>
          {arcBillingError && <p role="alert">{arcBillingError}</p>}
          {arcBilling && (
            <>
              <div className="opsCostGrid">
                <div>
                  <span>{tr("admin.adminOperations.paidReceiptValue") + arcBilling.month}</span>
                  <strong>${arcBilling.paidRevenueUsd.toFixed(2)}</strong>
                  <small>{tr("admin.adminOperations.excludesTaxAndRefundedReceipts")}</small>
                </div>
                <div>
                  <span>{tr("admin.adminOperations.ratedModelUsage")}</span>
                  <strong>${arcBilling.modelRatedCostUsd.toFixed(2)}</strong>
                  <small>{tr("admin.adminOperations.providerInvoicesCanDiffer")}</small>
                </div>
                <div>
                  <span>{tr("admin.adminOperations.pendingModelMaximum")}</span>
                  <strong>${arcBilling.heldModelMaximumUsd.toFixed(2)}</strong>
                  <small>{arcBilling.creditsPending.toLocaleString()} Credits</small>
                </div>
              </div>
              <p className="opsHelp">{tr("admin.adminOperations.theseFiguresAreNotGrossMargin")}</p>
              {arcBilling.unresolvedPayments.length > 0 && (
                <div>
                  <h4>{tr("admin.adminOperations.paymentsNeedingReview")}</h4>
                  {arcBilling.unresolvedPayments.map((event) => (
                    <p key={event.id}>
                      <code>{event.id}</code> ·{" "}
                      {event.error_code || tr("admin.adminOperations.processing")}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="opsToolbar">
            <div>
              <h3>{tr("admin.adminOperations.cloudflareAccountCostVisibility")}</h3>
              <p>{tr("admin.adminOperations.billingCoversTheEntireMoviegoerCloudflare")}</p>
            </div>
          </div>
          <div className="opsCostGrid">
            <div>
              <span>{tr("admin.adminOperations.currentAccountUsageCost")}</span>
              <strong>
                {liveBilling
                  ? liveBilling.currency + " " + liveBilling.total.toFixed(2)
                  : tr("admin.adminOperations.notConnected")}
              </strong>
              <small>
                {liveBilling
                  ? liveBilling.from +
                    " – " +
                    liveBilling.to +
                    " · " +
                    tr("admin.adminOperations.cloudflareDailyUpdatedUsageNotInvoice")
                  : tr("admin.adminOperations.billingReadTokenRequiredNoFabricated")}
              </small>
            </div>
            <div>
              <span>{tr("admin.adminOperations.d1AuditRows")}</span>
              <strong>{data?.totals.auditRows == null ? "—" : fmt(data.totals.auditRows)}</strong>
              <small>{tr("admin.adminOperations.storageActivityNotACurrencyCharge")}</small>
            </div>
            <div>
              <span>{tr("admin.adminOperations.monthlyMcpToolCalls")}</span>
              <strong>{count(data?.totals.monthlyCalls)}</strong>
              <small>{tr("admin.adminOperations.trackedByRemoteArcD1Not")}</small>
            </div>
          </div>
          <div className="opsToolbar">
            <button
              className="ghostButton"
              onClick={() => void loadBilling()}
              disabled={billingLoading}
            >
              {billingLoading
                ? tr("admin.adminOperations.loadingBilling")
                : tr("admin.adminOperations.fetchCloudflareCost")}
            </button>
            {billingError && (
              <small role="status">
                {billingError === "BILLING_READ_TOKEN_NOT_CONFIGURED"
                  ? tr("admin.adminOperations.addADedicatedBillingReadApi")
                  : billingError}
              </small>
            )}
          </div>
          {liveBilling && (
            <div className="opsContent">
              {liveBilling.services.map((x) => (
                <p key={x.name}>
                  <strong>{x.name}</strong>: {liveBilling.currency} {x.cost.toFixed(2)}
                </p>
              ))}
              <small>{liveBilling.note}</small>
            </div>
          )}
          <p className="opsHelp">{tr("admin.adminOperations.relayCurrentlyUsesWorkersD1And")}</p>
          <a
            className="opsBillingLink"
            href={data?.billing.billingUrl || "https://dash.cloudflare.com/"}
            target="_blank"
            rel="noreferrer"
          >
            {tr("admin.adminOperations.openActualCloudflareBilling")} ↗
          </a>
          <p className="opsHelp">{tr("admin.adminOperations.noAdditionalPaidBillingApiOr")}</p>
        </div>
      )}
    </section>
  );
}
