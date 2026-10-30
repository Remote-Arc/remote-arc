import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { AdminUserUsageInsights } from "./user-usage-insights.js";
import { ACTIVATION_STAGES, type ActivationEvidence, type ActivationSort, type ActivationStage } from '../../../packages/protocol/src/admin-activation.js';
import { UserActivationBadge, UserActivationEvidence } from './admin/user-activation.js';
import "./admin-operations.css";

type DeviceCapacityGrant = {
  id:string;user_id:string;email:string;extra_devices:number;reason:string;
  expires_at:string|null;revoked_at:string|null;created_at:string;
};
type PlusGrant = { id:string;email:string;expires_at:string|null;revoked_at:string|null;reason:string;created_at:string;plan:string };

type Account = ActivationEvidence & {
  id: string; email: string; name: string | null; role: string; plan: string;
  created_at: string; used: number; extra: number; allowance: number | null;
  device_count: number; computer_count: number; online_devices: number; last_activity: string | null;
  has_plus_grant: number;
  linked_login: "google" | "email_only";
  first_mcp_client: string | null;
  live_agent_versions: string[];
  live_status_verified: boolean;
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
  filteredTotal: number;
  activationCounts: Record<ActivationStage, number>;
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

export function AdminOperations({readOnly=false,embedded=false}:{readOnly?:boolean;embedded?:boolean}={}) {
  const { tr, locale } = useI18n();
  const [section, setSection] = useState<Section>("users");
  const [liveBilling, setLiveBilling] = useState<LiveBilling | null>(null);
  const [billingError, setBillingError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [arcBilling,setArcBilling]=useState<{month:string;paidRevenueUsd:number;modelRatedCostUsd:number;heldModelMaximumUsd:number;creditsPending:number;unresolvedPayments:Array<{id:string;error_code:string|null}>}|null>(null);
  const [arcBillingError,setArcBillingError]=useState(''),[arcBillingLoading,setArcBillingLoading]=useState(false);
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ActivationSort>('usage');
  const [activation, setActivation] = useState<ActivationStage | 'all'>('all');
  const [appliedQuery, setAppliedQuery] = useState('');
  const requestSequence = useRef(0);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [credit, setCredit] = useState("500");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [deviceGrants,setDeviceGrants] = useState<DeviceCapacityGrant[]>([]);
  const [deviceExtra,setDeviceExtra] = useState("2");
  const [deviceDuration,setDeviceDuration] = useState("30");
  const [deviceUntil,setDeviceUntil] = useState("");
  const [deviceReason,setDeviceReason] = useState("Additional computers for customer support");
  const [deviceBusy,setDeviceBusy] = useState(false);
  const [deviceNotice,setDeviceNotice] = useState("");
  const [plusGrants, setPlusGrants] = useState<PlusGrant[]>([]);
  const [plusDuration, setPlusDuration] = useState("30");
  const [plusCustomUntil, setPlusCustomUntil] = useState("");
  const [plusReason, setPlusReason] = useState("Admin-issued Plus access");
  const [plusBusy, setPlusBusy] = useState(false);
  const [plusNotice, setPlusNotice] = useState("");
  const pendingCreditRequest = useRef<{ key:string; requestId:string } | null>(null);

  async function refresh(pageToLoad = page) {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const parameters = new URLSearchParams({ page: String(pageToLoad), activation, sort, query: appliedQuery });
      const res = await fetch('/api/admin/operations?' + parameters, { credentials: "same-origin" });
      if (!res.ok) throw new Error(tr("Admin metrics could not be loaded", "无法加载管理员指标") + " · " + res.status);
      const result = await res.json() as OperationsData;
      if (sequence !== requestSequence.current) return;
      setData(result);
      setError("");
    } catch (cause) {
      if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }
  useEffect(() => {
    void refresh(page);
    return () => { requestSequence.current++; };
  }, [page, activation, sort, appliedQuery]);
  useEffect(() => {
    const nextQuery = query.trim();
    if (nextQuery === appliedQuery) return;
    const timer = setTimeout(() => { setPage(0); setSelectedUser(null); setAppliedQuery(nextQuery); }, 250);
    return () => clearTimeout(timer);
  }, [query, appliedQuery]);

  const filtered = data?.users || [];
  const chosen = data?.users.find(u => u.id === selectedUser) || null;
  const activeDeviceGrants = deviceGrants.filter(g => !g.revoked_at && (!g.expires_at || Date.parse(g.expires_at)>Date.now()));
  const activeDeviceExtra = activeDeviceGrants.reduce((total,g)=>total+g.extra_devices,0);
  const activePlusGrant = plusGrants.find(g => !g.revoked_at && (!g.expires_at || Date.parse(g.expires_at) > Date.now())) || null;
  useEffect(() => {
    let cancelled=false;
    setDeviceGrants([]);setDeviceNotice("");
    if(!chosen?.email || readOnly)return;
    void fetch("/api/admin/device-capacity?email="+encodeURIComponent(chosen.email),{credentials:"same-origin"})
      .then(async response=>{
        if(!response.ok)throw new Error("Could not load device capacity grants");
        return response.json() as Promise<{grants:DeviceCapacityGrant[]}>;
      })
      .then(payload=>{if(!cancelled)setDeviceGrants(payload.grants||[]);})
      .catch(error=>{if(!cancelled)setDeviceNotice(String(error));});
    return()=>{cancelled=true;};
  },[chosen?.email,readOnly]);
  useEffect(() => {
    let cancelled = false;
    setPlusGrants([]);
    setPlusNotice("");
    if (!chosen?.email || readOnly) return;
    void fetch("/api/admin/plan-grants?email=" + encodeURIComponent(chosen.email), {credentials:"same-origin"})
      .then(async response => {
        if (!response.ok) throw new Error("Could not load Plus grant history");
        return response.json() as Promise<{grants:PlusGrant[]}>;
      })
      .then(payload => { if (!cancelled) setPlusGrants(payload.grants || []); })
      .catch(error => { if (!cancelled) setPlusNotice(String(error)); });
    return () => { cancelled = true; };
  }, [chosen?.email, readOnly]);
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
  async function loadArcBilling(){
    if(readOnly||arcBillingLoading)return;setArcBillingLoading(true);setArcBillingError('');
    try{const response=await fetch('/api/admin/arc-billing',{credentials:'same-origin'});if(!response.ok)throw Error();setArcBilling(await response.json());}
    catch{setArcBillingError(tr('Arc billing data is temporarily unavailable.','暂时无法获取 Arc 计费数据。'));}finally{setArcBillingLoading(false);}
  }
  async function grantCredits() {
    if (readOnly || !chosen || !data || saving) return;
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

  async function refreshDeviceGrants(email:string) {
    const response=await fetch("/api/admin/device-capacity?email="+encodeURIComponent(email),{credentials:"same-origin"});
    if(!response.ok)throw new Error("Failed to refresh extra device capacity");
    const payload=await response.json() as {grants:DeviceCapacityGrant[]};
    setDeviceGrants(payload.grants||[]);
  }
  async function addDeviceCapacity() {
    if(!chosen||readOnly||deviceBusy||chosen.role==="admin")return;
    const amount=Number(deviceExtra),reason=deviceReason.trim();
    if(!Number.isSafeInteger(amount)||amount<1||amount>20){
      setDeviceNotice(tr("Choose 1–20 additional computers.","请选择追加 1–20 台电脑。"));return;
    }
    if(reason.length<3||reason.length>500){
      setDeviceNotice(tr("Enter a reason (3–500 characters).","请填写 3–500 字的原因。"));return;
    }
    let expiresAt:string|null=null;
    if(deviceDuration==="custom"){
      const timestamp=Date.parse(deviceUntil);
      if(!Number.isFinite(timestamp)||timestamp<=Date.now()){
        setDeviceNotice(tr("Choose a future expiry.","请选择未来的到期时间。"));return;
      }
      expiresAt=new Date(timestamp).toISOString();
    }else if(deviceDuration!=="never"){
      expiresAt=new Date(Date.now()+Number(deviceDuration)*86400000).toISOString();
    }
    if(!window.confirm(tr("Add "+amount+" computers for "+chosen.email+" until "+(expiresAt||"revoked")+"?",
      "确认给 "+chosen.email+" 追加 "+amount+" 台电脑，有效期至 "+(expiresAt||"手动撤销")+"？")))return;
    setDeviceBusy(true);setDeviceNotice("");
    try{
      const response=await fetch("/api/admin/device-capacity",{method:"POST",credentials:"same-origin",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({email:chosen.email,extra_devices:amount,expires_at:expiresAt,reason})});
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error||"Could not add devices");
      await Promise.all([refreshDeviceGrants(chosen.email),refresh()]);
      setDeviceNotice(tr("Extra computers granted and audited.","已追加电脑名额并记录管理员操作。"));
    }catch(error){setDeviceNotice(error instanceof Error?error.message:String(error));}
    finally{setDeviceBusy(false);}
  }
  async function revokeDeviceCapacity(id:string) {
    if(!chosen||readOnly||deviceBusy)return;
    if(!window.confirm(tr("Revoke this extra computer allocation?","确认撤销此项额外电脑名额？")))return;
    setDeviceBusy(true);setDeviceNotice("");
    try{
      const response=await fetch("/api/admin/device-capacity/"+encodeURIComponent(id)+"/revoke",
        {method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:"{}"});
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error||"Could not revoke devices");
      await Promise.all([refreshDeviceGrants(chosen.email),refresh()]);
      setDeviceNotice(tr("Extra computer capacity revoked.","已撤销额外电脑名额。"));
    }catch(error){setDeviceNotice(error instanceof Error?error.message:String(error));}
    finally{setDeviceBusy(false);}
  }
  async function refreshPlusGrants(email: string) {
    const response = await fetch("/api/admin/plan-grants?email=" + encodeURIComponent(email), {credentials:"same-origin"});
    if (!response.ok) throw new Error("Failed to refresh Plus grants");
    const payload = await response.json() as {grants:PlusGrant[]};
    setPlusGrants(payload.grants || []);
  }
  async function grantPlus() {
    if (!chosen || readOnly || plusBusy || activePlusGrant) return;
    const reason = plusReason.trim();
    if (reason.length < 3 || reason.length > 500) {
      setPlusNotice(tr("Enter a reason (3–500 characters).", "请输入 3–500 字的开通原因。"));
      return;
    }
    let expiresAt: string | null = null;
    if (plusDuration === "custom") {
      const timestamp = Date.parse(plusCustomUntil);
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        setPlusNotice(tr("Choose a future expiry.", "请选择未来的到期时间。"));
        return;
      }
      expiresAt = new Date(timestamp).toISOString();
    } else if (plusDuration !== "never") {
      expiresAt = new Date(Date.now() + Number(plusDuration) * 86400000).toISOString();
    }
    if (!window.confirm(tr("Grant Plus to " + chosen.email + " until " + (expiresAt || "revoked") + "?",
      "确认给 " + chosen.email + " 开通 Plus，有效期至 " + (expiresAt || "手动撤销") + "？"))) return;
    setPlusBusy(true);
    setPlusNotice("");
    try {
      const response = await fetch("/api/admin/plan-grants", {
        method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"},
        body:JSON.stringify({email:chosen.email,plan:"plus",reason,expires_at:expiresAt}),
      });
      const payload = await response.json() as {error?:string};
      if (!response.ok) throw new Error(payload.error || "Plus grant failed");
      await Promise.all([refreshPlusGrants(chosen.email),refresh()]);
      setPlusNotice(tr("Plus granted. The expiry and administrator are audited.", "Plus 已开通，期限与管理员操作已记录。"));
    } catch (err) {
      setPlusNotice(err instanceof Error ? err.message : String(err));
    } finally { setPlusBusy(false); }
  }
  async function revokePlus() {
    if (!chosen || !activePlusGrant || readOnly || plusBusy) return;
    if (!window.confirm(tr("Revoke this Plus grant for " + chosen.email + "?",
      "确认撤销 " + chosen.email + " 的此项 Plus 授权吗？"))) return;
    setPlusBusy(true);
    setPlusNotice("");
    try {
      const response = await fetch("/api/admin/plan-grants/" + encodeURIComponent(activePlusGrant.id) + "/revoke", {
        method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:"{}",
      });
      const payload = await response.json() as {error?:string};
      if (!response.ok) throw new Error(payload.error || "Revoke failed");
      await Promise.all([refreshPlusGrants(chosen.email),refresh()]);
      setPlusNotice(tr("Plus grant revoked.", "Plus 授权已撤销。"));
    } catch (err) {
      setPlusNotice(err instanceof Error ? err.message : String(err));
    } finally { setPlusBusy(false); }
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
        {!embedded&&<><span className="eyebrow">{tr("OPERATIONS · ADMIN ONLY", "运营中心 · 仅管理员")}</span><h2>{tr("Users, devices & capacity", "用户、设备与容量")}</h2></>}
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
        <div className="opsUsageControls">
          <label>{tr('Activation stage', '激活阶段')}<select aria-label={tr('Activation stage', '激活阶段')} value={activation} onChange={e => { setActivation(e.target.value as ActivationStage | 'all'); setPage(0); setSelectedUser(null); }}>
            <option value="all">{tr('All stages', '全部阶段')}</option>{ACTIVATION_STAGES.map(stage => <option key={stage.id} value={stage.id}>{tr(stage.en, stage.zh)}{data ? ` (${data.activationCounts?.[stage.id] || 0})` : ''}</option>)}
          </select></label>
          <label>{tr('Sort users', '用户排序')}<select aria-label={tr('Sort users', '用户排序')} value={sort} onChange={e => { setSort(e.target.value as ActivationSort); setPage(0); setSelectedUser(null); }}>
            <option value="usage">{tr('Highest usage first', '高用量优先')}</option><option value="recent">{tr('Newest registered', '最近注册优先')}</option><option value="activation_asc">{tr('Activation: early stages first', '激活阶段：流失前段优先')}</option><option value="activation_desc">{tr('Activation: later stages first', '激活阶段：后段优先')}</option>
          </select></label>
          <label>{tr('Search users', '搜索用户')}<input placeholder={tr("Search name or email", "搜索姓名或邮箱")} value={query} onChange={e => setQuery(e.target.value)} /></label>
        </div>
      </div>
      <p className="opsHelp opsActivationHelp">{tr('Activation filtering, search and sorting cover all users before pagination. A 0/0 device count is not plugin attribution. Client names alone are unverified.', '激活筛选、搜索和排序作用于全部用户，再进行分页。设备 0/0 不能证明插件来源，客户端名称本身也未经核实。')}</p>
      <div className="opsResultStatus" role="status" aria-live="polite">{loading ? tr('Loading users…', '正在读取用户…') : tr(`${data?.filteredTotal || 0} matching users`, `共 ${data?.filteredTotal || 0} 位匹配用户`)}</div>
      <div className="opsUsagePulse" aria-label={tr("Usage status on this page","当前页用量状况")}>
        <div><strong>{filtered.filter(u=>u.allowance!==null&&u.used>=u.allowance).length}</strong><span>{tr("At limit","额度已满")}</span></div>
        <div><strong>{filtered.filter(u=>u.allowance!==null&&u.used<u.allowance&&u.used>=u.allowance*.8).length}</strong><span>{tr("80% or more","已用超过 80%")}</span></div>
        <div><strong>{filtered.filter(u=>u.extra>0).length}</strong><span>{tr("With bonus calls","已赠送额度")}</span></div>
        <small>{tr("Filtered users on this page · not all accounts","仅当前页筛选用户 · 非全站统计")}</small>
      </div>
      <div className="opsTableScroll">
        <table className="opsTable">
          <thead><tr><th>{tr("Account", "账户")}</th><th>{tr('Activation', '激活状态')}</th><th>{tr("Plan", "套餐")}</th><th>{tr("Calls this month", "本月调用")}</th><th>{tr("Devices", "设备")}</th><th>{tr("Login / MCP client", "登录方式 / MCP 客户端")}</th><th>{tr("Agent version", "运行版本")}</th><th>{tr("Last activity", "最近活动")}</th><th></th></tr></thead>
          <tbody>{filtered.map(u => <tr key={u.id} className={u.id === selectedUser ? "selected" : ""}>
            <td><strong>{u.name || u.email.split("@")[0]}</strong><small>{u.email}</small></td>
            <td><UserActivationBadge evidence={u}/><small>{u.first_success_at ? tr('Success recorded', '有成功记录') : u.mcp_connections > 0 ? tr('OAuth recorded', '有 OAuth 记录') : tr('No success recorded', '无成功记录')}</small></td>
            <td>{u.role === "admin" ? "Admin" : u.plan === "plus" || u.has_plus_grant ? "Plus" : "Free"}</td>
            <td><strong>{fmt(u.used)} / {u.allowance === null ? "∞" : fmt(u.allowance)}</strong>
              <div className="opsMeter"><i style={{width: u.allowance ? Math.min(100, u.used / u.allowance * 100) + "%" : "0%"}} /></div></td>
            <td><span className={u.online_devices ? "opsOnline" : ""}>{u.live_status_verified ? u.online_devices : '—'} / {u.device_count}</span>{!u.live_status_verified && <small>{tr('Live status unverified', '实时在线未核实')}</small>}</td>
            <td><strong>{u.linked_login === "google" ? "Google" : "Email"}</strong>
              <small>{u.first_mcp_client ? tr('Reported client: ', '客户端自报：') + u.first_mcp_client : tr("No MCP connection recorded", "无 MCP 连接记录")}</small></td>
            <td><small>{u.live_agent_versions?.length ? u.live_agent_versions.join(", ") : "—"}</small></td>
            <td>{relative(u.last_activity, locale)}</td>
            <td><button onClick={() => { setSelectedUser(u.id === selectedUser ? null : u.id); setNotice(""); }}>{tr("Details", "详情")}</button></td>
          </tr>)}{!loading && filtered.length === 0 && <tr><td colSpan={9}>{tr('No users match these filters.', '没有符合筛选条件的用户。')}</td></tr>}</tbody>
        </table>
      </div>
      {chosen && <AdminUserUsageInsights key={chosen.id} userId={chosen.id} used={chosen.used} allowance={chosen.allowance} extra={chosen.extra} />}
      {chosen && <div className="opsUserDetail">
        <div><h3>{chosen.name || chosen.email}</h3><p>{chosen.email} · {tr("Joined", "注册于")} {new Date(chosen.created_at).toLocaleDateString()}</p><p>{tr("Monthly plan quota", "本月基础额度")}: {chosen.allowance === null ? "∞" : fmt(chosen.allowance - chosen.extra)} · {tr("Extra granted", "额外赠送")}: {fmt(chosen.extra)}</p><UserActivationEvidence evidence={chosen}/></div>
        <div className="opsPlusGrant">
          <div>
            <h4>{tr("Additional computer slots","追加电脑名额")}</h4>
            <p>{tr("Extra slots add to the plan's computer limit. Browser companions are counted separately. Expiry prevents new pairings but does not disconnect already-paired computers.",
              "额外名额叠加到套餐电脑上限，不占用浏览器扩展名额。")}</p>
            <p><strong>{tr("Active extra slots","当前额外名额")}: +{activeDeviceExtra}</strong>
              {" · "}{tr("Computers currently registered","已注册电脑")}: {chosen.computer_count ?? chosen.device_count}</p>
          </div>
          <label>{tr("Add computers","追加数量")}
            <input type="number" min={1} max={20} value={deviceExtra}
              disabled={deviceBusy||readOnly||chosen.role==="admin"}
              onChange={e=>setDeviceExtra(e.target.value)}/>
          </label>
          <label>{tr("Duration","生效时长")}
            <select value={deviceDuration} disabled={deviceBusy||readOnly} onChange={e=>setDeviceDuration(e.target.value)}>
              <option value="7">{tr("7 days","7 天")}</option>
              <option value="30">{tr("30 days","30 天")}</option>
              <option value="90">{tr("90 days","90 天")}</option>
              <option value="365">{tr("365 days","365 天")}</option>
              <option value="never">{tr("Until revoked","永久（直到撤销）")}</option>
              <option value="custom">{tr("Custom expiry","自定义到期时间")}</option>
            </select>
          </label>
          {deviceDuration==="custom"&&<label>{tr("Expires at (local time)","到期时间（本地时区）")}
            <input type="datetime-local" value={deviceUntil} onChange={e=>setDeviceUntil(e.target.value)}
              disabled={deviceBusy||readOnly}/>
          </label>}
          <label>{tr("Reason (audited)","追加原因（审计记录）")}
            <input value={deviceReason} maxLength={500} onChange={e=>setDeviceReason(e.target.value)}
              disabled={deviceBusy||readOnly}/>
          </label>
          <div className="opsPlusGrantActions">
            <button type="button" className="primaryButton" disabled={deviceBusy||readOnly||chosen.role==="admin"}
              onClick={()=>void addDeviceCapacity()}>
              {deviceBusy?tr("Saving…","处理中…"):tr("Grant extra slots","追加设备名额")}
            </button>
          </div>
          {activeDeviceGrants.length>0&&<div className="opsCapacityHistory">
            {activeDeviceGrants.map(g=><div key={g.id}>
              <span>+{g.extra_devices} · {g.expires_at?new Date(g.expires_at).toLocaleDateString():
                tr("Until revoked","直到撤销")} · {g.reason}</span>
              <button type="button" className="ghostButton" disabled={deviceBusy||readOnly}
                onClick={()=>void revokeDeviceCapacity(g.id)}>{tr("Revoke","撤销")}</button>
            </div>)}
          </div>}
          {deviceNotice&&<p role="status">{deviceNotice}</p>}
        </div>
        <div className="opsPlusGrant">
          <div>
            <h4>{tr("Plus membership", "Plus 会员管理")}</h4>
            <p>{tr("Grant Connect Plus with a chosen expiry. Hosted Arc model Credits are managed separately under Payments.", "为用户开通指定有效期的 Connect Plus；Arc 托管模型 Credits 在支付管理中独立管理。")}</p>
            {activePlusGrant
              ? <p><strong>{tr("Active Plus grant", "当前有效的 Plus 授权")}</strong> · {activePlusGrant.expires_at
                  ? new Date(activePlusGrant.expires_at).toLocaleString()
                  : tr("Until revoked", "手动撤销前有效")}</p>
              : <p>{tr("No active administrator Plus grant", "暂无有效的管理员 Plus 授权")}</p>}
          </div>
          <label>{tr("Duration", "开通时长")}
            <select aria-label={tr("Plus duration","Plus 开通时长")} value={plusDuration} disabled={plusBusy||!!activePlusGrant} onChange={e=>setPlusDuration(e.target.value)}>
              <option value="7">{tr("7 days","7 天")}</option>
              <option value="30">{tr("30 days","30 天")}</option>
              <option value="90">{tr("90 days","90 天")}</option>
              <option value="365">{tr("365 days","365 天")}</option>
              <option value="never">{tr("Until revoked","永久（直到撤销）")}</option>
              <option value="custom">{tr("Custom expiry","自定义到期时间")}</option>
            </select>
          </label>
          {plusDuration==="custom" && <label>{tr("Expires at (local time)","到期时间（本地时区）")}
            <input type="datetime-local" value={plusCustomUntil} onChange={e=>setPlusCustomUntil(e.target.value)} disabled={plusBusy||!!activePlusGrant}/>
          </label>}
          <label>{tr("Reason (audited)", "开通原因（审计记录）")}
            <input value={plusReason} onChange={e=>setPlusReason(e.target.value)} maxLength={500} disabled={plusBusy||!!activePlusGrant}/>
          </label>
          <div className="opsPlusGrantActions">
            <button className="primaryButton" type="button" onClick={()=>void grantPlus()} disabled={readOnly||plusBusy||!!activePlusGrant||chosen.role==="admin"}>
              {plusBusy?tr("Saving…","处理中…"):tr("Grant Plus","开通 Plus")}
            </button>
            {activePlusGrant && <button type="button" className="ghostButton" onClick={()=>void revokePlus()} disabled={readOnly||plusBusy}>
              {tr("Revoke grant","撤销授权")}
            </button>}
          </div>
          {plusNotice && <p role="status">{plusNotice}</p>}
        </div>
        <div className="opsCreditForm">
          <label>{tr("Add calls this month", "本月追加调用次数")}<input type="number" min={1} max={100000} value={credit} onChange={e => setCredit(e.target.value)} /></label>
          <label>{tr("Reason (audited)", "原因（可审计）")}<input maxLength={300} placeholder={tr("e.g. Early access feedback", "例如：早期体验反馈奖励")} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <button className="primaryButton" disabled={readOnly || saving || chosen.role === "admin" || !data?.creditsReady} onClick={() => void grantCredits()}>{saving ? tr("Saving…", "正在提交…") : tr("Grant monthly calls", "追加本月额度")}</button>
          {!data?.creditsReady && <small>{tr("Credit grants will be available after the database migration.", "额度追加将在数据库迁移完成后开放。")}</small>}
          {notice && <small role="status">{notice}</small>}
        </div>
      </div>}
      <div className="opsPages">
        <button disabled={page === 0 || loading} onClick={() => { setPage(p => Math.max(0,p-1)); setSelectedUser(null); }}>{tr("Previous", "上一页")}</button>
        <span>{page + 1} / {Math.max(1, Math.ceil((data?.filteredTotal || 1) / (data?.pageSize || 30)))}</span>
        <button disabled={!data || loading || (page+1)*data.pageSize >= data.filteredTotal} onClick={() => { setPage(p => p+1); setSelectedUser(null); }}>{tr("Next", "下一页")}</button>
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
      <div className="opsToolbar"><div><h3>{tr('Arc subscriptions & model usage','Arc 订阅与模型用量')}</h3><p>{tr('Verified receipts, rated model costs and unresolved payment events.','已核验收款、模型计量成本与待处理支付事件。')}</p></div><button className="ghostButton" disabled={readOnly||arcBillingLoading} onClick={()=>void loadArcBilling()}>{arcBillingLoading?tr('Loading…','读取中…'):tr('Fetch Arc billing','读取 Arc 计费')}</button></div>
      {arcBillingError&&<p role="alert">{arcBillingError}</p>}
      {arcBilling&&<><div className="opsCostGrid"><div><span>{tr('Paid receipt value · ','已付收款金额 · ')+arcBilling.month}</span><strong>${arcBilling.paidRevenueUsd.toFixed(2)}</strong><small>{tr('Excludes tax and refunded receipts.','不含税和已退款收据。')}</small></div><div><span>{tr('Rated model usage','模型计量成本')}</span><strong>${arcBilling.modelRatedCostUsd.toFixed(2)}</strong><small>{tr('Provider invoices can differ.','供应商实际账单可能有差异。')}</small></div><div><span>{tr('Pending model maximum','待确认模型费用上限')}</span><strong>${arcBilling.heldModelMaximumUsd.toFixed(2)}</strong><small>{arcBilling.creditsPending.toLocaleString()} Credits</small></div></div><p className="opsHelp">{tr('These figures are not gross margin. Include payment, hosting, Apps, support and Free-user costs in the repository SaaS economics tool.','以上不等于毛利；请在仓库 SaaS 测算工具中计入支付、托管、Apps、支持及免费用户成本。')}</p>{arcBilling.unresolvedPayments.length>0&&<div><h4>{tr('Payments needing review','待核查支付')}</h4>{arcBilling.unresolvedPayments.map(event=><p key={event.id}><code>{event.id}</code> · {event.error_code||tr('Processing','处理中')}</p>)}</div>}</>}
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
