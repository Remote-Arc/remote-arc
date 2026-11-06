import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { canonicalErrorCode } from "../../../../../../packages/protocol/src/error-codes.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { FOLLOWUP_TEMPLATES } from "../../../../../../packages/protocol/src/followup-templates.js";
import {
  renderFollowupEmail,
  type FollowupDesign,
} from "../../../../../../packages/protocol/src/followup-email.js";
import { FollowupEmailPreview } from "./followup-email-preview.js";
import {
  followupApi,
  FollowupApiError,
  followupTime,
  newFollowupDraft,
  savedFollowupDraft,
  draftFingerprint,
  draftDirty,
  type Person,
  type ContactDetail,
  type EmailDraft,
} from "./followup-model.js";

export function FollowupDialog({
  title,
  busy,
  onClose,
  children,
  className = "",
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"adminFollowupDialog " + className}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h3 id={titleId}>{title}</h3>
        <button
          type="button"
          className="adminOutlineBtn"
          disabled={busy}
          onClick={onClose}
          aria-label={tr("admin.followups.adminFollowupDetail.close")}
        >
          <Icon name="close" size={16} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function hardBlock(data: ContactDetail | null, suppress = false, now = Date.now()) {
  if (!data) return "LOADING";
  if (data.contact.suppressed_at || suppress) return "RECIPIENT_SUPPRESSED";
  if (!data.emailConfigured) return "EMAIL_NOT_CONFIGURED";
  if (
    data.messages.some(
      (mail) =>
        mail.batch_status === "queued" &&
        ["pending", "processing"].includes(mail.batch_recipient_status || ""),
    )
  )
    return "BATCH_PENDING";
  if (data.messages.some((mail) => ["sending", "unknown"].includes(mail.status)))
    return "DELIVERY_UNCONFIRMED";
  const next = Math.max(
    0,
    ...data.messages.map((mail) => (mail.sent_at ? Date.parse(mail.sent_at) + 72 * 3600000 : 0)),
  );
  return next > now ? "CONTACT_COOLDOWN" : null;
}

export function FollowupDetail({
  person,
  initialDraft,
  cacheDraft,
  onUpdate,
}: {
  person: Person;
  initialDraft?: EmailDraft;
  cacheDraft: (draft: EmailDraft) => void;
  onUpdate: () => void;
}) {
  const { tr } = useI18n();
  const [data, setData] = useState<ContactDetail | null>(null),
    [refreshing, setRefreshing] = useState(true),
    [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<EmailDraft>(() => initialDraft || newFollowupDraft(person));
  const [tab, setTab] = useState<"email" | "history" | "notes">("email"),
    [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<"draft" | "send" | "contact" | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [review, setReview] = useState(false),
    [basis, setBasis] = useState(""),
    [basisNote, setBasisNote] = useState("");
  const [replacement, setReplacement] = useState<EmailDraft | null>(null),
    [clock, setClock] = useState(Date.now);
  const [notes, setNotes] = useState({ status: "new", note: "", due: "", suppress: false });
  const initialized = useRef(false),
    draftTouched = useRef(Boolean(initialDraft)),
    mutation = useRef(false);
  const subjectRef = useRef<HTMLInputElement>(null),
    subjectId = useId(),
    bodyId = useId();
  useEffect(() => {
    cacheDraft(draft);
  }, [draft, cacheDraft]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    void followupApi<ContactDetail>("/" + encodeURIComponent(person.id), {
      signal: controller.signal,
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setRefreshing(false);
        if (initialized.current) return;
        initialized.current = true;
        const date = value.contact.next_followup_at
          ? new Date(value.contact.next_followup_at)
          : null;
        setNotes({
          status: value.contact.status,
          note: value.contact.note,
          due: date
            ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
            : "",
          suppress: Boolean(value.contact.suppressed_at),
        });
        const saved = value.messages.find((mail) => mail.status === "draft" && !mail.batch_id);
        if (saved && !draftTouched.current) setDraft(savedFollowupDraft(saved));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRefreshing(false);
          setError("HISTORY_UNAVAILABLE");
        }
      });
    return () => controller.abort();
  }, [person.id, revision]);
  const dirty = draftDirty(draft),
    block = hardBlock(data, notes.suppress, clock);
  const nextSendAt = Math.max(
    0,
    ...(data?.messages.map((mail) =>
      mail.sent_at ? Date.parse(mail.sent_at) + 72 * 3600000 : 0,
    ) || []),
  );
  const errorText = (value: string) => {
    const code = canonicalErrorCode(value) || value;
    return (
      {
        HISTORY_UNAVAILABLE: tr(
          "admin.followups.adminFollowupDetail.contactHistoryCouldNotBeLoaded",
        ),
        EMAIL_NOT_CONFIGURED: tr(
          "admin.followups.adminFollowupDetail.theEmailChannelIsNotConfigured",
        ),
        RECIPIENT_SUPPRESSED: tr("admin.followups.adminFollowupDetail.thisUserHasStoppedFollowUps"),
        CONTACT_COOLDOWN:
          tr("admin.followups.adminFollowupDetail.aFollowUpWasSentRecently") +
          followupTime(new Date(nextSendAt).toISOString()),
        CONTACT_COOLDOWN_OR_IN_PROGRESS: tr(
          "admin.followups.adminFollowupDetail.anotherEmailWasSentRecentlyOr",
        ),
        BATCH_PENDING: tr("admin.followups.adminFollowupDetail.aBulkEmailIsQueuedFor"),
        DELIVERY_UNCONFIRMED: tr("admin.followups.adminFollowupDetail.aDeliveryIsInProgressOr"),
        DRAFT_CONFLICT: tr("admin.followups.adminFollowupDetail.thisDraftChangedInAnotherTab"),
        DRAFT_NOT_EDITABLE: tr(
          "admin.followups.adminFollowupDetail.thisEmailWasAlreadyProcessedOpen",
        ),
        DRAFT_NOT_FOUND: tr("admin.followups.adminFollowupDetail.thisSavedDraftIsNoLonger"),
        RECIPIENT_CHANGED: tr(
          "admin.followups.adminFollowupDetail.theRecipientAddressChangedStartA",
        ),
        CONTACT_PERMISSION_REQUIRED: tr(
          "admin.followups.adminFollowupDetail.chooseTheUserSRequestOr",
        ),
        PERMISSION_NOTE_REQUIRED: tr(
          "admin.followups.adminFollowupDetail.addTheRequestOrAgreementThat",
        ),
        INVALID_MESSAGE: tr("admin.followups.adminFollowupDetail.enterASubjectAndAMessage"),
        LOADING: tr("admin.followups.adminFollowupDetail.checkingContactHistory"),
      }[code] ||
      (code.startsWith("PROVIDER_")
        ? tr("admin.followups.adminFollowupDetail.theEmailServiceRejectedThisSend")
        : tr("admin.followups.adminFollowupDetail.theActionCouldNotBeConfirmed"))
    );
  };
  const noticeText =
    notice === "sent"
      ? tr("admin.followups.adminFollowupDetail.emailSubmittedToTheSenderYou")
      : notice === "notes"
        ? tr("admin.followups.adminFollowupDetail.contactNotesSaved")
        : notice === "draft"
          ? tr("admin.followups.adminFollowupDetail.draftSavedYouCanKeepEditing")
          : "";
  const site = "https://remotearc.app" + (draft.locale === "zh" ? "/zh" : "");
  const generated = renderFollowupEmail({
    subject: draft.subject,
    body: draft.body,
    templateId: draft.templateId,
    locale: draft.locale,
    design: draft.design,
    setupUrl: site + "/connect-ai",
    feedbackUrl: site + "/feedback?source=" + encodeURIComponent("followup:" + draft.id),
    unsubscribeUrl: "https://remotearc.app/email/follow-up/unsubscribe?token=preview",
    replyTo: data?.sender?.replyTo || "support@remotearc.app",
    rewardAvailable: data?.rewardAvailable,
  });
  const reviewedHtml = !dirty && draft.html ? draft.html : generated.html;
  const update = (patch: Partial<EmailDraft>) => {
    draftTouched.current = true;
    setDraft((current) => ({ ...current, ...patch, edited: true }));
    setNotice("");
  };
  const updateDesign = (patch: Partial<FollowupDesign>) =>
    update({ design: { ...draft.design, ...patch } });
  const replaceDraft = (next: EmailDraft) => {
    if (draft.edited && dirty) {
      setReplacement(next);
      return;
    }
    draftTouched.current = true;
    setDraft(next);
    setTab("email");
    setError("");
    setNotice("");
  };
  const startSend = () => {
    setError("");
    if (!draft.subject.trim() || draft.body.trim().length < 20) {
      setError("INVALID_MESSAGE");
      setTab("email");
      subjectRef.current?.focus();
      return;
    }
    setBasis("");
    setBasisNote("");
    setReview(true);
  };
  async function persistDraft() {
    if (draft.revision !== null && !dirty) return draft;
    const result = await followupApi<{
      id: string;
      status: string;
      revision: number;
      htmlBody: string | null;
    }>("/drafts", {
      method: "POST",
      body: JSON.stringify({
        id: draft.id,
        userId: person.id,
        templateId: draft.templateId,
        locale: draft.locale,
        subject: draft.subject,
        body: draft.body,
        design: draft.design,
        ...(draft.revision !== null ? { expectedRevision: draft.revision } : {}),
      }),
    });
    if (result.status !== "draft") throw new FollowupApiError("DRAFT_NOT_EDITABLE");
    const saved = {
      ...draft,
      revision: result.revision,
      html: result.htmlBody,
      savedFingerprint: draftFingerprint(draft),
      edited: false,
    };
    setDraft(saved);
    return saved;
  }
  async function saveDraft() {
    if (mutation.current) return;
    mutation.current = true;
    setBusy("draft");
    setError("");
    try {
      await persistDraft();
      setNotice("draft");
      setRevision((value) => value + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      mutation.current = false;
      setBusy(null);
    }
  }
  async function send() {
    if (mutation.current) return;
    mutation.current = true;
    setBusy("send");
    setError("");
    try {
      let current = await followupApi<ContactDetail>("/" + encodeURIComponent(person.id));
      setData(current);
      const blocked = hardBlock(current, notes.suppress);
      if (blocked) throw new FollowupApiError(blocked);
      const saved = await persistDraft();
      if (!current.contact.consent_at && basis) {
        const reason =
          basis === "support"
            ? "User requested installation or product support"
            : "User agreed to this product follow-up";
        await followupApi("/" + encodeURIComponent(person.id), {
          method: "PATCH",
          body: JSON.stringify({
            status: current.contact.status,
            note: current.contact.note,
            nextFollowupAt: current.contact.next_followup_at,
            permission: true,
            consentNote: reason + (basisNote.trim() ? ": " + basisNote.trim() : ""),
            suppress: false,
          }),
        });
        current = await followupApi<ContactDetail>("/" + encodeURIComponent(person.id));
        setData(current);
      }
      const result = await followupApi<{ status: string }>(
        "/" + encodeURIComponent(saved.id) + "/send",
        { method: "POST", body: JSON.stringify({ expectedRevision: saved.revision }) },
      );
      if (result.status !== "sent") throw new FollowupApiError("DELIVERY_UNCONFIRMED");
      setReview(false);
      setNotice("sent");
      setTab("history");
      setDraft(newFollowupDraft(person, draft.locale, draft.templateId));
    } catch (err) {
      const e = err as FollowupApiError;
      setError(String(e.data?.errorCode || e.message));
    } finally {
      mutation.current = false;
      setBusy(null);
      setRevision((value) => value + 1);
      onUpdate();
    }
  }
  async function saveNotes() {
    if (!data || mutation.current) return;
    mutation.current = true;
    setBusy("contact");
    setError("");
    try {
      await followupApi("/" + encodeURIComponent(person.id), {
        method: "PATCH",
        body: JSON.stringify({
          status: notes.status,
          note: notes.note,
          nextFollowupAt: notes.due ? new Date(notes.due).toISOString() : null,
          permission: Boolean(data.contact.consent_at),
          consentNote: data.contact.consent_note,
          suppress: notes.suppress,
        }),
      });
      setNotice("notes");
      setRevision((value) => value + 1);
      onUpdate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      mutation.current = false;
      setBusy(null);
    }
  }
  const draftCount =
    data?.messages.filter((mail) => mail.status === "draft" && !mail.batch_id).length || 0;
  const mailStatus = (status: string) =>
    ({
      batch_draft: tr("admin.followups.adminFollowupDetail.bulkDraft"),
      queued: tr("admin.followups.adminFollowupDetail.queued"),
      cancelled: tr("admin.followups.adminFollowupDetail.cancelled"),
      skipped: tr("admin.followups.adminFollowupDetail.excluded"),
      draft: tr("admin.followups.adminFollowupDetail.draft"),
      sent: tr("admin.followups.adminFollowupDetail.submitted"),
      sending: tr("admin.followups.adminFollowupDetail.sending"),
      unknown: tr("admin.followups.adminFollowupDetail.checkDelivery"),
      failed: tr("admin.followups.adminFollowupDetail.sendFailed"),
    })[status] || status;
  return (
    <section
      className="adminFollowupDetail"
      aria-label={tr("admin.followups.adminFollowupDetail.followUpEmail")}
    >
      <header className="followupDetailHeader">
        <div>
          <h3>{person.name || person.email}</h3>
          <span>{person.email}</span>
        </div>
        <button
          type="button"
          className="adminOutlineBtn"
          disabled={Boolean(busy)}
          onClick={() => replaceDraft(newFollowupDraft(person, draft.locale))}
        >
          <Icon name="add" size={14} />
          {tr("admin.followups.adminFollowupDetail.newEmail")}
        </button>
      </header>
      <nav
        className="followupTabs"
        aria-label={tr("admin.followups.adminFollowupDetail.followUpWorkspace")}
      >
        {(["email", "history", "notes"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {value === "email"
              ? tr("admin.followups.adminFollowupDetail.writeEmail")
              : value === "history"
                ? tr("admin.followups.adminFollowupDetail.draftsHistory") +
                  (draftCount ? " · " + draftCount : "")
                : tr("admin.followups.adminFollowupDetail.contactNotes")}
          </button>
        ))}
      </nav>
      {error && !review && (
        <div className="adminAlert" role="alert">
          {errorText(error)}
          <button
            type="button"
            className="adminOutlineBtn"
            onClick={() => {
              setRevision((value) => value + 1);
              setError("");
            }}
          >
            {tr("admin.followups.adminFollowupDetail.refreshHistory")}
          </button>
        </div>
      )}
      {noticeText && (
        <p className="adminFollowupNotice" role="status">
          <Icon name="check" size={15} />
          {noticeText}
        </p>
      )}
      <div hidden={tab !== "email"} className="adminFollowupComposer">
        <div className="followupComposeToolbar">
          <span role="status">
            {busy === "draft"
              ? tr("admin.followups.adminFollowupDetail.saving")
              : draft.revision === null
                ? tr("admin.followups.adminFollowupDetail.newDraft")
                : dirty
                  ? tr("admin.followups.adminFollowupDetail.unsavedChanges")
                  : tr("admin.followups.adminFollowupDetail.draftSaved")}
          </span>
          <div>
            <button
              type="button"
              className="adminOutlineBtn"
              disabled={Boolean(busy)}
              onClick={() => void saveDraft()}
            >
              {tr("admin.followups.adminFollowupDetail.saveDraft")}
            </button>
            <button
              type="button"
              className="adminPrimaryBtn"
              disabled={Boolean(busy) || refreshing || !data}
              onClick={startSend}
            >
              {busy === "send"
                ? tr("admin.followups.adminFollowupDetail.sending2")
                : tr("admin.followups.adminFollowupDetail.sendEmail")}
              <Icon name="arrowUpRight" size={14} />
            </button>
          </div>
        </div>
        {block && block !== "LOADING" && (
          <div className="adminFollowupSendHint" role="status">
            <p>{errorText(block)}</p>
            <button
              type="button"
              className="adminOutlineBtn"
              onClick={() => {
                setRevision((value) => value + 1);
                onUpdate();
              }}
            >
              {tr("admin.followups.adminFollowupDetail.recheck")}
            </button>
          </div>
        )}
        {person.next_step === "pair_computer" && (
          <p className="followupSuggestion">
            <Icon name="add" size={16} />
            {tr("admin.followups.adminFollowupDetail.noComputerPairedYetThePairing")}
          </p>
        )}
        {(person.next_step === "connect_ai" ||
          (!person.next_step && person.devices > 0 && person.mcp_connections === 0)) && (
          <p className="followupSuggestion">
            <Icon name="link" size={16} />
            {tr("admin.followups.adminFollowupDetail.computerPairedNoActiveMcpAuthorization")}
          </p>
        )}
        {person.next_step === "first_use" && (
          <p className="followupSuggestion">
            <Icon name="activity" size={16} />
            {tr("admin.followups.adminFollowupDetail.connectedButNotUsedYetSuggest")}
          </p>
        )}
        <fieldset disabled={Boolean(busy)} className="followupEditor">
          <div className="adminFollowupTwo">
            <label>
              {tr("admin.followups.adminFollowupDetail.template")}
              <select
                aria-label={tr("admin.followups.adminFollowupDetail.template")}
                value={draft.templateId}
                onChange={(event) =>
                  replaceDraft(newFollowupDraft(person, draft.locale, event.target.value))
                }
              >
                {FOLLOWUP_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {tr(template.en, template.zh)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("admin.followups.adminFollowupDetail.emailLanguage")}
              <select
                aria-label={tr("admin.followups.adminFollowupDetail.emailLanguage")}
                value={draft.locale}
                onChange={(event) =>
                  replaceDraft(
                    newFollowupDraft(person, event.target.value as "en" | "zh", draft.templateId),
                  )
                }
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
          </div>
          <label htmlFor={subjectId}>
            {tr("admin.followups.adminFollowupDetail.subject")}
            <input
              ref={subjectRef}
              id={subjectId}
              value={draft.subject}
              maxLength={200}
              onChange={(event) => update({ subject: event.target.value })}
            />
          </label>
          <label htmlFor={bodyId}>
            {tr("admin.followups.adminFollowupDetail.message")}
            <textarea
              id={bodyId}
              value={draft.body}
              rows={12}
              maxLength={6000}
              onChange={(event) => update({ body: event.target.value })}
            />
          </label>
          <details className="adminFollowupDesign">
            <summary>
              {tr("admin.followups.adminFollowupDetail.emailAppearance")}
              <span>{tr("admin.followups.adminFollowupDetail.optional")}</span>
            </summary>
            <div className="adminFollowupTwo">
              <label>
                {tr("admin.followups.adminFollowupDetail.layout")}
                <select
                  value={draft.design.layout}
                  onChange={(event) =>
                    updateDesign({ layout: event.target.value as FollowupDesign["layout"] })
                  }
                >
                  <option value="spotlight">
                    {tr("admin.followups.adminFollowupDetail.spotlight")}
                  </option>
                  <option value="letter">{tr("admin.followups.adminFollowupDetail.letter")}</option>
                  <option value="digest">{tr("admin.followups.adminFollowupDetail.digest")}</option>
                </select>
              </label>
              <label>
                {tr("admin.followups.adminFollowupDetail.brandColor")}
                <input
                  type="color"
                  value={draft.design.accent}
                  onChange={(event) => updateDesign({ accent: event.target.value })}
                />
              </label>
            </div>
            <label>
              {tr("admin.followups.adminFollowupDetail.headline")}
              <input
                value={draft.design.headline}
                maxLength={200}
                placeholder={draft.subject}
                onChange={(event) => updateDesign({ headline: event.target.value })}
              />
            </label>
            <label>
              {tr("admin.followups.adminFollowupDetail.introduction")}
              <textarea
                rows={2}
                value={draft.design.intro}
                maxLength={500}
                onChange={(event) => updateDesign({ intro: event.target.value })}
              />
            </label>
            <label>
              {tr("admin.followups.adminFollowupDetail.buttonLabel")}
              <input
                value={draft.design.buttonLabel}
                maxLength={80}
                onChange={(event) => updateDesign({ buttonLabel: event.target.value })}
              />
            </label>
            <label>
              {tr("admin.followups.adminFollowupDetail.eyebrow")}
              <input
                value={draft.design.eyebrow}
                maxLength={100}
                onChange={(event) => updateDesign({ eyebrow: event.target.value })}
              />
            </label>
            {draft.design.highlights.map((card, index) => (
              <fieldset key={index}>
                <legend>
                  {tr("admin.followups.adminFollowupDetail.contentCard")} {index + 1}
                </legend>
                <input
                  aria-label={
                    tr("admin.followups.adminFollowupDetail.cardTitle") + " " + (index + 1)
                  }
                  value={card.title}
                  maxLength={100}
                  onChange={(event) =>
                    updateDesign({
                      highlights: draft.design.highlights.map((item, i) =>
                        i === index ? { ...item, title: event.target.value } : item,
                      ),
                    })
                  }
                />
                <textarea
                  aria-label={
                    tr("admin.followups.adminFollowupDetail.cardText") + " " + (index + 1)
                  }
                  value={card.body}
                  maxLength={600}
                  onChange={(event) =>
                    updateDesign({
                      highlights: draft.design.highlights.map((item, i) =>
                        i === index ? { ...item, body: event.target.value } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="adminOutlineBtn"
                  onClick={() =>
                    updateDesign({
                      highlights: draft.design.highlights.filter((_, i) => i !== index),
                    })
                  }
                >
                  {tr("admin.followups.adminFollowupDetail.removeCard")}
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="adminOutlineBtn"
              disabled={draft.design.highlights.length >= 3}
              onClick={() =>
                updateDesign({ highlights: [...draft.design.highlights, { title: "", body: "" }] })
              }
            >
              {tr("admin.followups.adminFollowupDetail.addContentCard")}
            </button>
          </details>
        </fieldset>
        <div className="followupPreviewToggle">
          <button
            type="button"
            className="adminOutlineBtn"
            aria-expanded={preview}
            onClick={() => setPreview((value) => !value)}
          >
            <Icon name="panel" size={15} />
            {preview
              ? tr("admin.followups.adminFollowupDetail.hidePreview")
              : tr("admin.followups.adminFollowupDetail.previewEmail")}
          </button>
          <span>{tr("admin.followups.adminFollowupDetail.replyAddressAndUnsubscribeLinkAre")}</span>
        </div>
        <div hidden={!preview}>
          <FollowupEmailPreview
            html={reviewedHtml}
            title={tr("admin.followups.adminFollowupDetail.emailPreview")}
          />
        </div>
      </div>
      {tab === "history" && (
        <section className="adminFollowupHistory">
          <div className="followupHistoryHeading">
            <h4>{tr("admin.followups.adminFollowupDetail.draftsContactHistory")}</h4>
            <button
              type="button"
              className="adminOutlineBtn"
              onClick={() => setRevision((value) => value + 1)}
            >
              <Icon name="refresh" size={14} />
              {tr("admin.followups.adminFollowupDetail.refreshHistory")}
            </button>
          </div>
          {data?.messages.length === 0 && (
            <p className="adminNoData">
              {tr("admin.followups.adminFollowupDetail.noSavedDraftsOrEmailsYet")}
            </p>
          )}
          {data?.messages.map((mail) => (
            <article className="followupHistoryItem" key={mail.id}>
              <header>
                <div>
                  <strong>{mail.subject}</strong>
                  <small>{followupTime(mail.sent_at || mail.created_at)}</small>
                </div>
                <span className="adminLeadStatus" data-status={mail.status}>
                  {mailStatus(
                    mail.batch_id
                      ? ["preparing", "draft"].includes(mail.batch_status || "")
                        ? "batch_draft"
                        : mail.batch_recipient_status === "pending"
                          ? "queued"
                          : mail.batch_recipient_status === "processing"
                            ? "sending"
                            : mail.batch_recipient_status || mail.status
                      : mail.status,
                  )}
                </span>
              </header>
              {mail.batch_id && (
                <small>{tr("admin.followups.adminFollowupDetail.partOfABulkFollowUp")}</small>
              )}
              {mail.status === "draft" && !mail.batch_id ? (
                <button
                  type="button"
                  className="adminOutlineBtn"
                  disabled={Boolean(busy)}
                  onClick={() => replaceDraft(savedFollowupDraft(mail))}
                >
                  {tr("admin.followups.adminFollowupDetail.continueEditing")}
                </button>
              ) : (
                <details>
                  <summary>{tr("admin.followups.adminFollowupDetail.viewEmail")}</summary>
                  <pre>{mail.body}</pre>
                  {mail.html_body && (
                    <FollowupEmailPreview
                      html={mail.html_body}
                      title={tr("admin.followups.adminFollowupDetail.savedEmail")}
                    />
                  )}
                </details>
              )}
              {["sending", "unknown"].includes(mail.status) && (
                <p>{tr("admin.followups.adminFollowupDetail.verifyTheSenderSDeliveryLog")}</p>
              )}
              {mail.error_code && (
                <p className="adminAlert">
                  {errorText(mail.error_code)} <small>{mail.error_code}</small>
                </p>
              )}
            </article>
          ))}
        </section>
      )}
      {tab === "notes" && (
        <section className="adminFollowupProfile">
          <h4>{tr("admin.followups.adminFollowupDetail.contactNotes")}</h4>
          <p>{tr("admin.followups.adminFollowupDetail.notesAndRemindersAreSeparateFrom")}</p>
          <fieldset disabled={Boolean(busy) || !data} className="followupEditor">
            <div className="adminFollowupTwo">
              <label>
                {tr("admin.followups.adminFollowupDetail.status")}
                <select
                  value={notes.status}
                  onChange={(event) =>
                    setNotes((value) => ({ ...value, status: event.target.value }))
                  }
                >
                  {[
                    ["new", tr("admin.followups.adminFollowupDetail.new")],
                    ["contacted", tr("admin.followups.adminFollowupDetail.contacted")],
                    ["waiting", tr("admin.followups.adminFollowupDetail.waitingForReply")],
                    ["resolved", tr("admin.followups.adminFollowupDetail.resolved")],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("admin.followups.adminFollowupDetail.remindMeInAdmin")}
                <input
                  type="datetime-local"
                  value={notes.due}
                  onChange={(event) => setNotes((value) => ({ ...value, due: event.target.value }))}
                />
              </label>
            </div>
            <label>
              {tr("admin.followups.adminFollowupDetail.internalNote")}
              <textarea
                rows={4}
                value={notes.note}
                maxLength={2000}
                onChange={(event) => setNotes((value) => ({ ...value, note: event.target.value }))}
              />
            </label>
            <p>
              {data?.contact.consent_at
                ? tr("admin.followups.adminFollowupDetail.savedContactBasis") +
                  data.contact.consent_note
                : tr("admin.followups.adminFollowupDetail.contactBasisCanBeRecordedWhen")}
            </p>
            <label className="adminFollowupCheck">
              <input
                type="checkbox"
                disabled={Boolean(data?.contact.suppressed_at)}
                checked={notes.suppress}
                onChange={(event) =>
                  setNotes((value) => ({ ...value, suppress: event.target.checked }))
                }
              />
              <span>{tr("admin.followups.adminFollowupDetail.stopFollowUpsToThisUser")}</span>
            </label>
            <button type="button" className="adminOutlineBtn" onClick={() => void saveNotes()}>
              {tr("admin.followups.adminFollowupDetail.saveNotes")}
            </button>
          </fieldset>
        </section>
      )}
      {review && (
        <FollowupDialog
          title={tr("admin.followups.adminFollowupDetail.sendThisEmail")}
          busy={Boolean(busy)}
          onClose={() => {
            setReview(false);
            setError("");
          }}
        >
          <div className="followupReviewBody">
            <dl>
              <dt>{tr("admin.followups.adminFollowupDetail.to")}</dt>
              <dd>{person.email}</dd>
              <dt>{tr("admin.followups.adminFollowupDetail.from")}</dt>
              <dd>
                {data?.sender?.from || tr("admin.followups.adminFollowupDetail.notConfigured")}
              </dd>
              <dt>{tr("admin.followups.adminFollowupDetail.replyTo")}</dt>
              <dd>
                {data?.sender?.replyTo || tr("admin.followups.adminFollowupDetail.notConfigured")}
              </dd>
              <dt>{tr("admin.followups.adminFollowupDetail.subject")}</dt>
              <dd>{draft.subject}</dd>
            </dl>
            {block ? (
              <div className="adminFollowupSendHint" role="status">
                <p>{errorText(block)}</p>
                <button
                  type="button"
                  className="adminOutlineBtn"
                  disabled={Boolean(busy)}
                  onClick={() => setRevision((value) => value + 1)}
                >
                  {tr("admin.followups.adminFollowupDetail.recheck")}
                </button>
              </div>
            ) : !data?.contact.consent_at ? (
              <fieldset disabled={Boolean(busy)} className="followupBasis">
                <legend>{tr("admin.followups.adminFollowupDetail.contactBasisOptional")}</legend>
                <p>{tr("admin.followups.adminFollowupDetail.youCanLeaveThisBlankAnd")}</p>
                <label>
                  <input
                    type="radio"
                    name="followup-basis"
                    value=""
                    checked={basis === ""}
                    onChange={() => setBasis("")}
                  />
                  {tr("admin.followups.adminFollowupDetail.doNotAddAContactBasis")}
                </label>
                <label>
                  <input
                    type="radio"
                    name="followup-basis"
                    value="support"
                    checked={basis === "support"}
                    onChange={() => setBasis("support")}
                  />
                  {tr("admin.followups.adminFollowupDetail.theUserRequestedInstallationOrProduct")}
                </label>
                <label>
                  <input
                    type="radio"
                    name="followup-basis"
                    value="followup"
                    checked={basis === "followup"}
                    onChange={() => setBasis("followup")}
                  />
                  {tr("admin.followups.adminFollowupDetail.theUserAgreedToThisProduct")}
                </label>
                <label className="followupBasisNote">
                  {tr("admin.followups.adminFollowupDetail.referenceOrNoteOptional")}
                  <input
                    value={basisNote}
                    maxLength={350}
                    placeholder={tr("admin.followups.adminFollowupDetail.forExampleASupportTicket")}
                    onChange={(event) => setBasisNote(event.target.value)}
                  />
                </label>
              </fieldset>
            ) : (
              <p className="followupBasisSaved">
                <Icon name="check" size={15} />
                {tr("admin.followups.adminFollowupDetail.contactBasisSaved") +
                  data.contact.consent_note}
              </p>
            )}
            {error && (
              <p className="adminAlert" role="alert">
                {errorText(error)}
              </p>
            )}
            <details className="followupReviewContent">
              <summary>{tr("admin.followups.adminFollowupDetail.reviewEmailContent")}</summary>
              <FollowupEmailPreview
                html={reviewedHtml}
                title={tr("admin.followups.adminFollowupDetail.emailToSend")}
              />
            </details>
          </div>
          <footer>
            <button
              type="button"
              className="adminOutlineBtn"
              disabled={Boolean(busy)}
              onClick={() => {
                setReview(false);
                setError("");
              }}
            >
              {tr("admin.followups.adminFollowupDetail.keepEditing")}
            </button>
            {!block && (
              <button
                type="button"
                className="adminPrimaryBtn"
                disabled={Boolean(busy) || refreshing}
                onClick={() => void send()}
              >
                {busy === "send"
                  ? tr("admin.followups.adminFollowupDetail.sending2")
                  : data?.contact.consent_at || !basis
                    ? tr("admin.followups.adminFollowupDetail.confirmSend")
                    : tr("admin.followups.adminFollowupDetail.recordBasisSend")}
              </button>
            )}
          </footer>
        </FollowupDialog>
      )}
      {replacement && (
        <FollowupDialog
          title={tr("admin.followups.adminFollowupDetail.keepYourChanges")}
          busy={Boolean(busy)}
          onClose={() => setReplacement(null)}
        >
          <div className="followupReviewBody">
            <p>{tr("admin.followups.adminFollowupDetail.thisEmailHasUnsavedChangesSave")}</p>
            {error && (
              <p className="adminAlert" role="alert">
                {errorText(error)}
              </p>
            )}
          </div>
          <footer>
            <button
              className="adminOutlineBtn"
              disabled={Boolean(busy)}
              onClick={() => setReplacement(null)}
            >
              {tr("admin.followups.adminFollowupDetail.cancel")}
            </button>
            <button
              className="adminOutlineBtn"
              disabled={Boolean(busy)}
              onClick={() => {
                setDraft(replacement);
                setReplacement(null);
                setTab("email");
                setError("");
              }}
            >
              {tr("admin.followups.adminFollowupDetail.discardEdits")}
            </button>
            <button
              className="adminPrimaryBtn"
              disabled={Boolean(busy)}
              onClick={() => {
                if (mutation.current) return;
                mutation.current = true;
                setBusy("draft");
                void persistDraft()
                  .then(() => {
                    setDraft(replacement);
                    setReplacement(null);
                    setTab("email");
                    setError("");
                    setRevision((value) => value + 1);
                  })
                  .catch((err) => setError((err as Error).message))
                  .finally(() => {
                    mutation.current = false;
                    setBusy(null);
                  });
              }}
            >
              {tr("admin.followups.adminFollowupDetail.saveContinue")}
            </button>
          </footer>
        </FollowupDialog>
      )}
    </section>
  );
}
