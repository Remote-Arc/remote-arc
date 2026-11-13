import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "../../styles/marketing/public-engagement.css";

type Category = "early_access" | "feedback";
const IS_PREVIEW = import.meta.env.VITE_UI_PREVIEW === "1";

export function EngagementPage({ category }: { category: Category }) {
  const { tr, locale } = useI18n();
  const isLead = category === "early_access";
  return (
    <main className="engagementPage">
      <a className="engagementBack" href={localizedWebsiteHref(isLead ? "/arc" : "/", locale)}>
        ← {tr("marketing.publicEngagement.backToRemoteArc")}
      </a>
      <span className="engagementEyebrow">
        {isLead
          ? tr("marketing.publicEngagement.arcFutureCapabilities")
          : tr("marketing.publicEngagement.remoteArcProductFeedback")}
      </span>
      <h1>
        {isLead
          ? tr("marketing.publicEngagement.helpShapeArcSNextCapabilities")
          : tr("marketing.publicEngagement.helpShapeWhatComesNext")}
      </h1>
      <p className="engagementIntro">
        {isLead
          ? tr("marketing.publicEngagement.whatWorkWouldYouTrustArc")
          : tr("marketing.publicEngagement.shareAnIdeaReportAnIssue")}
      </p>
      {isLead && (
        <p className="engagementIntro">
          <a href="https://agent.remotearc.app/dashboard/agent/chat">
            {tr("marketing.publicEngagement.arcIsAvailableNowOpenThe")} ↗
          </a>
        </p>
      )}
      <EngagementForm category={category} />
    </main>
  );
}

/** Support and Feedback use the same submission API and administrative inbox. */
export function EngagementForm({
  category = "feedback",
  context = "feedback",
}: {
  category?: Category;
  context?: "feedback" | "support" | "enterprise";
}) {
  const { tr, locale } = useI18n();
  const isLead = category === "early_access";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [rewardInfo, setRewardInfo] = useState<{
    enabled: boolean;
    policy: { versionId: string; calls: number; validDays: number; perUserLimit: number } | null;
    account: { email: string; availableCalls: number } | null;
  } | null>(null);
  const [rewardStatus, setRewardStatus] = useState("");
  useEffect(() => {
    if (isLead || context !== "feedback" || IS_PREVIEW) return;
    const controller = new AbortController();
    void fetch("/api/public/feedback-reward", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) {
          const value = await response.json().then(canonicalErrorEnvelope);
          if (!controller.signal.aborted) {
            setRewardInfo(value);
            if (value.enabled && value.account?.email)
              setEmail((current) => current || value.account.email);
          }
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isLead, context]);
  const source =
    context === "enterprise"
      ? "enterprise"
      : context === "support"
        ? "support"
        : new URLSearchParams(location.search).get("source")?.slice(0, 64) || "website";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (IS_PREVIEW) {
      setError(tr("marketing.publicEngagement.thisIsADesignPreviewSubmission"));
      return;
    }
    if (!consent) {
      setError(tr("marketing.publicEngagement.pleaseConfirmTheContactPrivacyAgreement"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/engagement", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          email,
          name,
          message,
          source,
          consent,
          website,
          requestId,
          ...(rewardInfo?.enabled && rewardInfo.account && rewardInfo.policy
            ? { rewardVersionId: rewardInfo.policy.versionId }
            : {}),
        }),
      });
      if (!response.ok) {
        const detail = (await response
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        throw new Error(
          detail.error === "RATE_LIMITED"
            ? tr("marketing.publicEngagement.tooManySubmissionsTryAgainIn")
            : tr("marketing.publicEngagement.submissionUnavailablePleaseRetryLater"),
        );
      }
      const result = await response.json().then(canonicalErrorEnvelope);
      setRewardStatus(result.reward?.status || "");
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : tr("marketing.publicEngagement.networkErrorPleaseRetry"),
      );
    } finally {
      setBusy(false);
    }
  }
  return done ? (
    <div className="engagementSuccess" role="status">
      <span aria-hidden="true">✓</span>
      <h2>{tr("marketing.publicEngagement.thanksWeReceivedYourSubmission")}</h2>
      <p>{tr("marketing.publicEngagement.yourInformationWasSavedWeLl")}</p>
      {rewardStatus && (
        <p>
          {rewardStatus === "pending"
            ? tr("marketing.publicEngagement.yourRewardApplicationIsAwaitingReview")
            : rewardStatus === "granted"
              ? tr("marketing.publicEngagement.yourFeedbackRewardHasBeenGranted")
              : tr("marketing.publicEngagement.yourFeedbackWasSavedThisSubmission")}
        </p>
      )}
      {rewardStatus && (
        <a href="https://agent.remotearc.app/settings?section=billing">
          {tr("marketing.publicEngagement.viewAccountAllowance")} ↗
        </a>
      )}
      <a href={localizedWebsiteHref("/", locale)}>
        {tr("marketing.publicEngagement.returnHome")} ↗
      </a>
    </div>
  ) : (
    <form className="engagementForm" onSubmit={(event) => void submit(event)}>
      {rewardInfo?.enabled && rewardInfo.policy && (
        <aside className="engagementReward">
          <strong>
            {tr("marketing.publicEngagement.feedbackReward")} ·{" "}
            {rewardInfo.policy.calls.toLocaleString()} Connect{" "}
            {tr("marketing.publicEngagement.calls")}
          </strong>
          <p>
            {tr("marketing.publicEngagement.approvedFeedbackEarnsCallsValidFor", {
              calls: rewardInfo.policy.calls,
              validDays: rewardInfo.policy.validDays,
              perUserLimit: rewardInfo.policy.perUserLimit,
            })}
          </p>
          {rewardInfo.account ? (
            <small>
              {tr("marketing.publicEngagement.useTheSignedInAccountS") + rewardInfo.account.email}
            </small>
          ) : (
            <a
              href={
                "https://agent.remotearc.app/auth/login?return_to=" +
                encodeURIComponent("https://remotearc.app" + location.pathname + location.search)
              }
            >
              {tr("marketing.publicEngagement.signInToApplyForA")} ↗
            </a>
          )}
        </aside>
      )}
      <label htmlFor="lead-name">{tr("marketing.publicEngagement.yourNameOptional")}</label>
      <input
        id="lead-name"
        autoComplete="name"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={tr("marketing.publicEngagement.howShouldWeAddressYou")}
      />
      <label htmlFor="lead-email">
        {tr("marketing.publicEngagement.emailAddress")} <span>*</span>
      </label>
      <input
        id="lead-email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <label htmlFor="lead-message">
        {isLead
          ? tr("marketing.publicEngagement.whatWouldYouDelegateToArc")
          : context === "enterprise"
            ? tr("marketing.publicEngagement.yourTeamAndRequirements")
            : context === "support"
              ? tr("marketing.publicEngagement.howCanWeHelp")
              : tr("marketing.publicEngagement.whatWouldYouLikeUsTo")}{" "}
        <span>*</span>
      </label>
      <textarea
        id="lead-message"
        required
        minLength={10}
        maxLength={3000}
        rows={5}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={
          isLead
            ? tr("marketing.publicEngagement.eGEveryMorningSummarizeMy")
            : context === "enterprise"
              ? tr("marketing.publicEngagement.tellUsAboutYourTeamSize")
              : context === "support"
                ? tr("marketing.publicEngagement.whatHappenedWhatDidYouExpect")
                : tr("marketing.publicEngagement.describeTheFeatureIssueOrImprovement")
        }
      />
      {context === "support" && (
        <p className="engagementFinePrint">
          {tr("marketing.publicEngagement.pleaseLeaveOutPasswordsApiKeys")}
        </p>
      )}
      <div className="engagementBotField" aria-hidden="true">
        <label htmlFor="lead-website">Website</label>
        <input
          id="lead-website"
          autoComplete="off"
          tabIndex={-1}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      <label className="engagementConsent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {tr("marketing.publicEngagement.iAgreeThatRemoteArcMay")}{" "}
          <a href={localizedWebsiteHref("/privacy", locale)} target="_blank" rel="noreferrer">
            {tr("marketing.publicEngagement.privacyPolicy")}
          </a>
        </span>
      </label>
      {IS_PREVIEW && (
        <p className="engagementPreviewWarning">
          {tr("marketing.publicEngagement.uiPreviewOnlyNoRealSubmissions")}
        </p>
      )}
      {error && (
        <p className="engagementError" role="alert">
          {error}
        </p>
      )}
      <button className="engagementSubmit" disabled={busy || !consent}>
        {busy
          ? tr("marketing.publicEngagement.submitting")
          : isLead
            ? tr("marketing.publicEngagement.requestEarlyAccess")
            : context === "enterprise"
              ? tr("marketing.publicEngagement.sendEnterpriseEnquiry")
              : context === "support"
                ? tr("marketing.publicEngagement.sendToSupport")
                : tr("marketing.publicEngagement.sendFeedback")}{" "}
        ↗
      </button>
      <p className="engagementFinePrint">
        {tr("marketing.publicEngagement.noMarketingSpamYourInformationIs")}
      </p>
    </form>
  );
}
