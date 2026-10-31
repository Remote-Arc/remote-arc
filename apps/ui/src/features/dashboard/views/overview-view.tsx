import { OverviewGreeting } from "../../../components/overview-greeting.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { UsageConversionBanner } from "../usage-conversion.js";
import { MARKETING_ORIGIN } from "../../../config/app-config.js";
import { platformLabel } from "../devices/device-presets.js";
import { CopyButton } from "../../../components/public-layout.js";
import { timeAgo } from "../format.js";
import type { DashboardModel } from "../hooks/use-dashboard-model.js";

// Overview tab: status cards, recent devices and activity.
export function OverviewView({ m }: { m: DashboardModel }) {
  const {
    automationAttentionCount, automationLoadError, deviceNameById, devices, eventLabel,
    hasAttention, locale, mcpEndpoint, navigateTab, refreshAutomations, setShowAdd, status, tr,
    usage, usageLimitLabel, usagePct, user,
  } = m;
  return (
    <>
      <section className="overviewTopbar">
        <div>
          <span className="eyebrow">{tr("OVERVIEW", "概览")}</span>
          <OverviewGreeting name={user.name} tr={tr}/>
          <p>{tr("Your connections, recent work and everything that needs your attention.", "连接状态、最近的工作，以及所有需要你关注的事。")}</p>
        </div>
        <div className="overviewActions">
          <button className="ghostButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
          <button className="addButton arcRadiantCta" onClick={() => navigateTab("connect")}><ProductIcon name="link"/>{tr("Connect your AI", "连接你的 AI")}</button>
        </div>
      </section>
      <UsageConversionBanner usage={usage} pricingUrl={MARKETING_ORIGIN + (locale==="zh"?"/zh/pricing":"/pricing")} onManagePlan={()=>{navigateTab("settings");const target=new URL(location.href);target.searchParams.set("section","billing");history.replaceState(history.state,"",target);window.dispatchEvent(new PopStateEvent("popstate"));}} />
      <section className="overviewStatusGrid">
        <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Devices online", "在线设备")}</span><i className={"healthDot " + ((status?.onlineDevices ?? 0) > 0 ? "good" : "idle")} /></div><strong>{status?.onlineDevices ?? 0} / {status?.totalDevices ?? devices.length}</strong><small>{tr("Ready for MCP calls", "可接受 MCP 调用")}</small></article>
                       <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr('Connected Apps','应用连接')}</span><ProductIcon name="apps"/></div><strong>{tr('Your tools','你的工具')}</strong><button className="ghostButton overviewManageLink" onClick={()=>navigateTab('apps')}>{tr('Manage connections','管理连接')}<ProductIcon name="arrowUpRight" size={14}/></button></article>
        <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Monthly usage", "本月用量")}</span><span>{usage?.unlimited ? tr("Unlimited", "无限") : Math.round(usagePct) + "%"}</span></div><strong>{(usage?.used ?? 0).toLocaleString()}</strong><div className="miniUsageBar"><i style={{ width: (usage?.unlimited ? 0 : usagePct) + "%" }} /></div><small>{usage?.unlimited ? tr("Unlimited Connect calls", "无限 Connect 调用") : tr("of", "共") + " " + usageLimitLabel + " " + tr("hosted calls", "次托管调用")}</small></article>
        <article className="overviewStatusCard endpoint"><div className="statusCardHead"><span>Remote MCP</span><span className="privacyPill">{tr("Secure", "安全")}</span></div><code>{mcpEndpoint}</code><div className="statusCardActions"><CopyButton value={mcpEndpoint} label={tr("Copy", "复制")} /><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Manage", "管理")}</button></div></article>
      </section>

      <section className="overviewQuickGrid">
        <article className="overviewQuickCard">
          <span className="eyebrow">{tr("QUICK ACTIONS", "快捷操作")}</span>
          <div className="quickActionList">
            <button onClick={() => setShowAdd(true)}><span><ProductIcon name="add"/></span><div><strong>{tr("Pair a computer", "配对电脑")}</strong><small>{tr("Add Windows, macOS or Linux", "添加 Windows、macOS 或 Linux")}</small></div></button>
            <button onClick={() => navigateTab("connect")}><span><ProductIcon name="link"/></span><div><strong>{tr("Connect an AI client", "连接 AI 客户端")}</strong><small>ChatGPT · Claude · Remote MCP</small></div></button>
            <button onClick={() => navigateTab("security")}><span><ProductIcon name="shield"/></span><div><strong>{tr("Review security", "检查安全设置")}</strong><small>{tr("Sessions, scopes and device policies", "会话、Scope 与设备权限")}</small></div></button>
            <button onClick={() => navigateTab("apps")}><span><ProductIcon name="apps"/></span><div><strong>{tr("Connect your apps", "连接应用")}</strong><small>{tr("One account connection, available to your AI", "连接账号，让 AI 可以使用你的应用")}</small></div></button>
          </div>
        </article>
        <article className="overviewAttentionCard">
          <span className="eyebrow">{tr("ATTENTION", "需要关注")}</span>
          <div className="attentionList">
            {!!automationAttentionCount && <button onClick={() => navigateTab('automations')}><i className="attentionIcon warn">!</i><div><strong>{automationAttentionCount} {tr("task(s) need attention", "项任务需要处理")}</strong><small>{tr("Ask your connected AI to review saved work and continue it.", "让已连接的 AI 检查保存的工作并继续处理。")}</small></div></button>}
            {automationLoadError && <button onClick={() => void refreshAutomations()}><i className="attentionIcon warn">!</i><div><strong>{tr("Task status unavailable", "任务状态暂不可用")}</strong><small>{tr("Retry to see current progress.", "点击重试以查看当前进度。")}</small></div></button>}
            {!devices.length && <button onClick={() => setShowAdd(true)}><i className="attentionIcon warn">!</i><div><strong>{tr("No computer paired", "还没有配对电脑")}</strong><small>{tr("Pair your first device to start using Remote Arc.", "先配对第一台设备即可开始使用 Remote Arc。")}</small></div></button>}
            {!!devices.length && devices.some((device) => device.status === "offline") && <button onClick={() => navigateTab("devices")}><i className="attentionIcon idle">•</i><div><strong>{tr("Some devices are offline", "部分设备离线")}</strong><small>{devices.filter((device) => device.status === "offline").length} {tr("device(s) unavailable for MCP calls", "台设备当前无法接受 MCP 调用")}</small></div></button>}
            {usagePct >= 80 && <button onClick={() => navigateTab("settings")}><i className="attentionIcon warn">!</i><div><strong>{tr("Usage is getting high", "本月额度使用较高")}</strong><small>{Math.round(usagePct)}% {tr("of your monthly hosted allowance is used", "的每月托管额度已使用")}</small></div></button>}
            {(status?.onlineDevices ?? 0) > 0 && !hasAttention && !automationLoadError && <div className="attentionClear"><i>✓</i><div><strong>{tr("Everything looks good", "当前状态良好")}</strong><small>{tr("Devices are online and no tasks need attention.", "设备在线，目前没有待处理任务。")}</small></div></div>}
          </div>
        </article>
      </section>

      <section className="overviewMainGrid">
        <div className="panelBlock overviewDevicesPanel">
          <div className="blockHeader"><div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Device status", "设备状态")}</h2></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage", "管理")}</button></div>
          <div className="overviewDeviceList">
            {devices.slice().sort((a,b) => Number(b.status === "online") - Number(a.status === "online")).slice(0,5).map((device) => (
              <button className="overviewDeviceRow" key={device.id} onClick={() => navigateTab("devices")}>
                <div className="deviceIcon"><ProductIcon name="device"/></div>
                <div><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                <div className="overviewDeviceMeta"><span>{device.tools.length} tools</span><small>{timeAgo(device.last_seen)}</small></div>
                <span className={"badge " + device.status}><i/>{device.status === "online" ? tr("Online", "在线") : tr("Offline", "离线")}</span>
              </button>
            ))}
            {!devices.length && <button className="overviewDeviceRow empty" onClick={() => setShowAdd(true)}><div className="deviceIcon">＋</div><div><strong>{tr("Add your first computer", "添加第一台电脑")}</strong><span>{tr("One command, then approve in your browser", "一条命令，然后在浏览器确认")}</span></div></button>}
          </div>
        </div>

        <div className="panelBlock overviewActivityPanel">
          <div className="blockHeader"><div><span className="eyebrow">{tr("RECENT ACTIVITY", "最近活动")}</span><h2>{tr("What Remote Arc did", "Remote Arc 最近做了什么")}</h2></div><span className="privacyPill">{tr("Arguments not logged", "不记录参数")}</span></div>
          <div className="activityList">
            {(status?.recentActivity || []).map((event) => (
              <div className="activityItem" key={event.id}><i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i><div><strong>{eventLabel(event)}</strong><span>{event.client_name || event.client_id?.slice(0,12) || tr("Unknown client", "未知客户端")} · {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}{event.request_id ? " · req " + event.request_id.slice(0,8) : ""}</span></div></div>
            ))}
            {!status?.recentActivity?.length && <div className="activityEmpty"><strong>{tr("No activity yet", "暂无活动")}</strong><span>{tr("Pair a device or call a tool from your AI client.", "配对设备或从 AI 客户端发起工具调用。")}</span></div>}
          </div>
        </div>
      </section>

    </>
  );
}
