import type { MessageKey } from "../../locales/locale-catalog.js";
import type { Translate } from "../../locales/locale-catalog.js";
import {
  canonicalErrorEnvelope,
  canonicalErrorCode,
} from "../../../../../packages/protocol/src/error-codes.js";
import { SlackBotPanel } from "./slack-bot-panel.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../hooks/use-i18n.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import "../../styles/apps/apps-manager.css";
import { ProductIcon } from "../../components/product-icon.js";
import directory from "../../data/app-directory.json" with { type: "json" };
import { AppCredentialForm, type AppCredentialInput } from "./apps-auth-form.js";
import {
  GoogleBetaApplication,
  GoogleConsentDialog,
  type GoogleBetaState,
} from "./google-app-beta.js";
import { billingRecovery } from "../../../../../packages/protocol/src/billing-recovery.js";
import { BillingRecoveryActions } from "../billing/billing-recovery-actions.js";

type Permission = "read" | "write";
export type AppDefinition = {
  provider: string;
  name: string;
  brand: string;
  configured: boolean;
  category?: string;
  auth?: "oauth" | "api_key";
  billingNote?: string;
  connectionNote?: string;
  operations: {
    name: string;
    description: string;
    permission: Permission;
    inputSchema?: unknown;
  }[];
  permissions: { read: string[]; write: string[] };
  consentNote?: string;
  dataPolicy?: { version: string; retentionDays: number };
  requiresBetaApproval?: boolean;
};
export type AppConnection = {
  id: string;
  provider: string;
  accountLabel: string;
  status: string;
  settings?: Record<string, string>;
  dailyCallLimit?: number;
  permissions: Permission[];
  scopes: string[];
  expiresAt: string | null;
  lastError: string | null;
  updatedAt: string;
  toolAccess?: { available: number; total: number; needsReconnect: boolean };
  dataConsentRequired?: boolean;
};
export type AppConnectionCheck = {
  connectionId: string;
  provider: string;
  accountLabel: string;
  checkedAt: string;
  verification: "provider_identity_checked";
  toolAccess: { available: number; total: number; needsReconnect: boolean };
};
export type AppApproval = {
  id: string;
  connectionId: string;
  operation: string;
  status: string;
  expiresAt: string;
  arguments: Record<string, unknown>;
  review?: Record<string, unknown>;
};
export type AppsSnapshot = {
  enabled: boolean;
  apps: AppDefinition[];
  connections: AppConnection[];
  googleBeta?: GoogleBetaState;
};
export type AppsRequest = (path: string, init?: RequestInit) => Promise<unknown>;

const brandFiles: Record<string, string> = Object.fromEntries(
  directory.apps.map((app) => [app.brand, app.brand]),
);
const connectedPermissions: Permission[] = ["read", "write"];

export function AppIcon({ brand }: { brand: string }) {
  const file = brandFiles[brand];
  return (
    <span className="appsManagerBrand" data-brand={file || "generic"}>
      {file ? (
        <img src={"/app-brands/" + file + ".svg"} alt="" width={30} height={30} />
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
        </svg>
      )}
    </span>
  );
}
async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response
    .json()
    .then(canonicalErrorEnvelope)
    .catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "APP_SERVICE_UNAVAILABLE");
  if (!body) throw new Error("APP_SERVICE_UNAVAILABLE");
  return body;
}
function statusLabel(status: string, tr: Translate) {
  switch (status) {
    case "active":
      return tr("apps.appsManager.connected");
    case "disconnected":
      return tr("apps.appsManager.disconnected");
    case "reauthorization_required":
      return tr("apps.appsManager.reconnectRequired");
    case "pending_approval":
      return tr("apps.appsManager.awaitingReview");
    case "approved":
      return tr("apps.appsManager.approved");
    case "running":
      return tr("apps.appsManager.running");
    case "unknown":
      return tr("apps.appsManager.outcomeUnknown");
    default:
      return tr("apps.appsManager.unavailable");
  }
}
function errorLabel(code: string, tr: Translate) {
  code = canonicalErrorCode(code) || code;
  const recovery = billingRecovery(code);
  if (recovery) return tr(...recovery.message);
  switch (code) {
    case "UNAUTHORIZED":
      return tr("apps.appsManager.yourSessionExpiredSignInAgain");
    case "APPS_NOT_ENABLED":
      return tr("apps.appsManager.appsAreNotEnabledYetContact");
    case "APP_NOT_CONFIGURED":
      return tr("apps.appsManager.thisProviderHasNotBeenConfigured");
    case "SLACK_DISTRIBUTION_REQUIRED":
      return tr("apps.appsManager.slackInstallationIsNotAvailableFor");
    case "APP_AUTHORIZATION_DENIED":
      return tr("apps.appsManager.slackAuthorizationWasCancelledOrDenied");
    case "SLACK_BOT_INSTALLATION_FAILED":
      return tr("apps.appsManager.slackBotInstallationCouldNotBe");
    case "APP_SCOPE_REQUIRED":
      return tr("apps.appsManager.theProviderNeedsAdditionalPermissionsReconnect");
    case "GOOGLE_APPS_BETA_INVITATION_REQUIRED":
      return tr("apps.appsManager.applyForGoogleAppsBetaBefore");
    case "GOOGLE_APP_DATA_CONSENT_REQUIRED":
      return tr("apps.appsManager.reviewGoogleDataUseInApps");
    case "APP_REAUTHORIZATION_REQUIRED":
      return tr("apps.appsManager.thisAccountNeedsAuthorizationAgainReconnect");
    case "APP_ACCOUNT_CHANGED":
      return tr("apps.appsManager.theProviderReturnedADifferentAccount");
    case "APP_CONNECTION_CHANGED":
      return tr("apps.appsManager.thisConnectionChangedDuringTheCheck");
    case "APP_RATE_LIMITED":
      return tr("apps.appsManager.theProviderIsTemporarilyLimitingRequests");
    case "APP_REFRESH_IN_PROGRESS":
      return tr("apps.appsManager.theAccountIsRefreshingItsAuthorization");
    case "APP_PROVIDER_UNAVAILABLE":
    case "APP_PROVIDER_FAILED":
      return tr("apps.appsManager.theProviderIsTemporarilyUnavailableTry");
    case "MCP_PAUSED":
      return tr("apps.appsManager.toolAccessIsPausedResumeIt");
    case "APP_PERMISSION_REQUIRED":
      return tr("apps.appsManager.thisConnectionDoesNotAllowThat");
    case "APP_APPROVAL_UNAVAILABLE":
      return tr("apps.appsManager.thisApprovalExpiredOrTheConnection");
    case "APP_DAILY_LIMIT_REACHED":
      return tr("apps.appsManager.thisConnectionOrProviderReachedIts");
    case "APP_COST_LIMIT":
      return tr("apps.appsManager.theEstimatedUsageExceedsTheLimit");
    case "APP_USER_TOKEN_REQUIRED":
      return tr("apps.appsManager.reconnectXToAuthorizeYourUser");
    case "APP_WHATSAPP_SETTINGS_REQUIRED":
      return tr("apps.appsManager.enterYourWhatsappBusinessAccountAnd");
    case "APP_SHOP_DOMAIN_REQUIRED":
      return tr("apps.appsManager.enterTheStoreSMyshopifyCom");
    case "APP_CONNECTION_NOT_FOUND":
      return tr("apps.appsManager.thisConnectionNoLongerExistsRefresh");
    default:
      return tr("apps.appsManager.appsCouldNotBeUpdatedCheck");
  }
}

function ConnectionRow({
  app,
  connection,
  busy,
  onAuthorize,
  onDisconnect,
  onCheck,
  onConsent,
  onErase,
}: {
  app: AppDefinition;
  connection: AppConnection;
  busy: boolean;
  onAuthorize: (
    provider: string,
    permissions: Permission[],
    settings?: Record<string, string>,
  ) => void;
  onDisconnect: (connection: AppConnection) => void;
  onCheck: (connection: AppConnection) => Promise<AppConnectionCheck | undefined>;
  onConsent: (connection: AppConnection) => void;
  onErase: (connection: AppConnection) => void;
}) {
  const { tr } = useI18n();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [verification, setVerification] = useState<AppConnectionCheck>();
  useEffect(() => {
    setConfirmDisconnect(false);
  }, [connection.id, connection.status]);
  useEffect(() => {
    setVerification(undefined);
  }, [connection.id, connection.status, connection.updatedAt]);
  const active = connection.status === "active";
  const needsScopes =
    connection.toolAccess?.needsReconnect === true && !connection.dataConsentRequired;
  return (
    <article className="appsManagerConnection" data-status={connection.status}>
      <div className="appsManagerConnectionTop">
        <strong>{connection.accountLabel}</strong>
        <span
          className="appsManagerStatus"
          data-status={needsScopes ? "limited" : connection.status}
        >
          {needsScopes ? tr("apps.appsManager.updateAccess") : statusLabel(connection.status, tr)}
        </span>
      </div>
      {connection.status === "reauthorization_required" && (
        <p className="appsManagerConnectionHint">
          {tr("apps.appsManager.providerAccessExpiredOrWasRevoked")}
        </p>
      )}
      {needsScopes && (
        <p className="appsManagerConnectionHint">
          {tr("apps.appsManager.someToolsNeedAdditionalProviderPermissions")}
        </p>
      )}
      {verification && (
        <p className="appsManagerConnectionCheck" role="status">
          <ProductIcon name="check" size={15} />
          <span>
            {tr("apps.appsManager.accountAccessVerified")} · {verification.toolAccess.available}/
            {verification.toolAccess.total} {tr("apps.appsManager.toolsAuthorized")}
          </span>
        </p>
      )}
      <div className="appsManagerConnectionActions">
        {(!active || needsScopes) && (
          <button
            type="button"
            className="appsManagerPrimary"
            disabled={busy || !app.configured}
            onClick={() => onAuthorize(app.provider, connectedPermissions, connection.settings)}
          >
            {tr("apps.appsManager.reconnectAccount")}
          </button>
        )}
        {connection.dataConsentRequired && (
          <button type="button" disabled={busy} onClick={() => onConsent(connection)}>
            {tr("apps.appsManager.reviewDataAccess")}
          </button>
        )}
        {active && !connection.dataConsentRequired && (
          <button
            type="button"
            disabled={busy || !app.configured}
            onClick={async () => {
              setVerification(undefined);
              setVerification(await onCheck(connection));
            }}
          >
            {tr("apps.appsManager.checkConnection")}
          </button>
        )}
        {connection.status !== "disconnected" && (
          <button
            type="button"
            className="appsManagerTextAction"
            disabled={busy}
            onClick={() => setConfirmDisconnect(true)}
          >
            {tr("apps.appsManager.disconnect")}
          </button>
        )}
        {app.dataPolicy && (
          <button
            type="button"
            className="appsManagerTextAction"
            disabled={busy}
            onClick={() => setConfirmErase(true)}
          >
            {tr("apps.appsManager.deleteSavedCallData")}
          </button>
        )}
      </div>
      {confirmDisconnect && (
        <div
          className="appsManagerDisconnect"
          role="group"
          aria-label={tr("apps.appsManager.confirmAccountDisconnection")}
        >
          <p>{tr("apps.appsManager.disconnectThisAccountArcAndConnected")}</p>
          <div>
            <button
              type="button"
              className="appsManagerDanger"
              disabled={busy}
              onClick={() => onDisconnect(connection)}
            >
              {tr("apps.appsManager.confirmDisconnect")}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)}>
              {tr("apps.appsManager.keepConnected")}
            </button>
          </div>
        </div>
      )}
      {confirmErase && (
        <div
          className="appsManagerDisconnect"
          role="group"
          aria-label={tr("apps.appsManager.confirmDeletionOfSavedCallData")}
        >
          <p>{tr("apps.appsManager.permanentlyDeleteBackgroundCallContentsFor")}</p>
          <div>
            <button
              type="button"
              className="appsManagerDanger"
              disabled={busy}
              onClick={() => {
                onErase(connection);
                setConfirmErase(false);
              }}
            >
              {tr("apps.appsManager.deleteCallContents")}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirmErase(false)}>
              {tr("apps.appsManager.cancel")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

type AppPanelTab = "accounts" | "tools";

const appSummaries: Record<string, MessageKey> = {
  github: "apps.appsManager.workWithRepositoriesIssuesPull",
  slack: "apps.appsManager.findConversationsShareUpdatesAnd",
  gmail: "apps.appsManager.findEmailsPrepareRepliesAnd",
  outlook: "apps.appsManager.readMailDraftRepliesAnd",
  google_calendar: "apps.appsManager.checkAvailabilityAndKeepMeetings",
  microsoft_calendar: "apps.appsManager.planMeetingsAndRespondTo",
  google_drive: "apps.appsManager.findFilesReadDocumentsAnd",
  google_docs: "apps.appsManager.createDocumentsAndTurnYour",
  google_sheets: "apps.appsManager.readDataUpdateSpreadsheetsAnd",
  notion: "apps.appsManager.findKnowledgeCreatePagesAnd",
  linear: "apps.appsManager.trackIssuesAndTurnNext",
  vercel: "apps.appsManager.inspectProjectsCheckDeploymentsAnd",
  jira: "apps.appsManager.findIssuesAddContextAnd",
  confluence: "apps.appsManager.findTeamSpacesReadPages",
  runway: "apps.appsManager.generateImagesAndVideosThen",
  youtube: "apps.appsManager.exploreVideosAndCreateEdit",
  facebook: "apps.appsManager.followYourPagesAndPublish",
  instagram: "apps.appsManager.manageMediaPublishContentAnd",
  x: "apps.appsManager.readYourPostsAndCreate",
  whatsapp: "apps.appsManager.sendBusinessMessagesAndWork",
  linkedin: "apps.appsManager.publishProfessionalUpdatesAndManage",
  google_search_console: "apps.appsManager.analyzeSearchTrafficAndSubmit",
  google_analytics: "apps.appsManager.exploreTrafficAndCreateOr",
  google_ads: "apps.appsManager.reviewAdPerformancePauseDelivery",
  meta_ads: "apps.appsManager.reviewCampaignResultsAndPause",
  shopify: "apps.appsManager.reviewOrdersBrowseProductsAnd",
  supabase: "apps.appsManager.inspectProjectsQueryDataAnd",
  hubspot: "apps.appsManager.followDealsAndKeepCustomer",
  salesforce: "apps.appsManager.reviewOpportunitiesAndManageCustomer",
  google_slides: "apps.appsManager.readPresentationsCreateSlidesAnd",
  onedrive: "apps.appsManager.findFilesCreateFoldersAnd",
  microsoft_excel: "apps.appsManager.readWorkbookDataUpdateCells",
  microsoft_teams: "apps.appsManager.readChatsAndSendEdit",
  microsoft_todo: "apps.appsManager.readTaskListsCreateTasks",
  dropbox: "apps.appsManager.findFilesCreateFoldersAnd2",
  asana: "apps.appsManager.findProjectTasksUpdateProgress",
  airtable: "apps.appsManager.readBaseRecordsAndCreate",
};

function appCategory(app: AppDefinition) {
  return directory.categories.find(
    (item) =>
      item.id ===
      (app.category || directory.apps.find((item) => item.provider === app.provider)?.category),
  );
}

function AppTools({
  app,
  connections,
  busy,
  onConnect,
}: {
  app: AppDefinition;
  connections: AppConnection[];
  busy: boolean;
  onConnect: () => void;
}) {
  const { tr } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [permissionFilter, setPermissionFilter] = useState("all");
  const active = connections.find((connection) => connection.status === "active");
  const matching = app.operations.filter(
    (item) =>
      (permissionFilter === "all" || item.permission === permissionFilter) &&
      (item.name + " " + item.description).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="appsToolsContent">
      <p className="appsPanelIntro">
        {active
          ? tr("apps.appsManager.connectedJustTellArcOrYour")
          : tr("apps.appsManager.connectYourAccountThenDescribeWhat")}
      </p>
      <label className="appsSearchField appsToolsSearch">
        <ProductIcon name="search" size={17} />
        <span className="appsSrOnly">{tr("apps.appsManager.findATool")}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tr("apps.appsManager.searchTools")}
        />
      </label>
      <div
        className="appsToolFilters"
        role="group"
        aria-label={tr("apps.appsManager.toolAccessType")}
      >
        {[
          ["all", tr("apps.appsManager.allTools")],
          ["read", tr("apps.appsManager.read")],
          ["write", tr("apps.appsManager.write")],
        ].map(([kind, label]) => (
          <button
            type="button"
            key={kind}
            aria-pressed={permissionFilter === kind}
            onClick={() => setPermissionFilter(kind!)}
          >
            {label} ·{" "}
            {app.operations.filter((item) => kind === "all" || item.permission === kind).length}
          </button>
        ))}
      </div>
      <div className="appsToolsItems">
        {matching.map((item) => (
          <section className="appsTool" key={item.name}>
            <h3>
              <button
                type="button"
                className="appsToolTrigger"
                aria-expanded={selectedName === item.name}
                aria-controls={"app-operation-" + app.provider + "-" + item.name}
                onClick={() => setSelectedName(selectedName === item.name ? "" : item.name)}
              >
                <span className="appsToolTitle">
                  <strong>{item.description || item.name}</strong>
                </span>
                <span className="appsToolMeta">
                  <small className="appsToolAccessBadge" data-permission={item.permission}>
                    {item.permission === "write"
                      ? tr("apps.appsManager.write")
                      : tr("apps.appsManager.read")}
                  </small>
                  <ProductIcon name="chevron" size={15} />
                </span>
              </button>
            </h3>
            {selectedName === item.name && (
              <div
                className="appsToolDetail"
                id={"app-operation-" + app.provider + "-" + item.name}
              >
                <span className="appsToolPermission">
                  {item.permission === "write"
                    ? tr("apps.appsManager.makesChanges")
                    : tr("apps.appsManager.readsData")}
                </span>
                <p>
                  {item.permission === "write"
                    ? tr("apps.appsManager.usesThePermissionsGrantedByYour")
                    : tr("apps.appsManager.returnsDataThisAccountHasAccess")}
                </p>
                {!active && (
                  <button
                    type="button"
                    className="appsToolsPrimary"
                    disabled={busy || !app.configured}
                    onClick={onConnect}
                  >
                    {app.configured
                      ? tr("apps.appsManager.connectAccount")
                      : tr("apps.appsManager.connectionComingSoon")}
                  </button>
                )}
              </div>
            )}
          </section>
        ))}
        {!matching.length && (
          <p className="appsToolsEmpty">
            {tr("apps.appsManager.noMatchingToolsTryAnotherKeyword")}
          </p>
        )}
      </div>
    </div>
  );
}

function AppDetailsPanel({
  app,
  connections,
  initialTab,
  onClose,
  onAuthorize,
  onDisconnect,
  onCredential,
  onCheck,
  onConsent,
  onErase,
  busy,
  error,
  notice,
}: {
  app: AppDefinition;
  connections: AppConnection[];
  initialTab: AppPanelTab;
  onClose: () => void;
  busy: boolean;
  error: string;
  notice: string;
  onAuthorize: (
    provider: string,
    permissions: Permission[],
    settings?: Record<string, string>,
  ) => void;
  onDisconnect: (connection: AppConnection) => void;
  onCredential: (provider: string, input: AppCredentialInput) => Promise<boolean>;
  onCheck: (connection: AppConnection) => Promise<AppConnectionCheck | undefined>;
  onConsent: (connection: AppConnection) => void;
  onErase: (connection: AppConnection) => void;
}) {
  const { tr } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const [credentialOpen, setCredentialOpen] = useState(
    app.auth === "api_key" && !connections.length,
  );
  const [shopDomain, setShopDomain] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const category = appCategory(app);
  const summary = appSummaries[app.provider];
  function connect(provider: string, permissions: Permission[], settings?: Record<string, string>) {
    if (app.auth === "api_key") {
      setTab("accounts");
      setCredentialOpen(true);
    } else if (provider === "shopify" && !settings) setTab("accounts");
    else onAuthorize(provider, permissions, settings);
  }
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.body.children).filter(
      (item): item is HTMLElement =>
        item instanceof HTMLElement && !item.contains(dialogRef.current),
    );
    const oldInert = background.map((item) => item.inert);
    background.forEach((item) => {
      item.inert = true;
    });
    closeRef.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary',
        ),
      ).filter((item) => item.getClientRects().length);
      if (!elements.length) return;
      const first = elements[0]!,
        last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      background.forEach((item, index) => {
        item.inert = oldInert[index]!;
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);
  return createPortal(
    <div
      className="appsPanelOverlay workspaceSurface"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="appsPanel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={"app-panel-title-" + app.provider}
      >
        <header className="appsPanelHead">
          <div className="appsPanelIdentity">
            <AppIcon brand={app.brand} />
            <div>
              <h2 id={"app-panel-title-" + app.provider}>{app.name}</h2>
              <p>
                {category ? tr(category.name, category.nameZh) : tr("apps.appsManager.integration")}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="appsPanelClose"
            aria-label={tr("apps.appsManager.closeAppDetails")}
            onClick={onClose}
          >
            <ProductIcon name="close" />
          </button>
        </header>
        <div
          className="appsPanelTabs"
          role="tablist"
          aria-label={tr("apps.appsManager.appDetails")}
        >
          {(["accounts", "tools"] as const).map((value) => (
            <button
              key={value}
              id={"app-panel-tab-" + value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              aria-controls={"app-panel-" + value}
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "accounts"
                    : event.key === "End"
                      ? "tools"
                      : value === "accounts"
                        ? "tools"
                        : "accounts";
                setTab(next);
                document.getElementById("app-panel-tab-" + next)?.focus();
              }}
            >
              {value === "accounts"
                ? tr("apps.appsManager.accounts")
                : tr("apps.appsManager.tools")}
              <span>{value === "accounts" ? connections.length : app.operations.length}</span>
            </button>
          ))}
        </div>
        <div className="appsPanelScroll">
          {error && (
            <div className="appsPanelFeedback" role="alert" data-error="true">
              <p>{errorLabel(error, tr)}</p>
              <BillingRecoveryActions code={error} tr={tr} />
            </div>
          )}
          {notice && !error && (
            <p className="appsPanelFeedback" role="status">
              {notice}
            </p>
          )}
          <section id={"app-panel-" + tab} role="tabpanel" aria-labelledby={"app-panel-tab-" + tab}>
            {tab === "tools" ? (
              <AppTools
                app={app}
                connections={connections}
                busy={busy}
                onConnect={() => connect(app.provider, connectedPermissions)}
              />
            ) : (
              <>
                {app.provider === "slack" && <SlackBotPanel />}
                {summary && <p className="appsPanelIntro">{tr(summary)}</p>}
                {connections.length ? (
                  <div className="appsPanelAccounts">
                    {connections.map((connection) => (
                      <ConnectionRow
                        key={connection.id}
                        app={app}
                        connection={connection}
                        busy={busy}
                        onAuthorize={connect}
                        onDisconnect={onDisconnect}
                        onCheck={onCheck}
                        onConsent={onConsent}
                        onErase={onErase}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="appsPanelEmpty">
                    <ProductIcon name="link" size={25} />
                    <h3>{tr("apps.appsManager.connectYourAccount", { name: app.name })}</h3>
                    <p>{tr("apps.appsManager.yourConnectedAiCanUseThis")}</p>
                  </div>
                )}
                {!app.configured ? (
                  <p className="appsPanelAvailability">
                    {tr("apps.appsManager.accountConnectionIsComingSoonYou")}
                  </p>
                ) : (
                  <div className="appsPanelConnect">
                    {app.provider === "shopify" ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          onAuthorize(app.provider, connectedPermissions, { shopDomain });
                        }}
                      >
                        <label className="appsManagerStore">
                          {tr("apps.appsManager.storeDomain")}
                          <input
                            value={shopDomain}
                            onChange={(event) => setShopDomain(event.target.value)}
                            placeholder="your-store.myshopify.com"
                            autoComplete="off"
                            required
                            pattern="[a-z0-9][a-z0-9-]*\.myshopify\.com"
                            maxLength={100}
                          />
                        </label>
                        <button
                          type="submit"
                          className="appsManagerPrimary"
                          disabled={
                            busy || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)
                          }
                        >
                          {tr("apps.appsManager.connectStore")}
                        </button>
                      </form>
                    ) : credentialOpen ? (
                      <AppCredentialForm
                        provider={app.provider}
                        write={true}
                        busy={busy}
                        onConnect={(input) => onCredential(app.provider, input)}
                        onCancel={() => setCredentialOpen(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="appsManagerPrimary"
                        disabled={busy}
                        onClick={() => connect(app.provider, connectedPermissions)}
                      >
                        <ProductIcon name={connections.length ? "add" : "link"} size={16} />
                        {connections.length
                          ? tr("apps.appsManager.connectAnotherAccount")
                          : tr("apps.appsManager.connectAccount")}
                      </button>
                    )}
                    <p className="appsPanelAccessNote">
                      <ProductIcon name="shield" size={15} />
                      {app.auth === "api_key"
                        ? tr("apps.appsManager.credentialsAreEncryptedAndKeptOut")
                        : tr("apps.appsManager.signInSecurelyWithDisconnectAt", { name: app.name })}
                    </p>
                  </div>
                )}
                {(app.connectionNote || app.billingNote) && (
                  <details className="appsManagerProviderNotes">
                    <summary>{tr("apps.appsManager.connectionBillingDetails")}</summary>
                    {app.connectionNote && <p>{app.connectionNote}</p>}
                    {app.billingNote && <p>{app.billingNote}</p>}
                  </details>
                )}
              </>
            )}
          </section>
        </div>
        {app.provider === "runway" && (
          <footer className="appsPanelAttribution">
            <a
              className="appsRunwayAttribution"
              href="https://runwayml.com"
              target="_blank"
              rel="noreferrer"
            >
              <img src="/app-brands/runwayattribution.svg" alt="Powered by Runway" />
            </a>
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

function CatalogCard({
  app,
  connections,
  busy,
  onConnect,
  onOpen,
}: {
  app: AppDefinition;
  connections: AppConnection[];
  busy: boolean;
  onConnect: () => void;
  onOpen: (tab: AppPanelTab) => void;
}) {
  const { tr } = useI18n();
  const category = appCategory(app);
  const summary = appSummaries[app.provider];
  const needsAttention = connections.some(
    (connection) => connection.status !== "active" || connection.toolAccess?.needsReconnect,
  );
  const state = connections.length
    ? needsAttention
      ? "attention"
      : "connected"
    : app.configured
      ? "available"
      : "soon";
  return (
    <article className="appsManagerCard" data-provider={app.provider} data-state={state}>
      <header>
        <AppIcon brand={app.brand} />
        <div>
          <h2>
            <button
              type="button"
              className="appsCardTitle"
              onClick={() => onOpen(app.provider === "slack" ? "accounts" : "tools")}
              aria-haspopup="dialog"
            >
              {app.name}
            </button>
          </h2>
          <span>
            {category ? tr(category.name, category.nameZh) : tr("apps.appsManager.integration")}
          </span>
        </div>
      </header>
      <p className="appsCardDescription">
        {summary ? tr(summary) : tr("apps.appsManager.useThisAppFromYourConnected")}
      </p>
      <div className="appsCardState" data-state={state}>
        {state === "connected" ? (
          <>
            <ProductIcon name="check" size={14} />
            {tr("apps.appsManager.connected")}
            {connections.length > 1 && (
              <span>
                · {connections.length} {tr("apps.appsManager.accounts2")}
              </span>
            )}
          </>
        ) : state === "attention" ? (
          <>
            <span className="appsCardStateDot" />
            {tr("apps.appsManager.needsAttention")}
          </>
        ) : state === "soon" ? (
          tr("apps.appsManager.comingSoon")
        ) : (
          tr("apps.appsManager.readyToConnect")
        )}
      </div>
      <footer className="appsCardFooter">
        <button
          type="button"
          className="appsCardTools"
          aria-haspopup="dialog"
          onClick={() => onOpen("tools")}
        >
          {app.operations.length} {tr("apps.appsManager.tools2")} ·{" "}
          {app.operations.filter((item) => item.permission === "write").length}{" "}
          {tr("apps.appsManager.write2")}
          <ProductIcon name="chevron" size={14} />
        </button>
        {connections.length ? (
          <button
            type="button"
            className="appsCardManage"
            aria-haspopup="dialog"
            onClick={() => onOpen("accounts")}
          >
            {tr("apps.appsManager.manage")}
            <ProductIcon name="chevron" size={14} />
          </button>
        ) : app.provider === "slack" ? (
          <button
            type="button"
            className="appsManagerPrimary"
            aria-haspopup="dialog"
            onClick={() => onOpen("accounts")}
          >
            {tr("apps.appsManager.setUpSlack")}
          </button>
        ) : app.configured ? (
          <button type="button" className="appsManagerPrimary" disabled={busy} onClick={onConnect}>
            <ProductIcon name="add" size={15} />
            {tr("apps.appsManager.connect")}
          </button>
        ) : (
          <button
            type="button"
            className="appsCardManage"
            aria-haspopup="dialog"
            onClick={() => onOpen("tools")}
          >
            {tr("apps.appsManager.explore")}
            <ProductIcon name="chevron" size={14} />
          </button>
        )}
      </footer>
    </article>
  );
}

export function AppsManager({
  request = requestJson,
  navigate = (url: string) => window.location.assign(url),
}: {
  request?: AppsRequest;
  navigate?: (url: string) => void;
} = {}) {
  const { tr } = useI18n();
  const [snapshot, setSnapshot] = useState<AppsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [betaProvider, setBetaProvider] = useState(
    () => new URLSearchParams(window.location.search).get("apply") || "",
  );
  const [consent, setConsent] = useState<{
    provider: string;
    permissions: Permission[];
    settings?: Record<string, string>;
    connectionId?: string;
  } | null>(null);
  const closeBeta = useCallback(() => setBetaProvider(""), []),
    closeConsent = useCallback(() => setConsent(null), []);
  const [query, setQuery] = useState(
    () => new URLSearchParams(window.location.search).get("provider") || "",
  );
  const [category, setCategory] = useState(
    () => new URLSearchParams(window.location.search).get("category") || "all",
  );
  const [connectionView, setConnectionView] = useState<"all" | "available" | "connected">(() =>
    new URLSearchParams(location.search).get("view") === "connected" ? "connected" : "all",
  );
  const [details, setDetails] = useState<{ provider: string; tab: AppPanelTab } | null>(() => {
    const query = new URLSearchParams(location.search);
    return query.get("provider") === "slack" ||
      query.has("slack_bot") ||
      query.has("slack_error") ||
      canonicalErrorCode(query.get("app_error"))?.startsWith("SLACK_")
      ? { provider: "slack", tab: "accounts" }
      : null;
  });
  const callbackFeedback = useRef(false);
  useEffect(() => {
    if (loading || callbackFeedback.current) return;
    callbackFeedback.current = true;
    const query = new URLSearchParams(location.search),
      appError = canonicalErrorCode(query.get("app_error")),
      slackError = canonicalErrorCode(query.get("slack_error"));
    if (appError && billingRecovery(appError)) setError(appError);
    else if (
      appError === "SLACK_DISTRIBUTION_REQUIRED" ||
      slackError === "DISTRIBUTION_NOT_ENABLED"
    )
      setError("SLACK_DISTRIBUTION_REQUIRED");
    else if (slackError === "INSTALLATION_FAILED") setError("SLACK_BOT_INSTALLATION_FAILED");
    else if (appError === "APP_AUTHORIZATION_DENIED" || slackError)
      setError("APP_AUTHORIZATION_DENIED");
    else if (query.get("slack_bot") === "installed")
      setNotice(tr("apps.appsManager.remoteArcBotWasInstalledOpen"));
  }, [loading, tr]);
  const closeDetails = useCallback(() => setDetails(null), []);
  const mounted = useRef(false);
  const revision = useRef(0);
  const mutationLock = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++revision.current;
    setLoading(true);
    setError("");
    try {
      const data = (await request("/api/apps")) as AppsSnapshot;
      if (
        !data ||
        typeof data.enabled !== "boolean" ||
        !Array.isArray(data.apps) ||
        !Array.isArray(data.connections)
      )
        throw new Error("APP_SERVICE_UNAVAILABLE");
      if (!mounted.current || version !== revision.current) return;
      setSnapshot(data);
    } catch (cause) {
      if (mounted.current && version === revision.current)
        setError(cause instanceof Error ? cause.message : "APP_SERVICE_UNAVAILABLE");
    } finally {
      if (mounted.current && version === revision.current) setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      revision.current++;
    };
  }, [refresh]);
  async function mutate(
    key: string,
    action: () => Promise<unknown>,
    success: string,
    refreshOnFailure = false,
  ) {
    if (UI_PREVIEW || mutationLock.current) return false;
    mutationLock.current = true;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      if (!mounted.current) return false;
      setNotice(success);
      await refresh();
      return true;
    } catch (cause) {
      if (refreshOnFailure && mounted.current) await refresh();
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : "APP_SERVICE_UNAVAILABLE");
      return false;
    } finally {
      mutationLock.current = false;
      if (mounted.current) setBusy("");
    }
  }
  function authorize(
    provider: string,
    permissions: Permission[],
    settings?: Record<string, string>,
  ) {
    const app = snapshot?.apps.find((value) => value.provider === provider);
    if (app?.requiresBetaApproval) {
      setBetaProvider(provider);
      return;
    }
    if (app?.dataPolicy) {
      setConsent({ provider, permissions, settings });
      return;
    }
    authorizeNow(provider, permissions, settings);
  }
  function authorizeNow(
    provider: string,
    permissions: Permission[],
    settings?: Record<string, string>,
    dataConsent?: string,
  ) {
    void mutate(
      "authorize:" + provider,
      async () => {
        const result = (await request("/api/apps/authorize", {
          method: "POST",
          body: JSON.stringify({
            provider,
            permissions,
            settings,
            ...(dataConsent ? { dataConsent } : {}),
          }),
        })) as { authorizationUrl?: string };
        if (!result.authorizationUrl || !/^https:\/\//i.test(result.authorizationUrl))
          throw new Error("APP_SERVICE_UNAVAILABLE");
        navigate(result.authorizationUrl);
      },
      tr("apps.appsManager.continueInTheProviderSAuthorization"),
    );
  }
  function reviewData(connection: AppConnection) {
    setConsent({
      provider: connection.provider,
      permissions: connection.permissions,
      connectionId: connection.id,
    });
  }
  function acceptData() {
    if (!consent) return;
    const app = snapshot?.apps.find((value) => value.provider === consent.provider);
    if (!app?.dataPolicy) return;
    if (consent.connectionId) {
      void mutate(
        "consent:" + consent.connectionId,
        () =>
          request(
            "/api/apps/connections/" + encodeURIComponent(consent.connectionId!) + "/data-consent",
            { method: "POST", body: JSON.stringify({ dataConsent: app.dataPolicy!.version }) },
          ),
        tr("apps.appsManager.googleDataAccessConfirmed"),
      );
    } else
      authorizeNow(consent.provider, consent.permissions, consent.settings, app.dataPolicy.version);
    setConsent(null);
  }
  function eraseData(connection: AppConnection) {
    void mutate(
      "erase:" + connection.id,
      () =>
        request("/api/apps/connections/" + encodeURIComponent(connection.id) + "/data-deletion", {
          method: "POST",
          body: JSON.stringify({ confirm: true }),
        }),
      tr("apps.appsManager.savedCallContentsDeletedChatTask"),
    );
  }
  function submitBeta(input: {
    googleEmail: string;
    providers: string[];
    useCase: string;
    betaTerms: true;
  }) {
    void mutate(
      "google-beta",
      () => request("/api/apps/google-beta", { method: "POST", body: JSON.stringify(input) }),
      tr("apps.appsManager.betaApplicationReceived"),
    );
  }
  function connectCredential(provider: string, input: AppCredentialInput) {
    return mutate(
      "connect:" + provider,
      () =>
        request("/api/apps/connections", {
          method: "POST",
          body: JSON.stringify({ provider, ...input }),
        }),
      tr("apps.appsManager.accountValidatedAndConnected"),
    );
  }
  function disconnect(connection: AppConnection) {
    void mutate(
      "disconnect:" + connection.id,
      () =>
        request("/api/apps/connections/" + encodeURIComponent(connection.id), { method: "DELETE" }),
      tr("apps.appsManager.theAccountWasDisconnected"),
    );
  }
  async function check(connection: AppConnection) {
    let result: AppConnectionCheck | undefined;
    const success = await mutate(
      "check:" + connection.id,
      async () => {
        const checked = (await request(
          "/api/apps/connections/" + encodeURIComponent(connection.id) + "/check",
          { method: "POST", body: "{}" },
        )) as AppConnectionCheck;
        if (
          checked.connectionId !== connection.id ||
          checked.verification !== "provider_identity_checked"
        )
          throw new Error("APP_SERVICE_UNAVAILABLE");
        result = checked;
      },
      tr("apps.appsManager.accountAccessVerifiedActualToolResults"),
      true,
    );
    return success ? result : undefined;
  }
  function openDetails(provider: string, tab: AppPanelTab) {
    setError("");
    setNotice("");
    setDetails({ provider, tab });
  }
  const connections =
    snapshot?.connections.filter((connection) => connection.status !== "disconnected") ?? [];
  const connectedProviders = new Set(connections.map((connection) => connection.provider));
  const featuredProviders = [
    "github",
    "slack",
    "gmail",
    "google_calendar",
    "google_drive",
    "notion",
    "linear",
    "vercel",
  ];
  const featuredRank = (provider: string) => {
    const index = featuredProviders.indexOf(provider);
    return index < 0 ? featuredProviders.length : index;
  };
  const visibleApps =
    snapshot?.apps
      .filter(
        (app) =>
          (connectionView === "all" ||
            (connectionView === "available"
              ? app.configured
              : connectedProviders.has(app.provider))) &&
          (category === "all" ||
            (app.category ||
              directory.apps.find((item) => item.provider === app.provider)?.category) ===
              category) &&
          (
            app.name +
            " " +
            app.provider +
            " " +
            app.operations.map((item) => item.name + " " + item.description).join(" ")
          )
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      )
      .sort(
        (a, b) =>
          Number(connectedProviders.has(b.provider)) - Number(connectedProviders.has(a.provider)) ||
          Number(b.configured) - Number(a.configured) ||
          featuredRank(a.provider) - featuredRank(b.provider) ||
          a.name.localeCompare(b.name),
      ) || [];
  const selectedApp = snapshot?.enabled
    ? snapshot.apps.find((app) => app.provider === details?.provider)
    : undefined;
  const availableCount = snapshot?.apps.filter((app) => app.configured).length || 0;
  return (
    <div className="appsManager">
      <header className="appsManagerHeader">
        <div>
          <span className="eyebrow">{tr("apps.appsManager.yourAiSToolkit")}</span>
          <h1>{tr("apps.appsManager.apps")}</h1>
          <p>{tr("apps.appsManager.yourEverydayAppsReadyToWork")}</p>
        </div>
        <button
          type="button"
          className="appsManagerRefresh"
          disabled={loading || Boolean(busy)}
          onClick={() => {
            setNotice("");
            void refresh();
          }}
        >
          <ProductIcon name="refresh" size={16} />
          {loading ? tr("apps.appsManager.refreshing") : tr("apps.appsManager.refresh")}
        </button>
      </header>
      {error && (
        <div className="appsManagerMessage appsManagerError" role="alert">
          <p>{errorLabel(error, tr)}</p>
          <BillingRecoveryActions code={error} tr={tr} />
          {error === "UNAUTHORIZED" && (
            <a href="/auth/login?return_to=%2Fapps">{tr("apps.appsManager.signIn")}</a>
          )}
          <button type="button" onClick={() => setError("")}>
            {tr("apps.appsManager.dismiss")}
          </button>
        </div>
      )}
      {notice && (
        <p className="appsManagerMessage" role="status">
          {notice}
        </p>
      )}
      {snapshot?.googleBeta?.mode === "beta" && (
        <section className="appsBetaBanner">
          <strong>
            Google Apps <span className="appsBetaBadge">Beta</span>
          </strong>
          <p>{tr("apps.appsManager.byInvitationApplyOnceThenConnect")}</p>
          <button type="button" onClick={() => setBetaProvider("gmail")}>
            {snapshot.googleBeta.request
              ? tr("apps.appsManager.viewApplication")
              : tr("apps.appsManager.applyToJoin")}
          </button>
        </section>
      )}
      {loading && !snapshot && (
        <WorkspaceLoading label={tr("apps.appsManager.loadingAppConnections")} variant="rows" />
      )}
      {snapshot && !snapshot.enabled && (
        <section className="appsManagerDisabled">
          <h2>{tr("apps.appsManager.appsAreNotEnabledYet")}</h2>
          <p>{tr("apps.appsManager.anAdministratorNeedsToEnableApps")}</p>
        </section>
      )}
      {snapshot?.enabled && (
        <>
          <div className="appsManagerFilters">
            <div
              className="appsManagerViewTabs"
              role="group"
              aria-label={tr("apps.appsManager.connectionFilter")}
            >
              <button
                type="button"
                aria-pressed={connectionView === "all"}
                onClick={() => setConnectionView("all")}
              >
                {tr("apps.appsManager.allApps")} <span>{snapshot.apps.length}</span>
              </button>
              <button
                type="button"
                aria-pressed={connectionView === "available"}
                onClick={() => setConnectionView("available")}
              >
                {tr("apps.appsManager.available")} <span>{availableCount}</span>
              </button>
              <button
                type="button"
                aria-pressed={connectionView === "connected"}
                onClick={() => setConnectionView("connected")}
              >
                {tr("apps.appsManager.connected")} <span>{connectedProviders.size}</span>
              </button>
            </div>
            <label className="appsSearchField">
              <span className="appsSrOnly">{tr("apps.appsManager.searchApps")}</span>
              <span className="appsSearchIcon">
                <ProductIcon name="search" size={17} />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("apps.appsManager.searchApps2")}
              />
            </label>
            <div
              className="appsManagerCategories"
              role="group"
              aria-label={tr("apps.appsManager.appCategories")}
            >
              <button
                type="button"
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
              >
                {tr("apps.appsManager.allCategories")}
              </button>
              {directory.categories.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                >
                  {tr(item.name, item.nameZh)}
                </button>
              ))}
            </div>
          </div>
          <section className="appsManagerGrid" aria-label={tr("apps.appsManager.availableApps")}>
            {visibleApps.map((app) => (
              <CatalogCard
                key={app.provider}
                app={app}
                connections={connections.filter(
                  (connection) => connection.provider === app.provider,
                )}
                busy={Boolean(busy) || UI_PREVIEW}
                onOpen={(tab) => openDetails(app.provider, tab)}
                onConnect={() =>
                  app.auth === "api_key" || app.provider === "shopify"
                    ? openDetails(app.provider, "accounts")
                    : authorize(app.provider, connectedPermissions)
                }
              />
            ))}
          </section>
          {!!snapshot.apps.length && !visibleApps.length && (
            <div className="appsManagerEmpty">
              <ProductIcon name="search" size={24} />
              <h2>{tr("apps.appsManager.noMatchingApps")}</h2>
              <p>{tr("apps.appsManager.tryAnotherKeywordOrResetYour")}</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategory("all");
                  setConnectionView("all");
                }}
              >
                {tr("apps.appsManager.resetFilters")}
              </button>
            </div>
          )}
          {!snapshot.apps.length && (
            <p className="appsManagerEmpty">
              {tr("apps.appsManager.noAppProvidersAreAvailableYet")}
            </p>
          )}
        </>
      )}
      {/* Keep one focus trap active. Preserve the selection to reopen details after review. */}
      {selectedApp && details && !consent && !betaProvider && (
        <AppDetailsPanel
          key={selectedApp.provider}
          app={selectedApp}
          connections={(snapshot?.connections || []).filter(
            (connection) => connection.provider === selectedApp.provider,
          )}
          initialTab={details.tab}
          onClose={closeDetails}
          busy={Boolean(busy) || UI_PREVIEW}
          error={error}
          notice={notice}
          onAuthorize={authorize}
          onCredential={connectCredential}
          onDisconnect={disconnect}
          onCheck={check}
          onConsent={reviewData}
          onErase={eraseData}
        />
      )}
      {betaProvider && snapshot?.googleBeta && (
        <GoogleBetaApplication
          apps={snapshot.apps.filter((app) => app.dataPolicy && app.configured)}
          initialProvider={betaProvider}
          state={snapshot.googleBeta}
          busy={Boolean(busy)}
          error={error ? errorLabel(error, tr) : ""}
          onSubmit={submitBeta}
          onClose={closeBeta}
        />
      )}
      {consent && (
        <GoogleConsentDialog
          provider={consent.provider}
          name={
            snapshot?.apps.find((app) => app.provider === consent.provider)?.name ||
            consent.provider
          }
          busy={Boolean(busy)}
          onAccept={acceptData}
          onClose={closeConsent}
        />
      )}
    </div>
  );
}
