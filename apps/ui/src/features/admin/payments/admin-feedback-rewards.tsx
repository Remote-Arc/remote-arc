import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
type Policy = {
  id: string;
  revision: number;
  enabled: number;
  calls: number;
  valid_days: number;
  per_user_limit: number;
  total_calls_cap: number;
};
type Claim = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  calls: number;
  valid_days: number;
  message: string | null;
  created_at: string;
  expires_at: string | null;
};
type Data = {
  policy: Policy;
  claims: Claim[];
  totals: { grants: number; grantedCalls: number; spentCalls: number };
};
export function AdminFeedbackRewards({ preview = false }: { preview?: boolean }) {
  const { tr } = useI18n(),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [review, setReview] = useState(false);
  const [enabled, setEnabled] = useState(false),
    [calls, setCalls] = useState(500),
    [days, setDays] = useState(30),
    [perUser, setPerUser] = useState(1),
    [cap, setCap] = useState(50000);
  useEffect(() => {
    if (preview) {
      setData({
        policy: {
          id: "preview",
          revision: 1,
          enabled: 0,
          calls: 500,
          valid_days: 30,
          per_user_limit: 1,
          total_calls_cap: 50000,
        },
        claims: [],
        totals: { grants: 0, grantedCalls: 0, spentCalls: 0 },
      });
      return;
    }
    const controller = new AbortController();
    setError("");
    void fetch("/api/admin/feedback-rewards", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        return response.json().then(canonicalErrorEnvelope);
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setEnabled(Boolean(value.policy.enabled));
          setCalls(value.policy.calls);
          setDays(value.policy.valid_days);
          setPerUser(value.policy.per_user_limit);
          setCap(value.policy.total_calls_cap);
          setReview(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(tr("admin.payments.adminFeedbackRewards.rewardDataCouldNotBeLoaded"));
      });
    return () => controller.abort();
  }, [preview, revision, tr]);
  async function action(path: string, body: unknown) {
    if (preview || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/feedback-rewards/" + path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw Error();
      setNotice(tr("admin.payments.adminFeedbackRewards.savedRewardGrantsAreRecordedOnce"));
      setRevision((value) => value + 1);
    } catch {
      setError(tr("admin.payments.adminFeedbackRewards.couldNotApplyThisChangeRefresh"));
    } finally {
      setBusy(false);
    }
  }
  function change(event: FormEvent) {
    event.preventDefault();
    setReview(true);
  }
  return (
    <section className="adminSurface adminFeedbackRewards">
      <div className="adminSectionHeader">
        <div>
          <h2>{tr("admin.payments.adminFeedbackRewards.rewardUsefulFeedback")}</h2>
          <p>{tr("admin.payments.adminFeedbackRewards.aSignedInUserSubmitsFeedback")}</p>
        </div>
        <button
          className="adminOutlineBtn"
          type="button"
          onClick={() => setRevision((value) => value + 1)}
        >
          {tr("admin.payments.adminFeedbackRewards.refresh")}
        </button>
      </div>
      {error && (
        <p role="alert" className="adminAlert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data && !error && (
        <WorkspaceLoading
          label={tr("admin.payments.adminFeedbackRewards.loadingRewardSettings")}
          variant="rows"
        />
      )}
      {data && (
        <>
          <div className="adminMetrics adminMetrics--overview">
            {[
              {
                label: tr("admin.payments.adminFeedbackRewards.rewardsGranted"),
                value: data.totals.grants,
              },
              {
                label: tr("admin.payments.adminFeedbackRewards.callsAwardedCampaignCap"),
                value: data.totals.grantedCalls + " / " + data.policy.total_calls_cap,
              },
              {
                label: tr("admin.payments.adminFeedbackRewards.rewardCallsUsed"),
                value: data.totals.spentCalls,
              },
            ].map((item) => (
              <article className="adminMetricCard" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
          <form onSubmit={change}>
            <div className="adminPaymentForm">
              <label className="adminPaymentField">
                {tr("admin.payments.adminFeedbackRewards.callsPerApprovedFeedback")}
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={calls}
                  onChange={(e) => {
                    setCalls(Number(e.target.value));
                    setReview(false);
                  }}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminFeedbackRewards.validityAfterGrantDays")}
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => {
                    setDays(Number(e.target.value));
                    setReview(false);
                  }}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminFeedbackRewards.rewardsPerAccount")}
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={perUser}
                  onChange={(e) => {
                    setPerUser(Number(e.target.value));
                    setReview(false);
                  }}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminFeedbackRewards.totalCampaignCalls")}
                <input
                  type="number"
                  min={calls}
                  max={10000000}
                  value={cap}
                  onChange={(e) => {
                    setCap(Number(e.target.value));
                    setReview(false);
                  }}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminFeedbackRewards.offerFeedbackRewards")}
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    setReview(false);
                  }}
                />
              </label>
            </div>
            <button className="adminOutlineBtn" disabled={busy || preview}>
              {tr("admin.payments.adminFeedbackRewards.reviewRewardTerms")}
            </button>
          </form>
          {review && (
            <div className="adminPaymentReview">
              <p>
                {enabled
                  ? tr("admin.payments.adminFeedbackRewards.enabled")
                  : tr("admin.payments.adminFeedbackRewards.paused")}{" "}
                · {calls} {tr("admin.payments.adminFeedbackRewards.calls")} · {days}{" "}
                {tr("admin.payments.adminFeedbackRewards.days")} · {perUser} /{" "}
                {tr("admin.payments.adminFeedbackRewards.account")} · {cap}{" "}
                {tr("admin.payments.adminFeedbackRewards.totalCalls")}
              </p>
              <p>
                {tr(
                  "admin.payments.adminFeedbackRewards.acceptedApplicationsKeepTheirOriginalAmount",
                )}
              </p>
              <button
                className="adminOutlineBtn"
                disabled={busy || preview}
                onClick={() =>
                  void action("config", {
                    revision: data.policy.revision,
                    enabled,
                    calls,
                    validDays: days,
                    perUserLimit: perUser,
                    totalCallsCap: cap,
                  })
                }
              >
                {tr("admin.payments.adminFeedbackRewards.publishTheseTerms")}
              </button>
            </div>
          )}
          <div className="adminPaymentTable">
            <table>
              <thead>
                <tr>
                  {[
                    tr("admin.payments.adminFeedbackRewards.user"),
                    tr("admin.payments.adminFeedbackRewards.feedback"),
                    tr("admin.payments.adminFeedbackRewards.reward"),
                    tr("admin.payments.adminFeedbackRewards.status"),
                    tr("admin.payments.adminFeedbackRewards.review"),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.claims.map((claim) => (
                  <tr key={claim.id}>
                    <td>
                      <strong>{claim.name || claim.email}</strong>
                      <small>{claim.email}</small>
                    </td>
                    <td>
                      <details>
                        <summary>
                          {tr("admin.payments.adminFeedbackRewards.readSubmittedFeedback")}
                        </summary>
                        <p style={{ whiteSpace: "pre-wrap", maxWidth: 360 }}>
                          {claim.message ||
                            tr("admin.payments.adminFeedbackRewards.submissionRemoved")}
                        </p>
                      </details>
                      <small>{new Date(claim.created_at).toLocaleString()}</small>
                    </td>
                    <td>
                      {claim.calls} {tr("admin.payments.adminFeedbackRewards.calls")}
                      <small>
                        {claim.valid_days} {tr("admin.payments.adminFeedbackRewards.days")}
                        {claim.expires_at
                          ? " · " + new Date(claim.expires_at).toLocaleDateString()
                          : ""}
                      </small>
                    </td>
                    <td>
                      {claim.status === "pending"
                        ? tr("admin.payments.adminFeedbackRewards.awaitingReview")
                        : claim.status === "granted"
                          ? tr("admin.payments.adminFeedbackRewards.granted")
                          : tr("admin.payments.adminFeedbackRewards.rejected")}
                    </td>
                    <td>
                      {claim.status === "pending" && (
                        <>
                          <button
                            className="adminOutlineBtn"
                            disabled={busy || preview || !data.policy.enabled}
                            onClick={() => void action("claims/" + claim.id + "/approve", {})}
                          >
                            {tr("admin.payments.adminFeedbackRewards.approveGrant")}
                          </button>
                          <button
                            className="adminOutlineBtn"
                            disabled={busy || preview}
                            onClick={() => void action("claims/" + claim.id + "/reject", {})}
                          >
                            {tr("admin.payments.adminFeedbackRewards.reject")}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.claims.length === 0 && (
              <p className="adminNoData">
                {tr("admin.payments.adminFeedbackRewards.noRewardApplicationsYet")}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
