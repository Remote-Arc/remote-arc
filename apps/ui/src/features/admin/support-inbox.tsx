import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/admin/support-inbox.css";

import {
  betaReplyDraft,
  GOOGLE_BETA_APP_NAMES,
  type SupportThread as Thread,
  type SupportDetail as Detail,
} from "./support-inbox-model.js";
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(options?.body ? { "content-type": "application/json" } : {}),
    },
  });
  const result = (await response.json().then(canonicalErrorEnvelope)) as T & { error?: string };
  if (!response.ok) throw Error(result.error || "HTTP " + response.status);
  return result;
}
/** initialThread opens that conversation first, e.g. one just opened from a submission. */
export function AdminSupportInbox({ initialThread = "" }: { initialThread?: string }) {
  const { tr, locale } = useI18n();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState("all"),
    [source, setSource] = useState("all");
  const [loading, setLoading] = useState(true);
  const selectedRef = useRef(""),
    listVersion = useRef(0),
    drafts = useRef(new Map<string, { message: string; attempt: string }>());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [attempt, setAttempt] = useState("");
  async function reloadList() {
    const version = ++listVersion.current;
    setLoading(true);
    try {
      const data = await request<{ items: Thread[] }>(
        "/api/admin/support-inbox?" + new URLSearchParams({ status: filter, source }),
      );
      if (version === listVersion.current) setThreads(data.items);
    } catch {
      if (version === listVersion.current)
        setError(tr("admin.supportInbox.couldNotLoadConversationsRefreshTo"));
    } finally {
      if (version === listVersion.current) setLoading(false);
    }
  }
  async function loadThread(id: string) {
    try {
      const value = await request<Detail>("/api/admin/support-inbox/" + id);
      if (selectedRef.current === id) setDetail(value);
    } catch {
      if (selectedRef.current === id)
        setError(tr("admin.supportInbox.couldNotLoadThisConversationRefresh"));
    }
  }
  useEffect(() => {
    void reloadList();
    return () => {
      listVersion.current++;
    };
  }, [filter, source]);
  useEffect(() => {
    if (selected) void loadThread(selected);
  }, [selected]);
  useEffect(() => {
    if (initialThread) selectThread(initialThread);
  }, [initialThread]);
  async function send() {
    if (!selected || !message.trim() || busy) return;
    // Keep one request ID per attempted message, including a failed network read.
    const id = attempt || crypto.randomUUID();
    if (!attempt) setAttempt(id);
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const data = await request<{ status: string; duplicate?: boolean }>(
        "/api/admin/support-inbox/" + selected + "/reply",
        {
          method: "POST",
          body: JSON.stringify({ requestId: id, message: message.trim() }),
        },
      );
      if (data.status === "sent") {
        setInfo(tr("admin.supportInbox.replySubmittedToSendpulseDeliveryIs"));
        setMessage("");
        setAttempt("");
      } else {
        setError(tr("admin.supportInbox.deliveryIsUncertainDoNotSend"));
      }
      await Promise.all([loadThread(selected), reloadList()]);
    } catch (e) {
      setError(tr("admin.supportInbox.couldNotConfirmSubmissionKeepThis") + " " + String(e));
    } finally {
      setBusy(false);
    }
  }
  async function reconcile(messageId: string, outcome: "sent" | "failed") {
    if (!selected || busy) return;
    const evidence = window.prompt(
      tr("admin.supportInbox.enterTheSendpulseProviderEvidenceMessage"),
    );
    if (!evidence) return;
    if (!window.confirm(tr("admin.supportInbox.confirmYouCheckedSendpulseAndThis"))) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await request("/api/admin/support-inbox/" + selected + "/reconcile", {
        method: "PATCH",
        body: JSON.stringify({ messageId, outcome, evidence }),
      });
      await Promise.all([loadThread(selected), reloadList()]);
      setAttempt("");
      setInfo(tr("admin.supportInbox.deliveryReviewRecorded"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(status: Thread["status"]) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/support-inbox/" + selected + "/status", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await Promise.all([loadThread(selected), reloadList()]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function reviewBeta(decision: "approve" | "decline") {
    if (!selected || busy || !detail?.beta) return;
    if (
      decision === "approve" &&
      !window.confirm(
        tr("admin.supportInbox.confirmYouHaveAddedThisExact") + detail.beta.googleEmail,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request("/api/admin/support-inbox/" + selected + "/google-beta", {
        method: "PATCH",
        body: JSON.stringify({
          decision,
          ...(decision === "approve" ? { googleTestUserAdded: true } : {}),
        }),
      });
      await Promise.all([loadThread(selected), reloadList()]);
      setInfo(tr("admin.supportInbox.betaRequestUpdatedNoEmailWas"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const selectThread = (id: string) => {
    if (busy || id === selected) return;
    if (selected) drafts.current.set(selected, { message, attempt });
    const saved = drafts.current.get(id);
    selectedRef.current = id;
    setSelected(id);
    setDetail(null);
    setMessage(saved?.message || "");
    setAttempt(saved?.attempt || "");
    setError("");
    setInfo("");
  };
  const statusLabel = (status: string) =>
    ({
      open: tr("admin.supportInbox.needsAttention"),
      waiting: tr("admin.supportInbox.waitingForCustomer"),
      resolved: tr("admin.supportInbox.resolved"),
    })[status] || status;
  const betaLabel = (status: string) =>
    ({
      pending: tr("admin.supportInbox.pendingReview"),
      approved: tr("admin.supportInbox.approved"),
      declined: tr("admin.supportInbox.notAdmitted"),
    })[status] || status;
  const deliveryLabel = (status: string) =>
    ({
      sent: tr("admin.supportInbox.submitted"),
      unknown: tr("admin.supportInbox.verifyDelivery"),
      failed: tr("admin.supportInbox.notSent"),
      sending: tr("admin.supportInbox.submitting"),
    })[status] || status;
  const readable = (value: string) =>
    new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const unconfirmed = detail?.messages.some(
    (mail) => mail.direction === "outbound" && ["unknown", "sending"].includes(mail.deliveryStatus),
  );
  const replied = detail?.messages.some(
    (mail) =>
      mail.direction === "outbound" &&
      mail.deliveryStatus === "sent" &&
      (!detail.beta?.reviewedAt || mail.createdAt >= detail.beta.reviewedAt),
  );
  function prepareBetaReply() {
    if (!detail?.beta || detail.beta.status !== "approved" || busy || attempt || unconfirmed)
      return;
    if (message.trim() && !window.confirm(tr("admin.supportInbox.replaceThisReplyDraftWithThe")))
      return;
    setMessage(betaReplyDraft(detail));
    setInfo(tr("admin.supportInbox.englishReplyPreparedReviewTheRecipient"));
  }
  return (
    <section
      className="adminSupportInbox adminSurface"
      aria-label={tr("admin.supportInbox.supportInbox")}
    >
      <header className="adminSupportToolbar">
        <p>{tr("admin.supportInbox.customerMailAndAppsApplicationsReview")}</p>
        <button
          type="button"
          className="adminOutlineBtn"
          disabled={busy || loading}
          onClick={() =>
            void Promise.all([reloadList(), selected ? loadThread(selected) : Promise.resolve()])
          }
        >
          {tr("admin.supportInbox.refresh")}
        </button>
      </header>
      {error && (
        <p className="adminAlert" role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className="adminSupportNotice" role="status">
          {info}
        </p>
      )}
      <div className="adminSupportLayout">
        <aside className="adminSupportList" aria-label={tr("admin.supportInbox.conversations")}>
          <div className="adminSupportListTitle">
            <h2>{tr("admin.supportInbox.conversations2")}</h2>
            <small>{loading ? "…" : threads.length}</small>
          </div>
          <div className="adminSupportFilters">
            <label>
              {tr("admin.supportInbox.source")}
              <select
                value={source}
                disabled={busy}
                onChange={(event) => {
                  selectThread("");
                  setSource(event.target.value);
                }}
              >
                <option value="all">{tr("admin.supportInbox.allSources")}</option>
                <option value="email">{tr("admin.supportInbox.customerEmail")}</option>
                <option value="google-beta">{tr("admin.supportInbox.appsApplication")}</option>
              </select>
            </label>
            <label>
              {tr("admin.supportInbox.status")}
              <select
                value={filter}
                disabled={busy}
                onChange={(event) => {
                  selectThread("");
                  setFilter(event.target.value);
                }}
              >
                <option value="all">{tr("admin.supportInbox.allStatuses")}</option>
                <option value="open">{tr("admin.supportInbox.needsAttention")}</option>
                <option value="waiting">{tr("admin.supportInbox.waitingForCustomer")}</option>
                <option value="resolved">{tr("admin.supportInbox.resolved")}</option>
              </select>
            </label>
          </div>
          {loading && (
            <p className="adminSupportEmpty" role="status">
              {tr("admin.supportInbox.loadingConversations")}
            </p>
          )}
          {!loading && !threads.length && (
            <p className="adminSupportEmpty">
              {tr("admin.supportInbox.noConversationsMatchTheseFilters")}
            </p>
          )}
          <div className="adminSupportThreadList" aria-busy={loading}>
            {threads.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy || loading}
                aria-pressed={selected === item.id}
                className={"adminSupportThread" + (selected === item.id ? " active" : "")}
                onClick={() => selectThread(item.id)}
              >
                <span className="adminSupportThreadTop">
                  <strong>{item.sender_email}</strong>
                  <time dateTime={item.last_message_at}>{readable(item.last_message_at)}</time>
                </span>
                <span className="adminSupportSubject">{item.subject}</span>
                <span className="adminSupportThreadMeta">
                  <span className="adminSupportTag" data-source={item.source}>
                    {item.source === "google-beta"
                      ? tr("admin.supportInbox.appsApplication")
                      : tr("admin.supportInbox.customerEmail")}
                  </span>
                  <small>
                    {item.beta_status === "pending"
                      ? betaLabel("pending")
                      : item.last_delivery_status === "unknown"
                        ? deliveryLabel("unknown")
                        : statusLabel(item.status)}
                  </small>
                </span>
                <small className="adminSupportLastDirection">
                  {item.last_direction === "outbound"
                    ? tr("admin.supportInbox.supportCustomer")
                    : item.source === "google-beta"
                      ? tr("admin.supportInbox.applicantSupport")
                      : tr("admin.supportInbox.customerSupport")}
                </small>
              </button>
            ))}
          </div>
        </aside>
        <div className="adminSupportConversation" aria-busy={Boolean(selected && !detail)}>
          {!detail || detail.thread.id !== selected ? (
            <div className="adminSupportPlaceholder">
              <strong>
                {selected
                  ? tr("admin.supportInbox.loadingConversation")
                  : tr("admin.supportInbox.selectAConversation")}
              </strong>
              <p>{tr("admin.supportInbox.seeWhoWroteInReviewThe")}</p>
            </div>
          ) : (
            <>
              <header className="adminSupportConversationHead">
                <div>
                  <span className="adminSupportEyebrow">
                    {detail.beta
                      ? tr("admin.supportInbox.appsApplication2")
                      : tr("admin.supportInbox.customerConversation")}
                  </span>
                  <h3>
                    {detail.beta
                      ? tr("admin.supportInbox.googleAppsBetaApplication")
                      : detail.thread.subject}
                  </h3>
                  <p>{detail.thread.sender_email}</p>
                </div>
                <label>
                  {tr("admin.supportInbox.conversationStatus")}
                  <select
                    value={detail.thread.status}
                    disabled={busy}
                    onChange={(event) => void changeStatus(event.target.value as Thread["status"])}
                  >
                    <option value="open">{tr("admin.supportInbox.needsAttention")}</option>
                    <option value="waiting">{tr("admin.supportInbox.waitingForCustomer")}</option>
                    <option value="resolved">{tr("admin.supportInbox.resolved")}</option>
                  </select>
                </label>
              </header>
              {detail.beta && (
                <section
                  className="adminSupportBeta"
                  aria-label={tr("admin.supportInbox.googleAppsBetaApplication")}
                >
                  <div className="adminSupportBetaHeading">
                    <strong>{tr("admin.supportInbox.applicationDetails")}</strong>
                    <span
                      className="adminSupportTag"
                      role="status"
                      aria-label={tr("admin.supportInbox.betaStatus")}
                    >
                      {betaLabel(detail.beta.status)}
                    </span>
                  </div>
                  <dl className="adminSupportAddresses">
                    <div>
                      <dt>{tr("admin.supportInbox.remoteArcAccountReplyTo")}</dt>
                      <dd>{detail.thread.sender_email}</dd>
                    </div>
                    <div>
                      <dt>{tr("admin.supportInbox.googleAccountAddToTestList")}</dt>
                      <dd>{detail.beta.googleEmail}</dd>
                    </div>
                  </dl>
                  <div className="adminSupportProviders">
                    {detail.beta.providers.map((provider) => (
                      <span key={provider}>{GOOGLE_BETA_APP_NAMES[provider] || provider}</span>
                    ))}
                  </div>
                  <ol
                    className="adminSupportSteps"
                    aria-label={tr("admin.supportInbox.applicationWorkflow")}
                  >
                    <li data-done={detail.beta.status === "approved"}>
                      <span>1</span>
                      <div>
                        <strong>{tr("admin.supportInbox.googleTestUsers")}</strong>
                        <small>{tr("admin.supportInbox.addTheGoogleAccountAbove")}</small>
                      </div>
                    </li>
                    <li data-done={detail.beta.status === "approved"}>
                      <span>2</span>
                      <div>
                        <strong>{tr("admin.supportInbox.openBetaAccess")}</strong>
                        <small>{tr("admin.supportInbox.confirmTheGoogleStepFirst")}</small>
                      </div>
                    </li>
                    <li data-done={Boolean(replied)}>
                      <span>3</span>
                      <div>
                        <strong>{tr("admin.supportInbox.replyToApplicant")}</strong>
                        <small>
                          {replied
                            ? tr("admin.supportInbox.replySubmitted")
                            : tr("admin.supportInbox.reviewAndSendTheNotice")}
                        </small>
                      </div>
                    </li>
                  </ol>
                  {detail.beta.status === "pending" ? (
                    <div className="adminSupportBetaActions">
                      <a
                        className="adminOutlineBtn"
                        href="https://console.cloud.google.com/auth/audience?project=remote-arc-prod-2026"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {tr("admin.supportInbox.openGoogleTestUsers")} ↗
                      </a>
                      <button
                        type="button"
                        className="adminPrimaryBtn"
                        disabled={busy}
                        onClick={() => void reviewBeta("approve")}
                      >
                        {tr("admin.supportInbox.addedToGoogleOpenBetaAccess")}
                      </button>
                      <button
                        type="button"
                        className="adminOutlineBtn"
                        disabled={busy}
                        onClick={() => void reviewBeta("decline")}
                      >
                        {tr("admin.supportInbox.declineRequest")}
                      </button>
                    </div>
                  ) : detail.beta.status === "approved" ? (
                    <div className="adminSupportBetaActions">
                      <button
                        type="button"
                        className="adminOutlineBtn"
                        disabled={busy || Boolean(attempt) || Boolean(unconfirmed)}
                        onClick={prepareBetaReply}
                      >
                        {tr("admin.supportInbox.prepareEnglishNotification")}
                      </button>
                      <small>{tr("admin.supportInbox.openingAccessDoesNotSendAn")}</small>
                    </div>
                  ) : (
                    <p>{tr("admin.supportInbox.thisRequestWasNotAdmittedYou")}</p>
                  )}
                </section>
              )}
              <section
                className="adminSupportMessages"
                aria-label={tr("admin.supportInbox.conversationHistory")}
              >
                {detail.messages.map((mail) =>
                  mail.source === "application" ? (
                    <details key={mail.id} className="adminSupportApplicationRecord">
                      <summary>
                        {tr("admin.supportInbox.originalWebApplication")} ·{" "}
                        {readable(mail.createdAt)}
                      </summary>
                      <p>{mail.body}</p>
                    </details>
                  ) : (
                    <article
                      key={mail.id}
                      className={"adminSupportMail " + mail.direction}
                      aria-label={
                        mail.direction === "outbound"
                          ? tr("admin.supportInbox.supportReply")
                          : tr("admin.supportInbox.customerEmail")
                      }
                    >
                      <header>
                        <strong>
                          {mail.direction === "outbound"
                            ? tr("admin.supportInbox.remoteArcSupport")
                            : tr("admin.supportInbox.customer")}
                        </strong>
                        <time dateTime={mail.createdAt}>{readable(mail.createdAt)}</time>
                      </header>
                      <dl className="adminSupportMailAddresses">
                        <div>
                          <dt>{tr("admin.supportInbox.from")}</dt>
                          <dd>{mail.from}</dd>
                        </div>
                        <div>
                          <dt>{tr("admin.supportInbox.to")}</dt>
                          <dd>{mail.to}</dd>
                        </div>
                      </dl>
                      <p>{mail.body}</p>
                      {mail.direction === "outbound" && (
                        <span className="adminSupportDelivery" data-status={mail.deliveryStatus}>
                          {deliveryLabel(mail.deliveryStatus)}
                        </span>
                      )}
                      {mail.direction === "outbound" && mail.deliveryStatus === "unknown" && (
                        <div className="adminSupportReview">
                          <strong>
                            {tr("admin.supportInbox.checkTheSendpulseDeliveryLogBefore")}
                          </strong>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reconcile(mail.id, "sent")}
                          >
                            {tr("admin.supportInbox.confirmedSubmitted")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reconcile(mail.id, "failed")}
                          >
                            {tr("admin.supportInbox.confirmedNotSent")}
                          </button>
                        </div>
                      )}
                    </article>
                  ),
                )}
              </section>
              <form
                className="adminSupportCompose"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <div className="adminSupportComposeHead">
                  <label htmlFor="admin-support-reply">
                    {tr("admin.supportInbox.replyToCustomer")}
                  </label>
                  <span>{tr("admin.supportInbox.from")} support@remotearc.app</span>
                </div>
                <p className="adminSupportRecipient">
                  {tr("admin.supportInbox.to2")}
                  <strong>{detail.thread.sender_email}</strong>
                </p>
                <textarea
                  id="admin-support-reply"
                  value={message}
                  maxLength={15000}
                  rows={5}
                  disabled={busy || Boolean(attempt) || Boolean(unconfirmed)}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={tr("admin.supportInbox.writeYourReplyHere")}
                />
                <div>
                  <small>
                    {unconfirmed
                      ? tr("admin.supportInbox.verifyThePreviousSubmissionAboveFirst")
                      : tr("admin.supportInbox.checkTheRecipientBeforeSendingSubmitted")}
                  </small>
                  <button
                    className="adminPrimaryBtn"
                    type="submit"
                    disabled={busy || !message.trim() || Boolean(attempt) || Boolean(unconfirmed)}
                  >
                    {busy
                      ? tr("admin.supportInbox.submitting2")
                      : tr("admin.supportInbox.sendReviewedReply")}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
