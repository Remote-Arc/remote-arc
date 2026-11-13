import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { summarizeConsentScopes } from "./oauth-consent-summary.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import { type User } from "../../types/app-types.js";
import { Brand, CenteredCard, LogoMark, PublicLayout } from "../../components/public-layout.js";
import { APP_ORIGIN, MARKETING_ORIGIN } from "../../config/app-config.js";

export function OAuthConsent({ user }: { user: User | null | undefined }) {
  const { tr } = useI18n();
  const [showSignIn, setShowSignIn] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const params = new URLSearchParams(location.search);
  const scopes = (params.get("scope") || "").split(/\s+/).filter(Boolean);
  const clientId = params.get("client_id") || "MCP client";
  const consentGroups = summarizeConsentScopes(scopes);

  async function continueAuthorization(mode: "allow" | "deny") {
    if (decisionBusy) return;
    setDecisionBusy(true);
    setDecisionError("");
    try {
      const body = Object.fromEntries(params.entries());
      delete body.approved;
      delete body.denied;
      const response = await fetch("/oauth/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, decision: mode }),
      });
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        redirect_to?: string;
        error?: string;
      };
      if (!response.ok || !payload.redirect_to) {
        throw new Error(payload.error || tr("auth.authPages.authorizationFailed"));
      }
      location.assign(payload.redirect_to);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : String(error));
      setDecisionBusy(false);
    }
  }

  if (user === undefined) {
    return (
      <CenteredCard
        title={tr("auth.authPages.loading")}
        body={tr("auth.authPages.checkingYourSession")}
      />
    );
  }
  if (!user) {
    return (
      <>
        <CenteredCard
          title={tr("auth.authPages.signInToContinue")}
          body={tr("auth.authPages.chooseARemoteArcAccountBefore")}
        >
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("auth.authPages.signInToRemoteArc")} <span>→</span>
          </button>
        </CenteredCard>
        {showSignIn && (
          <AuthProviderModal
            returnTo={location.pathname + location.search}
            title={tr("auth.authPages.chooseHowToSignIn")}
            body={tr("auth.authPages.signInToTheAccountYou")}
            onClose={() => setShowSignIn(false)}
          />
        )}
      </>
    );
  }

  return (
    <main className="consentShell">
      <Brand compact />
      <section className="consentCard">
        <div className="consentIcon" aria-hidden="true">
          ↗
        </div>
        <span className="eyebrow">{tr("auth.authPages.secureConnection")}</span>
        <h1>{tr("auth.authPages.connectYourAiAssistant")}</h1>
        <p>{tr("auth.authPages.yourAssistantCanWorkWithRemote")}</p>
        <p className="consentAccount">
          {tr("auth.authPages.yourRemoteArcAccount")} · <strong>{user.email}</strong>
        </p>
        <h2 className="consentGroupHeading">{tr("auth.authPages.whatThisEnables")}</h2>
        <div className="consentScopes">
          {consentGroups.map((group) => (
            <div key={group.key}>
              <i aria-hidden="true">{group.icon}</i>
              <span>
                <strong>{tr(group.title)}</strong>
                <small>{tr(group.description)}</small>
              </span>
            </div>
          ))}
        </div>
        {scopes.some((scope) => scope.startsWith("computer:")) && (
          <div className="consentNotice">
            {tr("auth.authPages.workOnAComputerNeedsOne")}{" "}
            <a
              href={MARKETING_ORIGIN + tr("auth.authPages.downloads")}
              target="_blank"
              rel="noreferrer"
            >
              {tr("auth.authPages.getTheAgent")} ↗
            </a>
          </div>
        )}
        <div className="consentNotice">
          {tr("auth.authPages.yourDeviceAndConnectedAppPermissions")}
        </div>
        <details className="consentTechnical">
          <summary>{tr("auth.authPages.technicalPermissions")}</summary>
          <p>{tr("auth.authPages.clientIdentifierNotAVerifiedCompany")}</p>
          <code>{clientId}</code>
          <p>{tr("auth.authPages.requestedScopes")}</p>
          <ul>
            {scopes.map((scope) => (
              <li key={scope}>
                <code>{scope}</code>
              </li>
            ))}
          </ul>
        </details>
        {decisionError && <p className="errorText">{decisionError}</p>}
        <div className="consentActions">
          <button
            className="ghostButton"
            disabled={decisionBusy}
            onClick={() => void continueAuthorization("deny")}
          >
            {tr("auth.authPages.deny")}
          </button>
          <button
            className="approveButton"
            disabled={decisionBusy}
            onClick={() => void continueAuthorization("allow")}
          >
            {decisionBusy ? tr("auth.authPages.authorizing") : tr("auth.authPages.allowAccess")}
          </button>
        </div>
      </section>
    </main>
  );
}
export function AuthProviderModal({
  returnTo,
  title,
  body,
  note,
  onClose,
}: {
  returnTo: string;
  title: string;
  body: string;
  note?: string;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const absoluteReturnTo = (() => {
    try {
      return new URL(returnTo, location.origin).toString();
    } catch {
      return location.origin + "/";
    }
  })();

  const providers = [
    {
      id: "google",
      label: tr("auth.authPages.continueWithGoogle"),
      href: MARKETING_ORIGIN + "/auth/google?return_to=" + encodeURIComponent(absoluteReturnTo),
    },
    {
      id: "email",
      label: tr("auth.authPages.continueWithEmail"),
      href:
        MARKETING_ORIGIN +
        "/auth/login?return_to=" +
        encodeURIComponent(absoluteReturnTo) +
        "#email",
    },
  ];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modalBackdrop installAuthBackdrop" onMouseDown={onClose}>
      <section className="installAuthModal" onMouseDown={(event) => event.stopPropagation()}>
        <button
          className="modalClose"
          type="button"
          onClick={onClose}
          aria-label={tr("auth.authPages.close")}
        >
          ×
        </button>
        <div className="installAuthBrand">
          <LogoMark />
        </div>
        <span className="eyebrow">{tr("auth.authPages.signInToRemoteArc2")}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="installAuthProviders">
          {providers.map((provider) => (
            <a
              className={"authProviderButton " + provider.id}
              href={provider.href}
              key={provider.id}
            >
              <span aria-hidden="true">
                {provider.id === "google" ? (
                  <img src="/google-g.svg" alt="" width={25} height={25} />
                ) : (
                  "✉"
                )}
              </span>
              <strong>{provider.label}</strong>
              <b>→</b>
            </a>
          ))}
        </div>
        <small>{note || tr("auth.authPages.googleAndEmailSignInUse")}</small>
      </section>
    </div>
  );
}
export function DashboardAccess() {
  const { tr } = useI18n();
  const target = encodeURIComponent(APP_ORIGIN + "/overview");
  useEffect(() => {
    // Keep the overview public as a product preview; other dashboard tabs
    // still require login and preserve their original destination.
    if (!UI_PREVIEW && location.pathname !== "/overview") {
      const returnTo = location.pathname + location.search;
      location.replace(APP_ORIGIN + "/auth/login?return_to=" + encodeURIComponent(returnTo));
    }
  }, []);
  if (!UI_PREVIEW && location.pathname !== "/overview") {
    return (
      <CenteredCard
        title={tr("auth.authPages.openingSignIn")}
        body={tr("auth.authPages.takingYouToGoogleOrEmail")}
      />
    );
  }
  return (
    <>
      <PublicLayout>
        <section className="dashboardAccess">
          <div className="dashboardAccessCopy">
            <span className="eyebrow">{tr("auth.authPages.yourRemoteArcControlCenter")}</span>
            <h1>{tr("auth.authPages.yourComputersOneSecureControlCenter")}</h1>
            <p>{tr("auth.authPages.pairWindowsMacosOrLinuxConnect")}</p>
            <div className="guestDashboardActions">
              <a
                className="guestGoogleButton"
                href={APP_ORIGIN + "/auth/google?return_to=" + target}
              >
                <img src="/google-g.svg" alt="" width={22} height={22} />
                {tr("auth.authPages.continueWithGoogle")}
              </a>
              <a
                className="primaryButton"
                href={APP_ORIGIN + "/auth/login?return_to=" + target + "#email"}
              >
                {tr("auth.authPages.continueWithEmail2")} <span>→</span>
              </a>
            </div>
            <a className="guestDashboardWebsiteLink" href={MARKETING_ORIGIN}>
              {tr("auth.authPages.notReadyYetExploreRemoteArc")} ↗
            </a>
            <p className="guestDashboardHint">{tr("auth.authPages.continueWithGoogleOrEmailNo")}</p>
          </div>
          <div className="dashboardAccessPreview" aria-hidden="true">
            <div className="previewTop">
              <span>Remote Arc Dashboard</span>
              <i>{tr("auth.authPages.illustrativePreviewNotLiveData")}</i>
            </div>
            <div className="previewMetricRow">
              <div>
                <small>ONLINE</small>
                <strong>2</strong>
                <span>devices</span>
              </div>
              <div>
                <small>USAGE</small>
                <strong>1.8k</strong>
                <span>/ 10k calls</span>
              </div>
              <div>
                <small>POLICY</small>
                <strong>Safe</strong>
                <span>default mode</span>
              </div>
            </div>
            <div className="previewDevice">
              <i className="onlineDot" />
              <div>
                <strong>Personal Mac</strong>
                <span>macOS · online now</span>
              </div>
              <b>Read + Dev</b>
            </div>
            <div className="previewDevice">
              <i className="onlineDot" />
              <div>
                <strong>Desktop PC</strong>
                <span>Windows · online now</span>
              </div>
              <b>Developer</b>
            </div>
            <div className="previewActivity">
              <span>Recent activity</span>
              <strong>read_file</strong>
              <small>Personal Mac · 12s ago</small>
            </div>
          </div>
        </section>
        <section className="guestDashboardBenefits" aria-label={tr("auth.authPages.whatYouCanDo")}>
          <article>
            <span className="guestBenefitSymbol" aria-hidden="true">
              01
            </span>
            <h2>{tr("auth.authPages.onePlaceForEveryComputer")}</h2>
            <p>{tr("auth.authPages.seeDevicesConnectionsAndExecutionPermissions")}</p>
          </article>
          <article>
            <span className="guestBenefitSymbol" aria-hidden="true">
              02
            </span>
            <h2>{tr("auth.authPages.youControlWhatAiCanDo")}</h2>
            <p>{tr("auth.authPages.approveAvailableToolsControlAccessAnd")}</p>
          </article>
          <article>
            <span className="guestBenefitSymbol" aria-hidden="true">
              03
            </span>
            <h2>{tr("auth.authPages.workThatOutlastsAChat")}</h2>
            <p>{tr("auth.authPages.saveDeviceSideTasksTrackProgress")}</p>
          </article>
        </section>
      </PublicLayout>
    </>
  );
}
