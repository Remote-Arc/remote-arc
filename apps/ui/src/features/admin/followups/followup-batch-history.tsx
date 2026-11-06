import { useEffect, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { FollowupEmailPreview } from "./followup-email-preview.js";
import {
  followupApi,
  followupReason,
  followupTime,
  type FollowupBatch,
  type BatchDetail,
} from "./followup-model.js";

export function FollowupBatchHistory({
  initialId,
  onUpdate,
}: {
  initialId: string | null;
  onUpdate: () => void;
}) {
  const { tr } = useI18n();
  const [items, setItems] = useState<FollowupBatch[]>([]),
    [id, setId] = useState<string | null>(initialId),
    [detail, setDetail] = useState<BatchDetail | null>(null);
  const [previewUser, setPreviewUser] = useState<string | null>(null);
  const [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const value = await followupApi<{ items: FollowupBatch[] }>("/batches");
        if (active) {
          setItems(value.items);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(followupReason((err as Error).message, tr));
          setLoading(false);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [revision]);
  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const value = await followupApi<BatchDetail>(
          "/batches/" + id + (previewUser ? "?previewUser=" + encodeURIComponent(previewUser) : ""),
        );
        if (active) setDetail(value);
      } catch (err) {
        if (active) setError(followupReason((err as Error).message, tr));
      }
    };
    setDetail((current) => (current?.batch.id === id ? current : null));
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, revision, previewUser]);
  const status = (value: string) =>
    ({
      preparing: tr("admin.followups.followupBatchHistory.preparing"),
      draft: tr("admin.followups.followupBatchHistory.readyForReview"),
      queued: tr("admin.followups.followupBatchHistory.sending"),
      completed: tr("admin.followups.followupBatchHistory.completed"),
      cancelled: tr("admin.followups.followupBatchHistory.cancelled"),
      pending: tr("admin.followups.followupBatchHistory.queued"),
      processing: tr("admin.followups.followupBatchHistory.sending"),
      sent: tr("admin.followups.followupBatchHistory.submitted"),
      failed: tr("admin.followups.followupBatchHistory.failed"),
      unknown: tr("admin.followups.followupBatchHistory.checkDelivery"),
      skipped: tr("admin.followups.followupBatchHistory.excluded"),
    })[value] || value;
  async function action(action: "queue" | "cancel") {
    if (!id || busy) return;
    setBusy(true);
    setError("");
    try {
      setDetail(
        await followupApi<BatchDetail>("/batches/" + id + "/" + action, {
          method: "POST",
          body: "{}",
        }),
      );
      setRevision((value) => value + 1);
      onUpdate();
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="followupBatchHistory"
      aria-label={tr("admin.followups.followupBatchHistory.bulkFollowUpHistory")}
    >
      <div className="followupCrmSectionHeading">
        <div>
          <h2>{tr("admin.followups.followupBatchHistory.bulkFollowUps")}</h2>
          <p>
            {tr(
              "admin.followups.followupBatchHistory.reviewedEmailsIndividualResultsSendingContinues",
            )}
          </p>
        </div>
        <button
          type="button"
          className="adminOutlineBtn"
          onClick={() => setRevision((value) => value + 1)}
        >
          <Icon name="refresh" size={14} />
          {tr("admin.followups.followupBatchHistory.refresh")}
        </button>
      </div>
      {error && (
        <p className="adminAlert" role="alert">
          {error}
        </p>
      )}
      {id ? (
        <>
          <button type="button" className="adminOutlineBtn" onClick={() => setId(null)}>
            ← {tr("admin.followups.followupBatchHistory.allBatches")}
          </button>
          {detail ? (
            <>
              <div className="followupBatchDetailHeader">
                <div>
                  <span className="followupStatus" data-status={detail.batch.status}>
                    {status(detail.batch.status)}
                  </span>
                  <h3>{detail.batch.title}</h3>
                  <p>{followupTime(detail.batch.queued_at || detail.batch.created_at)}</p>
                </div>
                <div>
                  {detail.batch.status === "draft" && (
                    <button
                      type="button"
                      className="adminPrimaryBtn"
                      disabled={busy || !detail.batch.pending || !detail.emailConfigured}
                      onClick={() => void action("queue")}
                    >
                      {tr("admin.followups.followupBatchHistory.confirmSend") +
                        detail.batch.pending +
                        (detail.batch.pending === 1
                          ? tr("admin.followups.followupBatchHistory.email")
                          : tr("admin.followups.followupBatchHistory.emails"))}
                    </button>
                  )}
                  {["preparing", "draft", "queued"].includes(detail.batch.status) && (
                    <button
                      type="button"
                      className="adminOutlineBtn"
                      disabled={busy}
                      onClick={() => void action("cancel")}
                    >
                      {tr("admin.followups.followupBatchHistory.cancelRemaining")}
                    </button>
                  )}
                </div>
              </div>
              <div className="followupBatchReviewStats">
                <div>
                  <strong>{detail.batch.sent}</strong>
                  <span>{tr("admin.followups.followupBatchHistory.submitted")}</span>
                </div>
                <div>
                  <strong>{detail.batch.pending + detail.batch.processing}</strong>
                  <span>{tr("admin.followups.followupBatchHistory.remaining")}</span>
                </div>
                <div>
                  <strong>{detail.batch.failed + detail.batch.unknown}</strong>
                  <span>{tr("admin.followups.followupBatchHistory.needsAttention")}</span>
                </div>
                <div>
                  <strong>{detail.batch.skipped + detail.batch.cancelled}</strong>
                  <span>{tr("admin.followups.followupBatchHistory.excludedCancelled")}</span>
                </div>
              </div>
              {!detail.emailConfigured && detail.batch.status === "queued" && (
                <p className="adminAlert">
                  {tr("admin.followups.followupBatchHistory.waitingForTheEmailChannelSending")}
                </p>
              )}
              {detail.batch.status === "cancelled" && (
                <p className="followupCrmHint">
                  {tr("admin.followups.followupBatchHistory.unsentEmailsAreCancelledAnEmail")}
                </p>
              )}
              <div className="followupCrmTableWrap">
                <table className="followupCrmTable">
                  <thead>
                    <tr>
                      <th>{tr("admin.followups.followupBatchHistory.user")}</th>
                      <th>{tr("admin.followups.followupBatchHistory.subject")}</th>
                      <th>{tr("admin.followups.followupBatchHistory.result")}</th>
                      <th>{tr("admin.followups.followupBatchHistory.detail")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recipients.map((person) => (
                      <tr key={person.user_id}>
                        <td>
                          <strong>{person.name || person.email}</strong>
                          <small>{person.email}</small>
                        </td>
                        <td>{person.subject || "—"}</td>
                        <td>
                          <span className="followupStatus" data-status={person.status}>
                            {status(person.status)}
                          </span>
                        </td>
                        <td>
                          {person.error_code
                            ? followupReason(person.error_code, tr)
                            : person.sent_at
                              ? followupTime(person.sent_at)
                              : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.preview && (
                <details className="followupBatchSavedPreview">
                  <summary>{tr("admin.followups.followupBatchHistory.viewASavedEmail")}</summary>
                  <label className="followupPreviewRecipient">
                    {tr("admin.followups.followupBatchHistory.previewRecipient")}
                    <select
                      value={detail.preview.user_id}
                      onChange={(event) => setPreviewUser(event.target.value)}
                    >
                      {detail.recipients
                        .filter((person) => person.message_id)
                        .map((person) => (
                          <option key={person.user_id} value={person.user_id}>
                            {person.name || person.email} · {person.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <FollowupEmailPreview
                    html={detail.preview.html_body}
                    title={tr("admin.followups.followupBatchHistory.savedBulkEmail")}
                  />
                </details>
              )}
            </>
          ) : (
            <p role="status">{tr("admin.followups.followupBatchHistory.loadingBatch")}</p>
          )}
        </>
      ) : (
        <>
          {!items.length && (
            <div className="followupCrmEmpty">
              <Icon name="chat" size={30} />
              <h3>
                {loading
                  ? tr("admin.followups.followupBatchHistory.loadingBatches")
                  : tr("admin.followups.followupBatchHistory.yourFirstBulkFollowUpStarts")}
              </h3>
              <p>{tr("admin.followups.followupBatchHistory.selectUsersInContactsThenChoose")}</p>
            </div>
          )}
          <div className="followupBatchCards">
            {items.map((batch) => (
              <button
                type="button"
                key={batch.id}
                className="followupBatchCard"
                onClick={() => {
                  setId(batch.id);
                  setPreviewUser(null);
                  setError("");
                }}
              >
                <div>
                  <span className="followupStatus" data-status={batch.status}>
                    {status(batch.status)}
                  </span>
                  <small>{followupTime(batch.queued_at || batch.created_at)}</small>
                </div>
                <h3>{batch.title}</h3>
                <p>
                  {batch.total} {tr("admin.followups.followupBatchHistory.users")} · {batch.sent}{" "}
                  {tr("admin.followups.followupBatchHistory.submitted2")} ·{" "}
                  {batch.failed + batch.unknown}{" "}
                  {tr("admin.followups.followupBatchHistory.needChecking")}
                </p>
                <progress
                  aria-label={tr("admin.followups.followupBatchHistory.batchProgress")}
                  max={Math.max(1, batch.total)}
                  value={batch.total - batch.pending - batch.processing}
                />
                <span>
                  {tr("admin.followups.followupBatchHistory.viewResults")}{" "}
                  <Icon name="chevron" size={13} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
