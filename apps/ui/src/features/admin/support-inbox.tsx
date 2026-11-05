import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../app/i18n.js";
import "./support-inbox.css";

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
export function AdminSupportInbox() {
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
        setError(
          tr("Could not load conversations. Refresh to try again.", "无法读取会话，请刷新重试。"),
        );
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
        setError(
          tr(
            "Could not load this conversation. Refresh to try again.",
            "无法读取会话内容，请刷新重试。",
          ),
        );
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
        setInfo(
          tr(
            "Reply submitted to SendPulse. Delivery is not yet confirmed.",
            "已提交 SendPulse，尚未确认送达。",
          ),
        );
        setMessage("");
        setAttempt("");
      } else {
        setError(
          tr(
            "Delivery is uncertain. Do not send again until verified in the provider dashboard.",
            "发送结果不确定，请先到服务商后台核实，不要重复发送。",
          ),
        );
      }
      await Promise.all([loadThread(selected), reloadList()]);
    } catch (e) {
      setError(
        tr(
          "Could not confirm submission. Keep this draft and verify before retrying.",
          "无法确认邮件提交，请保留草稿，核实后再操作。",
        ) +
          " " +
          String(e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function reconcile(messageId: string, outcome: "sent" | "failed") {
    if (!selected || busy) return;
    const evidence = window.prompt(
      tr(
        "Enter the SendPulse provider evidence (message ID or exact delivery log finding; minimum 10 characters).",
        "输入 SendPulse 后台核验依据（消息 ID 或准确的投递日志结果，至少 10 字符）。",
      ),
    );
    if (!evidence) return;
    if (
      !window.confirm(
        tr(
          "Confirm you checked SendPulse and this outcome is accurate?",
          "确认已核实 SendPulse 后台，此判断准确吗？",
        ),
      )
    )
      return;
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
      setInfo(tr("Delivery review recorded.", "已保存投递核验记录。"));
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
        tr(
          "Confirm you have added this exact Google account to the Apps project test-user list: ",
          "确认已将这个 Google 账号加入 Apps 项目测试名单：",
        ) + detail.beta.googleEmail,
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
      setInfo(tr("Beta request updated. No email was sent.", "已更新内测申请，未自动发送邮件。"));
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
      open: tr("Needs attention", "待处理"),
      waiting: tr("Waiting for customer", "等待客户"),
      resolved: tr("Resolved", "已解决"),
    })[status] || status;
  const betaLabel = (status: string) =>
    ({
      pending: tr("Pending review", "待审核"),
      approved: tr("Approved", "已开通"),
      declined: tr("Not admitted", "暂不开通"),
    })[status] || status;
  const deliveryLabel = (status: string) =>
    ({
      sent: tr("Submitted", "已提交"),
      unknown: tr("Verify delivery", "待核验"),
      failed: tr("Not sent", "发送失败"),
      sending: tr("Submitting", "提交中"),
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
    if (
      message.trim() &&
      !window.confirm(
        tr(
          "Replace this reply draft with the English Beta notification?",
          "用英文内测开通通知替换当前回复草稿？",
        ),
      )
    )
      return;
    setMessage(betaReplyDraft(detail));
    setInfo(
      tr(
        "English reply prepared. Review the recipient and message before sending.",
        "已准备英文回复，请核对收件人和正文后再发送。",
      ),
    );
  }
  return (
    <section
      className="adminSupportInbox adminSurface"
      aria-label={tr("Support inbox", "客服收件箱")}
    >
      <header className="adminSupportToolbar">
        <p>
          {tr(
            "Customer mail and Apps applications. Review, reply and follow up here.",
            "查看客户来信与 Apps 申请，在这里处理并跟进回复。",
          )}
        </p>
        <button
          type="button"
          className="adminOutlineBtn"
          disabled={busy || loading}
          onClick={() =>
            void Promise.all([reloadList(), selected ? loadThread(selected) : Promise.resolve()])
          }
        >
          {tr("Refresh", "刷新")}
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
        <aside className="adminSupportList" aria-label={tr("Conversations", "会话列表")}>
          <div className="adminSupportListTitle">
            <h2>{tr("Conversations", "会话")}</h2>
            <small>{loading ? "…" : threads.length}</small>
          </div>
          <div className="adminSupportFilters">
            <label>
              {tr("Source", "来源")}
              <select
                value={source}
                disabled={busy}
                onChange={(event) => {
                  selectThread("");
                  setSource(event.target.value);
                }}
              >
                <option value="all">{tr("All sources", "全部来源")}</option>
                <option value="email">{tr("Customer email", "客户来信")}</option>
                <option value="google-beta">{tr("Apps application", "内测申请")}</option>
              </select>
            </label>
            <label>
              {tr("Status", "处理状态")}
              <select
                value={filter}
                disabled={busy}
                onChange={(event) => {
                  selectThread("");
                  setFilter(event.target.value);
                }}
              >
                <option value="all">{tr("All statuses", "全部状态")}</option>
                <option value="open">{tr("Needs attention", "待处理")}</option>
                <option value="waiting">{tr("Waiting for customer", "等待客户")}</option>
                <option value="resolved">{tr("Resolved", "已解决")}</option>
              </select>
            </label>
          </div>
          {loading && (
            <p className="adminSupportEmpty" role="status">
              {tr("Loading conversations…", "正在读取会话…")}
            </p>
          )}
          {!loading && !threads.length && (
            <p className="adminSupportEmpty">
              {tr("No conversations match these filters.", "此筛选下暂无会话。")}
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
                      ? tr("Apps application", "内测申请")
                      : tr("Customer email", "客户来信")}
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
                    ? tr("Support → customer", "客服 → 客户")
                    : item.source === "google-beta"
                      ? tr("Applicant → support", "申请人 → 客服")
                      : tr("Customer → support", "客户 → 客服")}
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
                  ? tr("Loading conversation…", "正在读取会话…")
                  : tr("Select a conversation", "选择一个会话")}
              </strong>
              <p>
                {tr(
                  "See who wrote in, review the request and reply to the right address.",
                  "查看来信人、处理申请，并核对收件人后回复。",
                )}
              </p>
            </div>
          ) : (
            <>
              <header className="adminSupportConversationHead">
                <div>
                  <span className="adminSupportEyebrow">
                    {detail.beta
                      ? tr("APPS APPLICATION", "APPS 内测申请")
                      : tr("CUSTOMER CONVERSATION", "客户会话")}
                  </span>
                  <h3>
                    {detail.beta
                      ? tr("Google Apps Beta application", "Google Apps 内测申请")
                      : detail.thread.subject}
                  </h3>
                  <p>{detail.thread.sender_email}</p>
                </div>
                <label>
                  {tr("Conversation status", "会话状态")}
                  <select
                    value={detail.thread.status}
                    disabled={busy}
                    onChange={(event) => void changeStatus(event.target.value as Thread["status"])}
                  >
                    <option value="open">{tr("Needs attention", "待处理")}</option>
                    <option value="waiting">{tr("Waiting for customer", "等待客户")}</option>
                    <option value="resolved">{tr("Resolved", "已解决")}</option>
                  </select>
                </label>
              </header>
              {detail.beta && (
                <section
                  className="adminSupportBeta"
                  aria-label={tr("Google Apps Beta application", "Google Apps 内测申请")}
                >
                  <div className="adminSupportBetaHeading">
                    <strong>{tr("Application details", "申请信息")}</strong>
                    <span
                      className="adminSupportTag"
                      role="status"
                      aria-label={tr("Beta status", "内测状态")}
                    >
                      {betaLabel(detail.beta.status)}
                    </span>
                  </div>
                  <dl className="adminSupportAddresses">
                    <div>
                      <dt>{tr("Remote Arc account · reply to", "RA 账号 · 回复此邮箱")}</dt>
                      <dd>{detail.thread.sender_email}</dd>
                    </div>
                    <div>
                      <dt>
                        {tr("Google account · add to test list", "Google 账号 · 加入测试名单")}
                      </dt>
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
                    aria-label={tr("Application workflow", "申请处理流程")}
                  >
                    <li data-done={detail.beta.status === "approved"}>
                      <span>1</span>
                      <div>
                        <strong>{tr("Google test users", "加入 Google 名单")}</strong>
                        <small>
                          {tr("Add the Google account above.", "添加上方 Google 账号。")}
                        </small>
                      </div>
                    </li>
                    <li data-done={detail.beta.status === "approved"}>
                      <span>2</span>
                      <div>
                        <strong>{tr("Open Beta access", "开通 RA 内测")}</strong>
                        <small>{tr("Confirm the Google step first.", "确认名单后开通。")}</small>
                      </div>
                    </li>
                    <li data-done={Boolean(replied)}>
                      <span>3</span>
                      <div>
                        <strong>{tr("Reply to applicant", "回复申请人")}</strong>
                        <small>
                          {replied
                            ? tr("Reply submitted", "已提交回复")
                            : tr("Review and send the notice.", "审阅并发送通知。")}
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
                        {tr("1 · Open Google test users", "1 · 打开 Google 测试名单")} ↗
                      </a>
                      <button
                        type="button"
                        className="adminPrimaryBtn"
                        disabled={busy}
                        onClick={() => void reviewBeta("approve")}
                      >
                        {tr("Added to Google — open Beta access", "2 · 确认已加入，开通内测")}
                      </button>
                      <button
                        type="button"
                        className="adminOutlineBtn"
                        disabled={busy}
                        onClick={() => void reviewBeta("decline")}
                      >
                        {tr("Decline request", "暂不开通")}
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
                        {tr("Prepare English notification", "准备英文开通通知")}
                      </button>
                      <small>
                        {tr("Opening access does not send an email.", "开通内测不会自动发邮件。")}
                      </small>
                    </div>
                  ) : (
                    <p>
                      {tr(
                        "This request was not admitted. You can explain the next steps below.",
                        "本次申请暂未开通，可在下方回复说明。",
                      )}
                    </p>
                  )}
                </section>
              )}
              <section
                className="adminSupportMessages"
                aria-label={tr("Conversation history", "会话记录")}
              >
                {detail.messages.map((mail) =>
                  mail.source === "application" ? (
                    <details key={mail.id} className="adminSupportApplicationRecord">
                      <summary>
                        {tr("Original web application", "网页申请原始记录")} ·{" "}
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
                          ? tr("Support reply", "客服回复")
                          : tr("Customer email", "客户来信")
                      }
                    >
                      <header>
                        <strong>
                          {mail.direction === "outbound"
                            ? tr("Remote Arc support", "Remote Arc 客服")
                            : tr("Customer", "客户来信")}
                        </strong>
                        <time dateTime={mail.createdAt}>{readable(mail.createdAt)}</time>
                      </header>
                      <dl className="adminSupportMailAddresses">
                        <div>
                          <dt>{tr("From", "发件人")}</dt>
                          <dd>{mail.from}</dd>
                        </div>
                        <div>
                          <dt>{tr("To", "收件人")}</dt>
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
                            {tr(
                              "Check the SendPulse delivery log before sending another reply.",
                              "请先核实 SendPulse 投递日志，再发送新回复。",
                            )}
                          </strong>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reconcile(mail.id, "sent")}
                          >
                            {tr("Confirmed submitted", "核实已提交")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void reconcile(mail.id, "failed")}
                          >
                            {tr("Confirmed not sent", "核实未发送")}
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
                  <label htmlFor="admin-support-reply">{tr("Reply to customer", "回复客户")}</label>
                  <span>{tr("From", "发件人")} support@remotearc.app</span>
                </div>
                <p className="adminSupportRecipient">
                  {tr("To: ", "收件人：")}
                  <strong>{detail.thread.sender_email}</strong>
                </p>
                <textarea
                  id="admin-support-reply"
                  value={message}
                  maxLength={15000}
                  rows={5}
                  disabled={busy || Boolean(attempt) || Boolean(unconfirmed)}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={tr("Write your reply here…", "在这里填写回复内容…")}
                />
                <div>
                  <small>
                    {unconfirmed
                      ? tr(
                          "Verify the previous submission above first.",
                          "请先核验上方的上一次发送。",
                        )
                      : tr(
                          "Check the recipient before sending. Submitted does not mean delivered.",
                          "发送前请核对收件人；已提交不等于已送达。",
                        )}
                  </small>
                  <button
                    className="adminPrimaryBtn"
                    type="submit"
                    disabled={busy || !message.trim() || Boolean(attempt) || Boolean(unconfirmed)}
                  >
                    {busy
                      ? tr("Submitting…", "提交中…")
                      : tr("Send reviewed reply", "确认发送回复")}
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
