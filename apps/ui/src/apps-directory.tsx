import { useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import directory from "./app-directory.json" with { type: "json" };
import "./apps-directory.css";
const examples: Record<string, [string,string][]> = {
 email_calendar:[["Find a time across my Google and Outlook calendars.","看看我的 Google 和 Outlook 日历，找出空闲时间。"],["Prepare a reply to the customer email for my review.","准备一封客户邮件回复，让我审核。"]],
 docs_files:[["Find the project notes in Drive, Notion and Confluence.","在 Drive、Notion 和 Confluence 中查找项目资料。"],["Put the reviewed figures into my Google Sheet.","把核对过的数据写入我的 Google 表格。"]],
 development:[["Read the GitHub issue and check the Vercel deployment.","读取 GitHub Issue，检查 Vercel 的部署状态。"],["Create a Jira or Linear issue with the details I approve.","根据我审核的内容创建 Jira 或 Linear 问题。"]],
 communication:[["Send the approved release update to Slack.","把审核后的发布进展发送到 Slack。"],["Send my approved WhatsApp Business template.","发送我批准的 WhatsApp Business 模板消息。"]],
 social:[["Compare views and engagement on my YouTube videos.","查看 YouTube 视频的播放与互动情况。"],["Prepare a post for X, LinkedIn or my Facebook Page.","为 X、LinkedIn 或 Facebook 主页准备一条动态。"]],
 creative:[["Show my Runway API credit balance.","查看我的 Runway API 积分余额。"],["Generate a video after I approve the prompt and credit estimate.","等我确认提示词和积分估算，再生成视频。"]],
 marketing:[["Review search queries, site traffic and campaign results.","查看搜索词、网站流量与广告效果。"],["Pause a Meta campaign after I review the exact request.","等我审核具体请求，再暂停 Meta 广告系列。"]],
 sales_commerce:[["Find the customer record in HubSpot or Salesforce.","在 HubSpot 或 Salesforce 中查找客户记录。"],["Create a Shopify product draft for me to review.","在 Shopify 创建商品草稿，让我审核。"]],
};
export function AppsDirectory({id="apps"}:{id?:string}={}){
 const {tr,locale}=useI18n(),[query,setQuery]=useState("");
 const categories=directory.categories.map(group=>({...group,apps:directory.apps.filter(app=>app.category===group.id&&(app.name+" "+app.provider+" "+group.name+" "+group.nameZh).toLowerCase().includes(query.trim().toLowerCase()))})).filter(group=>group.apps.length);
 return <section className="appsDirectory sectionBlock" id={id} aria-labelledby={id+"DirectoryTitle"}>
 <header className="modernSectionIntro"><span className="eyebrow">{tr("APPS + DEVICES · YOUR CHOICE OF AI","应用 + 设备 · AI 由你选择")}</span><h2 id={id+"DirectoryTitle"}>{tr("Your work lives everywhere. Bring it together.","工作散布各处，也能一起完成。")}</h2><p>{tr("Connect the apps you use to a compatible AI chat through Remote Arc Connect. Read, prepare and act across accounts and your own computers—with write requests reviewed by you. Arc Agent is a separate experience; Apps do not depend on its launch.","通过 Remote Arc Connect，把常用应用接入兼容的 AI 聊天。跨账号和自己的电脑读取信息、准备内容、执行操作，写入请求由你审核。Apps 独立于 Arc Agent 推进，无需等待 Agent 上线。")}</p></header>
 <div className="appsDirectoryToolbar"><span><strong>{directory.apps.length}</strong> {tr("native integrations","个原生集成")}<i> / </i>{directory.categories.length} {tr("categories","个类别")}</span><label><span className="srOnly">{tr("Search integrations","搜索集成")}</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr("Find your apps…","查找你的应用…")} /></label></div>
 <div className="appsDirectoryGrid">{categories.map(group=><article className="appsDirectoryCard" key={group.id}><header><span className="appsDirectoryIndex">{String(directory.categories.findIndex(g=>g.id===group.id)+1).padStart(2,"0")}</span><h3>{tr(group.name,group.nameZh)}</h3></header><p>{tr(group.description,group.descriptionZh)}</p><ul className="appsDirectoryExamples">{(examples[group.id] || []).map(([en,zh])=><li key={en}>{tr(en,zh)}</li>)}</ul><div className="appsDirectoryBrands">{group.apps.map(app=><a key={app.provider} href={localizedWebsiteHref("/integrations?provider="+encodeURIComponent(app.provider),locale)} title={app.name+" · "+app.operationCount+" "+tr("operations","项操作")}><span data-brand={app.brand}><img src={"/app-brands/"+app.brand+".svg"} alt="" loading="lazy" width="22" height="22"/></span>{app.name}</a>)}</div><a className="appsDirectoryExplore" href={localizedWebsiteHref("/integrations?category="+group.id,locale)}>{tr("Explore connections","查看连接")} <span aria-hidden="true">↗</span></a></article>)}</div>
 {!categories.length&&<p role="status">{tr("No integrations match your search.","没有匹配的集成。")}</p>}
 <p className="appsDirectoryFootnote">{tr("Native API integrations. Provider configuration, account eligibility and authorization are required. Provider usage fees and quotas follow the connected account or API project; web subscriptions may not include API credits.","采用原生 API 集成。连接需要平台配置、符合条件的账号与用户授权。服务用量费用及额度遵循所连接账号或 API 项目的规则；网页订阅不一定包含 API 积分。")}</p>
 </section>;
}