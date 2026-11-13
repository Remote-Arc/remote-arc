import { ArcBillingPanel, ArcAccountPlan } from "../billing/arc-billing-panel.js";
import { ArcMemoryPanel } from "../arc/workspace/arc-memory-panel.js";
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "../../hooks/use-theme.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { OrganizationSettings } from "./organization-settings.js";
import { ProductInstall } from "../../app/product-pwa.js";
import "../../styles/settings/dashboard-settings.css";
const TeammateSettings = lazy(() =>
  import("../arc/teams/arc-teams-page.js").then((module) => ({ default: module.ArcTeamsPage })),
);

type Section =
  "account" | "appearance" | "workspaces" | "connections" | "billing" | "memory" | "teammates";
type Destination = "devices" | "connect" | "security" | "apps";
type Props = {
  accountId?: string;
  currentName?: string | null;
  currentEmail: string;
  locale: "en" | "zh";
  setLocale: (value: "en" | "zh") => void;
  hasPlus: boolean;
  usage: { used?: number; unlimited?: boolean } | null | undefined;
  usageLimitLabel: string;
  mcpEndpoint: string;
  marketingOrigin: string;
  onSignOut: () => void | Promise<void>;
  onNavigate: (destination: Destination) => void;
};

function Icon({
  name,
  size = 18,
}: {
  name:
    | "user"
    | "appearance"
    | "team"
    | "link"
    | "billing"
    | "shield"
    | "device"
    | "apps"
    | "copy"
    | "check"
    | "arrow";
  size?: number;
}) {
  const paths: Record<typeof name, ReactNode> = {
    appearance: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4M12 4v13" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="3.3" />
        <path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1.5a6 6 0 0 1 12 0V20M17 5.3a3 3 0 0 1 0 5.5M17.5 14a5.6 5.6 0 0 1 3.5 5.2" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" />
      </>
    ),
    billing: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M3 10h18M7 15h4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 2.5 20 6v5.5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3.5Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    device: (
      <>
        <rect x="3.5" y="4" width="17" height="12.5" rx="2" />
        <path d="M8 20h8M12 16.5V20" />
      </>
    ),
    apps: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    arrow: <path d="M6 12h12m-5-5 5 5-5 5" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function DashboardSettings({
  accountId,
  currentName,
  currentEmail,
  locale,
  setLocale,
  mcpEndpoint,
  onSignOut,
  onNavigate,
}: Props) {
  const { tr } = useI18n();
  const initialSection = () => {
    const value = new URLSearchParams(location.search).get("section");
    return [
      "account",
      "appearance",
      "workspaces",
      "connections",
      "billing",
      "memory",
      "teammates",
    ].includes(value || "")
      ? (value as Section)
      : "account";
  };
  const [section, setSection] = useState<Section>(initialSection);
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    const restore = () => setSection(initialSection());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function selectSection(next: Section) {
    setSection(next);
    setCopyStatus("idle");
    const url = new URL(location.href);
    url.searchParams.set("section", next);
    history.pushState({}, "", url);
  }
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const displayName =
    currentName?.trim() || currentEmail.split("@")[0] || tr("settings.dashboardSettings.account");
  const nav: {
    id: Section;
    icon: "user" | "appearance" | "team" | "link" | "billing";
    title: string;
  }[] = [
    { id: "account", icon: "user", title: tr("settings.dashboardSettings.profile") },
    { id: "appearance", icon: "appearance", title: tr("settings.dashboardSettings.appearance") },
    { id: "memory", icon: "user", title: tr("settings.dashboardSettings.memory") },
    ...(accountId
      ? [
          {
            id: "teammates" as const,
            icon: "team" as const,
            title: tr("settings.dashboardSettings.agents"),
          },
        ]
      : []),
    { id: "workspaces", icon: "team", title: tr("settings.dashboardSettings.workspaces") },
    {
      id: "connections",
      icon: "link",
      title: tr("settings.dashboardSettings.connectionsSecurity"),
    },
    { id: "billing", icon: "billing", title: tr("settings.dashboardSettings.planUsage") },
  ];
  const titles = {
    teammates: {
      eyebrow: tr("settings.dashboardSettings.optionalSettings"),
      title: tr("settings.dashboardSettings.agentProfiles"),
      detail: tr("settings.dashboardSettings.arcChatIsWhereYouOrganize"),
    },
    account: {
      eyebrow: tr("settings.dashboardSettings.personalSettings"),
      title: tr("settings.dashboardSettings.yourProfile"),
      detail: tr("settings.dashboardSettings.theAccountYouUseAcrossArc"),
    },
    appearance: {
      eyebrow: tr("settings.dashboardSettings.personalSettings"),
      title: tr("settings.dashboardSettings.makeItYours"),
      detail: tr("settings.dashboardSettings.chooseHowYourWorkspaceLooksAnd"),
    },
    memory: {
      eyebrow: tr("settings.dashboardSettings.personalContext"),
      title: tr("settings.dashboardSettings.memory"),
      detail: tr("settings.dashboardSettings.usefulContextThatFollowsYouAcross"),
    },
    workspaces: {
      eyebrow: tr("settings.dashboardSettings.collaboration"),
      title: tr("settings.dashboardSettings.workspaces"),
      detail: tr("settings.dashboardSettings.keepPersonalAccessPrivateAndOrganize"),
    },
    connections: {
      eyebrow: tr("settings.dashboardSettings.accessControl"),
      title: tr("settings.dashboardSettings.connectionsSecurity"),
      detail: tr("settings.dashboardSettings.manageTheDevicesAppsAndPermissions"),
    },
    billing: {
      eyebrow: tr("settings.dashboardSettings.subscription"),
      title: tr("settings.dashboardSettings.planUsage"),
      detail: tr("settings.dashboardSettings.understandYourPlanAndAvailableCapacity"),
    },
  };
  const active = titles[section];

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(mcpEndpoint);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="raSettings">
      <aside
        className="raSettingsAside"
        aria-label={tr("settings.dashboardSettings.settingsNavigation")}
      >
        <div className="raSettingsAsideLabel">{tr("settings.dashboardSettings.personal")}</div>
        <nav className="raSettingsNav">
          {nav.map((item, index) => (
            <Fragment key={item.id}>
              {index === 2 && (
                <div className="raSettingsAsideLabel raSettingsGroupLabel">
                  {tr("settings.dashboardSettings.workspace")}
                </div>
              )}
              <button
                type="button"
                key={item.id}
                className={"raSettingsNavItem" + (section === item.id ? " isActive" : "")}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => selectSection(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.title}</span>
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="raSettingsAsideFoot">
          <Icon name="shield" size={17} />
          <span>{tr("settings.dashboardSettings.yourPersonalDevicesAndCredentialsStay")}</span>
        </div>
      </aside>

      <div className="raSettingsContent" role="region" aria-label={active.title}>
        <header className="raSettingsHeading">
          <span className="raSettingsEyebrow">{active.eyebrow}</span>
          <h2>{active.title}</h2>
          <p>{active.detail}</p>
        </header>

        {section === "teammates" && accountId && (
          <Suspense fallback={<p>{tr("settings.dashboardSettings.loadingAgents")}</p>}>
            <TeammateSettings accountId={accountId} tr={tr} />
          </Suspense>
        )}
        {section === "account" && (
          <div className="raSettingsSections">
            <ArcAccountPlan onManage={() => selectSection("billing")} />
            <section className="raSettingsSurface raSettingsIdentity">
              <div className="raSettingsIdentityAvatar" aria-hidden="true">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="raSettingsIdentityText">
                <span className="raSettingsFieldLabel">
                  {tr("settings.dashboardSettings.signedInAs")}
                </span>
                <h3>{displayName}</h3>
                <p>{currentEmail}</p>
              </div>
              <span className="raSettingsQuietPill">
                {tr("settings.dashboardSettings.personalAccount")}
              </span>
            </section>
            <section className="raSettingsSurface">
              <div className="raSettingsRow raSettingsRowLast">
                <div className="raSettingsRowInfo">
                  <h4>{tr("settings.dashboardSettings.session")}</h4>
                  <p>{tr("settings.dashboardSettings.signOutOfThisBrowserWhen")}</p>
                </div>
                <button className="raSettingsButton" type="button" onClick={() => void onSignOut()}>
                  {tr("settings.dashboardSettings.signOut")}
                </button>
              </div>
            </section>
            <section className="raSettingsSurface">
              <div className="raSettingsRow raSettingsRowLast">
                <div className="raSettingsRowInfo">
                  <h4>{tr("settings.dashboardSettings.remoteArcOnYourDevice")}</h4>
                  <p>{tr("settings.dashboardSettings.keepYourWorkspaceAClickAway")}</p>
                </div>
                <ProductInstall />
              </div>
            </section>
          </div>
        )}

        {section === "appearance" && (
          <div className="raSettingsSections">
            <section className="raSettingsSurface">
              <div className="raSettingsSurfaceHeader">
                <div>
                  <h3>{tr("settings.dashboardSettings.theme")}</h3>
                  <p>{tr("settings.dashboardSettings.aComfortableWorkspaceDayOrNight")}</p>
                </div>
              </div>
              <div
                className="raThemeChoices"
                role="group"
                aria-label={tr("settings.dashboardSettings.workspaceTheme")}
              >
                {(["light", "dark", "system"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={theme === value}
                    onClick={() => setTheme(value)}
                  >
                    <span className={"raThemePreview " + value} aria-hidden="true">
                      <i className="raThemeSidebar">
                        <b />
                        <b />
                        <b />
                      </i>
                      <i className="raThemeContent">
                        <b />
                        <b />
                        <b />
                      </i>
                    </span>
                    <span>
                      {value === "light"
                        ? tr("settings.dashboardSettings.light")
                        : value === "dark"
                          ? tr("settings.dashboardSettings.dark")
                          : tr("settings.dashboardSettings.system")}
                      <i>{theme === value ? "✓" : ""}</i>
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="raSettingsSurface">
              <div className="raSettingsRow raSettingsRowLast">
                <div className="raSettingsRowInfo">
                  <h4>{tr("settings.dashboardSettings.language")}</h4>
                  <p>{tr("settings.dashboardSettings.chooseTheLanguageForYourWorkspace")}</p>
                </div>
                <div className="raSettingsRowControl">
                  <div
                    className="languageSetting"
                    role="group"
                    aria-label={tr("settings.dashboardSettings.dashboardLanguage")}
                  >
                    <button
                      type="button"
                      aria-pressed={locale === "en"}
                      className={locale === "en" ? "active" : ""}
                      onClick={() => setLocale("en")}
                    >
                      English
                    </button>
                    <button
                      type="button"
                      aria-pressed={locale === "zh"}
                      className={locale === "zh" ? "active" : ""}
                      onClick={() => setLocale("zh")}
                    >
                      中文
                    </button>
                  </div>
                </div>
              </div>
            </section>
            <p className="raSettingsFootnote">
              {tr("settings.dashboardSettings.preferencesAreSavedOnThisDevice")}
            </p>
          </div>
        )}

        {section === "workspaces" && (
          <div className="raSettingsSections">
            <OrganizationSettings currentEmail={currentEmail} />
          </div>
        )}

        {section === "connections" && (
          <div className="raSettingsSections">
            <section className="raSettingsSurface">
              <div className="raSettingsSurfaceHeader">
                <div>
                  <h3>{tr("settings.dashboardSettings.remoteMcpEndpoint")}</h3>
                  <p>{tr("settings.dashboardSettings.addThisUrlInASupported")}</p>
                </div>
              </div>
              <div className="raSettingsEndpoint">
                <code>{mcpEndpoint}</code>
                <button
                  type="button"
                  className="raSettingsButton raSettingsCopy"
                  onClick={() => void copyEndpoint()}
                >
                  <Icon name={copyStatus === "copied" ? "check" : "copy"} size={16} />
                  {copyStatus === "copied"
                    ? tr("settings.dashboardSettings.copied")
                    : tr("settings.dashboardSettings.copyUrl")}
                </button>
              </div>
              {copyStatus === "error" && (
                <p className="raSettingsInlineError" role="alert">
                  {tr("settings.dashboardSettings.couldnTCopyAutomaticallySelectThe")}
                </p>
              )}
            </section>
            <section className="raSettingsSurface">
              <div className="raSettingsSurfaceHeader">
                <div>
                  <h3>{tr("settings.dashboardSettings.accessManagement")}</h3>
                  <p>{tr("settings.dashboardSettings.manageTheAccountsAndComputersYour")}</p>
                </div>
              </div>
              {(
                [
                  [
                    "devices",
                    "device",
                    tr("settings.dashboardSettings.devicesTools"),
                    tr("settings.dashboardSettings.managePairedComputersAndToolPermissions"),
                  ],
                  [
                    "apps",
                    "apps",
                    tr("settings.dashboardSettings.connectedApps"),
                    tr("settings.dashboardSettings.reviewIntegrationsAndTheirAvailableActions"),
                  ],
                  [
                    "security",
                    "shield",
                    tr("settings.dashboardSettings.securityActivity"),
                    tr("settings.dashboardSettings.reviewGrantsAccessControlsAndAudit"),
                  ],
                  [
                    "connect",
                    "link",
                    tr("settings.dashboardSettings.connectionSetup"),
                    tr("settings.dashboardSettings.getStartedWithChatgptClaudeAnd"),
                  ],
                ] as const
              ).map(([destination, icon, title, description]) => (
                <button
                  className="raSettingsAction"
                  key={destination}
                  type="button"
                  onClick={() => onNavigate(destination)}
                >
                  <span className="raSettingsActionIcon">
                    <Icon name={icon} />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                  <Icon name="arrow" size={18} />
                </button>
              ))}
            </section>
          </div>
        )}

        {section === "billing" && <ArcBillingPanel />}
        {section === "memory" && <ArcMemoryPanel />}
      </div>
    </div>
  );
}
