import { useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { FOLLOWUP_TEMPLATES } from "../../../../../../packages/protocol/src/followup-templates.js";
import {
  DEFAULT_FOLLOWUP_DESIGN,
  type FollowupDesign,
} from "../../../../../../packages/protocol/src/followup-email.js";
import { followupPresentation } from "../../../../../../packages/protocol/src/followup-email-content.js";
import { FollowupDialog } from "./admin-followup-detail.js";
import { FollowupEmailPreview } from "./followup-email-preview.js";
import { followupApi, followupReason, type BatchDetail } from "./followup-model.js";

export function FollowupBulk({
  open,
  userIds,
  defaultTemplate,
  onClose,
  onQueued,
}: {
  open: boolean;
  userIds: string[];
  defaultTemplate: string;
  onClose: () => void;
  onQueued: (id: string) => void;
}) {
  const { tr } = useI18n();
  const [language, setLanguage] = useState<"en" | "zh">("en"),
    [templateId, setTemplateId] = useState(defaultTemplate);
  const initial = FOLLOWUP_TEMPLATES.find((item) => item.id === templateId)!;
  const [subject, setSubject] = useState<string>(initial.subject[0]),
    [body, setBody] = useState<string>(initial.body[0]);
  const [title, setTitle] = useState(
    tr("admin.followups.followupBulk.followUp") + " · " + new Date().toISOString().slice(0, 10),
  );
  const [design, setDesign] = useState<FollowupDesign>({
    ...DEFAULT_FOLLOWUP_DESIGN,
    highlights: [],
  });
  // Empty appearance fields use the template's own text; show it as the placeholder.
  const templateDefaults = followupPresentation(templateId, language, {
    setupUrl: "https://remotearc.app/connect-ai",
    feedbackUrl: "https://remotearc.app/feedback",
  });
  const [basis, setBasis] = useState(""),
    [basisNote, setBasisNote] = useState(""),
    [id, setId] = useState<string>(() => crypto.randomUUID());
  const [detail, setDetail] = useState<BatchDetail | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitted = useRef<{ fingerprint: string; id: string } | null>(null);
  const [replacement, setReplacement] = useState<{ id: string; language: "en" | "zh" } | null>(
    null,
  );
  const loadTemplate = (id: string, lang: "en" | "zh") => {
    const template = FOLLOWUP_TEMPLATES.find((item) => item.id === id)!;
    setTemplateId(id);
    setLanguage(lang);
    setSubject(template.subject[lang === "zh" ? 1 : 0]);
    setBody(template.body[lang === "zh" ? 1 : 0]);
  };
  const chooseTemplate = (id: string, lang: "en" | "zh") => {
    const current = FOLLOWUP_TEMPLATES.find((item) => item.id === templateId)!;
    if (
      subject !== current.subject[language === "zh" ? 1 : 0] ||
      body !== current.body[language === "zh" ? 1 : 0]
    )
      setReplacement({ id, language: lang });
    else loadTemplate(id, lang);
  };
  async function prepare() {
    setError("");
    if (!title.trim() || !subject.trim() || body.trim().length < 20) {
      setError(tr("admin.followups.followupBulk.enterABatchNameSubjectAnd"));
      return;
    }
    const content = {
        title,
        userIds,
        templateId,
        locale: language,
        subject,
        body,
        design,
        basis,
        basisNote,
      },
      fingerprint = JSON.stringify(content);
    const requestId =
      submitted.current?.fingerprint === fingerprint ? submitted.current.id : crypto.randomUUID();
    submitted.current = { fingerprint, id: requestId };
    setId(requestId);
    setBusy(true);
    try {
      setDetail(
        await followupApi<BatchDetail>("/batches", {
          method: "POST",
          body: JSON.stringify({ id: requestId, ...content }),
        }),
      );
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  async function preview(userId: string) {
    setBusy(true);
    setError("");
    try {
      setDetail(
        await followupApi<BatchDetail>(
          "/batches/" + id + "?previewUser=" + encodeURIComponent(userId),
        ),
      );
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  async function edit() {
    setBusy(true);
    setError("");
    try {
      await followupApi("/batches/" + id + "/cancel", { method: "POST", body: "{}" });
      setDetail(null);
      submitted.current = null;
      setId(crypto.randomUUID());
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  async function queue() {
    setBusy(true);
    setError("");
    try {
      await followupApi("/batches/" + id + "/queue", { method: "POST", body: "{}" });
      onQueued(id);
    } catch (err) {
      setError(followupReason((err as Error).message, tr));
    } finally {
      setBusy(false);
    }
  }
  if (!open) return null;
  const eligible = detail?.batch.pending || 0,
    remaining = detail?.emailBudget?.remaining;
  return (
    <FollowupDialog
      title={
        detail
          ? tr("admin.followups.followupBulk.reviewBulkFollowUp")
          : tr("admin.followups.followupBulk.composeBulkFollowUp")
      }
      busy={busy}
      onClose={onClose}
      className="followupBatchDialog"
    >
      <div className="followupReviewBody followupBulkBody">
        <ol
          className="followupBatchSteps"
          aria-label={tr("admin.followups.followupBulk.bulkFollowUpSteps")}
        >
          <li data-active={!detail}>1 · {tr("admin.followups.followupBulk.compose")}</li>
          <li data-active={Boolean(detail)}>
            2 · {tr("admin.followups.followupBulk.reviewRecipientsContent")}
          </li>
          <li>3 · {tr("admin.followups.followupBulk.sendInBackground")}</li>
        </ol>
        {error && (
          <p className="adminAlert" role="alert">
            {error}
          </p>
        )}
        {!detail ? (
          <>
            <p className="followupBulkIntro">
              {tr("admin.followups.followupBulk.aSeparatePersonalizedEmailForEach")}{" "}
              <strong>
                {userIds.length} {tr("admin.followups.followupBulk.selected")}
              </strong>
            </p>
            {replacement && (
              <div className="followupTemplateChange" role="status">
                <p>{tr("admin.followups.followupBulk.replaceTheCurrentSubjectAndMessage")}</p>
                <div>
                  <button
                    type="button"
                    className="adminOutlineBtn"
                    onClick={() => setReplacement(null)}
                  >
                    {tr("admin.followups.followupBulk.keepCurrentText")}
                  </button>
                  <button
                    type="button"
                    className="adminOutlineBtn"
                    onClick={() => {
                      loadTemplate(replacement.id, replacement.language);
                      setReplacement(null);
                    }}
                  >
                    {tr("admin.followups.followupBulk.useNewTemplate")}
                  </button>
                </div>
              </div>
            )}
            <fieldset className="followupEditor" disabled={busy}>
              <label>
                {tr("admin.followups.followupBulk.batchName")}
                <input
                  value={title}
                  maxLength={120}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <div className="adminFollowupTwo">
                <label>
                  {tr("admin.followups.followupBulk.template")}
                  <select
                    aria-label={tr("admin.followups.followupBulk.bulkTemplate")}
                    value={templateId}
                    onChange={(event) => chooseTemplate(event.target.value, language)}
                  >
                    {FOLLOWUP_TEMPLATES.map((item) => (
                      <option value={item.id} key={item.id}>
                        {tr(item.en, item.zh)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {tr("admin.followups.followupBulk.emailLanguage")}
                  <select
                    value={language}
                    onChange={(event) =>
                      chooseTemplate(templateId, event.target.value as "en" | "zh")
                    }
                  >
                    <option value="en">English</option>
                    <option value="zh">中文</option>
                  </select>
                </label>
              </div>
              <label>
                {tr("admin.followups.followupBulk.subject")}
                <input
                  aria-label={tr("admin.followups.followupBulk.bulkSubject")}
                  value={subject}
                  maxLength={200}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label>
                {tr("admin.followups.followupBulk.message")}
                <textarea
                  aria-label={tr("admin.followups.followupBulk.bulkMessage")}
                  value={body}
                  rows={10}
                  maxLength={6000}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <p className="followupTokenHelp">
                {tr("admin.followups.followupBulk.personalization")} <code>{"{{name}}"}</code>{" "}
                {tr("admin.followups.followupBulk.userName")} · <code>{"{{feedbackUrl}}"}</code>{" "}
                {tr("admin.followups.followupBulk.personalFeedbackLink")} ·{" "}
                <code>{"{{setupUrl}}"}</code> {tr("admin.followups.followupBulk.setupGuide")} ·{" "}
                <code>{"{{installCommand}}"}</code>{" "}
                {tr("admin.followups.followupBulk.installCommand")} ·{" "}
                <code>{"{{downloadsUrl}}"}</code> {tr("admin.followups.followupBulk.downloadsPage")}{" "}
                · <code>{"{{upgradeUrl}}"}</code>{" "}
                {tr("admin.followups.followupBulk.upgradeOptions")}
              </p>
              <details className="adminFollowupDesign">
                <summary>{tr("admin.followups.followupBulk.emailAppearance")}</summary>
                <div className="adminFollowupTwo">
                  <label>
                    {tr("admin.followups.followupBulk.layout")}
                    <select
                      value={design.layout}
                      onChange={(event) =>
                        setDesign((value) => ({
                          ...value,
                          layout: event.target.value as FollowupDesign["layout"],
                        }))
                      }
                    >
                      <option value="spotlight">
                        {tr("admin.followups.followupBulk.spotlight")}
                      </option>
                      <option value="letter">{tr("admin.followups.followupBulk.letter")}</option>
                      <option value="digest">{tr("admin.followups.followupBulk.digest")}</option>
                    </select>
                  </label>
                  <label>
                    {tr("admin.followups.followupBulk.brandColor")}
                    <input
                      type="color"
                      value={design.accent}
                      onChange={(event) =>
                        setDesign((value) => ({ ...value, accent: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label>
                  {tr("admin.followups.followupBulk.headline")}
                  <input
                    value={design.headline}
                    maxLength={200}
                    placeholder={templateDefaults.headline}
                    onChange={(event) =>
                      setDesign((value) => ({ ...value, headline: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {tr("admin.followups.followupBulk.introduction")}
                  <textarea
                    rows={2}
                    value={design.intro}
                    maxLength={500}
                    placeholder={templateDefaults.intro}
                    onChange={(event) =>
                      setDesign((value) => ({ ...value, intro: event.target.value }))
                    }
                  />
                </label>
              </details>
              <div className="followupBulkBasis">
                <label>
                  {tr("admin.followups.followupBulk.contactBasisForThisGroupOptional")}
                  <select
                    aria-label={tr("admin.followups.followupBulk.bulkContactBasis")}
                    value={basis}
                    onChange={(event) => setBasis(event.target.value)}
                  >
                    <option value="">
                      {tr("admin.followups.followupBulk.notRecordedContinueWithoutAddingA")}
                    </option>
                    <option value="existing">
                      {tr("admin.followups.followupBulk.useEachUserSExistingRecorded")}
                    </option>
                    <option value="support">
                      {tr("admin.followups.followupBulk.theseUsersRequestedInstallationOrProduct")}
                    </option>
                    <option value="agreed">
                      {tr("admin.followups.followupBulk.theseUsersAgreedToThisProduct")}
                    </option>
                  </select>
                </label>
                <label>
                  {tr("admin.followups.followupBulk.sourceNoteOptional")}
                  <input
                    value={basisNote}
                    maxLength={500}
                    onChange={(event) => setBasisNote(event.target.value)}
                    placeholder={tr(
                      "admin.followups.followupBulk.forExampleSupportRequestOrConversation",
                    )}
                  />
                </label>
              </div>
            </fieldset>
          </>
        ) : (
          <>
            <div className="followupBatchReviewStats">
              <div>
                <strong>{eligible}</strong>
                <span>{tr("admin.followups.followupBulk.readyToSend")}</span>
              </div>
              <div>
                <strong>{detail.batch.skipped}</strong>
                <span>{tr("admin.followups.followupBulk.excluded")}</span>
              </div>
              <div>
                <strong>{detail.batch.total}</strong>
                <span>{tr("admin.followups.followupBulk.selectedUsers")}</span>
              </div>
            </div>
            {remaining !== undefined && eligible > remaining && (
              <p className="followupBudgetNote" role="status">
                {tr("admin.followups.followupBulk.ofTheseCanGoOutNow", { remaining })}
              </p>
            )}
            <dl>
              <dt>{tr("admin.followups.followupBulk.from")}</dt>
              <dd>{detail.sender.from}</dd>
              <dt>{tr("admin.followups.followupBulk.replyTo")}</dt>
              <dd>{detail.sender.replyTo}</dd>
            </dl>
            {detail.recipients.some((person) => person.status === "skipped") && (
              <details className="followupExcluded">
                <summary>
                  {tr("admin.followups.followupBulk.whySomeUsersAreExcluded")} ·{" "}
                  {detail.batch.skipped}
                </summary>
                <ul>
                  {detail.recipients
                    .filter((person) => person.status === "skipped")
                    .map((person) => (
                      <li key={person.user_id}>
                        <span>{person.name || person.email}</span>
                        <small>{followupReason(person.error_code, tr)}</small>
                      </li>
                    ))}
                </ul>
              </details>
            )}
            {detail.preview ? (
              <>
                <label className="followupPreviewRecipient">
                  {tr("admin.followups.followupBulk.previewAsRecipient")}
                  <select
                    aria-label={tr("admin.followups.followupBulk.previewRecipient")}
                    disabled={busy}
                    value={detail.preview.user_id}
                    onChange={(event) => void preview(event.target.value)}
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
                <p>
                  <strong>{detail.preview.subject}</strong>
                </p>
                <FollowupEmailPreview
                  html={detail.preview.html_body}
                  title={tr("admin.followups.followupBulk.personalizedBulkEmail")}
                />
              </>
            ) : (
              <p className="adminNoData">
                {tr("admin.followups.followupBulk.noRecipientsAreEligibleReviewThe")}
              </p>
            )}
            <p className="followupBulkIntro">
              {tr("admin.followups.followupBulk.sendingContinuesInTheBackgroundAfter")}
            </p>
          </>
        )}
      </div>
      <footer>
        {detail ? (
          <>
            <button
              type="button"
              className="adminOutlineBtn"
              disabled={busy}
              onClick={() => void edit()}
            >
              {tr("admin.followups.followupBulk.backToEditing")}
            </button>
            <button
              type="button"
              className="adminPrimaryBtn"
              disabled={
                busy || eligible === 0 || !detail.emailConfigured || detail.batch.status !== "draft"
              }
              onClick={() => void queue()}
            >
              {busy
                ? tr("admin.followups.followupBulk.queueing")
                : tr("admin.followups.followupBulk.confirmSend") +
                  eligible +
                  (eligible === 1
                    ? tr("admin.followups.followupBulk.email")
                    : tr("admin.followups.followupBulk.emails"))}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="adminOutlineBtn" disabled={busy} onClick={onClose}>
              {tr("admin.followups.followupBulk.close")}
            </button>
            <button
              type="button"
              className="adminPrimaryBtn"
              disabled={busy || Boolean(replacement)}
              onClick={() => void prepare()}
            >
              {busy
                ? tr("admin.followups.followupBulk.preparing")
                : tr("admin.followups.followupBulk.reviewRecipientsEmails")}
            </button>
          </>
        )}
      </footer>
    </FollowupDialog>
  );
}
