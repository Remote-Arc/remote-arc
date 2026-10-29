type Copy = readonly [string,string];
type Trace = {tool:"list_apps"|"call_app"; provider?:string; input:Record<string,unknown>; output:Copy; working:Copy};
export type AppWorkflowExample={id:string;connectionProvider:string;label:Copy;title:Copy;request:Copy;result:Copy;permission:Copy;brands:{brand:string;name:string}[];traces:Trace[]};
const ids={github:"11111111-1111-4111-8111-111111111111",vercel:"22222222-2222-4222-8222-222222222222",slack:"33333333-3333-4333-8333-333333333333",google_drive:"55555555-5555-4555-8555-555555555555",notion:"66666666-6666-4666-8666-666666666666"};
const call=(provider:keyof typeof ids,operation:string,args:Record<string,unknown>,requestId:string)=>({connectionId:ids[provider],operation,arguments:args,requestId});
export const APP_WORKFLOW_EXAMPLES:readonly AppWorkflowExample[]=[
 {id:"release",connectionProvider:"vercel",label:["GitHub + Vercel","GitHub + Vercel"],title:["Know what shipped. Catch what didn’t.","哪些已发布，哪些卡住了，一眼掌握。"],
 request:["“Check our merged GitHub PRs against the latest Vercel deployments, then post a release update with source links to our Slack channel.”","“对照 GitHub 已合并的 PR 和最新 Vercel 部署，把附有来源链接的发布进展发到 Slack 频道。”"],
 result:["Four merged PRs checked, one failing preview identified, and a release update posted to Slack with source links.","已核对 4 个合并 PR，发现 1 个失败的预览部署，并将附有来源链接的发布进展发到 Slack。"],
 permission:["Connected GitHub, Vercel and Slack accounts","已授权的 GitHub、Vercel 与 Slack 账号"],
 brands:[{brand:"github",name:"GitHub"},{brand:"vercel",name:"Vercel"},{brand:"slack",name:"Slack"}],
 traces:[
  {tool:"list_apps",input:{provider:"vercel"},output:["Vercel account and available operation schemas found","已找到 Vercel 账号与可用操作"],working:["Checking connected deployment tools…","正在检查部署工具连接…"]},
  {tool:"call_app",provider:"github",input:call("github","pulls.list",{repo:"team/product",state:"closed",limit:30},"demo-release-prs"),output:["4 merged pull requests · source links retained","4 个已合并 PR · 保留来源链接"],working:["Reading merged changes and their source links…","正在读取合并记录与来源链接…"]},
  {tool:"call_app",provider:"vercel",input:call("vercel","deployments.list",{projectId:"example-project",limit:5},"demo-release-deployments"),output:["Production: READY · latest preview: ERROR","生产部署：READY · 最新预览：ERROR"],working:["Cross-checking deployment status…","正在交叉核对部署状态…"]},
  {tool:"call_app",provider:"slack",input:call("slack","messages.send",{channel:"C_PRODUCT",text:"Release review: four merged PRs. Production is ready; one preview needs investigation. Sources: https://github.com/example/product/pulls and https://vercel.com/example/product/deployments"},"demo-release-update"),output:["Message posted to #product · source links included","消息已发送至 #product · 已附来源链接"],working:["Posting the release update and source links to Slack…","正在将发布进展与来源链接发到 Slack…"]},
 ]},
 {id:"knowledge",connectionProvider:"google_drive",label:["Drive + Notion","Drive + Notion"],title:["Turn scattered files into shared knowledge.","把散落的资料，变成团队知识。"],
 request:["“Find the launch brief in Google Drive, summarize the decisions and next steps, and create a Notion page with a link to the source.”","“找到 Google Drive 里的发布资料，提炼决策与下一步，并创建一篇附有原文链接的 Notion 页面。”"],
 result:["Created a Notion page with the launch decisions, next steps and a link back to the original Drive document.","已创建 Notion 页面，包含发布决策、下一步，以及 Google Drive 原文链接。"],
 permission:["Connected Google Drive and Notion accounts","已授权的 Google Drive 与 Notion 账号"],
 brands:[{brand:"googledrive",name:"Google Drive"},{brand:"notion",name:"Notion"}],
 traces:[
  {tool:"list_apps",input:{provider:"google_drive"},output:["Google Drive account and document operations found","已找到 Google Drive 账号与文档操作"],working:["Finding the authorized document tools…","正在查找已授权的文档工具…"]},
  {tool:"call_app",provider:"google_drive",input:call("google_drive","files.list",{query:"mimeType = 'application/vnd.google-apps.document' and name contains 'Launch'",limit:5},"demo-knowledge-find"),output:["Launch brief found · original document link retained","找到发布资料 · 保留原文链接"],working:["Locating the launch brief…","正在定位发布资料…"]},
  {tool:"call_app",provider:"google_drive",input:call("google_drive","files.exportText",{id:"example-launch-document"},"demo-knowledge-read"),output:["Original brief read · decisions and next steps extracted","已读取原始资料 · 提炼决策与下一步"],working:["Reading the source and organizing the summary…","正在读取来源并整理摘要…"]},
  {tool:"call_app",provider:"notion",input:call("notion","pages.create",{parentPageId:"77777777-7777-4777-8777-777777777777",title:"Launch decisions and next steps",text:"Source: https://docs.google.com/document/d/example-launch-document\nDecision: ship the approved release after preview checks pass.\nNext: investigate the failing preview and review the launch checklist."},"demo-knowledge-page"),output:["Notion page created · source link and next steps saved","Notion 页面已创建 · 来源链接与下一步已保存"],working:["Creating the Notion page with its source and action items…","正在创建包含来源与行动项的 Notion 页面…"]},
 ]},
];
export const findAppWorkflow=(id:string)=>APP_WORKFLOW_EXAMPLES.find(example=>example.id===id);
export const translateCopy=(copy:Copy,tr:(en:string,zh:string)=>string)=>tr(copy[0],copy[1]);
