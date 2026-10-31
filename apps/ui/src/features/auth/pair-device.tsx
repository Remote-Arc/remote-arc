import { ProductIcon } from "../../components/product-icon.js";
import { CHATGPT_PLUGIN_URL } from "../install/client-links.js";
import React, { useEffect, useState } from "react";
import { LanguageSwitcher, useI18n } from "../../app/i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import { ONBOARDING_PREVIEW_CODE, createOnboardingPreviewDevice, onboardingPreviewStep } from "../../preview/onboarding-preview.js";
import { Brand, CopyButton, HelpTip, ThemeSwitcher } from "../../components/public-layout.js";
import { APP_ORIGIN, CLAUDE_CONNECTORS_URL, MARKETING_ORIGIN, MCP_ENDPOINT, cursorMcpInstallUrl } from "../../config/app-config.js";
import { atComputerLimit, pairingFailureMessage, type PairingFailure } from "./pairing-errors.js";
import { type Device, type DirectoryBrowser, type Pairing, type User } from "../../types/app-types.js";
import { SAFE_DEVICE_TOOLS, platformGlyph, platformLabel } from "../dashboard/devices/device-presets.js";
import { AuthProviderModal } from "./auth-pages.js";

function PairingCard({ title, body, children, step = 1 }: {
  title: string;
  body: string;
  children?: React.ReactNode;
  step?: 1 | 2 | 3;
}) {
  const { tr, locale } = useI18n();
  const steps = [tr("Pair computer", "配对电脑"), tr("Permissions", "设置权限"), tr("Connect AI", "连接 AI")];
  return (
    <main className="pairingShell workspaceSurface">
      <header className="pairingHeader">
        <Brand compact />
        <div><LanguageSwitcher compact syncUrl dropdown iconOnly /><ThemeSwitcher compact /></div>
      </header>
      {UI_PREVIEW && <aside className="pairingPreview" aria-label={tr("Onboarding preview", "配对流程预览")}>
        <span>{tr("UI preview · simulated computer", "UI 预览 · 模拟电脑")}</span>
        <nav>{(["pair", "permissions", "ready"] as const).map((phase, index) => <a key={phase} href={"/device?code=" + ONBOARDING_PREVIEW_CODE + "&demo=" + phase + "&lang=" + locale}>{[tr("Pair", "配对"), tr("Permissions", "权限设置"), tr("Connect AI", "连接 AI")][index]}</a>)}</nav>
      </aside>}
      <div className="pairingFlow">
        <ol className="pairingSteps" aria-label={tr("Computer setup", "电脑设置")}>
          {steps.map((label, index) => (
            <li key={index} data-complete={index + 1 < step} aria-current={index + 1 === step ? "step" : undefined}>
              <span>{index + 1 < step ? <ProductIcon name="check" size={14} /> : index + 1}</span>{label}
            </li>
          ))}
        </ol>
        <section className="pairingCard" aria-labelledby="pairing-title">
          <header className="pairingTitle">
            <span className="pairingTitleIcon"><ProductIcon name={step === 3 ? "link" : step === 2 ? "shield" : "device"} size={24} /></span>
            <h1 id="pairing-title">{title}</h1>
            <p>{body}</p>
          </header>
          {children}
        </section>
      </div>
      <footer className="pairingFooter">
        <span><ProductIcon name="shield" size={14} />{tr("Your computer. Your permissions.", "你的电脑，由你掌控权限。")}</span>
        <a href={MARKETING_ORIGIN + localizedWebsiteHref("/docs", locale)} target="_blank" rel="noreferrer">{tr("Help & guides", "帮助与指南")}<ProductIcon name="arrowUpRight" size={14} /></a>
      </footer>
    </main>
  );
}
export function PairDevice({
  user,
  onSignedIn,
}: {
  user: User | null | undefined;
  onSignedIn: () => Promise<void>;
}) {
  const { tr, locale } = useI18n();
  const previewStep = UI_PREVIEW ? onboardingPreviewStep(new URL(location.href)) : "pair";
  const previewDevice = UI_PREVIEW && previewStep !== "pair" ? createOnboardingPreviewDevice() : null;
  const initialCode =
    new URLSearchParams(location.search).get("code")?.toUpperCase() || (UI_PREVIEW ? ONBOARDING_PREVIEW_CODE : "");
  const [code, setCode] = useState(initialCode);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [message, setMessage] = useState("");
  const [computerLimitReached, setComputerLimitReached] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [approvedDeviceId, setApprovedDeviceId] = useState(previewDevice?.id || "");
  const [pairedDevice, setPairedDevice] = useState<Device | null>(previewDevice);
  const [setupStep, setSetupStep] = useState<"permissions" | "workspace" | "done">(previewStep === "ready" ? "done" : "permissions");
  const [directoryBrowser, setDirectoryBrowser] = useState<DirectoryBrowser | null>(null);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [workspacePathInput, setWorkspacePathInput] = useState("");
  const [pendingWorkspaceAction, setPendingWorkspaceAction] = useState<"file-editing" | "terminal" | null>(null);
  const [setupError, setSetupError] = useState("");
  const [terminalConfirm, setTerminalConfirm] = useState(false);
  const [backgroundRequested, setBackgroundRequested] = useState(true);

  async function lookup(targetCode = code) {
    if (!targetCode || !user) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pairing?code=" + encodeURIComponent(targetCode));
      const payload = (await response.json()) as Pairing & { error?: string };
      if (!response.ok) throw new Error(payload.error || tr("Pairing code not found", "未找到配对码"));
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
        const devices = (await response.json()) as Device[];
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
      const payload = (await response.json()) as PairingFailure & {
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
      const payload = (await response.json().catch(() => ({}))) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!response.ok || !payload.browser) {
        throw new Error(
          payload.error ||
            tr("Directory browsing is unavailable until the device is online.", "设备上线后才能浏览目录。"),
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
      available.length > 0
        ? nextTools.filter((tool) => available.includes(tool))
        : [...nextTools];

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(approvedDeviceId) + "/tools",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowed_tools: supported }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || tr("Could not save device permissions.", "无法保存设备权限。"));
    }
    setPairedDevice((current) =>
      current ? { ...current, allowed_tools: supported } : current,
    );
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
      await saveTools([
        ...current,
        "write_file",
        "edit_block",
        "undo_last_change",
      ]);
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
      setSetupError(tr("Choose a folder first.", "请先选择一个目录。"));
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
      const browsePayload = (await browseResponse.json().catch(() => ({}))) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!browseResponse.ok || !browsePayload.browser) {
        throw new Error(
          browsePayload.error ||
            tr("That folder is not available on this computer.", "这台电脑上无法使用该目录。"),
        );
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
        const payload = (await policyResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || tr("Could not save Trusted Write Locations.", "无法保存可信写入区域。"));
      }

      const nextAction = pendingWorkspaceAction;
      setPairedDevice((current) =>
        current ? { ...current, workspace_roots: [selectedPath] } : current,
      );
      setPendingWorkspaceAction(null);

      if (nextAction === "file-editing") {
        const current = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
        await saveTools([
          ...current,
          "write_file",
          "edit_block",
          "undo_last_change",
        ]);
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
      setSetupError(
        tr(
          "Wait for the local Remote Arc agent to connect before finishing setup.",
          "请等待本机 Remote Arc Agent 连接后再完成设置。",
        ),
      );
      return;
    }

    if (backgroundRequested && pairedDevice.background_agent_available !== true) {
      setSetupError(tr(
        "Automatic recovery is not available on this client yet. Turn it off to finish setup now, or update remotelink first.",
        "当前客户端还不支持自动恢复。你可以先关闭此选项完成设置，或先更新 remotelink。",
      ));
      return;
    }

    if (backgroundRequested && !pairedDevice.background_recovery_available) {
      setSetupError(tr("This older client exits its terminal when enabling background mode. Update to the recovery-capable CLI, or turn this option off to finish setup with the current session.", "当前旧版客户端启用后台模式会退出终端。请更新为支持恢复的 CLI，或关闭此选项，以当前会话完成设置。"));
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
      const payload = (await response.json().catch(() => ({}))) as {
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
          payload.error ||
            tr(
              "Could not apply the background connection setting.",
              "无法应用后台连接设置。",
            ),
        );
      }

      const actualEnabled =
        payload.enabled === true || payload.status?.enabled === true;
      if (backgroundRequested && !actualEnabled) {
        throw new Error(
          payload.status?.detail ||
            tr(
              "Background service could not be installed. This terminal session is still connected.",
              "后台服务安装失败，当前终端会话仍保持连接。",
            ),
        );
      }

      setPairedDevice((current) =>
        current
          ? {
              ...current,
              background_enabled: actualEnabled,
              background_service:
                payload.status?.service || current.background_service || null,
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
    ["write_file", "edit_block", "undo_last_change"].every((tool) =>
      availableTools.includes(tool),
    );
  const terminalSupported =
    pairedDevice?.status === "online" && availableTools.includes("start_process");
  const enabledTools = pairedDevice?.allowed_tools || [...SAFE_DEVICE_TOOLS];
  const fileEditingEnabled =
    enabledTools.includes("write_file") &&
    enabledTools.includes("edit_block") &&
    enabledTools.includes("undo_last_change");
  const terminalEnabled = enabledTools.includes("start_process");
  const backgroundCapabilityReady =
    pairedDevice?.status === "online" &&
    pairedDevice.background_agent_available === true;
  const backgroundActuallyEnabled = pairedDevice?.background_enabled === true;

  if (user === undefined) {
    return <PairingCard title={tr("Loading…", "加载中…")} body={tr("Checking your Remote Arc account.", "正在检查 Remote Arc 账户。")} />;
  }

  if (!user) {
    return (
      <>
        <PairingCard
          title={tr("Sign in to pair this computer", "登录以配对这台电脑")}
          body={initialCode
            ? tr("Choose a Remote Arc account, then confirm the code shown in your terminal.", "选择一个 Remote Arc 账户，然后确认终端中显示的配对码。")
            : tr("Choose a Remote Arc account before approving this computer.", "授权这台电脑前，请先选择 Remote Arc 账户。")}
        >
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("Sign in to Remote Arc", "登录 Remote Arc")} <span>→</span>
          </button>
        </PairingCard>
        {showSignIn && (
          <AuthProviderModal
            returnTo={location.pathname + location.search}
            title={tr("Choose how to sign in.", "选择登录方式。")}
            body={tr("Sign in to the Remote Arc account that should own this paired computer.", "登录将拥有这台已配对电脑的 Remote Arc 账户。")}
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
        detail: tr("Install the published plugin and connect this same Remote Arc account", "安装已上架插件，并连接当前这个 Remote Arc 账号"),
        action: tr("Open official plugin", "打开官方插件"),
        copyEndpoint: false,
      },
      {
        id: "claude",
        name: "Claude",
        icon: "/ai-claude.svg",
        href: CLAUDE_CONNECTORS_URL,
        guidePath: "/install/claude",
        detail: tr("Remote MCP endpoint will be copied for you", "会自动复制 Remote MCP 地址"),
        action: tr("Open Connectors", "打开 Connectors"),
        copyEndpoint: true,
      },
      {
        id: "cursor",
        name: "Cursor",
        icon: "/ai-cursor.svg",
        href: cursorMcpInstallUrl(),
        guidePath: "/install/cursor",
        detail: tr("One-click MCP install, then complete OAuth", "一键添加 MCP，然后完成 OAuth"),
        action: tr("Add to Cursor", "添加到 Cursor"),
        copyEndpoint: false,
      },
      {
        id: "other",
        name: tr("Other MCP", "其他 MCP"),
        icon: "",
        href: MARKETING_ORIGIN + localizedWebsiteHref("/docs/mcp", locale),
        guidePath: "/remote-mcp",
        detail: tr("Copy the endpoint and use your client's MCP setup", "复制 Endpoint，并在客户端的 MCP 设置中添加"),
        action: tr("Copy & open docs", "复制并打开文档"),
        copyEndpoint: true,
      },
    ];

    return (
      <PairingCard
        step={3}
        title={tr("Connect your AI", "连接你的 AI")}
        body={tr(
          "Your computer is paired. To use Connect, you must also add Remote Arc to your AI client and complete MCP authorization. Pairing the computer alone does not connect your AI.",
          "电脑已配对。使用 Connect 还必须在 AI 客户端中添加 Remote Arc，并完成 MCP 授权。仅配对电脑，不代表 AI 已经连接。",
        )}
      >
        <div className="pairConnectStatus"><span><ProductIcon name="check" size={15}/>{tr("Computer paired", "电脑已配对")}</span><strong><ProductIcon name="link" size={15}/>{tr("MCP connection required", "还需完成 MCP 连接")}</strong></div>

        <section className="pairAgentConnect">
          <div className="pairAgentConnectIntro">
            <span className="eyebrow">{tr("REQUIRED FOR CONNECT", "CONNECT 必需步骤")}</span>
            <h3>{tr("Choose your AI client", "选择你的 AI 客户端")}</h3>
            <p>{tr(
              "For ChatGPT, open the published Remote Arc plugin and connect the same account used to pair this computer. Other clients can use a custom MCP connection. Then ask your AI to list your computers.",
              "ChatGPT 用户直接打开已上架的 Remote Arc 插件，并连接配对这台电脑时使用的同一账号。其他客户端仍可使用 Custom MCP。然后让 AI 列出你的电脑。",
            )}</p>
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
                  <a className="pairAgentGuide" href={MARKETING_ORIGIN + localizedWebsiteHref(agent.guidePath, locale)} target="_blank" rel="noreferrer" aria-label={agent.name + " · " + tr("Installation guide", "安装指南")}>
                    <ProductIcon name="link" size={15} /><span>{tr("Connect ", "连接 ")}{agent.name}</span><ProductIcon name="arrowUpRight" size={14} />
                  </a>
                  <a className="pairAgentLaunch" href={agent.href} target="_blank" rel="noreferrer" onClick={agent.copyEndpoint ? copyEndpoint : undefined}>
                    {agent.action}<ProductIcon name="arrowUpRight" size={14} />
                  </a>
                </div>
              </article>
            ))}
          </div>

          <details className="pairCustomMcp">
            <summary>{tr("Custom MCP / other clients", "Custom MCP / 其他客户端")}</summary>
            <div className="pairAgentEndpoint">
              <span>{tr("Remote MCP endpoint", "Remote MCP 地址")}</span>
              <code>{MCP_ENDPOINT}</code>
              <CopyButton value={MCP_ENDPOINT} />
            </div>
          </details>
        </section>
        <div className="pairConnectionCheck"><strong>{tr("Check the connection", "确认连接成功")}</strong><p>{tr("After authorization, select Remote Arc in your AI chat and ask for your device list. A successful device result confirms the connection.", "授权后，在 AI 对话中启用 Remote Arc，发送“列出我的设备”。成功返回设备结果，才说明连接已经可用。")}</p></div>

        <details className="pairDeviceSummary"><summary>{tr("Computer paired · review permissions", "电脑已配对 · 查看权限")}</summary>
        <div className="pairSetupSummary">
          <div>
            <span>{tr("Background connection", "后台连接")}</span>
            <strong>
              {backgroundActuallyEnabled
                ? tr("Enabled", "已开启")
                : tr("Foreground only", "仅前台运行")}
            </strong>
          </div>
          <div><span>{tr("Read access", "读取权限")}</span><strong>{tr("Enabled", "已开启")}</strong></div>
          <div><span>{tr("File editing", "文件编辑")}</span><strong>{fileEditingEnabled ? tr("Enabled", "已开启") : tr("Off", "未开启")}</strong></div>
          <div><span>{tr("Terminal", "终端")}</span><strong>{terminalEnabled ? tr("Enabled", "已开启") : tr("Off", "未开启")}</strong></div>
        </div>
        </details>

        <div className="pairDoneSecondary">
          <a href="/connect">{tr("Already connected? Open Connect AI", "已完成连接？打开 Connect AI")} →</a>
          <a href="/devices">{tr("Manage computer permissions", "管理电脑权限")} →</a>
        </div>
      </PairingCard>
    );
  }

  if (approvedDeviceId && setupStep === "workspace") {
    return (
      <PairingCard
        step={2}
        title={tr("Choose where AI may work", "选择 AI 可以工作的目录")}
        body={pendingWorkspaceAction === "terminal"
          ? tr(
              "Terminal access needs a Trusted Write Location before it can be enabled. Choose a folder on this runtime. Terminal commands still run as your local OS user and are not confined to this folder by an OS sandbox.",
              "开启终端前需要先设置可信写入区域。请选择这个运行环境上的目录。终端命令仍以本机用户身份执行，并不会被操作系统沙箱限制在这个目录内。",
            )
          : tr(
              "Choose a folder where Remote Arc may create or edit files. You can browse this computer or enter any folder path that this runtime can access.",
              "选择一个允许 Remote Arc 创建或编辑文件的目录。你可以浏览这台电脑，也可以直接输入这个运行环境能够访问的任意目录路径。",
            )}
      >
        <div className="pairWorkspaceManual">
          <label htmlFor="pair-workspace-path">{tr("Folder path", "目录路径")}</label>
          <div>
            <input
              id="pair-workspace-path"
              value={workspacePathInput}
              onChange={(event) => setWorkspacePathInput(event.target.value)}
              placeholder={tr("Enter a folder path on this computer", "输入这台电脑上的目录路径")}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="ghostButton"
              disabled={!workspacePathInput.trim() || directoryLoading || busy}
              onClick={() => void browseWorkspace(workspacePathInput.trim())}
            >
              {directoryLoading ? tr("Opening…", "正在打开…") : tr("Browse", "浏览")}
            </button>
          </div>
          <small>{tr(
            "Paths are interpreted by this runtime, so Windows, macOS, Linux and WSL can each use their native filesystem paths.",
            "路径由当前运行环境解释，因此 Windows、macOS、Linux 和 WSL 都可以使用各自原生的文件系统路径。",
          )}</small>
        </div>

        <div className="pairWorkspacePath">
          <code>{directoryBrowser?.path || tr("Waiting for device…", "等待设备上线…")}</code>
          {directoryBrowser?.parent && (
            <button className="ghostButton small" onClick={() => void browseWorkspace(directoryBrowser.parent!)}>
              ↑ {tr("Parent", "上一级")}
            </button>
          )}
        </div>

        <div className="pairWorkspaceList">
          {directoryLoading && <div className="pairSetupEmpty">{tr("Loading folders…", "正在加载目录…")}</div>}
          {!directoryLoading && directoryBrowser?.directories.map((entry) => (
            <button key={entry.path} onClick={() => void browseWorkspace(entry.path)}>
              <span>{entry.type === "symlink" ? "↗" : "▣"}</span>
              <strong>{entry.name}</strong>
              <small>›</small>
            </button>
          ))}
          {!directoryLoading && directoryBrowser && !directoryBrowser.directories.length && (
            <div className="pairSetupEmpty">{tr("No visible child folders.", "没有可见的子目录。")}</div>
          )}
        </div>

        {directoryBrowser && directoryBrowser.protected_entries_omitted > 0 && (
          <p className="pairSetupNote">{tr(
            directoryBrowser.protected_entries_omitted + " protected folder(s) are hidden.",
            "有 " + directoryBrowser.protected_entries_omitted + " 个受保护目录已隐藏。",
          )}</p>
        )}
        {setupError && <p className="errorText">{setupError}</p>}

        <div className="pairSetupActions">
          <button className="ghostButton" onClick={() => {
            setPendingWorkspaceAction(null);
            setSetupError("");
            setSetupStep("permissions");
          }}>
            {tr("Back", "返回")}
          </button>
          <button
            className="primaryButton"
            disabled={!workspacePathInput.trim() || directoryLoading || busy}
            onClick={() => void applyWorkspaceScope()}
          >
            {busy
              ? tr("Saving…", "正在保存…")
              : pendingWorkspaceAction
                ? tr("Use folder & continue", "使用此目录并继续")
                : tr("Use this folder", "使用此目录")}
          </button>
        </div>
      </PairingCard>
    );
  }

  if (approvedDeviceId) {
    return (
      <PairingCard
        step={2}
        title={tr("Choose what AI can do", "选择 AI 可以做什么")}
        body={tr(
          "Your computer is paired. Start with the safe default, then opt in to file editing or terminal execution when you need them.",
          "电脑已经配对。默认从安全的只读权限开始，需要时再主动开启文件编辑或终端执行。",
        )}
      >
        <div className="pairConnectedDevice">
          <div className="deviceIcon large">{platformGlyph(pairedDevice?.platform)}</div>
          <div>
            <strong>{pairedDevice?.name || pairing?.device_name}</strong>
            <span>
              {pairedDevice?.status === "online"
                ? tr("Connected and ready", "已连接，可以使用")
                : tr("Waiting for the local agent to connect…", "正在等待本地 Agent 连接…")}
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
                    <strong>{tr("Automatic recovery", "自动恢复")}</strong>
                    <HelpTip
                      label={tr("How automatic recovery works", "自动恢复如何工作")}
                      text={tr(
                        "An updated client keeps this terminal and logs open. A local supervisor waits to take over if the executing Agent ends, and starts at login. Relay reconnect handles network interruptions independently. Sleep and power loss still make the device unavailable.",
                        "更新后的客户端会保留当前终端和日志。本机守护在执行 Agent 结束后接手，并可在登录时启动。网络中断由独立的 Relay 重连处理；睡眠和断电仍会让设备不可用。",
                      )}
                    />
                  </div>
                  <small>
                    {backgroundActuallyEnabled
                      ? tr("Installed locally", "本机已安装")
                      : backgroundRequested
                        ? tr("Recommended · selected by default", "推荐 · 默认选中")
                        : tr("Foreground only", "仅前台运行")}
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
                ? tr(
                    "Finish setup to enable a verified local supervisor and login startup while keeping this terminal open. Requires the recovery-capable CLI.",
                    "完成设置后启用经过确认的本机守护和登录自启，并保留当前终端。需要支持恢复的 CLI。",
                  )
                : tr(
                    "No login autostart will be installed. Keep this terminal session open while you want the computer reachable.",
                    "不会安装登录自启。需要电脑保持可连接时，请保持当前终端会话运行。",
                  )}
            </p>
            {!backgroundCapabilityReady && (
              <small className="pairSetupNote">
                {tr(
                  "Waiting for the local agent before this choice can be applied.",
                  "正在等待本机 Agent 上线，上线后才能应用此选项。",
                )}
              </small>
            )}
          </section>
          <section className="pairPermissionCard enabled">
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">R</span>
                <div>
                  <strong>{tr("Read access", "读取权限")}</strong>
                  <small>{tr("Safe default", "安全默认")}</small>
                </div>
              </div>
              <span className="pairPermissionState">{tr("Enabled", "已开启")}</span>
            </div>
            <ul>
              <li>{tr("Browse files and folders", "浏览文件和目录")}</li>
              <li>{tr("Read file contents and metadata", "读取文件内容与元数据")}</li>
              <li>{tr("View running processes", "查看运行中的进程")}</li>
            </ul>
          </section>

          <section className={"pairPermissionCard " + (fileEditingEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">✎</span>
                <div>
                  <strong>{tr("File editing", "文件编辑")}</strong>
                  <small>{tr("Recommended for coding, documents and data", "推荐用于开发、文档和数据任务")}</small>
                </div>
              </div>
              {fileEditingEnabled && <span className="pairPermissionState">{tr("Enabled", "已开启")}</span>}
            </div>
            <p>{tr(
              "Create and edit files with Sensitive Path Protection and Local Undo. Trusted Write Locations define where edits can happen without a per-request approval.",
              "开启文件创建与编辑，并继续使用 Sensitive Path Protection 和 Local Undo。可信写入区域决定哪些目录可以无需逐次审批地修改。",
            )}</p>
            {!fileEditingEnabled ? (
              <button
                className="primaryButton"
                disabled={!fileEditingSupported || busy}
                onClick={() => void enableFileEditing()}
              >
                {fileEditingSupported
                  ? (busy ? tr("Enabling…", "正在开启…") : tr("Enable file editing", "开启文件编辑"))
                  : tr("Waiting for device capability…", "等待设备能力上线…")}
              </button>
            ) : (
              <div className="pairWorkspaceControl">
                <div>
                  <span>{tr("Trusted Write Locations", "Trusted Write Locations")}</span>
                  <code>
                    {pairedDevice?.workspace_roots?.[0] ||
                      tr("All non-sensitive paths", "所有非敏感路径")}
                  </code>
                </div>
                <button className="ghostButton" onClick={() => void openWorkspacePicker()}>
                  {pairedDevice?.workspace_roots?.length
                    ? tr("Change workspace", "更改工作区")
                    : tr("Limit to a workspace", "限制到工作区")}
                </button>
              </div>
            )}
          </section>

          <section className={"pairPermissionCard terminal " + (terminalEnabled ? "enabled" : "")}>
            <div className="pairPermissionHead">
              <div>
                <span className="pairPermissionIcon">›_</span>
                <div>
                  <strong>{tr("Terminal access", "终端权限")}</strong>
                  <small>{tr("Advanced", "高级功能")}</small>
                </div>
              </div>
              {terminalEnabled && <span className="pairPermissionState">{tr("Enabled", "已开启")}</span>}
            </div>
            <p>{tr(
              "Allow AI to run shell commands. Commands can modify local state or external services, and Trusted Write Locations is not a complete OS sandbox.",
              "允许 AI 执行 Shell 命令。命令可能修改本地状态或外部服务，Trusted Write Locations 也不是完整的操作系统沙箱。",
            )}</p>
            {!terminalEnabled && !terminalConfirm && (
              <button
                className="ghostButton"
                disabled={!terminalSupported}
                onClick={() => setTerminalConfirm(true)}
              >
                {tr("Enable terminal access", "开启终端权限")}
              </button>
            )}
            {!terminalEnabled && terminalConfirm && (
              <div className="pairTerminalConfirm">
                <span>{tr("Terminal commands can have effects that Local Undo cannot reverse.", "终端命令可能产生 Local Undo 无法撤销的影响。")}</span>
                <div>
                  <button className="ghostButton" onClick={() => setTerminalConfirm(false)}>{tr("Cancel", "取消")}</button>
                  <button className="dangerConfirmButton" disabled={busy} onClick={() => void enableTerminal()}>
                    {busy ? tr("Enabling…", "正在开启…") : tr("Confirm terminal access", "确认开启终端")}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {setupError && <p className="errorText">{setupError}</p>}

        <div className="pairSetupFooter">
          <span>{tr("You can change every permission later from Devices.", "之后可以在设备页随时修改所有权限。")}</span>
          <button
            className="primaryButton"
            disabled={pairedDevice?.status !== "online" || busy}
            onClick={() => void finishSetup()}
          >
            {busy
              ? tr("Saving setup…", "正在保存设置…")
              : tr("Continue to AI connection", "继续连接 AI")}
          </button>
        </div>
      </PairingCard>
    );
  }

  return (
    <PairingCard
      title={tr("Pair a computer", "配对电脑")}
      body={tr("Confirm that the code and computer match what is shown in your terminal.", "确认下面的配对码和设备与终端显示一致。")}
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
            {busy ? tr("Checking…", "检查中…") : tr("Continue", "继续")}
          </button>
        </div>
      ) : (
        <div className="pairDevice">
          <div className="pairCode">{pairing.user_code}</div>
          <div className="pairComputer">
            <div className="deviceIcon large">{platformGlyph(pairing.platform)}</div>
            <div className="pairMeta">
              <strong>{pairing.device_name}</strong>
              <span>{platformLabel(pairing.platform)} · {pairing.arch || "unknown"}</span>
              {pairing.hostname && <span>{pairing.hostname}</span>}
            </div>
          </div>
          <div className="permissionBox">
            <div>
              <strong>{tr("Read-only access", "只读权限")}</strong>
              <span>{tr("Files, folders, metadata and process visibility", "文件、目录、元数据与进程可见性")}</span>
            </div>
            <span className="permissionBadge">{tr("Safe default", "安全默认")}</span>
          </div>
          <button className="approveButton" onClick={() => void approve()} disabled={busy}>
            {busy ? tr("Authorizing…", "授权中…") : tr("Authorize this device", "授权此设备")}
          </button>
        </div>
      )}
      {message && <p className="errorText">{message}</p>}
      {computerLimitReached && (
        <div className="pairLimitActions">
          <a className="primaryButton" href={APP_ORIGIN + "/checkout?product=connect-unlimited-v1"}>{tr("Get unlimited computers", "升级，连接更多电脑")} <span>→</span></a>
          <a className="ghostButton" href={APP_ORIGIN + "/devices"}>{tr("Manage computers", "管理电脑")}</a>
        </div>
      )}
      <p className="signedInAs">{tr("Signed in as", "当前登录")} {user.email}</p>
    </PairingCard>
  );
}
