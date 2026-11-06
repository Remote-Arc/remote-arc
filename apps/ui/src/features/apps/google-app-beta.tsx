import type { MessageKey } from "../../locales/locale-catalog.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/apps/google-app-beta.css";

export type GoogleBetaState = {
  mode: "beta" | "public";
  email: string;
  request: {
    googleEmail: string;
    providers: string[];
    status: "pending" | "approved" | "declined";
    createdAt: string;
  } | null;
};
export function AppsPolicyDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLDivElement>(null),
    close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.body.children).filter(
      (item): item is HTMLElement => item instanceof HTMLElement && !item.contains(ref.current),
    );
    const inert = background.map((item) => item.inert);
    background.forEach((item) => {
      item.inert = true;
    });
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key !== "Tab") return;
      event.stopPropagation();
      const items = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
        ) || [],
      ).filter((item) => item.getClientRects().length);
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      background.forEach((item, index) => {
        item.inert = inert[index]!;
      });
      if (previous?.isConnected) previous.focus();
    };
  }, [onClose]);
  return createPortal(
    <div className="appsPolicyOverlay workspaceSurface">
      <div
        ref={ref}
        className="appsPolicyDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apps-policy-title"
      >
        <header>
          <h2 id="apps-policy-title">{title}</h2>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label={tr("apps.googleAppBeta.close")}
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}
const dataTypes: Record<string, MessageKey> = {
  gmail: "apps.googleAppBeta.emailMessagesAttachmentsAndLabels",
  google_calendar: "apps.googleAppBeta.calendarsEventsAndAvailability",
  google_drive: "apps.googleAppBeta.fileContentsMetadataAndFolders",
  google_docs: "apps.googleAppBeta.documentContents",
  google_sheets: "apps.googleAppBeta.spreadsheetContents",
  google_slides: "apps.googleAppBeta.presentationContents",
  youtube: "apps.googleAppBeta.channelVideoAndPlaylistData",
  google_search_console: "apps.googleAppBeta.siteSearchPerformanceAndSitemap",
  google_analytics: "apps.googleAppBeta.analyticsReportsPropertiesAndCustom",
  google_ads: "apps.googleAppBeta.advertisingAccountsReportsAndSupported",
};
export function GoogleDataNotice({
  provider,
  checked,
  onChange,
}: {
  provider: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { tr } = useI18n();
  const data = dataTypes[provider] ?? "apps.googleAppBeta.googleAccountData";
  return (
    <section
      className="appsGoogleNotice"
      aria-label={tr("apps.googleAppBeta.googleDataUseAndSharing")}
    >
      <p>{tr("apps.googleAppBeta.remoteArcUsesTheData", { data: tr(data) })}</p>
      <p>{tr("apps.googleAppBeta.encryptedCallContentsExpireAfterDays")}</p>
      <p>
        {tr("apps.googleAppBeta.remoteArcDoesNotUseGoogle")}{" "}
        <a
          href={tr("apps.googleAppBeta.httpsRemotearcAppPrivacyGoogle")}
          target="_blank"
          rel="noreferrer"
        >
          {tr("apps.googleAppBeta.dataUseAndDeletionDetails")}
        </a>
      </p>
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{tr("apps.googleAppBeta.iAgreeToThisUseAnd")}</span>
      </label>
    </section>
  );
}
export function GoogleConsentDialog({
  provider,
  name,
  busy,
  onAccept,
  onClose,
}: {
  provider: string;
  name: string;
  busy: boolean;
  onAccept: () => void;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const [accepted, setAccepted] = useState(false);
  return (
    <AppsPolicyDialog title={tr("apps.googleAppBeta.useWithYourAi", { name })} onClose={onClose}>
      <GoogleDataNotice provider={provider} checked={accepted} onChange={setAccepted} />
      <button
        className="appsManagerPrimary"
        type="button"
        disabled={busy || !accepted}
        onClick={onAccept}
      >
        {tr("apps.googleAppBeta.agreeAndContinue")}
      </button>
    </AppsPolicyDialog>
  );
}
export function GoogleBetaApplication({
  apps,
  initialProvider,
  state,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  apps: { provider: string; name: string }[];
  initialProvider: string;
  state: GoogleBetaState;
  busy: boolean;
  error: string;
  onSubmit: (input: {
    googleEmail: string;
    providers: string[];
    useCase: string;
    betaTerms: true;
  }) => void;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const [email, setEmail] = useState(state.request?.googleEmail || state.email),
    [providers, setProviders] = useState(() =>
      apps.some((app) => app.provider === initialProvider) ? [initialProvider] : [],
    ),
    [useCase, setUseCase] = useState(""),
    [accepted, setAccepted] = useState(false);
  return (
    <AppsPolicyDialog title={tr("apps.googleAppBeta.applyForGoogleAppsBeta")} onClose={onClose}>
      {state.request ? (
        <>
          <p role="status">
            {state.request.status === "pending"
              ? tr("apps.googleAppBeta.yourApplicationIsWaitingForReview")
              : state.request.status === "approved"
                ? tr("apps.googleAppBeta.yourApprovedAppsAreReadyTo")
                : tr("apps.googleAppBeta.accessHasNotBeenOpenedContact")}
          </p>
          <p>{state.request.googleEmail}</p>
          <a href="mailto:support@remotearc.app">support@remotearc.app</a>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (accepted && providers.length)
              onSubmit({ googleEmail: email, providers, useCase, betaTerms: true });
          }}
        >
          <p>{tr("apps.googleAppBeta.requestAccessBelowConnectYourGoogle")}</p>
          <label>
            {tr("apps.googleAppBeta.googleAccountEmail")}
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <fieldset>
            <legend>{tr("apps.googleAppBeta.appsYouWantToTry")}</legend>
            {apps.map((app) => (
              <label key={app.provider}>
                <input
                  type="checkbox"
                  checked={providers.includes(app.provider)}
                  onChange={(event) =>
                    setProviders((values) =>
                      event.target.checked
                        ? [...values, app.provider]
                        : values.filter((value) => value !== app.provider),
                    )
                  }
                />
                {app.name}
              </label>
            ))}
          </fieldset>
          <details className="appsBetaUseCase">
            <summary>{tr("apps.googleAppBeta.addAUseCaseOptional")}</summary>
            <textarea
              aria-label={tr("apps.googleAppBeta.whatWouldYouLikeToDo")}
              value={useCase}
              onChange={(event) => setUseCase(event.target.value)}
              maxLength={500}
              rows={2}
            />
          </details>
          <p>{tr("apps.googleAppBeta.limitedPlacesGoogleAuthorizationNormallyExpires")}</p>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>{tr("apps.googleAppBeta.iUnderstandTheTestingLimitsAnd")}</span>
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            className="appsManagerPrimary"
            type="submit"
            disabled={busy || !accepted || !providers.length}
          >
            {busy
              ? tr("apps.googleAppBeta.submitting")
              : tr("apps.googleAppBeta.submitApplication")}
          </button>
        </form>
      )}
    </AppsPolicyDialog>
  );
}
