import { summarizeConsentScopes } from "./oauth-consent-summary.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../app/i18n.js";
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
      const payload = (await response.json().catch(() => ({}))) as {
        redirect_to?: string;
        error?: string;
      };
      if (!response.ok || !payload.redirect_to) {
        throw new Error(payload.error || tr("Authorization failed.", "授权失败。"));
      }
      location.assign(payload.redirect_to);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : String(error));
      setDecisionBusy(false);
    }
  }

  if (user === undefined) {
    return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Checking your session.", "正在检查登录状态。")} />;
  }
  if (!user) {
    return (
      <>
        <CenteredCard title={tr("Sign in to continue", "登录后继续")} body={tr("Choose a Remote Arc account before authorizing this MCP client.", "授权 MCP 客户端前，请先选择 Remote Arc 账户。")}>
          <button className="primaryButton" type="button" onClick={() => setShowSignIn(true)}>
            {tr("Sign in to Remote Arc", "登录 Remote Arc")} <span>→</span>
          </button>
        </CenteredCard>
        {showSignIn && (
          <AuthProviderModal
            returnTo={location.pathname + location.search}
            title={tr("Choose how to sign in.", "选择登录方式。")}
            body={tr("Sign in to the account you want this MCP client to access.", "登录你希望此 MCP 客户端访问的 Remote Arc 账户。")}
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
        <div className="consentIcon" aria-hidden="true">↗</div>
        <span className="eyebrow">{tr("SECURE CONNECTION", "安全连接")}</span>
        <h1>{tr("Connect your AI assistant?", "连接你的 AI 助手？")}</h1>
        <p>{tr("Your assistant can work with Remote Arc within the permissions shown below.", "连接后，AI 助手可以在以下授权范围内使用 Remote Arc。")}</p>
        <p className="consentAccount">{tr("Your Remote Arc account", "你的 Remote Arc 账号")} · <strong>{user.email}</strong></p>
        <h2 className="consentGroupHeading">{tr("What this enables", "连接后能做什么")}</h2>
        <div className="consentScopes">
          {consentGroups.map(group => (
            <div key={group.key}>
              <i aria-hidden="true">{group.icon}</i>
              <span>
                <strong>{tr(group.title, group.titleZh)}</strong>
                <small>{tr(group.description, group.descriptionZh)}</small>
              </span>
            </div>
          ))}
        </div>
        {scopes.some(scope => scope.startsWith("computer:")) && (
          <div className="consentNotice">
            {tr("Work on a computer needs one more step: install the Remote Arc Agent on it. Connected Apps work without it.", "要在电脑上工作，还需要一步：在那台电脑上安装 Remote Arc Agent。已连接的应用无需安装。")}{" "}
            <a href={MARKETING_ORIGIN + tr("/downloads", "/zh/downloads")} target="_blank" rel="noreferrer">{tr("Get the Agent", "下载 Agent")} ↗</a>
          </div>
        )}
        <div className="consentNotice">
          {tr("Your device and connected-app permissions still apply. This connection does not automatically link new accounts or approve sensitive actions.", "设备及第三方应用的权限仍独立生效。连接 AI 不会自动授权新账号，也不会替你批准敏感操作。")}
        </div>
        <details className="consentTechnical">
          <summary>{tr("Technical permissions", "查看技术权限")}</summary>
          <p>{tr("Client identifier (not a verified company identity)", "客户端标识（不代表已验证的企业身份）")}</p>
          <code>{clientId}</code>
          <p>{tr("Requested scopes", "请求的具体权限")}</p>
          <ul>{scopes.map(scope => <li key={scope}><code>{scope}</code></li>)}</ul>
        </details>
        {decisionError && <p className="errorText">{decisionError}</p>}
        <div className="consentActions">
          <button className="ghostButton" disabled={decisionBusy} onClick={() => void continueAuthorization("deny")}>{tr("Deny", "拒绝")}</button>
          <button className="approveButton" disabled={decisionBusy} onClick={() => void continueAuthorization("allow")}>{decisionBusy ? tr("Authorizing…", "正在授权…") : tr("Allow access", "允许访问")}</button>
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
      label: tr("Continue with Google", "使用 Google 继续"),
      href:
        MARKETING_ORIGIN +
        "/auth/google?return_to=" +
        encodeURIComponent(absoluteReturnTo),
    },
    {
      id: "email",
      label: tr("Continue with Email", "使用邮箱继续"),
      href: MARKETING_ORIGIN + "/auth/login?return_to=" + encodeURIComponent(absoluteReturnTo) + "#email",
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
        <button className="modalClose" type="button" onClick={onClose} aria-label={tr("Close", "关闭")}>×</button>
        <div className="installAuthBrand"><LogoMark /></div>
        <span className="eyebrow">{tr("SIGN IN TO REMOTE ARC", "登录 REMOTE ARC")}</span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="installAuthProviders">
          {providers.map((provider) => (
            <a className={"authProviderButton " + provider.id} href={provider.href} key={provider.id}>
              <span aria-hidden="true">{provider.id === "google" ? <img src="/google-g.svg" alt="" width={25} height={25} /> : "✉"}</span>
              <strong>{provider.label}</strong>
              <b>→</b>
            </a>
          ))}
        </div>
        <small>{note || tr(
          "Google and email sign-in use the same Remote Arc account. Your paired computers and AI connections stay attached.",
          "Google 和邮箱登录使用同一个 Remote Arc 账户，已配对设备和 AI 连接会保留。",
        )}</small>
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
    return <CenteredCard title={tr("Opening sign in…", "正在打开登录页…")}
      body={tr("Taking you to Google or email sign-in.", "正在跳转到 Google 或邮箱登录页。")} />;
  }
  return (
    <>
    <PublicLayout>
      <section className="dashboardAccess">
        <div className="dashboardAccessCopy">
          <span className="eyebrow">{tr("YOUR REMOTE ARC CONTROL CENTER", "你的 REMOTE ARC 控制中心")}</span>
          <h1>{tr(
            "Your computers. One secure control center.",
            "你的所有电脑，一个安全控制中心。"
          )}</h1>
          <p>{tr(
            "Pair Windows, macOS or Linux. Connect ChatGPT or Claude. Review AI access, running tasks and actions from one dashboard — while your files stay on your own machines.",
            "连接 Windows、macOS 或 Linux，将 ChatGPT 或 Claude 接入自己的电脑。在一个控制台里查看设备、AI 授权、任务和操作记录，文件仍保留在你自己的电脑上。"
          )}</p>
          <div className="guestDashboardActions">
            <a className="guestGoogleButton" href={APP_ORIGIN + "/auth/google?return_to=" + target}>
              <img src="/google-g.svg" alt="" width={22} height={22} />
              {tr("Continue with Google", "使用 Google 继续")}
            </a>
            <a className="primaryButton" href={APP_ORIGIN + "/auth/login?return_to=" + target + "#email"}>
              {tr("Continue with email", "使用邮箱继续")} <span>→</span>
            </a>
          </div>
          <a className="guestDashboardWebsiteLink" href={MARKETING_ORIGIN}>
            {tr("Not ready yet? Explore Remote Arc", "还想了解更多？前往产品官网")} ↗
          </a>
          <p className="guestDashboardHint">{tr(
            "Continue with Google or email. No separate model API key is required when using a compatible MCP-enabled AI chat; your provider's limits still apply.",
            "支持 Google 或邮箱登录。使用兼容 MCP 的 AI 对话时，不需要额外配置模型 API Key；仍受 AI 服务商自身的套餐与额度限制。"
          )}</p>
        </div>
        <div className="dashboardAccessPreview" aria-hidden="true">
          <div className="previewTop"><span>Remote Arc Dashboard</span><i>{tr("Illustrative preview · not live data", "界面示例 · 非实时数据")}</i></div>
          <div className="previewMetricRow">
            <div><small>ONLINE</small><strong>2</strong><span>devices</span></div>
            <div><small>USAGE</small><strong>1.8k</strong><span>/ 10k calls</span></div>
            <div><small>POLICY</small><strong>Safe</strong><span>default mode</span></div>
          </div>
          <div className="previewDevice"><i className="onlineDot" /><div><strong>Personal Mac</strong><span>macOS · online now</span></div><b>Read + Dev</b></div>
          <div className="previewDevice"><i className="onlineDot" /><div><strong>Desktop PC</strong><span>Windows · online now</span></div><b>Developer</b></div>
          <div className="previewActivity"><span>Recent activity</span><strong>read_file</strong><small>Personal Mac · 12s ago</small></div>
        </div>
      </section>
      <section className="guestDashboardBenefits" aria-label={tr("What you can do", "你可以做什么")}>
        <article>
          <span className="guestBenefitSymbol" aria-hidden="true">01</span>
          <h2>{tr("One place for every computer", "统一管理你的所有电脑")}</h2>
          <p>{tr("See devices, connections and execution permissions without juggling terminals.", "查看设备状态、连接方式和执行权限，不必在多个终端之间来回切换。")}</p>
        </article>
        <article>
          <span className="guestBenefitSymbol" aria-hidden="true">02</span>
          <h2>{tr("You control what AI can do", "每一步操作都由你掌控")}</h2>
          <p>{tr("Approve available tools, control access and review recent actions from your dashboard.", "配置允许使用的工具、管理授权，并查看 AI 最近在电脑上执行的操作。")}</p>
        </article>
        <article>
          <span className="guestBenefitSymbol" aria-hidden="true">03</span>
          <h2>{tr("Work that outlasts a chat", "聊天结束，工作状态仍在")}</h2>
          <p>{tr("Save device-side tasks, track progress and resume where supported; AI decisions still require a connected model.", "保存设备端任务，追踪进度，并在支持的场景中继续；新的 AI 决策仍需要已连接的大模型。")}</p>
        </article>
      </section>
    </PublicLayout>
    </>
  );
}
