import { useState } from "react";
import { DOC_TOPICS, docTopic } from "../../../packages/docs/src/catalog.js";
import { Documentation } from "./product-docs.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { useI18n } from "./i18n.js";
import "./docs-portal.css";
const groups=[{id:"start",en:"Get started",zh:"开始使用"},{id:"work",en:"Get work done",zh:"执行工作"},{id:"understand",en:"Understand the platform",zh:"了解平台"}];
export function DocsPortal({path}:{path:string}){
 const{tr,locale}=useI18n(),[query,setQuery]=useState(""),[navOpen,setNavOpen]=useState(false);
 const href=(value:string)=>localizedWebsiteHref(value,locale),topic=docTopic(path);
 const filtered=DOC_TOPICS.filter(item=>(item.title.en+" "+item.title.zh+" "+item.description.en+" "+item.description.zh).toLowerCase().includes(query.trim().toLowerCase()));
 if(path==="/docs")return <main className="docsHub"><header><span className="eyebrow">REMOTE ARC / DOCUMENTATION</span><h1>{tr("From your first connection to real work.","从首次连接，到完成工作。")}</h1><p>{tr("Find the guide for your next step: connect your AI, manage devices, use Apps or continue a saved task.","找到下一步所需的指南：连接 AI、管理设备、使用 Apps，或继续保存的任务。")}</p></header>
 <div className="docsHubStart"><div><span>{tr("START HERE","从这里开始")}</span><h2>{tr("One connection. Your choice of AI.","连接一次，AI 由你选择。")}</h2><p>{tr("Set up Connect, then choose the devices and cloud accounts your AI can use.","配置 Connect，再选择 AI 可以使用的设备和云端账号。")}</p></div><a className="primaryButton" href={href("/docs/connect")}>{tr("Connect your AI","连接你的 AI")} →</a></div>
 <label className="docsHubSearch">{tr("Find a guide","查找指南")}<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr("Search documentation…","搜索文档…")}/></label>
 {groups.map(group=>{const items=filtered.filter(item=>item.group===group.id);return items.length?<section className="docsHubGroup" key={group.id}><h2>{tr(group.en,group.zh)}</h2><div>{items.map(item=><a key={item.slug} href={href("/docs/"+item.slug)}><span className="docsHubArrow" aria-hidden="true">↗</span><h3>{tr(item.title.en,item.title.zh)}</h3><p>{tr(item.description.en,item.description.zh)}</p></a>)}</div></section>:null;})}
 {!filtered.length&&<p role="status">{tr("No guides match your search.","没有匹配的指南。")}</p>}
 <nav className="docsHubReference" aria-label={tr("More references","更多参考")}><a href={href("/docs/mcp")}>{tr("MCP reference","MCP 参考")} ↗</a><a href={href("/docs/long-running-work")}>{tr("Long-running work","持续工作指南")} ↗</a><a href={href("/install")}>{tr("Installation guides","安装指南")} ↗</a></nav>
 </main>;
 if(!topic)return <main className="technicalDoc"><h1>{tr("Guide not found","未找到指南")}</h1><a href={href("/docs")}>{tr("All documentation","全部文档")} →</a></main>;
 return <div className="docsPortal"><aside><a className="docsPortalHome" href={href("/docs")}>← {tr("All documentation","全部文档")}</a><button type="button" className="docsPortalToggle" aria-expanded={navOpen} aria-controls="docsTopicNavigation" onClick={()=>setNavOpen(value=>!value)}>{tr("Browse topics","浏览主题")} <span aria-hidden="true">{navOpen?"−":"+"}</span></button><nav id="docsTopicNavigation" className="docsPortalTopicNav" data-expanded={navOpen} aria-label={tr("Documentation topics","文档主题")}>{groups.map(group=><div key={group.id}><strong>{tr(group.en,group.zh)}</strong>{DOC_TOPICS.filter(item=>item.group===group.id).map(item=><a key={item.slug} href={href("/docs/"+item.slug)} aria-current={item.slug===topic.slug?"page":undefined}>{tr(item.title.en,item.title.zh)}</a>)}</div>)}</nav></aside>
 <div className="docsPortalContent">
 {topic.sections?<main className="technicalDoc"><header className="articleHeader"><span className="eyebrow">{tr("DOCUMENTATION","文档")}</span><h1>{tr(topic.title.en,topic.title.zh)}</h1><p>{tr(topic.description.en,topic.description.zh)}</p></header><article className="technicalArticle">{topic.sections.map((section,index)=><section key={index}><h2>{tr(section.heading.en,section.heading.zh)}</h2><p>{tr(section.text.en,section.text.zh)}</p></section>)}</article></main>:<Documentation sectionIds={topic.legacyIds} title={tr(topic.title.en,topic.title.zh)} description={tr(topic.description.en,topic.description.zh)}/>}
 {topic.links&&<nav className="docsPortalRelated" aria-label={tr("Related guides","相关指南")}>{topic.links.map(([url,en,zh])=><a key={url} href={href(url!)}>{tr(en!,zh!)} ↗</a>)}</nav>}
 <footer className="docsPortalFooter"><a href={href("/docs")}>← {tr("Documentation","文档")}</a><a href={href("/docs/"+DOC_TOPICS[(DOC_TOPICS.indexOf(topic)+1)%DOC_TOPICS.length]!.slug)}>{tr("Next guide","下一篇指南")} →</a></footer>
 </div></div>;
}
