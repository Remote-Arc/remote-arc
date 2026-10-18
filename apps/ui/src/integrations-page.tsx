import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import directory from "./app-directory.json" with { type: "json" };
import "./integrations-page.css";
type Availability={enabled:boolean;providers:{provider:string;ready:boolean}[]};
type AvailabilityState={state:"loading"}|{state:"unavailable"}|{state:"loaded";data:Availability};
function validAvailability(value:unknown):value is Availability{
 if(!value||typeof value!=="object")return false;
 const item=value as Partial<Availability>;
 return typeof item.enabled==="boolean"&&Array.isArray(item.providers)&&item.providers.every(provider=>provider&&typeof provider.provider==="string"&&typeof provider.ready==="boolean");
}
export function IntegrationsPage(){
 const {tr,locale}=useI18n();
 const params=new URLSearchParams(window.location.search),initialCategory=params.get("category");
 const[category,setCategory]=useState(()=>directory.categories.some(item=>item.id===initialCategory)?initialCategory!:"all");
 const[query,setQuery]=useState(""),[selectedProvider,setSelectedProvider]=useState(()=>params.get("provider")||"");
 const[availability,setAvailability]=useState<AvailabilityState>({state:"loading"}),[refresh,setRefresh]=useState(0);
 const detailRef=useRef<HTMLElement>(null),catalogRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let active=true;const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),8000);
  setAvailability({state:"loading"});
  void fetch("https://mcp.remotearc.app/api/apps/status",{credentials:"omit",signal:controller.signal,headers:{accept:"application/json"}})
   .then(async response=>{if(!response.ok)throw Error("unavailable");const data:unknown=await response.json();if(!validAvailability(data))throw Error("unavailable");if(active)setAvailability({state:"loaded",data});})
   .catch(()=>{if(active)setAvailability({state:"unavailable"});}).finally(()=>window.clearTimeout(timer));
  return()=>{active=false;window.clearTimeout(timer);controller.abort();};
 },[refresh]);
 const filtered=directory.apps.filter(app=>(category==="all"||app.category===category)&&(app.name+" "+app.provider).toLowerCase().includes(query.trim().toLowerCase()));
 const selected=filtered.find(app=>app.provider===selectedProvider)||filtered[0];
 const unknownProvider=Boolean(selectedProvider&&!directory.apps.some(app=>app.provider===selectedProvider));
 const ready=selected&&availability.state==="loaded"&&availability.data.enabled&&availability.data.providers.some(item=>item.provider===selected.provider&&item.ready);
 function updateUrl(nextCategory:string,provider?:string){
  const url=new URL(window.location.href);url.searchParams.delete("category");url.searchParams.delete("provider");
  if(nextCategory!=="all")url.searchParams.set("category",nextCategory);if(provider)url.searchParams.set("provider",provider);
  history.replaceState(null,"",url.pathname+url.search+url.hash);
 }
 function chooseCategory(value:string){setCategory(value);setQuery("");setSelectedProvider("");updateUrl(value);}
 function chooseProvider(provider:string){setSelectedProvider(provider);updateUrl(category,provider);if(window.matchMedia("(max-width:860px)").matches)detailRef.current?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth"});}
 return <main className="integrationsPage">
 <header className="integrationsHero"><a href={localizedWebsiteHref("/#apps",locale)}>← {tr("Back to Remote Arc","返回 Remote Arc")}</a><span className="eyebrow">REMOTE ARC CONNECT / APPS</span><h1>{tr("Explore your integrations.","探索你的应用连接。")}</h1><p>{tr("Find an app, see what your AI can actually do, and check what you need to connect. Apps work through Connect independently of Arc Agent.","找到应用，查看 AI 实际能做什么，以及连接前需要准备什么。Apps 通过 Connect 工作，独立于 Arc Agent 发布。")}</p><span className="integrationsCount">{directory.apps.length} {tr("native integrations","个原生集成")} · {directory.categories.length} {tr("categories","个类别")}</span></header>
 <div className="integrationsLayout"><div className="integrationsCatalog" ref={catalogRef}>
 <label className="integrationsSearch">{tr("Find an app","查找应用")}<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr("Search apps…","搜索应用…")}/></label>
 <div className="integrationsFilters" role="group" aria-label={tr("App categories","应用分类")}><button type="button" aria-pressed={category==="all"} onClick={()=>chooseCategory("all")}>{tr("All apps","全部应用")}</button>{directory.categories.map(item=><button type="button" key={item.id} aria-pressed={category===item.id} onClick={()=>chooseCategory(item.id)}>{tr(item.name,item.nameZh)}</button>)}</div>
 {unknownProvider&&<p className="integrationsNotice" role="status">{tr("That app is not in the current catalog. Choose an integration below.","当前目录中没有这个应用，请从下面选择。")}</p>}
 <p className="integrationsResults">{filtered.length} {tr("integrations","个集成")}</p>
 <ul className="integrationsGrid">{filtered.map(app=><li key={app.provider}><button type="button" data-provider={app.provider} aria-pressed={selected?.provider===app.provider} onClick={()=>chooseProvider(app.provider)}><span className="integrationsBrand" data-brand={app.brand}><img src={"/app-brands/"+app.brand+".svg"} alt="" width="30" height="30"/></span><span><strong>{app.name}</strong><small>{app.operationCount} {tr("operations","项操作")}</small></span><span className="integrationsSelectArrow" aria-hidden="true">↗</span></button></li>)}</ul>
 {!filtered.length&&<p className="integrationsNotice" role="status">{tr("No apps match your search.","没有匹配的应用。")}</p>}
 </div>
 <aside className="integrationDetail" ref={detailRef} aria-label={tr("Selected integration details","所选应用详情")}>
 {selected?<><header><span className="integrationsBrand" data-brand={selected.brand}><img src={"/app-brands/"+selected.brand+".svg"} alt="" width="40" height="40"/></span><div><span className="eyebrow">{selected.auth==="api_key"?tr("YOUR API ACCOUNT","你的 API 账号"):tr("ACCOUNT AUTHORIZATION","账号授权")}</span><h2>{selected.name}</h2></div></header>
 <section className="integrationAvailability" aria-live="polite"><h3>{tr("Connection availability","连接开放状态")}</h3>
 {availability.state==="loading"?<p role="status">{tr("Checking the connection service…","正在检查连接服务…")}</p>:ready?<><p>{tr("This integration is ready for account authorization. Sign in to choose your own account and permissions.","此集成已开放账号授权。登录后选择你自己的账号与权限。")}</p><a className="primaryButton" href={"https://agent.remotearc.app/apps?provider="+encodeURIComponent(selected.provider)}>{tr("Connect your account","连接你的账号")} ↗</a></>:<><p>{availability.state==="unavailable"?tr("Account connections are not available here yet. You can explore the supported operations below; connection availability could not be confirmed.","账号连接服务暂不可用。你可以先查看下面支持的操作；目前尚无法确认连接开放状态。"):availability.data.enabled?tr("Remote Arc needs to complete this provider's setup before you can authorize your account.","Remote Arc 需要先完成此平台的接入配置，你才能授权自己的账号。"):tr("App connections are being prepared. Account authorization opens after platform setup and verification.","应用连接正在准备中。平台配置与验收完成后，将开放账号授权。")}</p><button type="button" disabled>{tr("Connection setup pending","等待连接配置")}</button>{availability.state==="unavailable"&&<button className="integrationRetry" type="button" onClick={()=>setRefresh(value=>value+1)}>{tr("Check again","重新检查")}</button>}</>}
 </section>
 <section className="integrationSetup"><h3>{tr("What you need","连接前准备")}</h3><p>{selected.auth==="api_key"?tr("Use an API key or access token from your own provider account. Enter it only in the signed-in Apps page.","使用你自己的服务账号提供的 API 密钥或访问令牌，仅在登录后的 Apps 页面填写。"):tr("Authorize your own account on the provider's consent page. Remote Arc manages the platform OAuth application.","在平台的授权页面授权你自己的账号。平台 OAuth 应用由 Remote Arc 配置和管理。")}</p>{selected.connectionNote&&<p>{selected.connectionNote}</p>}<p>{tr("Read access is the default. Write actions also require approval of each exact request.","默认授予读取权限；每次写入还需要你审核具体请求。")}</p></section>
 <section className="integrationBilling"><h3>{tr("Usage and costs","用量与费用")}</h3><p>{selected.billingNote}</p><p>{tr("Remote Arc tool-call limits and provider API fees are separate. A web subscription may not include API usage.","Remote Arc 工具调用额度与服务商 API 费用分别计算；网页订阅不一定包含 API 用量。")}</p></section>
 <section className="integrationOperations"><h3>{tr("Supported operations","支持的操作")} <span>{selected.operationCount}</span></h3><ul>{selected.operations.map(operation=><li key={operation.name}><strong>{operation.description}</strong><code>{operation.name}</code><span data-permission={operation.permission}>{operation.permission==="write"?tr("Write · review required","写入 · 需要审核"):tr("Read","读取")}</span></li>)}</ul></section>
 <button className="integrationChooseAnother" type="button" onClick={()=>catalogRef.current?.scrollIntoView({block:"start"})}>{tr("Choose another app","选择其他应用")} ↑</button>
 </>:<p>{tr("Choose an integration to see its operations and connection requirements.","选择应用，查看操作和连接条件。")}</p>}
 </aside></div>
 </main>;
}
