import {
  FOLLOWUP_USAGE_FILTERS,
  type FollowupUsageFilter,
} from "../../../../../../packages/protocol/src/followup-usage.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { FollowupDetail } from "./admin-followup-detail.js";
import { FollowupBulk } from "./followup-bulk.js";
import { FollowupBatchHistory } from "./followup-batch-history.js";
import { FollowupLifecyclePanel } from "./followup-lifecycle.js";
import {
  followupApi,
  followupTime,
  followupStatus,
  followupReason,
  followupBudgetSummary,
  NEXT_STEP_TEMPLATE,
  type NextStep,
  type Person,
  type EmailDraft,
  type FollowupList,
  type FollowupTab,
} from "./followup-model.js";
import "../../../styles/admin/followups/admin-followups.css";

export function AdminFollowups() {
  const { tr, locale } = useI18n();
  const [data, setData] = useState<FollowupList | null>(null),
    [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<FollowupUsageFilter>("all");
  const selectionEpoch = useRef(0);
  const [query, setQuery] = useState(""),
    [segment, setSegment] = useState("all"),
    [tab, setTab] = useState<FollowupTab>("all"),
    [sort, setSort] = useState("due"),
    [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Person | null>(null),
    [checked, setChecked] = useState<string[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [view, setView] = useState<"contacts" | "batches">("contacts"),
    [bulk, setBulk] = useState(false),
    [batchId, setBatchId] = useState<string | null>(null),
    [bulkStatus, setBulkStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const drafts = useRef(new Map<string, EmailDraft>());
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const params = new URLSearchParams({
    segment,
    tab,
    query,
    sort,
    usage,
    page: String(page),
  }).toString();
  useEffect(() => {
    // Bulk history loads and refreshes its own data; the user list is read again on return.
    if (view === "batches") return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(
      () =>
        void followupApi<FollowupList>("?" + params, { signal: controller.signal })
          .then((value) => {
            if (!controller.signal.aborted) {
              setData(value);
              setLoading(false);
              setError("");
              setSelected((current) =>
                current ? value.items.find((person) => person.id === current.id) || current : null,
              );
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setLoading(false);
              setError(tr("admin.followups.adminFollowups.couldNotLoadUsers"));
            }
          }),
      150,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params, revision, locale, view]);
  const stepLabel = (step: NextStep) =>
    ({
      pair_computer: tr("admin.followups.adminFollowups.pairAComputer"),
      connect_ai: tr("admin.followups.adminFollowups.connectAnAiClient"),
      first_use: tr("admin.followups.adminFollowups.firstTask"),
      active: tr("admin.followups.adminFollowups.active"),
    })[step];
  const filters = [
    ["all", tr("admin.followups.adminFollowups.allProductActivity")],
    ...(["pair_computer", "connect_ai", "first_use"] as NextStep[]).map((step) => [
      "step:" + step,
      tr("admin.followups.adminFollowups.nextStep") + stepLabel(step),
    ]),
    ["device-only", tr("admin.followups.adminFollowups.computerPairedNoMcp")],
    ["unconnected", tr("admin.followups.adminFollowups.noConnections")],
    ["unused", tr("admin.followups.adminFollowups.noRecordedUsage")],
    ["active", tr("admin.followups.adminFollowups.hasUsedArcConnect")],
    ["due", tr("admin.followups.adminFollowups.reminderDue")],
    ["suppressed", tr("admin.followups.adminFollowups.doNotContact")],
  ];
  const tabs: [FollowupTab, string][] = [
    ["all", tr("admin.followups.adminFollowups.allUsers")],
    ["pending", tr("admin.followups.adminFollowups.toFollowUp")],
    ["contacted", tr("admin.followups.adminFollowups.contacted")],
    ["waiting", tr("admin.followups.adminFollowups.waitingForReply")],
    ["resolved", tr("admin.followups.adminFollowups.resolved")],
    ["suppressed", tr("admin.followups.adminFollowups.stopped")],
  ];
  const shortTime = (value: string) =>
    new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const statusLabel = (status: string) =>
    ({
      new: tr("admin.followups.adminFollowups.toFollowUp"),
      contacted: tr("admin.followups.adminFollowups.contacted"),
      waiting: tr("admin.followups.adminFollowups.waitingForReply"),
      resolved: tr("admin.followups.adminFollowups.resolved"),
      suppressed: tr("admin.followups.adminFollowups.stopped"),
    })[status] || status;
  const reset = () => {
    selectionEpoch.current++;
    setPage(0);
    setChecked([]);
    setNotice("");
  };
  const toggle = (ids: string[], check: boolean) => {
    const next = check
      ? [...new Set([...checked, ...ids])]
      : checked.filter((id) => !ids.includes(id));
    if (next.length > 100) {
      setError(tr("admin.followups.adminFollowups.selectUpToUsersPerBatch"));
      return;
    }
    setChecked(next);
    setError("");
  };
  const pageIds = data?.items.map((person) => person.id) || [],
    allPage = pageIds.length > 0 && pageIds.every((id) => checked.includes(id));
  async function selectMatching() {
    const epoch = selectionEpoch.current;
    setBusy(true);
    setError("");
    try {
      const value = await followupApi<{ ids: string[]; total: number }>("/selection?" + params);
      if (epoch === selectionEpoch.current) setChecked(value.ids);
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  async function updateStatus() {
    if (!bulkStatus) return;
    setBusy(true);
    setError("");
    try {
      await followupApi("/bulk-status", {
        method: "PATCH",
        body: JSON.stringify({ userIds: checked, status: bulkStatus }),
      });
      setChecked([]);
      setNotice(tr("admin.followups.adminFollowups.contactStatusUpdated"));
      setBulkStatus("");
      refresh();
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  const choice = (person: Person) => (
    <input
      type="checkbox"
      aria-label={tr("admin.followups.adminFollowups.select") + (person.name || person.email)}
      checked={checked.includes(person.id)}
      disabled={loading || busy}
      onChange={(event) => toggle([person.id], event.target.checked)}
    />
  );
  const due = (person: Person) =>
    Boolean(
      person.next_followup_at &&
      Date.parse(person.next_followup_at) <= Date.now() &&
      !person.suppressed_at &&
      person.status !== "resolved",
    );
  return (
    <section className="adminFollowups followupCrm">
      <div className="followupCrmTopbar">
        <p>
          <span className="followupCrmLiveDot" />
          {tr("admin.followups.adminFollowups.contactHistoryCurrentStatusAndReminders")}
          {data?.emailBudget && (
            <span
              className="followupBudget"
              title={tr("admin.followups.adminFollowups.sendingPausesAtTheseLimitsSign")}
            >
              {followupBudgetSummary(data.emailBudget)} ·{" "}
              {tr("admin.followups.adminFollowups.availableNow")}
              {data.emailBudget.remaining}
            </span>
          )}
          {Boolean(data?.counts?.due) && (
            <button
              type="button"
              className="followupDueLink"
              onClick={() => {
                setTab("pending");
                setSegment("due");
                setView("contacts");
                setSelected(null);
                reset();
              }}
            >
              {data!.counts.due} {tr("admin.followups.adminFollowups.remindersDue")} ↗
            </button>
          )}
        </p>
        <button
          type="button"
          className="adminOutlineBtn"
          aria-pressed={view === "batches"}
          onClick={() => {
            setView(view === "batches" ? "contacts" : "batches");
            setBatchId(null);
          }}
        >
          <Icon name="chat" size={15} />
          {view === "batches"
            ? tr("admin.followups.adminFollowups.userList")
            : tr("admin.followups.adminFollowups.bulkHistory")}
        </button>
      </div>
      {data?.funnel && view === "contacts" && (
        <ol
          className="followupFunnel"
          aria-label={tr("admin.followups.adminFollowups.activationFunnel")}
        >
          {(
            [
              [tr("admin.followups.adminFollowups.registered"), data.funnel.registered, null],
              [
                tr("admin.followups.adminFollowups.computerPaired"),
                data.funnel.paired,
                "pair_computer",
              ],
              [
                tr("admin.followups.adminFollowups.aiClientConnected"),
                data.funnel.connected,
                "connect_ai",
              ],
              [tr("admin.followups.adminFollowups.usedRemoteArc"), data.funnel.used, "first_use"],
            ] as [string, number, NextStep | null][]
          ).map(([label, count, stuck]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{count}</strong>
              {stuck && (
                <button
                  type="button"
                  className="followupTextButton"
                  aria-pressed={segment === "step:" + stuck}
                  onClick={() => {
                    setSegment("step:" + stuck);
                    setTab("all");
                    setSelected(null);
                    reset();
                  }}
                >
                  {tr("admin.followups.adminFollowups.stuckBeforeThis")}
                  {data.funnel![stuck]} →
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {view === "contacts" && data && (
        <FollowupLifecyclePanel summary={data.lifecycle} budget={data.emailBudget} />
      )}
      <div
        className="followupCrmTabs"
        role="tablist"
        aria-label={tr("admin.followups.adminFollowups.followUpStatus")}
      >
        {tabs.map(([value, label]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={view === "contacts" && tab === value}
            onClick={() => {
              setTab(value);
              setView("contacts");
              setSelected(null);
              reset();
            }}
          >
            <span>{label}</span>
            <strong>{data?.counts?.[value] ?? "—"}</strong>
          </button>
        ))}
      </div>
      {view === "batches" ? (
        <FollowupBatchHistory key={batchId || "history"} initialId={batchId} onUpdate={refresh} />
      ) : (
        <>
          <div className="adminFollowupFilters followupCrmFilters">
            <label>
              <Icon name="search" size={16} />
              <input
                type="search"
                aria-label={tr("admin.followups.adminFollowups.searchUsers")}
                placeholder={tr("admin.followups.adminFollowups.searchNameOrEmail")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  reset();
                }}
              />
            </label>
            <select
              aria-label={tr("admin.followups.adminFollowups.userSegment")}
              value={segment}
              onChange={(event) => {
                setSegment(event.target.value);
                reset();
              }}
            >
              {filters.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label={tr("admin.followups.adminFollowups.monthlyUsage")}
              value={usage}
              onChange={(event) => {
                setUsage(event.target.value as FollowupUsageFilter);
                setSelected(null);
                reset();
              }}
            >
              {FOLLOWUP_USAGE_FILTERS.map((item) => (
                <option key={item.id} value={item.id}>
                  {tr(item.en, item.zh)}
                </option>
              ))}
            </select>
            <select
              aria-label={tr("admin.followups.adminFollowups.sortUsers")}
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(0);
              }}
            >
              <option value="due">{tr("admin.followups.adminFollowups.nextActionFirst")}</option>
              <option value="recent">{tr("admin.followups.adminFollowups.newestUsers")}</option>
              <option value="last-contact">
                {tr("admin.followups.adminFollowups.recentlyContacted")}
              </option>
              <option value="name">{tr("admin.followups.adminFollowups.name")}</option>
            </select>
            <button
              type="button"
              className="adminOutlineBtn"
              aria-label={tr("admin.followups.adminFollowups.refreshUsers")}
              onClick={refresh}
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
          {error && (
            <p className="adminAlert" role="alert">
              {error}
              <button type="button" className="adminOutlineBtn" onClick={refresh}>
                {tr("admin.followups.adminFollowups.retry")}
              </button>
            </p>
          )}
          {notice && (
            <p className="adminFollowupNotice" role="status">
              <Icon name="check" size={15} />
              {notice}
            </p>
          )}
          <div className={"followupSelectionBar" + (checked.length ? " isSelected" : "")}>
            <label>
              <input
                type="checkbox"
                aria-label={tr("admin.followups.adminFollowups.selectUsersOnThisPage")}
                checked={allPage}
                disabled={loading || busy}
                onChange={(event) => toggle(pageIds, event.target.checked)}
              />
              <span>
                {checked.length
                  ? tr("admin.followups.adminFollowups.selected") +
                    checked.length +
                    tr("admin.followups.adminFollowups.users")
                  : (data?.total ?? "—") + tr("admin.followups.adminFollowups.users")}
              </span>
            </label>
            {checked.length ? (
              <>
                <button
                  type="button"
                  className="followupTextButton"
                  disabled={busy || loading}
                  onClick={() => void selectMatching()}
                >
                  {(data?.total || 0) > 100
                    ? tr("admin.followups.adminFollowups.selectFirstMatches")
                    : tr("admin.followups.adminFollowups.selectAllMatches")}
                </button>
                <button
                  type="button"
                  className="followupTextButton"
                  disabled={busy}
                  onClick={() => setChecked([])}
                >
                  {tr("admin.followups.adminFollowups.clear")}
                </button>
                <div className="followupSelectionActions">
                  <select
                    aria-label={tr("admin.followups.adminFollowups.setFollowUpStatus")}
                    value={bulkStatus}
                    disabled={busy}
                    onChange={(event) => setBulkStatus(event.target.value)}
                  >
                    <option value="">{tr("admin.followups.adminFollowups.changeStatus")}</option>
                    {["new", "contacted", "waiting", "resolved"].map((value) => (
                      <option key={value} value={value}>
                        {statusLabel(value)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="adminOutlineBtn"
                    disabled={busy || !bulkStatus}
                    onClick={() => void updateStatus()}
                  >
                    {tr("admin.followups.adminFollowups.apply")}
                  </button>
                  <button
                    type="button"
                    className="adminPrimaryBtn"
                    disabled={busy || loading || !data?.emailConfigured}
                    onClick={() => setBulk(true)}
                  >
                    {tr("admin.followups.adminFollowups.bulkEmail")} · {checked.length}
                    <Icon name="arrowUpRight" size={14} />
                  </button>
                </div>
              </>
            ) : (
              <span className="followupCrmHint">
                {tr("admin.followups.adminFollowups.selectUsersToSendABulk")}
              </span>
            )}
          </div>
          {!data && !error && (
            <WorkspaceLoading
              label={tr("admin.followups.adminFollowups.loadingUsers")}
              variant="rows"
            />
          )}
          {data?.items.length === 0 && (
            <div className="followupCrmEmpty">
              <Icon name="users" size={30} />
              <h3>{tr("admin.followups.adminFollowups.noUsersInThisView")}</h3>
              <p>{tr("admin.followups.adminFollowups.tryAnotherStatusOrClearThe")}</p>
              <button
                type="button"
                className="adminOutlineBtn"
                onClick={() => {
                  setQuery("");
                  setSegment("all");
                  setUsage("all");
                  setTab("all");
                  reset();
                }}
              >
                {tr("admin.followups.adminFollowups.showAllUsers")}
              </button>
            </div>
          )}
          <div className={selected ? "followupCrmSplit" : "followupCrmFull"} aria-busy={loading}>
            {selected ? (
              <aside
                className="followupCrmContacts"
                aria-label={tr("admin.followups.adminFollowups.usersToFollowUp")}
              >
                <button type="button" className="adminOutlineBtn" onClick={() => setSelected(null)}>
                  ← {tr("admin.followups.adminFollowups.backToFullList")}
                </button>
                {data?.items.map((person) => (
                  <div
                    key={person.id}
                    className="followupCrmContact"
                    data-active={selected.id === person.id}
                  >
                    {choice(person)}
                    <button
                      type="button"
                      aria-pressed={selected.id === person.id}
                      onClick={() => setSelected(person)}
                    >
                      <strong>{person.name || person.email}</strong>
                      <small>{person.email}</small>
                      <span className="followupStatus" data-status={followupStatus(person)}>
                        {statusLabel(followupStatus(person))}
                      </span>
                    </button>
                  </div>
                ))}
              </aside>
            ) : (
              <div className="followupCrmTableWrap">
                <table
                  className="followupCrmTable"
                  aria-label={tr("admin.followups.adminFollowups.userFollowUpList")}
                >
                  <thead>
                    <tr>
                      <th className="followupCheckCell">
                        <span className="followupSrOnly">
                          {tr("admin.followups.adminFollowups.select2")}
                        </span>
                      </th>
                      <th>{tr("admin.followups.adminFollowups.user")}</th>
                      <th>{tr("admin.followups.adminFollowups.followUpStatus")}</th>
                      <th>{tr("admin.followups.adminFollowups.productActivity")}</th>
                      <th>{tr("admin.followups.adminFollowups.lastContact")}</th>
                      <th>{tr("admin.followups.adminFollowups.nextAction")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((person) => (
                      <tr key={person.id} data-checked={checked.includes(person.id)}>
                        <td className="followupCheckCell">{choice(person)}</td>
                        <td>
                          <button
                            type="button"
                            className="followupPersonButton"
                            onClick={() => setSelected(person)}
                          >
                            <span className="adminFollowupAvatar">
                              {(person.name || person.email).slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{person.name || person.email}</strong>
                              <small>{person.email}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="followupStatus" data-status={followupStatus(person)}>
                            {statusLabel(followupStatus(person))}
                          </span>
                          {Boolean(person.queued_followups) && (
                            <small>{tr("admin.followups.adminFollowups.bulkEmailQueued")}</small>
                          )}
                          {person.feedback_count > 0 && (
                            <small>
                              {person.feedback_count}{" "}
                              {tr("admin.followups.adminFollowups.feedbackItems")}
                            </small>
                          )}
                        </td>
                        <td>
                          <span>
                            {person.devices} {tr("admin.followups.adminFollowups.devices")} ·{" "}
                            {person.calls.toLocaleString()}{" "}
                            {tr("admin.followups.adminFollowups.calls")}
                          </span>
                          {person.monthly_calls !== undefined && (
                            <small>
                              {tr("admin.followups.adminFollowups.thisMonth")}
                              {person.monthly_calls.toLocaleString()}
                              {person.monthly_limit === null
                                ? tr("admin.followups.adminFollowups.unlimited")
                                : person.monthly_limit !== undefined
                                  ? " / " + person.monthly_limit.toLocaleString()
                                  : ""}
                            </small>
                          )}
                          {person.devices > 0 && person.mcp_connections === 0 ? (
                            <small className="followupMcpLabel">
                              {tr("admin.followups.adminFollowups.mcpSetupIncomplete")}
                            </small>
                          ) : (
                            <small>
                              {person.mcp_connections || 0} MCP · {person.apps} Apps
                            </small>
                          )}
                          {person.next_step &&
                            person.next_step !== "active" &&
                            !person.suppressed_at && (
                              <small className="followupNextStep">
                                {tr("admin.followups.adminFollowups.next")}
                                {stepLabel(person.next_step)}
                              </small>
                            )}
                        </td>
                        <td data-label={tr("admin.followups.adminFollowups.lastContact")}>
                          {person.last_contact_at ? (
                            <time
                              dateTime={person.last_contact_at}
                              title={followupTime(person.last_contact_at)}
                            >
                              {shortTime(person.last_contact_at)}
                            </time>
                          ) : (
                            <span className="followupCrmMuted">
                              {tr("admin.followups.adminFollowups.notContacted")}
                            </span>
                          )}
                        </td>
                        <td data-label={tr("admin.followups.adminFollowups.nextAction")}>
                          {person.suppressed_at ? (
                            <span className="followupCrmMuted">
                              {tr("admin.followups.adminFollowups.noFurtherOutreach")}
                            </span>
                          ) : person.next_followup_at ? (
                            <span className={due(person) ? "followupDueDate" : ""}>
                              {due(person) && <Icon name="activity" size={12} />}{" "}
                              <time
                                dateTime={person.next_followup_at}
                                title={followupTime(person.next_followup_at)}
                              >
                                {shortTime(person.next_followup_at)}
                              </time>
                            </span>
                          ) : (
                            <span className="followupCrmMuted">
                              {person.status === "resolved"
                                ? tr("admin.followups.adminFollowups.complete")
                                : tr("admin.followups.adminFollowups.noReminderSet")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selected && (
              <FollowupDetail
                key={selected.id}
                person={selected}
                initialDraft={drafts.current.get(selected.id)}
                cacheDraft={(draft) => drafts.current.set(selected.id, draft)}
                onUpdate={refresh}
              />
            )}
          </div>
          <div className="followupCrmPager">
            <span>
              {data?.total
                ? Math.min(page * 30 + 1, data.total) +
                  "–" +
                  Math.min((page + 1) * 30, data.total) +
                  " / " +
                  data.total
                : "0"}
            </span>
            <div>
              <button
                type="button"
                className="adminOutlineBtn"
                disabled={page === 0 || loading}
                onClick={() => {
                  setPage((value) => value - 1);
                  setSelected(null);
                }}
              >
                {tr("admin.followups.adminFollowups.previous")}
              </button>
              <button
                type="button"
                className="adminOutlineBtn"
                disabled={!data || (page + 1) * 30 >= data.total || loading}
                onClick={() => {
                  setPage((value) => value + 1);
                  setSelected(null);
                }}
              >
                {tr("admin.followups.adminFollowups.next2")}
              </button>
            </div>
          </div>
          {!data?.emailConfigured && data && (
            <p className="followupCrmHint">
              {tr("admin.followups.adminFollowups.emailSendingIsUnavailableYouCan")}
            </p>
          )}
        </>
      )}
      <FollowupBulk
        key={checked.join("|")}
        open={bulk}
        userIds={checked}
        defaultTemplate={
          usage === "near" || usage === "exhausted"
            ? "quota-upgrade"
            : usage === "used" || usage === "high"
              ? "use-case"
              : segment.startsWith("step:")
                ? NEXT_STEP_TEMPLATE[segment.slice(5) as NextStep]
                : segment === "device-only"
                  ? "finish-mcp"
                  : "experience"
        }
        onClose={() => setBulk(false)}
        onQueued={(id) => {
          setBulk(false);
          setChecked([]);
          setBatchId(id);
          setView("batches");
          setSelected(null);
          refresh();
        }}
      />
    </section>
  );
}
