import { useState, type ReactNode } from "react";
import { useI18n } from "./i18n.js";
import { OrganizationSettings } from "./organization-settings.js";
import "./dashboard-settings.css";

type Section = "account" | "workspaces" | "connections" | "billing";
type Destination = "devices" | "connect" | "security" | "apps";
type Props = {
  currentName?: string | null;
  currentEmail: string;
  locale: "en" | "zh";
  setLocale: (value: "en" | "zh") => void;
  themeSwitcher: ReactNode;
  hasPlus: boolean;
  usage: { used?: number; unlimited?: boolean } | null | undefined;
  usageLimitLabel: string;
  mcpEndpoint: string;
  marketingOrigin: string;
  onSignOut: () => void | Promise<void>;
  onNavigate: (destination: Destination) => void;
};

function Icon({ name, size = 18 }: { name: "user" | "team" | "link" | "billing" | "shield" | "device" | "apps" | "copy" | "check" | "arrow"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1.5a6 6 0 0 1 12 0V20M17 5.3a3 3 0 0 1 0 5.5M17.5 14a5.6 5.6 0 0 1 3.5 5.2" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
    billing: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
    shield: <><path d="M12 2.5 20 6v5.5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3.5Z" /><path d="m9 12 2 2 4-4" /></>,
    device: <><rect x="3.5" y="4" width="17" height="12.5" rx="2" /><path d="M8 20h8M12 16.5V20" /></>,
    apps: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    arrow: <path d="M6 12h12m-5-5 5 5-5 5" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function DashboardSettings({
  currentName, currentEmail, locale, setLocale, themeSwitcher, hasPlus, usage,
  usageLimitLabel, mcpEndpoint, marketingOrigin, onSignOut, onNavigate,
}: Props) {
  const { tr } = useI18n();
  const [section, setSection] = useState<Section>("account");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const displayName = currentName?.trim() || currentEmail.split("@")[0] || tr("Account", "账号");
  const nav: { id: Section; icon: "user" | "team" | "link" | "billing"; title: string }[] = [
    { id: "account", icon: "user", title: tr("My account", "我的账号") },
    { id: "workspaces", icon: "team", title: tr("Workspaces", "工作空间") },
    { id: "connections", icon: "link", title: tr("Connections & security", "连接与安全") },
    { id: "billing", icon: "billing", title: tr("Plan & usage", "套餐与用量") },
  ];
  const titles = {
    account: { eyebrow: tr("PERSONAL SETTINGS", "个人设置"), title: tr("My account", "我的账号"), detail: tr("Your profile and how Remote Arc looks and feels.", "管理个人资料、外观与语言偏好。") },
    workspaces: { eyebrow: tr("COLLABORATION", "协作空间"), title: tr("Workspaces", "工作空间"), detail: tr("Keep personal access private and organize your team.", "让个人设备保持私有，同时与团队安全协作。") },
    connections: { eyebrow: tr("ACCESS CONTROL", "访问控制"), title: tr("Connections & security", "连接与安全"), detail: tr("Manage the devices, apps and permissions available to your AI.", "管理 AI 可访问的设备、应用和权限边界。") },
    billing: { eyebrow: tr("SUBSCRIPTION", "订阅方案"), title: tr("Plan & usage", "套餐与用量"), detail: tr("Understand your plan and available capacity.", "查看当前套餐与可用调用额度。") },
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

  return <div className="raSettings">
    <aside className="raSettingsAside" aria-label={tr("Settings navigation", "设置导航")}>
      <div className="raSettingsAsideLabel">{tr("PREFERENCES", "设置分类")}</div>
      <nav className="raSettingsNav">
        {nav.map(item => <button type="button" key={item.id}
          className={"raSettingsNavItem" + (section === item.id ? " isActive" : "")}
          aria-current={section === item.id ? "page" : undefined}
          onClick={() => { setSection(item.id); setCopyStatus("idle"); }}>
          <Icon name={item.icon} /><span>{item.title}</span>
        </button>)}
      </nav>
      <div className="raSettingsAsideFoot"><Icon name="shield" size={17} />
        <span>{tr("Your personal devices and credentials stay private.", "你的个人设备与凭证始终保持私有。")}</span>
      </div>
    </aside>

    <div className="raSettingsContent" role="region" aria-label={active.title}>
      <header className="raSettingsHeading">
        <span className="raSettingsEyebrow">{active.eyebrow}</span>
        <h2>{active.title}</h2>
        <p>{active.detail}</p>
      </header>

      {section === "account" && <div className="raSettingsSections">
        <section className="raSettingsSurface raSettingsIdentity">
          <div className="raSettingsIdentityAvatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</div>
          <div className="raSettingsIdentityText">
            <span className="raSettingsFieldLabel">{tr("SIGNED IN AS", "当前登录账号")}</span>
            <h3>{displayName}</h3><p>{currentEmail}</p>
          </div>
          <span className="raSettingsQuietPill">{tr("Personal account", "个人账号")}</span>
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsSurfaceHeader"><div><h3>{tr("Preferences", "偏好设置")}</h3>
            <p>{tr("Make Remote Arc comfortable for your workflow.", "按照你的使用习惯调整控制台。")}</p></div></div>
          <div className="raSettingsRow">
            <div className="raSettingsRowInfo"><h4>{tr("Appearance", "外观")}</h4>
              <p>{tr("Choose a theme for this browser.", "为当前浏览器选择显示主题。")}</p></div>
            <div className="raSettingsRowControl">{themeSwitcher}</div>
          </div>
          <div className="raSettingsRow">
            <div className="raSettingsRowInfo"><h4>{tr("Language", "语言")}</h4>
              <p>{tr("Changes apply immediately on this device.", "更改将立即在当前设备生效。")}</p></div>
            <div className="raSettingsRowControl"><div className="languageSetting" role="group" aria-label={tr("Dashboard language", "控制台语言")}>
              <button type="button" aria-pressed={locale === "en"} className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button>
              <button type="button" aria-pressed={locale === "zh"} className={locale === "zh" ? "active" : ""} onClick={() => setLocale("zh")}>中文</button>
            </div></div>
          </div>
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsRow raSettingsRowLast">
            <div className="raSettingsRowInfo"><h4>{tr("Session", "登录会话")}</h4>
              <p>{tr("Sign out of this browser when you're finished.", "在共享设备或使用结束后退出当前登录。")}</p></div>
            <button className="raSettingsButton" type="button" onClick={() => void onSignOut()}>{tr("Sign out", "退出登录")}</button>
          </div>
        </section>
      </div>}

      {section === "workspaces" && <div className="raSettingsSections">
        <OrganizationSettings currentEmail={currentEmail} />
      </div>}

      {section === "connections" && <div className="raSettingsSections">
        <section className="raSettingsSurface">
          <div className="raSettingsSurfaceHeader"><div><h3>{tr("Remote MCP endpoint", "远程 MCP 地址")}</h3>
            <p>{tr("Add this URL in a supported AI client to connect Remote Arc.", "在支持 MCP 的 AI 客户端中添加此地址即可连接 Remote Arc。")}</p></div></div>
          <div className="raSettingsEndpoint">
            <code>{mcpEndpoint}</code>
            <button type="button" className="raSettingsButton raSettingsCopy" onClick={() => void copyEndpoint()}>
              <Icon name={copyStatus === "copied" ? "check" : "copy"} size={16} />
              {copyStatus === "copied" ? tr("Copied", "已复制") : tr("Copy URL", "复制地址")}
            </button>
          </div>
          {copyStatus === "error" && <p className="raSettingsInlineError" role="alert">{tr("Couldn't copy automatically. Select the address above to copy it.", "复制失败，请选中上方地址手动复制。")}</p>}
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsSurfaceHeader"><div><h3>{tr("Access management", "访问权限管理")}</h3>
            <p>{tr("Control what your AI can use. Permissions are enforced by the relay.", "明确控制 AI 能访问哪些资源，权限由 Relay 强制执行。")}</p></div></div>
          {([
            ["devices", "device", tr("Devices & tools", "设备与工具"), tr("Manage paired computers and tool permissions", "管理已配对电脑和工具权限")],
            ["apps", "apps", tr("Connected apps", "已连接应用"), tr("Review integrations and their available actions", "查看应用集成及其操作能力")],
            ["security", "shield", tr("Security & activity", "安全与活动记录"), tr("Review grants, access controls and audit events", "检查授权、访问控制和审计记录")],
            ["connect", "link", tr("Connection setup", "连接配置"), tr("Get started with ChatGPT, Claude and more", "查看 ChatGPT、Claude 等客户端连接指南")],
          ] as const).map(([destination, icon, title, description]) => <button className="raSettingsAction" key={destination} type="button" onClick={() => onNavigate(destination)}>
            <span className="raSettingsActionIcon"><Icon name={icon} /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
            <Icon name="arrow" size={18} />
          </button>)}
        </section>
      </div>}

      {section === "billing" && <div className="raSettingsSections">
        <section className="raSettingsSurface raSettingsPlan">
          <div className="raSettingsPlanTop">
            <div><span className="raSettingsFieldLabel">{tr("CURRENT PLAN", "当前套餐")}</span>
              <h3>Remote Arc {hasPlus ? "Plus" : "Free"}</h3>
              <p>{hasPlus ? tr("Your account has Plus features enabled.", "当前账号已开通 Plus 功能。") : tr("Core remote tools are available on your plan.", "当前套餐已包含核心远程工具。")}</p>
            </div>
            <span className="raSettingsPlanTag">{hasPlus ? "Plus" : "Free"}</span>
          </div>
          <div className="raSettingsPlanUsage">
            <span>{tr("Tool call allowance", "工具调用额度")}</span>
            <strong>{usage ? (usage.unlimited ? tr("Unlimited", "无限") : String(usage.used ?? 0) + " / " + usageLimitLabel) : "—"}</strong>
          </div>
          <p className="raSettingsPlanCaption">{usage
            ? tr("This reflects the allowance reported for your account.", "以上额度来自当前账号的实际套餐数据。")
            : tr("Usage data is not available yet.", "当前暂时无法获取用量数据。")}</p>
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsRow raSettingsRowLast">
            <div className="raSettingsRowInfo"><h4>{tr("Plans & capacity", "套餐与容量")}</h4>
              <p>{tr("Compare available plans and learn how capacity works.", "对比可用套餐，了解用量与容量规则。")}</p></div>
            <a className="raSettingsButton raSettingsButtonPrimary" href={marketingOrigin + "/pricing"}>
              {hasPlus ? tr("View plan details", "查看套餐详情") : tr("Explore plans", "查看套餐")} <Icon name="arrow" size={16} />
            </a>
          </div>
        </section>
      </div>}
    </div>
  </div>;
}
