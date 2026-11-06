import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { ProductIcon } from "../../components/product-icon.js";
import { CHATGPT_PLUGIN_URL } from "../install/client-links.js";
import React, { useEffect, useState } from "react";
import { LanguageSwitcher } from "../../app/i18n.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import {
  ONBOARDING_PREVIEW_CODE,
  createOnboardingPreviewDevice,
  onboardingPreviewStep,
} from "../../preview/onboarding-preview.js";
import { Brand, CopyButton, HelpTip, ThemeSwitcher } from "../../components/public-layout.js";
import {
  APP_ORIGIN,
  CLAUDE_CONNECTORS_URL,
  MARKETING_ORIGIN,
  MCP_ENDPOINT,
  cursorMcpInstallUrl,
} from "../../config/app-config.js";
import { atComputerLimit, pairingFailureMessage, type PairingFailure } from "./pairing-errors.js";
import {
  type Device,
  type DirectoryBrowser,
  type Pairing,
  type User,
} from "../../types/app-types.js";
import {
  SAFE_DEVICE_TOOLS,
  platformGlyph,
  platformLabel,
} from "../dashboard/devices/device-presets.js";
import { AuthProviderModal } from "./auth-pages.js";

function PairingCard({
  title,
  body,
  children,
  step = 1,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
  step?: 1 | 2 | 3;
}) {
  const { tr, locale } = useI18n();
  const steps = [
    tr("auth.pairDevice.pairComputer"),
    tr("auth.pairDevice.permissions"),
    tr("auth.pairDevice.connectAi"),
  ];
  return (
    <main className="pairingShell workspaceSurface">
      <header className="pairingHeader">
        <Brand compact />
        <div>
          <LanguageSwitcher compact syncUrl dropdown iconOnly />
          <ThemeSwitcher compact />
        </div>
      </header>
      {UI_PREVIEW && (
        <aside className="pairingPreview" aria-label={tr("auth.pairDevice.onboardingPreview")}>
          <span>{tr("auth.pairDevice.uiPreviewSimulatedComputer")}</span>
          <nav>
            {(["pair", "permissions", "ready"] as const).map((phase, index) => (
              <a
                key={phase}
                href={
                  "/device?code=" + ONBOARDING_PREVIEW_CODE + "&demo=" + phase + "&lang=" + locale
                }
              >
                {
                  [
                    tr("auth.pairDevice.pair"),
                    tr("auth.pairDevice.permissions2"),
                    tr("auth.pairDevice.connectAi"),
                  ][index]
                }
              </a>
            ))}
          </nav>
        </aside>
      )}
      <div className="pairingFlow">
        <ol className="pairingSteps" aria-label={tr("auth.pairDevice.computerSetup")}>
          {steps.map((label, index) => (
            <li
              key={index}
              data-complete={index + 1 < step}
              aria-current={index + 1 === step ? "step" : undefined}
            >
              <span>{index + 1 < step ? <ProductIcon name="check" size={14} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <section className="pairingCard" aria-labelledby="pairing-title">
          <header className="pairingTitle">
            <span className="pairingTitleIcon">
              <ProductIcon
                name={step === 3 ? "link" : step === 2 ? "shield" : "device"}
                size={24}
              />
            </span>
            <h1 id="pairing-title">{title}</h1>
            <p>{body}</p>
          </header>
          {children}
        </section>
      </div>
      <footer className="pairingFooter">
        <span>
          <ProductIcon name="shield" size={14} />
          {tr("auth.pairDevice.yourComputerYourPermissions")}
        </span>
        <a
          href={MARKETING_ORIGIN + localizedWebsiteHref("/docs", locale)}
          target="_blank"
          rel="noreferrer"
        >
          {tr("auth.pairDevice.helpGuides")}
          <ProductIcon name="arrowUpRight" size={14} />
        </a>
      </footer>
    </main>
  );
}
export function PairDevice({
  user,
}: {
  user: User | null | undefined;
  onSignedIn: () => Promise<void>;
}) {
  const { tr, locale } = useI18n();
  const previewStep = UI_PREVIEW ? onboardingPreviewStep(new URL(location.href)) : "pair";
  const previewDevice =
    UI_PREVIEW && previewStep !== "pair" ? createOnboardingPreviewDevice() : null;
  const initialCode =
    new URLSearchParams(location.search).get("code")?.toUpperCase() ||
    (UI_PREVIEW ? ONBOARDING_PREVIEW_CODE : "");
  const [code, setCode] = useState(initialCode);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [message, setMessage] = useState("");
  const [computerLimitReached, setComputerLimitReached] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [approvedDeviceId, setApprovedDeviceId] = useState(previewDevice?.id || "");
  const [pairedDevice, setPairedDevice] = useState<Device | null>(previewDevice);
  const [setupStep, setSetupStep] = useState<"permissions" | "workspace" | "done">(
    previewStep === "ready" ? "done" : "permissions",
  );
  const [directoryBrowser, setDirectoryBrowser] = useState<DirectoryBrowser | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [workspacePathInput, setWorkspacePathInput] = useState("");
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<
    "file-editing" | "terminal" | null
  >(null);
  const [setupError, setSetupError] = useState("");
  const [terminalConfirm, setTerminalConfirm] = useState(false);
  const [backgroundRequested, setBackgroundRequested] = useState(true);

  async function lookup(targetCode = code) {
    if (!targetCode || !user) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pairing?code=" + encodeURIComponent(targetCode));
      const payload = (await response.json().then(canonicalErrorEnvelope)) as Pairing & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || tr("auth.pairDevice.pairingCodeNotFound"));
      setPairing(payload);
    } catch (error) {
      setPairing(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (user && initialCode) void lookup(initialCode);
  }, [user?.id]);

  useEffect(() => {
    if (
      pairedDevice?.status === "online" &&
      pairedDevice.background_agent_available !== true &&
      pairedDevice.background_enabled !== true
    ) {
      setBackgroundRequested(false);
    }
  }, [
    pairedDevice?.status,
    pairedDevice?.background_agent_available,
    pairedDevice?.background_enabled,
  ]);

  useEffect(() => {
    if (!approvedDeviceId || setupStep === "done") return;
    let cancelled = false;
    let timer: number | undefined;

    const refreshPairedDevice = async () => {
      try {
        const response = await fetch("/api/devices");
        if (!response.ok) return;
        const devices = (await response.json().then(canonicalErrorEnvelope)) as Device[];
        const device = devices.find((item) => item.id === approvedDeviceId) || null;
        if (!cancelled && device) {
          setPairedDevice(device);
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => void refreshPairedDevice(), 1400);
        }
      }
    };

    void refreshPairedDevice();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [approvedDeviceId, setupStep]);

  async function approve() {
    if (!pairing) return;
    setBusy(true);
    setMessage("");
    setComputerLimitReached(false);
    try {
      const response = await fetch("/api/pairing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_code: pairing.user_code }),
      });
      const payload = (await response.json().then(canonicalErrorEnvelope)) as PairingFailure & {
        device?: { id: string; name: string; platform: string; arch: string | null };
      };
      if (!response.ok || !payload.device?.id) {
        setComputerLimitReached(atComputerLimit(payload));
        throw new Error(pairingFailureMessage(payload, tr));
      }
      setApprovedDeviceId(payload.device.id);
      setDirectoryBrowser(null);
      setWorkspacePathInput("");
      setPendingWorkspaceAction(null);
      setSetupError("");
      setTerminalConfirm(false);
      setPairedDevice({
        id: payload.device.id,
        name: payload.device.name,
        platform: payload.device.platform,
        arch: payload.device.arch,
        hostname: pairing.hostname,
        created_at: new Date().toISOString(),
        last_seen: null,
        status: "offline",
        tools: [],
        available_tools: [],
        allowed_tools: [...SAFE_DEVICE_TOOLS],
        workspace_roots: [],
        sensitive_paths: [],
        sensitive_allow_paths: [],
        protect_sensitive_paths: true,
        undo_enabled: true,
        background_agent_available: false,
        background_enabled: null,
        background_service: null,
      });
      setSetupStep("permissions");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function browseWorkspace(path = "~") {
    if (!approvedDeviceId) return;
    setDirectoryLoading(true);
    setSetupError("");
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(approvedDeviceId) +
          "/directories?path=" +
          encodeURIComponent(path),
      );
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!response.ok || !payload.browser) {
        throw new Error(
          payload.error || tr("auth.pairDevice.directoryBrowsingIsUnavailableUntilThe"),
        );
      }
      setDirectoryBrowser(payload.browser);
      setWorkspacePathInput(payload.browser.path);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setDirectoryLoading(false);
    }
  }

  async function openWorkspacePicker(nextAction: "file-editing" | "terminal" | null = null) {
    setPendingWorkspaceAction(nextAction);
    setSetupError("");
    setSetupStep("workspace");
    if (!directoryBrowser) await browseWorkspace("~");
  }

  async function saveTools(nextTools: readonly string[]) {
    if (!approvedDeviceId) return false;
    const available = pairedDevice?.available_tools || pairedDevice?.tools || [];
    const supported =
      available.length > 0 ? nextTools.filter((tool) => available.includes(tool)) : [...nextTools];

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/tools",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowed_tools: supported }),
      },
    );
    if (!response.ok) {
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || tr("auth.pairDevice.couldNotSaveDevicePermissions"));
    }
    setPairedDevice((current) => (current ? { ...current, allowed_tools: supported } : current));
    return true;
  }

  async function enableFileEditing() {
    if (!approvedDeviceId) return;
    if (!(pairedDevice?.workspace_roots || []).length) {
      await openWorkspacePicker("file-editing");
      return;
    }
    setBusy(true);
    setSetupError("");
    try {
      const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
      await saveTools([...current, "write_file", "edit_block", "undo_last_change"]);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyWorkspaceScope() {
    if (!approvedDeviceId) return;
    const requestedPath = workspacePathInput.trim() || directoryBrowser?.path || "";
    if (!requestedPath) {
      setSetupError(tr("auth.pairDevice.chooseAFolderFirst"));
      return;
    }

    setBusy(true);
    setSetupError("");
    try {
      const browseResponse = await fetch(
        "/api/devices/" +
          encodeURIComponent(approvedDeviceId) +
          "/directories?path=" +
          encodeURIComponent(requestedPath),
      );
      const browsePayload = (await browseResponse
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!browseResponse.ok || !browsePayload.browser) {
        throw new Error(browsePayload.error || tr("auth.pairDevice.thatFolderIsNotAvailableOn"));
      }

      const selectedPath = browsePayload.browser.path;
      setDirectoryBrowser(browsePayload.browser);
      setWorkspacePathInput(selectedPath);

      const policyResponse = await fetch(
        "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/policy",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspace_roots: [selectedPath],
            sensitive_paths: pairedDevice?.sensitive_paths || [],
            sensitive_allow_paths: pairedDevice?.sensitive_allow_paths || [],
            protect_sensitive_paths: pairedDevice?.protect_sensitive_paths ?? true,
            undo_enabled: pairedDevice?.undo_enabled ?? true,
          }),
        },
      );
      if (!policyResponse.ok) {
        const payload = (await policyResponse
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || tr("auth.pairDevice.couldNotSaveTrustedWriteLocations"));
      }

      const nextAction = pendingWorkspaceAction;
      setPairedDevice((current) =>
        current ? { ...current, workspace_roots: [selectedPath] } : current,
      );
      setPendingWorkspaceAction(null);

      if (nextAction === "file-editing") {
        const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
        await saveTools([...current, "write_file", "edit_block", "undo_last_change"]);
      } else if (nextAction === "terminal") {
        const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
        await saveTools([...current, "start_process"]);
        setTerminalConfirm(false);
      }

      setSetupStep("permissions");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function enableTerminal() {
    if (!(pairedDevice?.workspace_roots || []).length) {
      setTerminalConfirm(false);
      await openWorkspacePicker("terminal");
      return;
    }
    setBusy(true);
    setSetupError("");
    try {
      const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
      await saveTools([...current, "start_process"]);
      setTerminalConfirm(false);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function finishSetup() {
    if (!approvedDeviceId) return;
    if (pairedDevice?.status !== "online") {
      setSetupError(tr("auth.pairDevice.waitForTheLocalRemoteArc"));
      return;
    }

    if (backgroundRequested && pairedDevice.background_agent_available !== true) {
      setSetupError(tr("auth.pairDevice.automaticRecoveryIsNotAvailableOn"));
      return;
    }

    if (backgroundRequested && !pairedDevice.background_recovery_available) {
      setSetupError(tr("auth.pairDevice.thisOlderClientExitsItsTerminal"));
      return;
    }
    if (!backgroundRequested && !backgroundActuallyEnabled) {
      setSetupError("");
      setSetupStep("done");
      return;
    }

    setBusy(true);
    setSetupError("");
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/background",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: backgroundRequested }),
        },
      );
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        error?: string;
        enabled?: boolean;
        status?: {
          enabled?: boolean;
          active?: boolean;
          service?: string;
          detail?: string;
        };
      };
      if (!response.ok) {
        throw new Error(
          payload.error || tr("auth.pairDevice.couldNotApplyTheBackgroundConnection"),
        );
      }

      const actualEnabled = payload.enabled === true || payload.status?.enabled === true;
      if (backgroundRequested && !actualEnabled) {
        throw new Error(
          payload.status?.detail || tr("auth.pairDevice.backgroundServiceCouldNotBeInstalled"),
        );
      }

      setPairedDevice((current) =>
        current
          ? {
              ...current,
              background_enabled: actualEnabled,
              background_service: payload.status?.service || current.background_service || null,
              background_seen_at: new Date().toISOString(),
            }
          : current,
      );
      setSetupStep("done");
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const availableTools = pairedDevice?.available_tools || pairedDevice?.tools || [];
  const fileEditingSupported =
    pairedDevice?.status === "online" &&
    ["write_file", "edit_block", "undo_last_change"].every((tool) => availableTools.includes(tool));
  const terminalSupported =
    pairedDevice?.status === "online" && availableTools.includes("start_process");
  const enabledTools = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
  const fileEditingEnabled =
    enabledTools.includes("write_file") &&
    enabledTools.includes("edit_block") &&
    enabledTools.includes("undo_last_change");
  const terminalEnabled = enabledTools.includes("start_process");
  const backgroundCapabilityReady =
    pairedDevice?.status === "online" && pairedDevice.background_agent_available === true;
  const backgroundActuallyEnabled = pairedDevice?.background_enabled === true;

  if (user === undefined) {
    return (
      <PairingCard
        title={tr("auth.pairDevice.loading")}
        body={tr("auth.pairDevice.checkingYourRemoteArcAccount")}
      />
    );
  }

  if (!user) {
    return (
      <>
        <PairingCard
          title={tr("auth.pairDevice.signInToPairThisComputer")}
          body={
            initialCode
              ? tr("auth.pairDevice.chooseARemoteArcAccountThen")
              : tr("auth.pairDevice.chooseARemoteArcAccountBefore")
          }
        >
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("auth.pairDevice.signInToRemoteArc")} <span>→</span>
          </button>
        </PairingCard>
        {showSignIn && (
          <AuthProviderModal
            returnTo={location.pathname + location.search}
            title={tr("auth.pairDevice.chooseHowToSignIn")}
            body={tr("auth.pairDevice.signInToTheRemoteArc")}
            onClose={() => setShowSignIn(false)}
          />
        )}
      </>
    );
  }

  if (approvedDeviceId && setupStep === "done") {
    const copyEndpoint = () => {
      void navigator.clipboard?.writeText(MCP_ENDPOINT).catch(() => undefined);
    };
    const agentTargets = [
      {
        id: "chatgpt",
        name: "ChatGPT",
        icon: "/ai-openai.svg",
        href: CHATGPT_PLUGIN_URL,
        guidePath: "/install/chatgpt",
        detail: tr("auth.pairDevice.installThePublishedPluginAndConnect"),
        action: tr("auth.pairDevice.openOfficialPlugin"),
        copyEndpoint: false,
      },
      {
        id: "claude",
        name: "Claude",
        icon: "/ai-claude.svg",
        href: CLAUDE_CONNECTORS_URL,
        guidePath: "/install/claude",
        detail: tr("auth.pairDevice.remoteMcpEndpointWillBeCopied"),
        action: tr("auth.pairDevice.openConnectors"),
        copyEndpoint: true,
      },
      {
        id: "cursor",
        name: "Cursor",
        icon: "/ai-cursor.svg",
        href: cursorMcpInstallUrl(),
        guidePath: "/install/cursor",
        detail: tr("auth.pairDevice.oneClickMcpInstallThenComplete"),
        action: tr("auth.pairDevice.addToCursor"),
        copyEndpoint: false,
      },
      {
        id: "other",
        name: tr("auth.pairDevice.otherMcp"),
        icon: "",
        href: MARKETING_ORIGIN + localizedWebsiteHref("/docs/mcp", locale),
        guidePath: "/remote-mcp",
        detail: tr("auth.pairDevice.copyTheEndpointAndUseYour"),
        action: tr("auth.pairDevice.copyOpenDocs"),
        copyEndpoint: true,
      },
    ];

    return (
      <PairingCard
        step={3}
        title={tr("auth.pairDevice.connectYourAi")}
        body={tr("auth.pairDevice.yourComputerIsPairedToUse")}
      >
        <div className="pairConnectStatus">
          <span>
            <ProductIcon name="check" size={15} />
            {tr("auth.pairDevice.computerPaired")}
          </span>
          <strong>
            <ProductIcon name="link" size={15} />
            {tr("auth.pairDevice.mcpConnectionRequired")}
          </strong>
        </div>

        <section className="pairAgentConnect">
          <div className="pairAgentConnectIntro">
            <span className="eyebrow">{tr("auth.pairDevice.requiredForConnect")}</span>
            <h3>{tr("auth.pairDevice.chooseYourAiClient")}</h3>
            <p>{tr("auth.pairDevice.forChatgptOpenThePublishedRemote")}</p>
          </div>

          <div className="pairAgentGrid">
            {agentTargets.map((agent) => (
              <article className="pairAgentOption" key={agent.id}>
                <div className="pairAgentIdentity">
                  {agent.icon ? (
                    <img
                      src={agent.icon}
                      alt=""
                      className={agent.id === "chatgpt" ? "pairChatGptLogo" : undefined}
                    />
                  ) : (
                    <span className="pairMcpIcon">MCP</span>
                  )}
                  <div>
                    <strong>{agent.name}</strong>
                    <small>{agent.detail}</small>
                  </div>
                </div>
                <div className="pairAgentActions">
                  <a
                    className="pairAgentGuide"
                    href={MARKETING_ORIGIN + localizedWebsiteHref(agent.guidePath, locale)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={agent.name + " · " + tr("auth.pairDevice.installationGuide")}
                  >
                    <ProductIcon name="link" size={15} />
                    <span>
                      {tr("auth.pairDevice.connect")}
                      {agent.name}
                    </span>
                    <ProductIcon name="arrowUpRight" size={14} />
                  </a>
                  <a
                    className="pairAgentLaunch"
                    href={agent.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={agent.copyEndpoint ? copyEndpoint : undefined}
                  >
                    {agent.action}
                    <ProductIcon name="arrowUpRight" size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>

          <details className="pairCustomMcp">
            <summary>{tr("auth.pairDevice.customMcpOtherClients")}</summary>
            <div className="pairAgentEndpoint">
              <span>{tr("auth.pairDevice.remoteMcpEndpoint")}</span>
              <code>{MCP_ENDPOINT}</code>
              <CopyButton value={MCP_ENDPOINT} />
            </div>
          </details>
        </section>
        <div className="pairConnectionCheck">
          <strong>{tr("auth.pairDevice.checkTheConnection")}</strong>
          <p>{tr("auth.pairDevice.afterAuthorizationSelectRemoteArcIn")}</p>
        </div>

        <details className="pairDeviceSummary">
          <summary>{tr("auth.pairDevice.computerPairedReviewPermissions")}</summary>
          <div className="pairSetupSummary">
            <div>
              <span>{tr("auth.pairDevice.backgroundConnection")}</span>
              <strong>
                {backgroundActuallyEnabled
                  ? tr("auth.pairDevice.enabled")
                  : tr("auth.pairDevice.foregroundOnly")}
              </strong>
            </div>
            <div>
              <span>{tr("auth.pairDevice.readAccess")}</span>
              <strong>{tr("auth.pairDevice.enabled")}</strong>
            </div>
            <div>
              <span>{tr("auth.pairDevice.fileEditing")}</span>
              <strong>
                {fileEditingEnabled ? tr("auth.pairDevice.enabled") : tr("auth.pairDevice.off")}
              </strong>
            </div>
            <div>
              <span>{tr("auth.pairDevice.terminal")}</span>
              <strong>
                {terminalEnabled ? tr("auth.pairDevice.enabled") : tr("auth.pairDevice.off")}
              </strong>
            </div>
          </div>
        </details>

        <div className="pairDoneSecondary">
          <a href="/connect">{tr("auth.pairDevice.alreadyConnectedOpenConnectAi")} →</a>
          <a href="/devices">{tr("auth.pairDevice.manageComputerPermissions")} →</a>
        </div>
      </PairingCard>
    );
  }

  if (approvedDeviceId && setupStep === "workspace") {
    return (
      <PairingCard
        step={2}
        title={tr("auth.pairDevice.chooseWhereAiMayWork")}
        body={
          pendingWorkspaceAction === "terminal"
            ? tr("auth.pairDevice.terminalAccessNeedsATrustedWrite")
            : tr("auth.pairDevice.chooseAFolderWhereRemoteArc")
        }
      >
        <div className="pairWorkspaceManual">
          <label htmlFor="pair-workspace-path">{tr("auth.pairDevice.folderPath")}</label>
          <div>
            <input
              id="pair-workspace-path"
              value={workspacePathInput}
              onChange={(event) => setWorkspacePathInput(event.target.value)}
              placeholder={tr("auth.pairDevice.enterAFolderPathOnThis")}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="ghostButton"
              disabled={!workspacePathInput.trim() || directoryLoading || busy}
              onClick={() => void browseWorkspace(workspacePathInput.trim())}
            >
              {directoryLoading ? tr("auth.pairDevice.opening") : tr("auth.pairDevice.browse")}
            </button>
          </div>
          <small>{tr("auth.pairDevice.pathsAreInterpretedByThisRuntime")}</small>
        </div>

        <div className="pairWorkspacePath">
          <code>{directoryBrowser?.path || tr("auth.pairDevice.waitingForDevice")}</code>
          {directoryBrowser?.parent && (
            <button
              className="ghostButton small"
              onClick={() => void browseWorkspace(directoryBrowser.parent!)}
            >
              ↑ {tr("auth.pairDevice.parent")}
            </button>
          )}
        </div>

        <div className="pairWorkspaceList">
          {directoryLoading && (
            <div className="pairSetupEmpty">{tr("auth.pairDevice.loadingFolders")}</div>
          )}
          {!directoryLoading &&
            directoryBrowser?.directories.map((entry) => (
              <button key={entry.path} onClick={() => void browseWorkspace(entry.path)}>
                <span>{entry.type === "symlink" ? "↗" : "▣"}</span>
                <strong>{entry.name}</strong>
                <small>›</small>
              </button>
            ))}
          {!directoryLoading && directoryBrowser && !directoryBrowser.directories.length && (
            <div className="pairSetupEmpty">{tr("auth.pairDevice.noVisibleChildFolders")}</div>
          )}
        </div>

        {directoryBrowser && directoryBrowser.protected_entries_omitted > 0 && (
          <p className="pairSetupNote">
            {tr("auth.pairDevice.protectedFolderSAreHidden", {
              protected_entries_omitted: directoryBrowser.protected_entries_omitted,
            })}
          </p>
        )}
        {setupError && <p className="errorText">{setupError}</p>}

        <div className="pairSetupActions">
          <button
            className="ghostButton"
            onClick={() => {
              setPendingWorkspaceAction(null);
              setSetupError("");
              setSetupStep("permissions");
            }}
          >
            {tr("auth.pairDevice.back")}
          </button>
          <button
            className="primaryButton"
            disabled={!workspacePathInput.trim() || directoryLoading || busy}
            onClick={() => void applyWorkspaceScope()}
          >
            {busy
              ? tr("auth.pairDevice.saving")
              : pendingWorkspaceAction
                ? tr("auth.pairDevice.useFolderContinue")
                : tr("auth.pairDevice.useThisFolder")}
          </button>
        </div>
      </PairingCard>
    );
  }

  if (approvedDeviceId) {
    return (
      <PairingCard
        step={2}
        title={tr("auth.pairDevice.chooseWhatAiCanDo")}
        body={tr("auth.pairDevice.yourComputerIsPairedStartWith")}
      >
        <div className="pairConnectedDevice">
          <div className="deviceIcon large">{platformGlyph(pairedDevice?.platform)}</div>
          <div>
            <strong>{pairedDevice?.name || pairing?.device_name}</strong>
            <span>
              {pairedDevice?.status === "online"
                ? tr("auth.pairDevice.connectedAndReady")
                : tr("auth.pairDevice.waitingForTheLocalAgentTo")}
            </span>
          </div>
          <i className={"pairStatusDot " + (pairedDevice?.status === "online" ? "online" : "")} />
        </div>

        <div className="pairPermissionStack">
          <section className={"pairPermissionCard " + (backgroundActuallyEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">↻</span>
                <div>
                  <div className="labelWithHelp">
                    <strong>{tr("auth.pairDevice.automaticRecovery")}</strong>
                    <HelpTip
                      label={tr("auth.pairDevice.howAutomaticRecoveryWorks")}
                      text={tr("auth.pairDevice.anUpdatedClientKeepsThisTerminal")}
                    />
                  </div>
                  <small>
                    {backgroundActuallyEnabled
                      ? tr("auth.pairDevice.installedLocally")
                      : backgroundRequested
                        ? tr("auth.pairDevice.recommendedSelectedByDefault")
                        : tr("auth.pairDevice.foregroundOnly")}
                  </small>
                </div>
              </div>
              <label className="compactSwitch">
                <input
                  type="checkbox"
                  checked={backgroundRequested}
                  disabled={!backgroundCapabilityReady || busy}
                  onChange={(event) => setBackgroundRequested(event.target.checked)}
                />
                <span />
              </label>
            </div>
            <p>
              {backgroundRequested
                ? tr("auth.pairDevice.finishSetupToEnableAVerified")
                : tr("auth.pairDevice.noLoginAutostartWillBeInstalled")}
            </p>
            {!backgroundCapabilityReady && (
              <small className="pairSetupNote">
                {tr("auth.pairDevice.waitingForTheLocalAgentBefore")}
              </small>
            )}
          </section>
          <section className="pairPermissionCard enabled">
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">R</span>
                <div>
                  <strong>{tr("auth.pairDevice.readAccess")}</strong>
                  <small>{tr("auth.pairDevice.safeDefault")}</small>
                </div>
              </div>
              <span className="pairPermissionState">{tr("auth.pairDevice.enabled")}</span>
            </div>
            <ul>
              <li>{tr("auth.pairDevice.browseFilesAndFolders")}</li>
              <li>{tr("auth.pairDevice.readFileContentsAndMetadata")}</li>
              <li>{tr("auth.pairDevice.viewRunningProcesses")}</li>
            </ul>
          </section>

          <section className={"pairPermissionCard " + (fileEditingEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">✎</span>
                <div>
                  <strong>{tr("auth.pairDevice.fileEditing")}</strong>
                  <small>{tr("auth.pairDevice.recommendedForCodingDocumentsAndData")}</small>
                </div>
              </div>
              {fileEditingEnabled && (
                <span className="pairPermissionState">{tr("auth.pairDevice.enabled")}</span>
              )}
            </div>
            <p>{tr("auth.pairDevice.createAndEditFilesWithSensitive")}</p>
            {!fileEditingEnabled ? (
              <button
                className="primaryButton"
                disabled={!fileEditingSupported || busy}
                onClick={() => void enableFileEditing()}
              >
                {fileEditingSupported
                  ? busy
                    ? tr("auth.pairDevice.enabling")
                    : tr("auth.pairDevice.enableFileEditing")
                  : tr("auth.pairDevice.waitingForDeviceCapability")}
              </button>
            ) : (
              <div className="pairWorkspaceControl">
                <div>
                  <span>{tr("auth.pairDevice.trustedWriteLocations")}</span>
                  <code>
                    {pairedDevice?.workspace_roots?.[0] ||
                      tr("auth.pairDevice.allNonSensitivePaths")}
                  </code>
                </div>
                <button className="ghostButton" onClick={() => void openWorkspacePicker()}>
                  {pairedDevice?.workspace_roots?.length
                    ? tr("auth.pairDevice.changeWorkspace")
                    : tr("auth.pairDevice.limitToAWorkspace")}
                </button>
              </div>
            )}
          </section>

          <section className={"pairPermissionCard terminal " + (terminalEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">›_</span>
                <div>
                  <strong>{tr("auth.pairDevice.terminalAccess")}</strong>
                  <small>{tr("auth.pairDevice.advanced")}</small>
                </div>
              </div>
              {terminalEnabled && (
                <span className="pairPermissionState">{tr("auth.pairDevice.enabled")}</span>
              )}
            </div>
            <p>{tr("auth.pairDevice.allowAiToRunShellCommands")}</p>
            {!terminalEnabled && !terminalConfirm && (
              <button
                className="ghostButton"
                disabled={!terminalSupported}
                onClick={() => setTerminalConfirm(true)}
              >
                {tr("auth.pairDevice.enableTerminalAccess")}
              </button>
            )}
            {!terminalEnabled && terminalConfirm && (
              <div className="pairTerminalConfirm">
                <span>{tr("auth.pairDevice.terminalCommandsCanHaveEffectsThat")}</span>
                <div>
                  <button className="ghostButton" onClick={() => setTerminalConfirm(false)}>
                    {tr("auth.pairDevice.cancel")}
                  </button>
                  <button
                    className="dangerConfirmButton"
                    disabled={busy}
                    onClick={() => void enableTerminal()}
                  >
                    {busy
                      ? tr("auth.pairDevice.enabling")
                      : tr("auth.pairDevice.confirmTerminalAccess")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {setupError && <p className="errorText">{setupError}</p>}

        <div className="pairSetupFooter">
          <span>{tr("auth.pairDevice.youCanChangeEveryPermissionLater")}</span>
          <button
            className="primaryButton"
            disabled={pairedDevice?.status !== "online" || busy}
            onClick={() => void finishSetup()}
          >
            {busy
              ? tr("auth.pairDevice.savingSetup")
              : tr("auth.pairDevice.continueToAiConnection")}
          </button>
        </div>
      </PairingCard>
    );
  }

  return (
    <PairingCard
      title={tr("auth.pairDevice.pairAComputer")}
      body={tr("auth.pairDevice.confirmThatTheCodeAndComputer")}
    >
      {!pairing ? (
        <div className="pairLookup">
          <input
            className="codeInput"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            maxLength={9}
          />
          <button onClick={() => void lookup()} disabled={busy || !code}>
            {busy ? tr("auth.pairDevice.checking") : tr("auth.pairDevice.continue")}
          </button>
        </div>
      ) : (
        <div className="pairDevice">
          <div className="pairCode">{pairing.user_code}</div>
          <div className="pairComputer">
            <div className="deviceIcon large">{platformGlyph(pairing.platform)}</div>
            <div className="pairMeta">
              <strong>{pairing.device_name}</strong>
              <span>
                {platformLabel(pairing.platform)} · {pairing.arch || "unknown"}
              </span>
              {pairing.hostname && <span>{pairing.hostname}</span>}
            </div>
          </div>
          <div className="permissionBox">
            <div>
              <strong>{tr("auth.pairDevice.readOnlyAccess")}</strong>
              <span>{tr("auth.pairDevice.filesFoldersMetadataAndProcessVisibility")}</span>
            </div>
            <span className="permissionBadge">{tr("auth.pairDevice.safeDefault")}</span>
          </div>
          <button className="approveButton" onClick={() => void approve()} disabled={busy}>
            {busy ? tr("auth.pairDevice.authorizing") : tr("auth.pairDevice.authorizeThisDevice")}
          </button>
        </div>
      )}
      {message && <p className="errorText">{message}</p>}
      {computerLimitReached && (
        <div className="pairLimitActions">
          <a className="primaryButton" href={APP_ORIGIN + "/checkout?product=connect-unlimited-v1"}>
            {tr("auth.pairDevice.getUnlimitedComputers")} <span>→</span>
          </a>
          <a className="ghostButton" href={APP_ORIGIN + "/devices"}>
            {tr("auth.pairDevice.manageComputers")}
          </a>
        </div>
      )}
      <p className="signedInAs">
        {tr("auth.pairDevice.signedInAs")} {user.email}
      </p>
    </PairingCard>
  );
}
