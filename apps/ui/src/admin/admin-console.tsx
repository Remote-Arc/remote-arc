import { useEffect, useState } from "react";
import { useI18n } from "../i18n.js";
import { AdminOperations } from "../admin-operations.js";
import "./admin-console.css";

type Section="overview"|"leads"|"operations"|"health";
type Submission={id:string;category:"early_access"|"feedback";email:string;name:string;message:string;source:string;status:string;consent_at:string;created_at:string;updated_at:string};
type LeadsResponse={items:Submission[];total:number;page:number;pageSize:number;counts:Array<{category:string;count:number}>};
type Operations={checkedAt?:string;totals:{users:number;devices:number;online:number;monthlyCalls:number;auditLast7d:number};activity?:Array<{hour:string;calls:number;users:number}>};
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

function AdminGlyph({name}:{name:Section|"arrow"|"refresh"|"shield"|"pulse"}){
 const paths:Record<Section|"arrow"|"refresh"|"shield"|"pulse",string>={
  overview:"M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  leads:"M3 6h18v13H3zM3 13h5l2 3h4l2-3h5",
  operations:"M16 20v-2a4 4 0 0 0-4-4H4a4 4 0 0 0-4 4v2M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8h5M21.5 5.5v5M18 14h6m-3-3v6",
  health:"M3 12h4l3-6 4 12 3-6h4",
  arrow:"M5 12h14m-6-6 6 6-6 6",
  refresh:"M20 7v5h-5M4 17v-5h5M5.8 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.2-3",
  shield:"M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6zM8 12l3 3 5-6",
  pulse:"M3 12h5l3-6 3 12 3-6h4",
 };
 return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d={paths[name]}/></svg>;
}
function MiniActivity({ops}:{ops:Operations|null}){
 const {tr}=useI18n();
 const values=(ops?.activity||[]).slice(-48);
 const max=Math.max(1,...values.map(x=>x.calls));
 return <section className="adminActivityCard">
  <div className="adminPanelTitle"><div><span className="adminSmallLabel">{tr("WORKLOAD · LAST 48 HOURS","工作量 · 最近 48 小时")}</span><h2>{tr("Tool execution activity","工具调用趋势")}</h2><p>{tr("Real hourly audit counts · UTC","来自真实审计记录 · UTC 小时")}</p></div><span className="adminPanelIndicator">{tr("Live source","真实数据")}</span></div>
  <div className="adminActivityChart" role="img" aria-label={tr("Hourly tool call activity for the past 48 hours","最近48小时工具调用情况")}>
   {values.length?values.map(x=><div key={x.hour} className="adminActivityBar" title={x.hour+" · "+x.calls} style={{height:Math.max(4,Math.round(100*x.calls/max))+"%"}} />):<div className="adminEmptyChart">{tr("No activity metrics loaded yet.","尚未加载活动数据。")}</div>}
  </div>
  <div className="adminChartFooter"><span>{tr("48h ago","48 小时前")}</span><span>{tr("Now","现在")}</span></div>
 </section>;
}
function AdminOverview({ops,health,leadOverview,setSection}:{ops:Operations|null;health:Health|null;leadOverview:LeadsResponse|null;setSection:(s:Section)=>void}){
 const {tr}=useI18n();
 const userCount=ops?.totals.users;
 const activeCount=ops?.totals.online;
 const leadsCount=leadOverview?.total;
 const errors=health?.worker.errors24h;
 const metrics=[
  {label:tr("Registered users","注册用户"),value:userCount,caption:tr("All accounts","累计账户"),icon:"operations" as const},
  {label:tr("Online devices","在线设备"),value:activeCount,caption:ops?tr("of ","共 ") + ops.totals.devices + tr(" registered"," 台已注册") : tr("Verified live connections","验证过的实时连接"),icon:"pulse" as const},
  {label:tr("Customer requests","用户申请与反馈"),value:leadsCount,caption:tr("Explicitly submitted","用户主动提交"),icon:"leads" as const},
  {label:tr("Monthly MCP calls","本月 MCP 调用"),value:ops?.totals.monthlyCalls,caption:tr("Actual recorded usage","实际记录的调用量"),icon:"overview" as const}
 ];
 return <div className="adminOverview">
  <div className="adminOverviewLead"><div><span className="adminSmallLabel">{tr("YOUR BUSINESS AT A GLANCE","业务概况")}</span><h2>{tr("The numbers that matter.","从重要数据开始。")}</h2></div><span className="adminDataOrigin"><span className="adminDataDot"/>{tr("Operational data","运营数据")}</span></div>
  <div className="adminMetrics">{metrics.map(m=><article className="adminMetricCard" key={m.label}><div className="adminMetricHead"><span>{m.label}</span><AdminGlyph name={m.icon}/></div><strong>{m.value===undefined?"—":m.value.toLocaleString()}</strong><small>{m.caption}</small></article>)}</div>
  <div className="adminDashboardGrid">
   <MiniActivity ops={ops}/>
   <div className="adminSnapshot">
    <div className="adminPanelTitle"><span className="adminSmallLabel">{tr("REQUIRES ATTENTION","重点关注")}</span><h2>{tr("Today’s pulse","今日运营状态")}</h2></div>
    <div className="adminSnapshotRow"><span className={"adminHealthLight "+(health?.status==="operational"?"healthy":"")}><AdminGlyph name="pulse"/></span><div><strong>{tr("Infrastructure","基础设施")}</strong><small>{health?.status==="operational"?tr("All systems operational","服务运行正常"):health?.status==="degraded"?tr("Degraded — inspect incidents","服务异常，需要检查"):tr("Status unavailable","暂无健康状态")}</small></div><button onClick={()=>setSection("health")} aria-label={tr("Open service health","查看服务健康")}><AdminGlyph name="arrow"/></button></div>
    <div className="adminSnapshotRow"><span className="adminHealthLight"><AdminGlyph name="leads"/></span><div><strong>{tr("Early access & feedback","抢先体验与反馈")}</strong><small>{leadsCount===undefined?"—":leadsCount.toLocaleString()} {tr("total submissions","条用户提交")}</small></div><button onClick={()=>setSection("leads")} aria-label={tr("Open leads and feedback","查看线索和反馈")}><AdminGlyph name="arrow"/></button></div>
    <div className="adminSnapshotRow"><span className="adminHealthLight"><AdminGlyph name="shield"/></span><div><strong>{tr("Worker errors · 24 hours","Worker 错误 · 24 小时")}</strong><small>{errors===undefined?"—":errors.toLocaleString()} {tr("recorded errors","次记录异常")}</small></div><button onClick={()=>setSection("health")} aria-label={tr("Open incidents","查看异常记录")}><AdminGlyph name="arrow"/></button></div>
   </div>
  </div>
  <section className="adminCommerce">
   <div className="adminCommerceCopy"><span className="adminSmallLabel">{tr("REVENUE & BILLING","营收与计费")}</span><h2>{tr("Financial clarity starts with real payments.","真实收入，才是有效数据。")}</h2><p>{tr("GMV, recurring revenue and paying customers will appear when verified payment and subscription events exist. Until then, nothing is estimated or fabricated.","只有接入经过验证的真实支付与订阅事件，才会展示 GMV、MRR 和付费客户数量。当前不以注册数、试用额度或调用量虚构收入。")}</p></div>
   <div className="adminCommerceKpis">{["GMV","MRR",tr("Paying customers","付费客户")].map(x=><div key={x}><span>{x}</span><strong>—</strong><small>{tr("Billing not connected","尚未接入真实支付")}</small></div>)}</div>
  </section>
 </div>;
}

export function AdminConsole({preview=false}:{preview?:boolean}){
 const {tr,locale}=useI18n();
 const [section,setSection]=useState<Section>("overview");
 const [ops,setOps]=useState<Operations|null>(null);
 const [leadOverview,setLeadOverview]=useState<LeadsResponse|null>(null);
 const [health,setHealth]=useState<Health|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 async function refresh(){
  if(preview)return;
  setLoading(true);
  try{
   const [a,b,c]=await Promise.allSettled([readJson<Operations>("/api/admin/operations?page=0"),readJson<Health>("/api/monitor"),readJson<LeadsResponse>("/api/admin/submissions?category=all&page=0")]);
   if(a.status==="fulfilled")setOps(a.value);
   if(b.status==="fulfilled")setHealth(b.value);
   if(c.status==="fulfilled")setLeadOverview(c.value);
   setError(a.status==="rejected"||b.status==="rejected"||c.status==="rejected"?tr("Some metrics could not be loaded. Your other data is still available.","部分数据暂时无法加载，其余数据仍然可以查看。"):"");
  }finally{setLoading(false);}
 }
 useEffect(()=>{void refresh();},[preview]);
 const nav:Array<{key:Section;en:string;zh:string}>=[
  {key:"overview",en:"Overview",zh:"业务总览"},
  {key:"leads",en:"Leads & feedback",zh:"线索与反馈"},
  {key:"operations",en:"Users & operations",zh:"用户与运营"},
  {key:"health",en:"Service health",zh:"服务健康"}
 ];
 const current=nav.find(x=>x.key===section)!;
 return <div className="adminShell">
  <aside className="adminSidebar">
   <a className="adminBrand" href="/"><span className="adminBrandSymbol"><img src="/remote-arc.svg" width="38" height="38" alt=""/></span><span>Remote Arc<small>ADMIN CONSOLE</small></span></a>
   <div className="adminSidebarGroup"><span className="adminSidebarKicker">{tr("WORKSPACE","工作空间")}</span><nav aria-label={tr("Admin sections","管理员菜单")}>{nav.map(n=><button type="button" key={n.key} aria-current={section===n.key?"page":undefined} onClick={()=>setSection(n.key)}><AdminGlyph name={n.key}/><span>{tr(n.en,n.zh)}</span><AdminGlyph name="arrow"/></button>)}</nav></div>
   <div className="adminSidebarBottom"><div className="adminOwnerChip"><span><AdminGlyph name="shield"/></span><div><strong>{tr("Administrator","管理员工作区")}</strong><small>{tr("Protected access","受保护的访问")}</small></div></div><a className="adminBackToApp" href="https://mcp.remotearc.app/overview">← {tr("Customer dashboard","用户控制台")}</a></div>
  </aside>
  <main className="adminContent">
   <div className="adminTopbar"><div className="adminBreadcrumb">Remote Arc <span>/</span> Admin <span>/</span> <strong>{tr(current.en,current.zh)}</strong></div><div className="adminTopActions"><span className="adminTopPrivate"><AdminGlyph name="shield"/>{tr("Private console","私有后台")}</span><button type="button" onClick={()=>void refresh()} disabled={loading||preview}><AdminGlyph name="refresh"/>{loading?tr("Refreshing","刷新中"):tr("Refresh","刷新数据")}</button></div></div>
   <header className="adminHeading"><span className="adminSmallLabel">{tr("OPERATIONS CENTER","运营工作台")}</span><h1>{section==="overview"?tr("Good to see you. Here's the big picture.","运营数据，一目了然。"):tr(current.en,current.zh)}</h1><p>{section==="overview"?tr("A clear view of product adoption, real activity and infrastructure health.","集中查看产品增长、真实使用情况和基础设施健康状态。"):section==="leads"?tr("Follow up on the people who actually reached out.","了解并跟进每一条用户主动提交的申请与反馈。"):section==="operations"?tr("Manage accounts, connected devices, capacity and costs.","管理用户账户、连接设备、用量配额和成本。"):tr("Keep the service stable, with evidence rather than guesswork.","以真实基础设施指标及时识别服务问题。")}</p></header>
   {preview&&<div className="adminPreviewNote" role="status">{tr("Design preview. No customer or billing data is connected here.","设计预览环境，不连接真实客户与账单数据。")}</div>}
   {error&&<div className="adminAlert" role="alert">{error}</div>}
   {section==="overview"&&<AdminOverview ops={ops} health={health} leadOverview={leadOverview} setSection={setSection}/>}
   {section==="leads"&&(preview?<div className="adminNoData">{tr("Preview mode: private submissions are not loaded.","预览环境不加载真实反馈记录。")}</div>:<LeadsPanel/>)}
   {section==="operations"&&(preview?<div className="adminNoData">{tr("Preview mode: private account operations are not loaded.","预览环境不加载真实用户数据。")}</div>:<AdminOperations/>)}
   {section==="health"&&<HealthPanel health={health} loading={loading} reload={()=>void refresh()}/>}
  </main>
 </div>;
}
