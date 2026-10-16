import { useEffect, useState } from "react";
import { useI18n } from "../i18n.js";
import { AdminOperations } from "../admin-operations.js";
import "./admin-console.css";

type Section="overview"|"leads"|"operations"|"health";
type Submission={id:string;category:"early_access"|"feedback";email:string;name:string;message:string;source:string;status:string;consent_at:string;created_at:string;updated_at:string};
type LeadsResponse={items:Submission[];total:number;page:number;pageSize:number;counts:Array<{category:string;count:number}>};
type Operations={totals:{users:number;devices:number;online:number;monthlyCalls:number;auditLast7d:number}};
type Incident={id:string;created_at:string;severity:string;kind:string;method?:string|null;path?:string|null;message:string;status_code?:number|null;colo?:string|null;ray_id?:string|null};
type Health={status:"operational"|"degraded";checkedAt:string;worker:{status:string;errors15m:number;errors1h:number;errors24h:number};dependencies:{d1:{status:string};durableObjects:{status:string}};alerts:{emailConfigured:boolean;destination:string|null;recent:Array<{alert_key:string;last_sent_at:string|null;last_status_code:number|null;last_path:string|null}>};account:{users:number;devices:number;activeTokens:number};incidents:Incident[]};

async function readJson<T>(path:string):Promise<T>{
 const response=await fetch(path,{credentials:"same-origin",headers:{"accept":"application/json"}});
 if(!response.ok)throw new Error("HTTP "+response.status);
 return response.json() as Promise<T>;
}
const time=(s:string|null|undefined)=>s?new Date(s).toLocaleString():"—";

function LeadsPanel(){
 const {tr}=useI18n();
 const [filter,setFilter]=useState<"all"|"early_access"|"feedback">("all");
 const [data,setData]=useState<LeadsResponse|null>(null);
 const [page,setPage]=useState(0);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 async function refresh(){
   try{setError("");setData(await readJson<LeadsResponse>("/api/admin/submissions?category="+filter+"&page="+page));}
   catch(e){setError(tr("Could not load saved submissions. Check migrations and admin access.","无法读取提交记录，请检查迁移和管理员权限。")+" "+String(e));}
 }
 useEffect(()=>{void refresh();},[filter,page]);
 async function change(item:Submission,status:string){
   setBusy(item.id);try{
     const res=await fetch("/api/admin/submissions/"+item.id,{method:"PATCH",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({status})});
     if(!res.ok)throw Error(String(res.status));await refresh();
   }catch{setError(tr("Could not update submission.","无法修改记录。"));}
   finally{setBusy("");}
 }
 async function remove(item:Submission){
   if(!window.confirm(tr("Permanently remove this contact submission?","永久删除这条联系记录？")))return;
   setBusy(item.id);
   try{const res=await fetch("/api/admin/submissions/"+item.id,{method:"DELETE",credentials:"same-origin",headers:{"content-type":"application/json"}});
     if(!res.ok)throw Error(String(res.status));await refresh();
   }catch{setError(tr("Could not delete submission.","无法删除记录。"));}
   finally{setBusy("");}
 }
 return <section className="adminSurface">
   <div className="adminSectionHeader"><div><h2>{tr("Early access & feedback","抢先体验与用户反馈")}</h2><p>{tr("Explicitly submitted contact requests only. No private device content or conversations.","仅展示用户主动提交的联系信息，不采集设备文件或私人对话内容。")}</p></div><button type="button" className="adminOutlineBtn" onClick={()=>void refresh()}>{tr("Refresh","刷新")} ↻</button></div>
   <div className="adminFilterRow" role="group" aria-label={tr("Submission type","提交类型")}>
    {(["all","early_access","feedback"] as const).map(kind=><button key={kind} type="button" className={filter===kind?"isActive":""} aria-pressed={filter===kind} onClick={()=>{setFilter(kind);setPage(0);}}>{kind==="all"?tr("All","全部"):kind==="early_access"?tr("Early access","抢先体验"):tr("Feedback","反馈")}</button>)}
    <span>{data?.total??"—"} {tr("submissions","条记录")}</span>
   </div>
   {error&&<p className="adminAlert" role="alert">{error}</p>}
   <div className="adminLeadsList">
   {data?.items.map(item=><article className="adminLeadItem" key={item.id}>
     <div className="adminLeadTop"><div><span className="adminLeadType">{item.category==="early_access"?"ARC EARLY ACCESS":"FEEDBACK"}</span><h3>{item.name||item.email}</h3><a href={"mailto:"+encodeURIComponent(item.email)}>{item.email}</a><small>{item.source} · {time(item.created_at)}</small></div><span className="adminLeadStatus">{item.status}</span></div>
     <p>{item.message}</p>
     <div className="adminLeadActions"><label>{tr("Status","状态")} <select value={item.status} disabled={busy===item.id} onChange={e=>void change(item,e.target.value)}><option value="new">{tr("New","新提交")}</option><option value="reviewed">{tr("Reviewed","已查看")}</option><option value="contacted">{tr("Contacted","已联系")}</option><option value="archived">{tr("Archived","已归档")}</option></select></label><button type="button" disabled={busy===item.id} onClick={()=>void remove(item)}>{tr("Delete","删除")}</button></div>
   </article>)}
   {data&&data.items.length===0&&<div className="adminNoData">{tr("No submissions yet.","暂无提交记录。")}</div>}
   </div>
   <div className="adminPager"><button disabled={page===0} onClick={()=>setPage(v=>Math.max(0,v-1))}>{tr("Previous","上一页")}</button><span>{page+1}</span><button disabled={!data||data.items.length<data.pageSize} onClick={()=>setPage(v=>v+1)}>{tr("Next","下一页")}</button></div>
 </section>;
}

function HealthPanel({health,loading,reload}:{health:Health|null;loading:boolean;reload:()=>void}) {
 const {tr}=useI18n();
 return <section className="adminSurface"><div className="adminSectionHeader"><div><h2>{tr("Service health & incidents","服务健康与异常")}</h2><p>{tr("Infrastructure diagnostics, not surveillance of users.","仅用于基础设施排障，不监视用户行为内容。")}</p></div><button className="adminOutlineBtn" disabled={loading} onClick={reload}>{loading?tr("Refreshing…","刷新中…"):tr("Refresh","刷新")} ↻</button></div>
 <div className="adminMetrics adminMetrics--health">
  <div><span>{tr("Overall","整体状态")}</span><strong>{health?health.status:"—"}</strong></div>
  <div><span>5xx · 15m</span><strong>{health?.worker.errors15m??"—"}</strong></div>
  <div><span>5xx · 1h</span><strong>{health?.worker.errors1h??"—"}</strong></div>
  <div><span>5xx · 24h</span><strong>{health?.worker.errors24h??"—"}</strong></div>
 </div>
 <div className="adminDiagnostics">
   <article><h3>{tr("Dependencies","基础设施")}</h3><p>Cloudflare Worker <b>{health?.worker.status||"—"}</b></p><p>D1 <b>{health?.dependencies.d1.status||"—"}</b></p><p>Durable Objects <b>{health?.dependencies.durableObjects.status||"—"}</b></p></article>
   <article><h3>{tr("Alert delivery","告警投递")}</h3><p>{health?.alerts.emailConfigured?tr("Email enabled","邮件已启用"):tr("Email pending","邮件通道待启用")}</p><small>{health?.alerts.destination||"—"}</small><p>{tr("Active OAuth tokens","有效 OAuth Token")} <b>{health?.account.activeTokens??"—"}</b></p></article>
 </div>
 <div className="adminIncidents"><h3>{tr("Recent recorded incidents","近期服务异常")}</h3>{health?.incidents.map(i=><article key={i.id}><span>{i.severity.toUpperCase()}</span><strong>{i.method||""} {i.path||i.kind}</strong><p>{i.message}</p><small>{time(i.created_at)} · {i.status_code||"ERR"} {i.colo||""}</small></article>)}{health?.incidents.length===0&&<div className="adminNoData">{tr("No incidents recorded.","暂无服务异常记录。")}</div>}{!health&&<div className="adminNoData">{tr("Waiting for service metrics.","等待服务指标。")}</div>}</div>
 </section>;
}

export function AdminConsole({preview=false}:{preview?:boolean}){
 const {tr,locale}=useI18n();
 const [section,setSection]=useState<Section>("overview");
 const [ops,setOps]=useState<Operations|null>(null);
 const [health,setHealth]=useState<Health|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 async function refresh(){
  if(preview)return;
  setLoading(true);try{
    const [a,b]=await Promise.allSettled([readJson<Operations>("/api/admin/operations?page=0"),readJson<Health>("/api/monitor")]);
    if(a.status==="fulfilled")setOps(a.value);if(b.status==="fulfilled")setHealth(b.value);
    setError(a.status==="rejected"||b.status==="rejected"?tr("Some metrics are unavailable. Check permissions or migration status.","部分数据不可用，请检查权限和迁移状态。"):"");
  }finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[preview]);
 const nav:Array<{key:Section;en:string;zh:string}>=[{key:"overview",en:"Overview",zh:"总览"},{key:"leads",en:"Leads & Feedback",zh:"线索与反馈"},{key:"operations",en:"Users & Operations",zh:"用户与运营"},{key:"health",en:"Service Health",zh:"服务健康"}];
 return <div className="adminShell">
   <aside className="adminSidebar"><a className="adminBrand" href="/"><img src="/remote-arc.svg" width="33" height="33" alt=""/><span>Remote Arc<small>ADMIN / INTERNAL</small></span></a><nav aria-label={tr("Admin sections","管理员菜单")}>{nav.map(n=><button type="button" key={n.key} aria-current={section===n.key?"page":undefined} onClick={()=>setSection(n.key)}>{tr(n.en,n.zh)} <span>↗</span></button>)}</nav><a className="adminBackToApp" href="https://mcp.remotearc.app/overview">← {tr("User Dashboard","用户控制台")}</a></aside>
   <main className="adminContent">
     <div className="adminTopbar"><span>{tr("PRIVATE WORKSPACE · OWNER ACCESS", "内部管理空间 · 管理员权限")}</span><button onClick={()=>void refresh()} disabled={loading}>{loading?tr("Refreshing…","刷新中…"):tr("Refresh data","刷新数据")} ↻</button></div>
     <header className="adminHeading"><span>REMOTE ARC / CONTROL CENTER</span><h1>{section==="overview"?tr("Business overview","运营总览"):nav.find(n=>n.key===section)?.[locale==="zh"?"zh":"en"]||section}</h1><p>{tr("Business, infrastructure and customer operations — separate from your users' device Dashboard.","将商业运营、基础设施和客户管理与用户自己的设备控制台分开。")}</p></header>
     {preview&&<p className="adminPreviewNote" role="status">{tr("UI preview — live operational data and submissions are intentionally unavailable.","UI 预览环境：真实运营数据与表单记录未连接。")}</p>}
     {error&&<p className="adminAlert">{error}</p>}
     {section==="overview"&&<>
      <div className="adminMetrics"><div><span>{tr("Registered users","注册用户")}</span><strong>{ops?.totals.users??"—"}</strong><small>{tr("Real account records","实际账号数据")}</small></div><div><span>{tr("Devices","已连接设备")}</span><strong>{ops?.totals.devices??"—"}</strong><small>{tr("Active device records","有效设备记录")}</small></div><div><span>{tr("Monthly MCP calls","本月 MCP 调用")}</span><strong>{ops?.totals.monthlyCalls??"—"}</strong><small>{tr("Actual usage","真实调用量")}</small></div><div><span>{tr("Service status","服务状态")}</span><strong>{health?.status||"—"}</strong><small>{tr("Worker + dependencies","Worker 与依赖")}</small></div></div>
      <section className="adminRevenue"><div><span>{tr("COMMERCIAL METRICS","商业指标")}</span><h2>{tr("Revenue intelligence","营收数据")}</h2><p>{tr("We only show payment-backed figures. No real checkout or settled orders exist in the current product, so GMV and MRR are not available yet.","商业数据必须来自真实支付和订单。当前产品尚未接入完整支付闭环，因此暂不提供 GMV 或 MRR 金额。")}</p></div><div className="adminRevenueStats"><div><span>GMV</span><strong>N/A</strong><small>{tr("Payment ledger not connected","尚未连接支付流水")}</small></div><div><span>MRR</span><strong>N/A</strong><small>{tr("Subscriptions not live","订阅尚未上线")}</small></div><div><span>{tr("Paying customers","付费客户")}</span><strong>N/A</strong><small>{tr("Awaiting billing integration","等待 Billing 集成")}</small></div></div></section>
      <div className="adminQuickActions"><button onClick={()=>setSection("leads")}>{tr("Review leads & feedback","查看线索和反馈")} ↗</button><button onClick={()=>setSection("operations")}>{tr("Manage accounts","管理用户账户")} ↗</button><button onClick={()=>setSection("health")}>{tr("Inspect service health","查看服务健康")} ↗</button></div>
     </>}
     {section==="leads"&&(preview?<div className="adminNoData">{tr("Preview mode: submissions are not connected.","预览环境：尚未连接真实记录。")}</div>:<LeadsPanel/>)}
     {section==="operations"&&(preview?<div className="adminNoData">{tr("Preview mode: user operations are not connected.","预览环境：尚未连接用户数据。")}</div>:<AdminOperations/>)}
     {section==="health"&&<HealthPanel health={health} loading={loading} reload={()=>void refresh()}/>}
   </main>
 </div>;
}
