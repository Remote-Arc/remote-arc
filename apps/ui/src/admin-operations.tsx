import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import "./admin-operations.css";

type Account = {
  id: string; email: string; name: string | null; role: string; plan: string;
  created_at: string; used: number; extra: number; allowance: number | null;
  device_count: number; online_devices: number; last_activity: string | null;
  has_plus_grant: number;
  linked_login: "google" | "email_only";
  first_mcp_client: string | null;
  live_agent_versions: string[];
};
type Computer = {
  id: string; user_id: string; name: string; platform: string; arch: string | null;
  last_seen: string | null; created_at: string; online: boolean; statusVerified: boolean;
  agent_version: string | null; background_agent_version: string | null; recovery_bundle_version: string | null;
};
type Hour = { hour: string; calls: number; users: number };
type OperationsData = {
  checkedAt: string; month: string; page: number; pageSize: number; creditsReady: boolean;
  totals: { users: number; devices: number; online: number; auditRows: number; auditLast7d: number; monthlyCalls: number };
  limits: { free: number; plus: number };
  users: Account[]; devices: Computer[]; activity: Hour[];
  billing: { actualUsd: number | null; source: string; billingUrl: string;
    note: string; services: string[] };
};
type LiveBilling = { connected: boolean; total: number; currency: string; from: string; to: string;
  source: string; services: Array<{name: string;cost: number}>; note: string };
type Section = "users" | "devices" | "activity" | "costs";
const relative = (value: string | null, locale: string) => {
  if (!value) return "—";
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff)) return "—";
  if (diff < 60_000) return locale === "zh" ? "刚刚" : "Just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
};
const fmt = (v: number) => new Intl.NumberFormat("en").format(v);

export function AdminOperations() {
  const { tr, locale } = useI18n();
  const [section, setSection] = useState<Section>("users");
  const [liveBilling, setLiveBilling] = useState<LiveBilling | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [credit, setCredit] = useState("500");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const pendingCreditRequest = useRef<{ key:string; requestId:string } | null>(null);

  async function refresh(pageToLoad = page) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/operations?page=" + pageToLoad, { credentials: "same-origin" });
      if (!res.ok) throw new Error(tr("Admin metrics could not be loaded", "无法加载管理员指标") + " · " + res.status);
      setData(await res.json() as OperationsData);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh(page);
  }, [page]);

  const filtered = useMemo(() => data?.users.filter(u => {
    const text = query.toLowerCase();
    return u.email.toLowerCase().includes(text) || (u.name || "").toLowerCase().includes(text);
  }) || [], [data, query]);
  const chosen = data?.users.find(u => u.id === selectedUser) || null;
  const userNames = new Map((data?.users || []).map(u => [u.id, u.email]));
  const hours = useMemo(() => {
    if (!data) return [];
    const amounts = new Map(data.activity.map(x => [x.hour, x.calls]));
    const ending = Math.floor(Date.parse(data.checkedAt) / 3600_000) * 3600_000;
    return Array.from({ length: 48 }, (_, i) => {
      const instant = new Date(ending - (47 - i) * 3600_000);
      return { hour: instant.toISOString().slice(0, 13), calls: amounts.get(instant.toISOString().slice(0, 13)) || 0 };
    });
  }, [data]);
  const peak = Math.max(1, ...hours.map(h => h.calls));
  const quietWindow = useMemo(() => {
    const list = data?.activity || [];
    const days = new Set(list.map(item => item.hour.slice(0,10)));
    if (days.size < 3 || list.reduce((sum, item) => sum + item.calls, 0) < 100) return null;
    const totals = Array.from({length:24},(_,i) => ({hour:i,calls:0}));
    list.forEach(item => { const index=Number(item.hour.slice(11,13)); if (index>=0 && index<24) totals[index]!.calls += item.calls; });
    return totals.sort((a,b) => a.calls-b.calls).slice(0,3).map(x => {
      const utc = new Date();
      utc.setUTCHours(x.hour,0,0,0);
      const local = new Intl.DateTimeFormat(locale==="zh"?"zh-NZ":"en-NZ",{
        timeZone:"Pacific/Auckland",hour:"2-digit",hour12:false,
      }).format(utc);
      return local+":00";
    });
  },[data,locale]);
  async function loadBilling() {
    if (billingLoading) return;
    setBillingLoading(true); setBillingError("");
    try {
      const response = await fetch("/api/admin/billing", { credentials: "same-origin" });
      const result = await response.json() as LiveBilling & {error?: string};
      if (!response.ok) throw new Error(result.error || "Billing read unavailable");
      setLiveBilling(result);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : String(error));
      setLiveBilling(null);
    } finally { setBillingLoading(false); }
  }
  async function grantCredits() {
    if (!chosen || !data || saving) return;
    const amount = Number(credit);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000 || reason.trim().length < 5) {
      setNotice(tr("Enter 1–100,000 calls and a reason (at least five characters).", "请输入 1–100,000 次额度，并填写至少五个字的原因。"));
      return;
    }
    if (!window.confirm(tr(
      `Give ${chosen.email} +${fmt(amount)} calls for ${data.month}?`,
      `确定给 ${chosen.email} 在 ${data.month} 追加 ${fmt(amount)} 次工具调用吗？`,
    ))) return;
    const fingerprint = [chosen.id,data.month,amount,reason.trim()].join("|");
    if (!pendingCreditRequest.current || pendingCreditRequest.current.key !== fingerprint) {
      pendingCreditRequest.current = { key: fingerprint, requestId: crypto.randomUUID() };
    }
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/admin/call-credits", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: chosen.id, amount, reason: reason.trim(), month: data.month, requestId: pendingCreditRequest.current!.requestId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to grant credits");
      pendingCreditRequest.current = null;
      setReason("");
      setNotice(tr("Monthly bonus granted and recorded.", "已追加本月额度并记录管理员操作。"));
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }

  const tabs: Array<[Section, string, string]> = [
    ["users", "Users", "用户"],
    ["devices", "Devices", "设备"],
    ["activity", "Activity", "活跃度"],
    ["costs", "Cost & billing", "成本与账单"],
  ];
  return <section className="opsWrap">
    <div className="opsHeadline">
      <div>
        <span className="eyebrow">{tr("OPERATIONS · ADMIN ONLY", "运营中心 · 仅管理员")}</span>
        <h2>{tr("Users, devices & capacity", "用户、设备与容量")}</h2>
        <p>{tr("Live sessions, usage, recent demand and account-wide cost visibility.",
          "在线会话、工具使用量、活跃时段与 Cloudflare 账户级成本。")}</p>
      </div>
      <div className="opsFresh">
        <small>{data ? tr("Last checked", "最近检查") + " " + new Date(data.checkedAt).toLocaleTimeString() : ""}</small>
        <button className="ghostButton" onClick={() => void refresh()} disabled={loading}>{tr("Refresh", "刷新")}</button>
      </div>
    </div>
    {error && <div className="opsNotice" role="alert">{error}</div>}
    <div className="opsStats">
      <div><span>{tr("Registered users", "注册用户")}</span><strong>{data ? fmt(data.totals.users) : "—"}</strong></div>
      <div><span>{tr("Paired devices", "已配对设备")}</span><strong>{data ? fmt(data.totals.devices) : "—"}</strong></div>
      <div><span>{tr("Online now", "当前在线")}</span><strong>{data ? fmt(data.totals.online) : "—"}</strong><small>{tr("Verified against device connections", "根据实际设备连接核实")}</small></div>
      <div><span>{tr("Audit events · 7d", "审计事件 · 7 天")}</span><strong>{data ? fmt(data.totals.auditLast7d) : "—"}</strong></div>
    </div>
    <nav className="opsTabs" aria-label={tr("Operational views", "运营视图")}>
      {tabs.map(([id, en, zh]) =>
        <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}>{tr(en, zh)}</button>)}
    </nav>

    {section === "users" && <div className="opsContent">
      <div className="opsToolbar">
        <div><h3>{tr("User management", "用户管理")}</h3><p>{tr("Select a user to inspect usage and grant extra calls for the current month.", "选择用户查看使用情况、在线设备并追加本月额度。")}</p></div>
        <input aria-label={tr("Search users", "搜索用户")} placeholder={tr("Search name or email", "搜索姓名或邮箱")} value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="opsTableScroll">
        <table className="opsTable">
          <thead><tr><th>{tr("Account", "账户")}</th><th>{tr("Plan", "套餐")}</th><th>{tr("Calls this month", "本月调用")}</th><th>{tr("Devices", "设备")}</th><th>{tr("Login / MCP client", "登录方式 / MCP 客户端")}</th><th>{tr("Agent version", "运行版本")}</th><th>{tr("Last activity", "最近活动")}</th><th></th></tr></thead>
          <tbody>{filtered.map(u => <tr key={u.id} className={u.id === selectedUser ? "selected" : ""}>
            <td><strong>{u.name || u.email.split("@")[0]}</strong><small>{u.email}</small></td>
            <td>{u.role === "admin" ? "Admin" : u.plan === "plus" || u.has_plus_grant ? "Plus" : "Free"}</td>
            <td><strong>{fmt(u.used)} / {u.allowance === null ? "∞" : fmt(u.allowance)}</strong>
              <div className="opsMeter"><i style={{width: u.allowance ? Math.min(100, u.used / u.allowance * 100) + "%" : "0%"}} /></div></td>
            <td><span className={u.online_devices ? "opsOnline" : ""}>{u.online_devices} / {u.device_count}</span></td>
            <td><strong>{u.linked_login === "google" ? "Google" : "Email"}</strong>
              <small>{u.first_mcp_client || tr("No MCP connection yet", "尚未连接 MCP")}</small></td>
            <td><small>{u.live_agent_versions?.length ? u.live_agent_versions.join(", ") : "—"}</small></td>
            <td>{relative(u.last_activity, locale)}</td>
            <td><button onClick={() => { setSelectedUser(u.id === selectedUser ? null : u.id); setNotice(""); }}>{tr("Details", "详情")}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {chosen && <div className="opsUserDetail">
        <div><h3>{chosen.name || chosen.email}</h3><p>{chosen.email} · {tr("Joined", "注册于")} {new Date(chosen.created_at).toLocaleDateString()}</p><p>{tr("Monthly plan quota", "本月基础额度")}: {chosen.allowance === null ? "∞" : fmt(chosen.allowance - chosen.extra)} · {tr("Extra granted", "额外赠送")}: {fmt(chosen.extra)}</p></div>
        <div className="opsCreditForm">
          <label>{tr("Add calls this month", "本月追加调用次数")}<input type="number" min={1} max={100000} value={credit} onChange={e => setCredit(e.target.value)} /></label>
          <label>{tr("Reason (audited)", "原因（可审计）")}<input maxLength={300} placeholder={tr("e.g. Early access feedback", "例如：早期体验反馈奖励")} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button className="primaryButton" disabled={saving || chosen.role === "admin" || !data?.creditsReady} onClick={() => void grantCredits()}>{saving ? tr("Saving…", "正在提交…") : tr("Grant monthly calls", "追加本月额度")}</button>
          {!data?.creditsReady && <small>{tr("Credit grants will be available after the database migration.", "额度追加将在数据库迁移完成后开放。")}</small>}
          {notice && <small role="status">{notice}</small>}
        </div>
      </div>}
      <div className="opsPages">
        <button disabled={page === 0} onClick={() => setPage(p => Math.max(0,p-1))}>{tr("Previous", "上一页")}</button>
        <span>{page + 1} / {Math.max(1, Math.ceil((data?.totals.users || 1) / (data?.pageSize || 30)))}</span>
        <button disabled={!data || (page+1)*data.pageSize >= data.totals.users} onClick={() => setPage(p => p+1)}>{tr("Next", "下一页")}</button>
      </div>
    </div>}

    {section === "devices" && <div className="opsContent">
      <div className="opsToolbar"><div><h3>{tr("Connected computers", "设备运行情况")}</h3>
        <p>{tr("Online is checked from active WebSocket sessions. Last seen is historical.", "在线状态来自实时 WebSocket，会话断开后仍保留最后连接时间。")}</p></div></div>
      <div className="opsTableScroll"><table className="opsTable"><thead><tr><th>{tr("Device", "设备")}</th><th>{tr("Owner", "所属用户")}</th><th>{tr("Platform", "平台")}</th><th>{tr("Status", "在线状态")}</th><th>{tr("remotelink version", "remotelink 版本")}</th><th>{tr("Last seen", "最后连接")}</th></tr></thead>
        <tbody>{(data?.devices || []).map(device => <tr key={device.id}><td><strong>{device.name}</strong><small>{device.id.slice(0,8)}…</small></td><td>{userNames.get(device.user_id) || device.user_id.slice(0,8)+"…"}</td><td>{device.platform} {device.arch || ""}</td><td><span className={device.online ? "opsOnline" : ""}>{!device.statusVerified ? tr("Unverified", "未核实") : device.online ? tr("Online", "在线") : tr("Offline", "离线")}</span></td><td><strong>{device.agent_version || "—"}</strong>
          {device.background_agent_version && <small>{tr("Background", "后台")}: {device.background_agent_version}</small>}</td>
          <td>{relative(device.last_seen, locale)}</td></tr>)}</tbody></table></div>
    </div>}

    {section === "activity" && <div className="opsContent">
      <div className="opsToolbar"><div><h3>{tr("Tool activity · last 48 hours", "工具活跃趋势 · 最近 48 小时")}</h3>
        <p>{tr("Hourly audit events, UTC. Use repeated quiet periods to help plan deployments, not as guaranteed availability.", "按 UTC 小时统计审计活动；可辅助选择低峰发版，但不代表绝对安全时段。")}</p></div></div>
      <div className="opsChart" role="img" aria-label={tr("Hourly tool call activity", "每小时工具调用趋势")}>
        {hours.map((h, i) => <div className="opsChartBar" key={h.hour} title={h.hour+" UTC · "+h.calls}>
          <div style={{ height: Math.max(2, h.calls / peak * 100) + "%" }} />
          {(i % 6 === 0 || i === 47) && <small>{h.hour.slice(11)}h</small>}
        </div>)}
      </div>
      <p className="opsHelp">{quietWindow ?
        tr("Observed lower-activity hours (Auckland time): ", "近期观察到较低活跃的奥克兰时段：") + quietWindow.join(" · ") +
        tr(". Treat as a planning hint, not a guaranteed safe deployment window.", "。仅供安排发版参考，不保证在线用户为零。") :
        tr("Not enough multi-day activity for a reliable release window yet.", "目前还缺少足够的多天活跃记录，暂不建议自动推荐发版时段。")}</p>
      <p className="opsHelp">{tr("Counts derive from recorded audit events; sampled telemetry and production billing may differ.", "此图来自审计事件，不等于 Cloudflare 的实际计费请求或完整流量指标。")}</p>
    </div>}

    {section === "costs" && <div className="opsContent">
      <div className="opsToolbar"><div><h3>{tr("Cloudflare account cost visibility", "Cloudflare 账户成本")}</h3>
        <p>{tr("Billing covers the entire moviegoer Cloudflare account. Any other resources on that account share the same quotas.", "账单以 moviegoer Cloudflare 账户为单位；如果该账户还部署其他资源，额度与费用会合并计算。")}</p></div></div>
      <div className="opsCostGrid">
        <div><span>{tr("Current account usage cost", "本月账户用量成本")}</span>
          <strong>{liveBilling ? liveBilling.currency + " " + liveBilling.total.toFixed(2) : tr("Not connected", "未连接")}</strong>
          <small>{liveBilling ? liveBilling.from + " – " + liveBilling.to + " · " + tr("Cloudflare daily-updated usage, not invoice", "Cloudflare 按日更新用量，非正式账单") :
            tr("Billing Read token required; no fabricated cost estimate.", "需要 Billing Read 只读令牌；不展示虚构费用。")}</small></div>
        <div><span>{tr("D1 audit rows", "D1 审计记录")}</span><strong>{data ? fmt(data.totals.auditRows) : "—"}</strong>
          <small>{tr("Storage activity, not a currency charge.", "表示数据存量，不是收费金额。")}</small></div>
        <div><span>{tr("Monthly MCP tool calls", "本月 MCP 工具调用")}</span><strong>{data ? fmt(data.totals.monthlyCalls) : "—"}</strong>
          <small>{tr("Tracked by Remote Arc D1, not equal to billable Worker requests.", "由 Remote Arc D1 统计，不等于 Worker 实际计费请求量。")}</small></div>
      </div>
      <div className="opsToolbar">
        <button className="ghostButton" onClick={() => void loadBilling()} disabled={billingLoading}>
          {billingLoading ? tr("Loading billing…", "读取账单中…") : tr("Fetch Cloudflare cost", "读取 Cloudflare 实际费用")}
        </button>
        {billingError && <small role="status">{billingError === "billing_read_token_not_configured" ?
          tr("Add a dedicated Billing Read API token to the Worker first.", "需要先为 Worker 配置独立的 Billing Read 只读令牌。") : billingError}</small>}
      </div>
      {liveBilling && <div className="opsContent">
        {liveBilling.services.map(x => <p key={x.name}><strong>{x.name}</strong>: {liveBilling.currency} {x.cost.toFixed(2)}</p>)}
        <small>{liveBilling.note}</small>
      </div>}
      <p className="opsHelp">{tr("Relay currently uses Workers, D1 and Durable Objects. R2 is an account storage service; audit archive is disabled until explicitly activated. No KV binding is configured for this Worker.", "Relay 当前使用 Workers、D1 和 Durable Objects。R2 属于账户级存储，审计归档尚未启用；本 Worker 当前没有配置 KV 绑定。")}</p>
      <a className="opsBillingLink" href={data?.billing.billingUrl || "https://dash.cloudflare.com/"} target="_blank" rel="noreferrer">{tr("Open actual Cloudflare billing", "打开 Cloudflare 真实账单")} ↗</a>
      <p className="opsHelp">{tr("No additional paid billing API or monitoring service has been enabled by this dashboard.", "此 Dashboard 没有自动启用任何新的付费账单 API 或监控服务。")}</p>
    </div>}
  </section>;
}
