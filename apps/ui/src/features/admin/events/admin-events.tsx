import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { GrowthChart, RetentionPanel } from "./admin-events-panels.js";
import {
  biggestDrop,
  percent,
  percentagePoints,
  rate,
  retentionState,
  sceneName,
  stepName,
  validAnalytics,
  type Analytics,
  type SceneId,
} from "./admin-events-model.js";
import "../../../styles/admin/events/admin-events.css";

export function AdminEvents({ preview = false }: { preview?: boolean }) {
  const { tr, locale } = useI18n();
  const [days, setDays] = useState(7),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<SceneId>("login");
  const [method, setMethod] = useState("all"),
    [data, setData] = useState<Analytics | null>(null),
    [loading, setLoading] = useState(!preview),
    [error, setError] = useState(false);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setData(null);
    void fetch("/api/admin/analytics?days=" + days, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("unavailable");
        const value: unknown = await response.json().then(canonicalErrorEnvelope);
        if (!validAnalytics(value)) throw Error("invalid");
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [preview, days, revision]);
  const format = (value: number | undefined) =>
    typeof value === "number" ? value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "—";
  const changed = (current: number | undefined, before: number | undefined) =>
    typeof current === "number" && typeof before === "number"
      ? current === before
        ? tr("admin.events.adminEvents.unchangedFromPreviousPeriod")
        : tr("admin.events.adminEvents.vsPreviousPeriod") +
          (current > before ? "+" : "") +
          format(current - before)
      : tr("admin.events.adminEvents.noComparisonYet");
  const payment = data?.scenes.find((item) => item.id === "payment"),
    d7 = data?.retention.find((item) => item.day === 7);
  const scene =
    selected === "login" && method !== "all"
      ? data?.loginMethods.find((item) => item.id === method)
      : data?.scenes.find((item) => item.id === selected);
  const previous =
    selected === "login" && method !== "all"
      ? data?.previous.loginMethods.find((item) => item.id === method)
      : data?.previous.scenes.find((item) => item.id === selected);
  const drop = biggestDrop(scene),
    points = percentagePoints(scene?.rate, previous?.rate);
  const metrics = [
    {
      label: tr("admin.events.adminEvents.newUsers"),
      value: format(data?.summary.newUsers),
      note: changed(data?.summary.newUsers, data?.previous.summary.newUsers),
    },
    {
      label: tr("admin.events.adminEvents.activeUsers"),
      value: format(data?.summary.activeUsers),
      note: tr("admin.events.adminEvents.accountsWithRecordedRealUsage"),
    },
    {
      label: tr("admin.events.adminEvents.newUserDevicePairing"),
      value: data ? percent(rate(data.summary.newPaired, data.summary.newUsers)) : "—",
      note: data
        ? `${data.summary.newPaired} / ${data.summary.newUsers} ` +
          tr("admin.events.adminEvents.newUsersApprovedComputerPairing")
        : tr("admin.events.adminEvents.waitingForRealData"),
    },
    {
      label: tr("admin.events.adminEvents.purchaseConversion"),
      value: percent(payment?.rate),
      note: payment
        ? `${payment.completed} / ${payment.total} ` +
          tr("admin.events.adminEvents.purchaseVisitsCompleted")
        : tr("admin.events.adminEvents.paymentAndAccessMustBothBe"),
    },
    {
      label: tr("admin.events.adminEvents.verifiedPayingUsers"),
      value: format(data?.summary.payingUsers),
      note: changed(data?.summary.payingUsers, data?.previous.summary.payingUsers),
    },
    {
      label: tr("admin.events.adminEvents.dayRetention"),
      value: percent(d7?.rate),
      note:
        d7?.status === "ready"
          ? `${d7.returned} / ${d7.eligible} ` +
            tr("admin.events.adminEvents.eligibleUsersReturned")
          : retentionState(d7, tr),
    },
  ];
  return (
    <div className="businessAnalytics" aria-busy={loading}>
      <div className="businessHeading">
        <div>
          <span className="businessEyebrow">
            {tr("admin.events.adminEvents.growthConversionRetention")}
          </span>
          <h2>{tr("admin.events.adminEvents.isTheProductGrowing")}</h2>
          <p>{tr("admin.events.adminEvents.realAccountsProcessOutcomesAndRegistration")}</p>
        </div>
        <div className="businessControls">
          <div
            className="businessRange"
            aria-label={tr("admin.events.adminEvents.reportingPeriod")}
          >
            {[1, 7, 30].map((value) => (
              <button key={value} aria-pressed={days === value} onClick={() => setDays(value)}>
                {value === 1
                  ? tr("admin.events.adminEvents.today")
                  : tr("admin.events.adminEvents.last") +
                    value +
                    tr("admin.events.adminEvents.days")}
              </button>
            ))}
          </div>
          <button
            className="businessRefresh"
            disabled={preview || loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <Icon name="refresh" size={14} />
            {tr("admin.events.adminEvents.refresh")}
          </button>
        </div>
      </div>
      <div className="businessDataStatus">
        <span>
          <i />
          {data
            ? tr("admin.events.adminEvents.productionData")
            : preview
              ? tr("admin.events.adminEvents.previewNoInventedFigures")
              : loading
                ? tr("admin.events.adminEvents.loadingProductionData")
                : tr("admin.events.adminEvents.dataUnavailable")}
        </span>
        {data && (
          <time dateTime={data.checkedAt}>
            {tr("admin.events.adminEvents.updated")}
            {new Date(data.checkedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {tr("admin.events.adminEvents.utcReportingDays")}
          </time>
        )}
      </div>
      {error && (
        <div className="businessLoadError" role="alert">
          <strong>{tr("admin.events.adminEvents.businessDataCouldNotLoad")}</strong>
          <p>{tr("admin.events.adminEvents.figuresAreUnavailableThisIsNot")}</p>
          <button onClick={() => setRevision((value) => value + 1)}>
            {tr("admin.events.adminEvents.retry")}
          </button>
        </div>
      )}
      <section
        className="businessKpis"
        aria-label={tr("admin.events.adminEvents.businessOverview")}
      >
        {metrics.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </article>
        ))}
      </section>
      {data && (
        <p className="businessScopeNote">
          {tr("admin.events.adminEvents.startedPeriodCohortsFollowedThroughNow")}
        </p>
      )}
      <GrowthChart data={data} tr={tr} />
      <section className="businessPanel businessFlows">
        <header>
          <div>
            <h2>{tr("admin.events.adminEvents.canPeopleFinishTheKeyJourneys")}</h2>
            <p>{tr("admin.events.adminEvents.eachRateFollowsItsOwnStarting")}</p>
          </div>
        </header>
        <div
          className="businessSceneTabs"
          role="tablist"
          aria-label={tr("admin.events.adminEvents.businessJourneys")}
        >
          {(["login", "devices", "payment", "tasks"] as SceneId[]).map((id) => {
            const item = data?.scenes.find((value) => value.id === id);
            return (
              <button
                role="tab"
                key={id}
                id={"business-tab-" + id}
                aria-controls="business-funnel-panel"
                aria-selected={selected === id}
                tabIndex={selected === id ? 0 : -1}
                onKeyDown={(event) => {
                  const tabs = Array.from(
                    event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                      "[role=tab]",
                    ),
                  );
                  const index = tabs.indexOf(event.currentTarget);
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    tabs[next]?.focus();
                    tabs[next]?.click();
                  }
                }}
                onClick={() => {
                  setSelected(id);
                  setMethod("all");
                }}
              >
                <span>{sceneName(id, tr)}</span>
                <strong>{percent(item?.rate)}</strong>
                <small>
                  {item
                    ? `${format(item.completed)} / ${format(item.total)} ` +
                      tr("admin.events.adminEvents.completed")
                    : tr("admin.events.adminEvents.waitingForData")}
                </small>
              </button>
            );
          })}
        </div>
        <div
          className="businessFunnelPanel"
          id="business-funnel-panel"
          role="tabpanel"
          aria-labelledby={"business-tab-" + selected}
        >
          <div className="businessFunnelHeading">
            <div>
              <h3>
                {sceneName(scene?.id || selected, tr)}
                {tr("admin.events.adminEvents.completion")}
              </h3>
              <strong>{percent(scene?.rate)}</strong>
              <span>
                {scene
                  ? `${format(scene.completed)} / ${format(scene.total)} ` +
                    tr("admin.events.adminEvents.completed")
                  : tr("admin.events.adminEvents.waitingForRealProcessData")}
              </span>
              {points !== null && (
                <small className="businessComparison">
                  {points > 0 ? "+" : ""}
                  {points} {tr("admin.events.adminEvents.percentagePointsVsPreviousPeriod")}
                </small>
              )}
            </div>
            {selected === "login" && (
              <select
                aria-label={tr("admin.events.adminEvents.signInMethod")}
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="all">{tr("admin.events.adminEvents.allSignInMethods")}</option>
                <option value="email_login">{tr("admin.events.adminEvents.emailCode")}</option>
                <option value="google_login">Google</option>
              </select>
            )}
          </div>
          <div
            className="businessFunnelSteps"
            style={{ gridTemplateColumns: `repeat(${scene?.steps.length || 4},minmax(0,1fr))` }}
          >
            {(
              scene?.steps ||
              Array.from({ length: 4 }, (_, i) => ({
                key: String(i),
                count: 0,
                rate: null,
                previousRate: null,
                dropoff: 0,
              }))
            ).map((step, index) => (
              <article key={step.key}>
                <span className="businessStepNumber">{String(index + 1).padStart(2, "0")}</span>
                <h4>{scene ? stepName(scene.id, step.key, tr) : "—"}</h4>
                <strong>{scene ? format(step.count) : "—"}</strong>
                <div className="businessFunnelBar">
                  <span
                    style={{ width: scene?.total ? `${(step.count / scene.total) * 100}%` : "0%" }}
                  />
                </div>
                {index > 0 ? (
                  <small>
                    {tr("admin.events.adminEvents.fromPreviousStep")}
                    <b>{percent(step.previousRate)}</b>
                    <span>
                      {tr("admin.events.adminEvents.notCompletedAtThisStep")}
                      {scene ? format(step.dropoff) : "—"}
                    </span>
                  </small>
                ) : (
                  <small>{tr("admin.events.adminEvents.startingCohortDeduplicated")}</small>
                )}
              </article>
            ))}
          </div>
          {scene && (
            <div className="businessFlowOutcome">
              <span>
                <i data-tone="good" />
                {tr("admin.events.adminEvents.completed2")}
                <b>{format(scene.completed)}</b>
              </span>
              <span>
                <i />
                {tr("admin.events.adminEvents.inProgress")}
                <b>{format(scene.pending)}</b>
              </span>
              <span>
                <i data-tone="muted" />
                {tr("admin.events.adminEvents.notCompleted")}
                <b>{format(scene.unfinished)}</b>
              </span>
              {selected === "tasks" && (
                <span>
                  {tr("admin.events.adminEvents.failedCancelledUnknown")}
                  {scene.failed} / {scene.cancelled || 0} / {scene.unknown || 0}
                </span>
              )}
            </div>
          )}
          {scene?.incompleteEvidence ? (
            <p className="businessInsight">
              {tr("admin.events.adminEvents.someJourneysHaveMissingIntermediateEvidence")}
            </p>
          ) : (
            drop && (
              <p className="businessInsight">
                <Icon name="activity" size={16} />
                <span>
                  {tr("admin.events.adminEvents.largestDropOff")}
                  <strong>{stepName(scene!.id, drop.key, tr)}</strong>
                  {tr("admin.events.adminEvents.label")}
                  {format(drop.dropoff)}
                  {tr("admin.events.adminEvents.attemptsHaveNotReachedThisStep")}
                  {scene!.pending > 0 && tr("admin.events.adminEvents.someAreStillInProgress")}
                </span>
              </p>
            )
          )}
          {scene?.total === 0 && (
            <p className="businessEmptySample">
              {tr("admin.events.adminEvents.noAttemptsRecordedForThisCohort")}
            </p>
          )}
          {!!scene?.historyUnmeasured && (
            <p className="businessFootnote">
              {tr("admin.events.adminEvents.historicalPairingAttempts")}
              {scene.historyUnmeasured}
              {tr("admin.events.adminEvents.theirOriginalConnectionOutcomeWasNot")}
            </p>
          )}
          {selected === "payment" && payment?.orders && (
            <div className="businessOrderMetrics">
              <div>
                <span>{tr("admin.events.adminEvents.orderCompletionRate")}</span>
                <strong>{percent(rate(payment.orders.fulfilled, payment.orders.total))}</strong>
                <small>
                  {payment.orders.fulfilled} / {payment.orders.total}{" "}
                  {tr("admin.events.adminEvents.liveModeOrdersCompleted")}
                </small>
              </div>
              <div>
                <span>{tr("admin.events.adminEvents.paymentConfirmed")}</span>
                <strong>{payment.orders.paid}</strong>
                <small>{tr("admin.events.adminEvents.verifiedPaymentNotAPageReturn")}</small>
              </div>
              <div>
                <span>{tr("admin.events.adminEvents.ordersAwaitingCompletion")}</span>
                <strong>{Math.max(0, payment.orders.total - payment.orders.fulfilled)}</strong>
                <small>
                  {payment.orders.pending} {tr("admin.events.adminEvents.stillOpenLeavingIsNotA")}
                </small>
              </div>
              <div>
                <span>{tr("admin.events.adminEvents.confirmedReceiptsUsd")}</span>
                <strong>${((data?.summary.paidCents || 0) / 100).toFixed(2)}</strong>
                <small>{tr("admin.events.adminEvents.excludesZeroPriceAndRefundedReceipts")}</small>
              </div>
            </div>
          )}
          <details className="businessSource">
            <summary>{tr("admin.events.adminEvents.howThisRateIsCalculated")}</summary>
            <p>
              {selected === "login"
                ? tr("admin.events.adminEvents.oneIssuedEmailChallengeOrGoogle")
                : selected === "devices"
                  ? tr("admin.events.adminEvents.onePairingCodeIsOneAttempt")
                  : selected === "payment"
                    ? tr("admin.events.adminEvents.theSameAccountAndBrowserVisit")
                    : tr("admin.events.adminEvents.eachSavedArcTaskCountsOnce")}
            </p>
          </details>
        </div>
      </section>
      <section className="businessPanel businessActivation">
        <header>
          <div>
            <h2>{tr("admin.events.adminEvents.areNewUsersReachingValue")}</h2>
            <p>{tr("admin.events.adminEvents.theSameRegistrationCohortEachGoal")}</p>
          </div>
        </header>
        <div>
          {[
            {
              label: tr("admin.events.adminEvents.approvedComputerPairing"),
              count: data?.summary.newPaired,
            },
            {
              label: tr("admin.events.adminEvents.firstSuccessfulUse"),
              count: data?.summary.newUsed,
            },
            {
              label: tr("admin.events.adminEvents.becameAPayingUser"),
              count: data?.summary.newPaid,
            },
          ].map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{data ? percent(rate(item.count || 0, data.summary.newUsers)) : "—"}</strong>
              <small>
                {format(item.count)} / {format(data?.summary.newUsers)}{" "}
                {tr("admin.events.adminEvents.newUsers2")}
              </small>
            </article>
          ))}
        </div>
      </section>
      <RetentionPanel key={data?.coverage.activityCompleteFrom || "none"} data={data} tr={tr} />
      <footer className="businessDefinitions">
        <h3>{tr("admin.events.adminEvents.dataCoverage")}</h3>
        <p>{tr("admin.events.adminEvents.accountsSignInsForegroundVisitsAnd")}</p>
        {data?.coverage.flowSince && (
          <p>
            {tr("admin.events.adminEvents.completeSignInAndConnectionFunnels")}
            {new Date(data.coverage.flowSince).toLocaleDateString(
              locale === "zh" ? "zh-CN" : "en-US",
            )}
            {tr("admin.events.adminEvents.earlierUnrecordedStepsAreNotReconstructed")}
            {data.coverage.activityCompleteFrom && (
              <>
                {" "}
                {tr("admin.events.adminEvents.fullyObservedActivityDaysBegin")}
                {data.coverage.activityCompleteFrom.slice(0, 10)}
                {tr("admin.events.adminEvents.retentionFillsAsCohortsMature")}
              </>
            )}
          </p>
        )}
      </footer>
    </div>
  );
}
