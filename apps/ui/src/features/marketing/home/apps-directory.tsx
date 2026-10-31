import {CreativeDirectoryPreviews} from "./local-creative-demo.js";
import {useState} from "react";
import {useI18n} from "../../../app/i18n.js";
import {localizedWebsiteHref} from "../../../lib/marketing-paths.js";
import directory from "../../../data/app-directory.json" with {type:"json"};
import "./apps-directory.css";
import "./apps-directory-compact.css";

type SkillLink={name:string;nameZh:string;href:string};
type Showcase={id:string;name:string;nameZh:string;description:string;descriptionZh:string;categories:string[];prompt:string;promptZh:string;href:string;keywords:string;skills:SkillLink[]};
const showcase:Showcase[]=[
 {id:"email_calendar",name:"Email & calendar",nameZh:"邮件与日程",description:"Catch up, draft replies and find time to meet.",descriptionZh:"整理收件箱、准备回复、安排会议。",categories:["email_calendar"],prompt:"Find a meeting time across my Google and Outlook calendars.",promptZh:"对照我的 Google 和 Outlook 日历，找个开会时间。",href:"/integrations?category=email_calendar",keywords:"email calendar 邮件 日历",skills:[]},
 {id:"docs_files",name:"Documents & data",nameZh:"文档与数据",description:"Find the source. Turn it into a useful document.",descriptionZh:"找到资料，把它变成表格、演示文稿和报告。",categories:["docs_files"],prompt:"Turn these files into an Excel report and a presentation.",promptZh:"把这些资料整理成 Excel 报告和演示文稿。",href:"/use-cases/spreadsheet-report",keywords:"word excel powerpoint ppt pdf spreadsheet 文档 表格 数据",skills:[{name:"Word",nameZh:"Word",href:"/use-cases/word-documents"},{name:"Excel",nameZh:"Excel",href:"/use-cases/spreadsheet-report"},{name:"PowerPoint",nameZh:"PowerPoint",href:"/use-cases/presentation-deck"},{name:"PDF",nameZh:"PDF",href:"/use-cases/pdf-workflows"}]},
 {id:"development",name:"Build & ship",nameZh:"开发与交付",description:"Work on code, test the interface and check deployments.",descriptionZh:"修改代码、测试界面、检查部署。",categories:["development"],prompt:"Read the GitHub issue, fix it and run the relevant checks.",promptZh:"读取 GitHub Issue，修复问题并运行相关检查。",href:"/integrations?category=development",keywords:"react frontend playwright web testing 开发 测试 网页 前端",skills:[{name:"Web testing",nameZh:"网页测试",href:"/use-cases/webapp-testing"}]},
 {id:"communication",name:"Teams & business",nameZh:"团队与业务",description:"Keep conversations, customers and campaigns moving.",descriptionZh:"串起团队沟通、客户记录与营销进展。",categories:["communication","social","marketing","sales_commerce"],prompt:"Summarize the customer updates and prepare a Slack message.",promptZh:"汇总客户进展，准备一条 Slack 团队消息。",href:"/integrations",keywords:"teams slack marketing sales social 团队 社交 营销 销售",skills:[]},
 {id:"creative",name:"Video & design",nameZh:"视频与设计",description:"Make videos, posters and illustrations on your computer.",descriptionZh:"在你的电脑上制作视频、海报与插画。",categories:[],prompt:"Edit my clips, add subtitles and export the finished video.",promptZh:"剪辑我的素材，加上字幕，导出成片。",href:"/use-cases/video-creation#video-gallery",keywords:"creative local video image poster illustration vibe remotion subtitles 本地 创意 视频 剪辑 字幕 生图 图片 海报 插画",skills:[{name:"Vibe Knowledge Film",nameZh:"Vibe 知识短片",href:"/use-cases/video-creation"},{name:"Subtitles",nameZh:"字幕转录",href:"/use-cases/audio-transcription"}]},
 {id:"research",name:"Research & thinking",nameZh:"研究与思考",description:"Compare evidence and build reusable ways to think.",descriptionZh:"比较资料与证据，沉淀可复用的思维方法。",categories:[],prompt:"Research this topic and build a reusable thinking framework.",promptZh:"研究这个主题，整理出有来源的报告和可复用思维框架。",href:"/use-cases/research-reports",keywords:"research reports nuwa thinking framework 女娲 研究 调研 报告 思维 框架",skills:[{name:"Research & Reports",nameZh:"研究报告",href:"/use-cases/research-reports"},{name:"Nuwa",nameZh:"女娲 Nuwa",href:"/use-cases/research-reports"}]},
];

export function AppsDirectory({id="apps"}:{id?:string}={}){
 const {tr,locale}=useI18n(),[query,setQuery]=useState("");
 const nativeApps=directory.apps.filter(app=>app.category!=="creative");
 const search=query.trim().toLowerCase();
 const groups=showcase.map(group=>({...group,apps:nativeApps.filter(app=>group.categories.includes(app.category))})).filter(group=>!search||[group.name,group.nameZh,group.description,group.descriptionZh,group.keywords,...group.skills.flatMap(skill=>[skill.name,skill.nameZh]),...group.apps.flatMap(app=>[app.name,app.provider])].join(" ").toLowerCase().includes(search));
 return <section className="appsDirectory sectionBlock" id={id} aria-labelledby={id+"DirectoryTitle"}>
  <header className="modernSectionIntro"><span className="eyebrow">{tr("APPS + BUILT-IN SKILLS","应用 + 内置技能")}</span><h2 id={id+"DirectoryTitle"}>{tr("Your apps. More ways to get work done.","你的应用，加上会做事的技能。")}</h2><p>{tr("Bring connected accounts, local files and built-in skills into the work you already do.","把已连接的账号、本地文件和内置技能，用进每天的工作。")}</p></header>
  <div className="appsDirectoryToolbar"><span><strong>{nativeApps.length}</strong> {tr("app integrations + built-in skills","个应用集成 + 内置技能")}</span><div className="appsDirectoryActions"><a href={localizedWebsiteHref("/integrations",locale)}>{tr("All apps","全部应用")} ↗</a><label><span className="srOnly">{tr("Search apps and skills","搜索应用与技能")}</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr("Find an app or skill…","查找应用或技能…")}/></label></div></div>
  <div className="appsDirectoryGrid">{groups.map(group=><article className="appsDirectoryCard" key={group.id} data-category={group.id}>
   <header><span className="appsDirectoryIndex">{String(showcase.findIndex(item=>item.id===group.id)+1).padStart(2,"0")}</span><h3>{tr(group.name,group.nameZh)}</h3></header>
   <p>{tr(group.description,group.descriptionZh)}</p>
   <ul className="appsDirectoryExamples"><li>{tr(group.prompt,group.promptZh)}</li></ul>
   {!!group.apps.length&&<div className="appsDirectoryBrands">{group.apps.slice(0,6).map(app=><a key={app.provider} aria-label={app.name} href={localizedWebsiteHref("/integrations?provider="+encodeURIComponent(app.provider),locale)} title={app.name}><span data-brand={app.brand}><img src={"/app-brands/"+app.brand+".svg"} alt="" loading="lazy" width="20" height="20"/></span><span className="appsDirectoryBrandName">{app.name}</span></a>)}{group.apps.length>6&&<a className="appsDirectoryMore" href={localizedWebsiteHref("/integrations",locale)} aria-label={tr("Browse all applications","浏览全部应用")}>+{group.apps.length-6}</a>}</div>}
   {!!group.skills.length&&<div className="appsDirectorySkills" aria-label={tr("Built-in skills","内置技能")}>{group.skills.map(skill=><a key={skill.name} href={localizedWebsiteHref(skill.href,locale)}>{tr(skill.name,skill.nameZh)}</a>)}</div>}
   {group.id==="creative"&&<CreativeDirectoryPreviews/>}
   <a className="appsDirectoryExplore" href={localizedWebsiteHref(group.href,locale)}>{group.skills.length?tr("Explore this workflow","查看工作流"):tr("Explore connections","查看连接")}<span aria-hidden="true">↗</span></a>
  </article>)}</div>
  {!groups.length&&<p role="status">{tr("No apps or skills match your search.","没有匹配的应用或技能。")}</p>}
  <p className="appsDirectoryFootnote">{tr("Apps use the accounts and permissions you connect. Local skills need an online computer and their supporting tools; provider usage limits and fees still apply.","应用使用你连接的账号与授权。本地技能需要在线电脑及相应工具；第三方服务的额度和费用仍按各平台规则执行。")}</p>
 </section>;
}
