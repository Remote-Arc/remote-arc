import { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import { AdminOperations } from "./admin-operations.js";
import "./admin-console.css";

type Lead={id:string;kind:"early_access"|"feedback";email:string;name:string|null;company:string|null;message:string;source:string;locale:string;status:"new"|"reviewed"|"contacted"|"closed";created_at:string};
type LeadResult={total:number;items:Lead[];page:number};
type Panel="overview"|"leads"|"operations"|"health";
export function AdminConsole({user,previewMode=false}:{user:{isAdmin:boolean;email:string}|null;previewMode?:boolean}){
  const {tr}=useI18n();
  const [panel,setPanel]=useState<Panel>("overview");
  const [leads,setLeads]=useState<LeadResult|null>(null);
  const [page,setPage]=useState(0);
  const [filter,setFilter]=useState("");
  const [status,setStatus]=useState("loading");
  const [health,setHealth]=useState<{
    status?:string;checkedAt?:string;
    account?:{users?:number;devices?:number;activeTokens?:number};
    worker?:{errors15m?:number;errors1h?:number;errors24h?:number};
    dependencies?:{d1?:{status:string};durableObjects?:{status:string}};
    alerts?:{emailConfigured?:boolean;destination?:string};
    incidents?:Array<{id:string;created_at:string;severity:string;kind:string;path:string|null;message:string;status_code:number|null}>;
  }|null>(null);
  const [error,setError]=useState("");
  async function refresh(){
    if(!user?.isAdmin||previewMode)return;
    try{
      setStatus("loading");
      const [lr,hr]=await Promise.all([
        fetch("/api/admin/arc-interest?page="+page+(filter?"&status="+encodeURIComponent(filter):""),{credentials:"same-origin"}),
        fetch("/api/monitor",{credentials:"same-origin"})
      ]);
      if(!lr.ok)throw new Error("Leads API "+lr.status);
      setLeads(await lr.json() as LeadResult);
      if(hr.ok)setHealth(await hr.json() as typeof health);
      setError("");setStatus("ready");
    }catch(e){setError(e instanceof Error?e.message:String(e));setStatus("error");}
  }
  useEffect(()=>{void refresh();},[user?.isAdmin,page,filter,previewMode]);
  async function mark(lead:Lead,next:Lead["status"]){
    const r=await fetch("/api/admin/arc-interest",{method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:lead.id,status:next})});
    if(!r.ok){setError(tr("Could not update lead","更新线索失败"));return;}
    await refresh();
  }
  if(!user)return <main className="raAdminGate"><h1>{tr("Remote Arc Admin","Remote Arc 管理后台")}</h1><p>{tr("Sign in to your existing Remote Arc account, then return here.","请先登录现有的 Remote Arc 账号，再返回此页面。")}</p><a href="https://mcp.remotearc.app/auth/login">{tr("Sign in on Remote Arc","登录 Remote Arc")}</a></main>;
  if(!user.isAdmin)return <main className="raAdminGate"><h1>403</h1><p>{tr("This workspace is restricted to authorized administrators.","该工作区仅限授权管理员访问。")}</p><a href="https://mcp.remotearc.app/overview">{tr("Return to your dashboard","返回普通 Dashboard")}</a></main>;
  return <div className="raAdminFrame">
    <aside className="raAdminSidebar"><a className="raAdminBrand" href="/"><img src="/remote-arc.svg" alt="" width="36" height="36"/><strong>Remote Arc <span>Admin</span></strong></a>
      <p className="raAdminCaption">{tr("INTERNAL OPERATIONS","内部运营")}</p>
      <nav aria-label="Admin">
        {([["overview",tr("Overview","总览")],["leads",tr("Leads & feedback","线索与反馈")],["operations",tr("Users & operations","用户与运营")],["health",tr("System health","服务健康")]] as [Panel,string][]).map(([id,label])=><button type="button" key={id} aria-current={panel===id?"page":undefined} onClick={()=>setPanel(id)}>{label}<span aria-hidden="true">↗</span></button>)}
      </nav>
      <div className="raAdminBottom"><small>{user.email}</small><a href="https://mcp.remotearc.app/overview">{tr("Customer dashboard","用户 Dashboard")} ↗</a></div>
    </aside>
    <main className="raAdminContent">
      <header className="raAdminTop"><div><small>REMOTE ARC / ADMIN</small><h1>{panel==="overview"?tr("Business overview","业务总览"):panel==="leads"?tr("Leads & feedback","线索与反馈"):panel==="operations"?tr("Users & operations","用户与运营"):tr("System health","服务健康")}</h1></div><button type="button" onClick={()=>void refresh()} disabled={status==="loading"}>{tr("Refresh","刷新")} ↻</button></header>
      {previewMode&&<p className="raAdminHint" role="status">{tr("UI preview only — this page contains no live operator data. Production Admin access requires your real administrator session.","仅供界面预览；这里不含任何真实运营数据。正式 Admin 需要真实管理员登录。")}</p>}
      {error&&<p className="raAdminError" role="alert">{error}</p>}
      {panel==="overview"&&<><div className="raAdminMetrics"><article><span>{tr("Total users","注册用户")}</span><strong>{health?.account?.users?.toLocaleString()??"—"}</strong></article><article><span>{tr("Registered devices","注册设备")}</span><strong>{health?.account?.devices?.toLocaleString()??"—"}</strong></article><article><span>{tr("Interest & feedback","线索和反馈")}</span><strong>{leads?.total??"—"}</strong></article><article><span>GMV</span><strong>—</strong><small>{tr("No payment provider connected","支付尚未接入")}</small></article></div><p className="raAdminHint">{tr("GMV and revenue will only appear after verified payment events are integrated. Do not equate API usage or trial signups with revenue.","只有接入可信支付事件后才展示 GMV 和营收，不会将 API 调用量或试用申请误算作收入。")}</p></>}
      {panel==="leads"&&<section className="raAdminLeads"><div className="raAdminLeadControls"><span>{leads?.total??0} {tr("records","条记录")}</span><select aria-label={tr("Filter status","筛选状态")} value={filter} onChange={e=>{setPage(0);setFilter(e.target.value)}}><option value="">{tr("All statuses","全部状态")}</option>{["new","reviewed","contacted","closed"].map(s=><option key={s} value={s}>{s}</option>)}</select></div>{status==="loading"&&!leads&&<p>{tr("Loading...","加载中……")}</p>}{(leads?.items||[]).map(x=><article className="raAdminLead" key={x.id}><div className="raAdminLeadHeader"><strong>{x.name||x.email}</strong><span>{x.kind==="early_access"?tr("Early access","抢先体验"):tr("Feedback","体验反馈")} · {new Date(x.created_at).toLocaleString()}</span></div><p>{x.message}</p><div className="raAdminLeadFooter"><span>{x.email}{x.company?" · "+x.company:""} · {x.source}</span><select aria-label={tr("Lead follow-up status","线索跟进状态")} value={x.status} onChange={e=>void mark(x,e.target.value as Lead["status"])}>{["new","reviewed","contacted","closed"].map(s=><option key={s}>{s}</option>)}</select></div></article>)}{leads?.items.length===0&&<p>{tr("No submissions yet.","暂时没有提交记录。")}</p>}<div className="raAdminPager"><button disabled={page===0} onClick={()=>setPage(x=>x-1)}>← {tr("Previous","上一页")}</button><span>{page+1}</span><button disabled={(page+1)*30>=(leads?.total||0)} onClick={()=>setPage(x=>x+1)}>{tr("Next","下一页")} →</button></div></section>}
      {panel==="operations"&&(previewMode?<p className="raAdminHint">{tr("Operational data is intentionally unavailable in this Preview.","此预览不加载真实运营数据。")}</p>:<AdminOperations/>)}
      {panel==="health"&&<><section className="raAdminMetrics">
        <article><span>{tr("Service status","服务状态")}</span><strong>{health?.status||"—"}</strong></article>
        <article><span>{tr("Errors · 15 min","错误 · 15 分钟")}</span><strong>{health?.worker?.errors15m??"—"}</strong></article>
        <article><span>{tr("Errors · 1 hour","错误 · 1 小时")}</span><strong>{health?.worker?.errors1h??"—"}</strong></article>
        <article><span>{tr("Errors · 24 hours","错误 · 24 小时")}</span><strong>{health?.worker?.errors24h??"—"}</strong></article>
        <article><span>Cloudflare D1</span><strong>{health?.dependencies?.d1?.status||"—"}</strong></article>
        <article><span>Durable Objects</span><strong>{health?.dependencies?.durableObjects?.status||"—"}</strong></article>
        <article><span>{tr("Active OAuth tokens","有效 OAuth Token")}</span><strong>{health?.account?.activeTokens??"—"}</strong></article>
        <article><span>{tr("Alert emails","告警邮件")}</span><strong>{health?.alerts?.emailConfigured?tr("Enabled","已启用"):tr("Not configured","未配置")}</strong><small>{health?.alerts?.destination||"—"}</small></article>
      </section><h2 className="raAdminIncidentHeading">{tr("Recent service incidents","最近服务事件")}</h2>
      <section className="raAdminLeads">{(health?.incidents||[]).map(item=><article key={item.id} className="raAdminLead"><div className="raAdminLeadHeader"><strong>{item.kind} · {item.status_code||"ERR"}</strong><span>{item.severity} · {new Date(item.created_at).toLocaleString()}</span></div><p>{item.message}</p><small>{item.path||"—"}</small></article>)}{health&&health.incidents?.length===0&&<p>{tr("No recent service incidents.","最近没有服务异常。")}</p>}</section></>}
    </main>
  </div>;
}
