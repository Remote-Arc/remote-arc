type Copy = readonly [string,string];
type Trace = {tool:"list_apps"|"call_app"; provider?:string; input:Record<string,unknown>; output:Copy; working:Copy};
export type AppWorkflowExample={id:string;label:Copy;title:Copy;request:Copy;result:Copy;permission:Copy;brands:{brand:string;name:string}[];traces:Trace[]};
const ids={github:"11111111-1111-4111-8111-111111111111",vercel:"22222222-2222-4222-8222-222222222222",slack:"33333333-3333-4333-8333-333333333333",runway:"44444444-4444-4444-8444-444444444444",google_drive:"55555555-5555-4555-8555-555555555555",notion:"66666666-6666-4666-8666-666666666666"};
const call=(provider:keyof typeof ids,operation:string,args:Record<string,unknown>,requestId:string)=>({connectionId:ids[provider],operation,arguments:args,requestId});
export const APP_WORKFLOW_EXAMPLES:readonly AppWorkflowExample[]=[
 {id:"release",label:["GitHub + Vercel","GitHub + Vercel"],title:["Know what shipped. Catch what didn’t.","哪些已发布，哪些卡住了，一眼掌握。"],
 request:["“Check our merged GitHub PRs against the latest Vercel deployments. Prepare a release update for Slack, and ask before posting.”","“对照 GitHub 已合并的 PR 和最新 Vercel 部署，整理发布进展发到 Slack。发送前让我确认。”"],
 result:["Four merged PRs, one preview that needs attention, and a Slack update waiting for your approval.","4 个已合并 PR、1 个需要关注的预览部署，以及一条等待你确认的 Slack 动态。"],
 permission:["GitHub + Vercel read · Slack write approval","读取 GitHub 与 Vercel · 写入 Slack 须审批"],
 brands:[{brand:"github",name:"GitHub"},{brand:"vercel",name:"Vercel"},{brand:"slack",name:"Slack"}],
 traces:[
  {tool:"list_apps",input:{provider:"vercel"},output:["Vercel account and available operation schemas found","已找到 Vercel 账号与可用操作"],working:["Checking connected deployment tools…","正在检查部署工具连接…"]},
  {tool:"call_app",provider:"github",input:call("github","pulls.list",{repo:"team/product",state:"closed",limit:30},"demo-release-prs"),output:["4 merged pull requests · source links retained","4 个已合并 PR · 保留来源链接"],working:["Reading merged changes and their source links…","正在读取合并记录与来源链接…"]},
  {tool:"call_app",provider:"vercel",input:call("vercel","deployments.list",{projectId:"example-project",limit:5},"demo-release-deployments"),output:["Production: READY · latest preview: ERROR","生产部署：READY · 最新预览：ERROR"],working:["Cross-checking deployment status…","正在交叉核对部署状态…"]},
  {tool:"call_app",provider:"slack",input:call("slack","messages.send",{channel:"C_PRODUCT",text:"Release review: four merged PRs. Production is ready; one preview needs investigation. Source links attached."},"demo-release-update"),output:["status: pending_approval · nothing posted","状态：等待审批 · 尚未发送消息"],working:["Preparing a sourced update for your approval…","正在准备有来源依据的动态，等待你确认…"]},
 ]},
 {id:"video",label:["Create with Runway","Runway 创作"],title:["From an idea to a production brief.","让一句创意，进入制作流程。"],
 request:["“Prepare a five-second cinematic product video in Runway. Check my API balance and show the prompt and credit estimate before generating.”","“用 Runway 准备一段 5 秒的电影感产品视频。先查看我的 API 余额，生成前让我确认提示词和积分估算。”"],
 result:["Gen-4.5 · 5 seconds · estimated 60 API credits. Your prompt and usage estimate are ready for review. No video has been generated.","Gen-4.5 · 5 秒 · 预计 60 API 积分。提示词和用量估算已准备好，等待你审核，尚未生成视频。"],
 permission:["Your Runway API account · approval before generation","使用你的 Runway API 账号 · 生成前审批"],
 brands:[{brand:"runway",name:"Runway"}],
 traces:[
  {tool:"list_apps",input:{provider:"runway"},output:["Runway API connection · usage belongs to your account","Runway API 已连接 · 用量归属你的账号"],working:["Checking your creative tools…","正在检查创作工具…"]},
  {tool:"call_app",provider:"runway",input:call("runway","organization.get",{},"demo-runway-balance"),output:["API credit balance: 1,000 · example account","API 积分余额：1,000 · 示例账号"],working:["Reading the available API credits…","正在查看可用 API 积分…"]},
  {tool:"call_app",provider:"runway",input:call("runway","videos.generate",{promptText:"Cinematic close-up of a brushed-metal product on dark stone. Soft studio light moves across the surface; slow camera push-in.",ratio:"1280:720",duration:5,maxCredits:60},"demo-runway-video"),output:["status: pending_approval · estimated 60 credits · no generation started","状态：等待审批 · 预计 60 积分 · 尚未开始生成"],working:["Preparing the prompt and credit estimate for review…","正在准备提示词与积分估算，等待审核…"]},
 ]},
 {id:"knowledge",label:["Drive + Notion","Drive + Notion"],title:["Turn scattered files into shared knowledge.","把散落的资料，变成团队知识。"],
 request:["“Find the launch brief in Google Drive. Summarize the decisions and next steps, then prepare a Notion page for my review.”","“找到 Google Drive 里的发布资料，提炼决策与下一步，准备一篇 Notion 页面给我审核。”"],
 result:["A concise Notion page grounded in the Drive document, with its source link and next steps. Creating the page waits for your approval.","依据 Drive 原文整理的 Notion 页面，包含来源链接与下一步，确认后才会创建。"],
 permission:["Google Drive read · Notion page approval","读取 Google Drive · 创建 Notion 页面须审批"],
 brands:[{brand:"googledrive",name:"Google Drive"},{brand:"notion",name:"Notion"}],
 traces:[
  {tool:"list_apps",input:{provider:"google_drive"},output:["Google Drive account and document operations found","已找到 Google Drive 账号与文档操作"],working:["Finding the authorized document tools…","正在查找已授权的文档工具…"]},
  {tool:"call_app",provider:"google_drive",input:call("google_drive","files.list",{query:"mimeType = 'application/vnd.google-apps.document' and name contains 'Launch'",limit:5},"demo-knowledge-find"),output:["Launch brief found · original document link retained","找到发布资料 · 保留原文链接"],working:["Locating the launch brief…","正在定位发布资料…"]},
  {tool:"call_app",provider:"google_drive",input:call("google_drive","files.exportText",{id:"example-launch-document"},"demo-knowledge-read"),output:["Original brief read · decisions and next steps extracted","已读取原始资料 · 提炼决策与下一步"],working:["Reading the source and organizing the summary…","正在读取来源并整理摘要…"]},
  {tool:"call_app",provider:"notion",input:call("notion","pages.create",{parentPageId:"77777777-7777-4777-8777-777777777777",title:"Launch decisions and next steps",text:"Source: https://docs.google.com/document/d/example-launch-document\nDecision: ship the approved release after preview checks pass.\nNext: investigate the failing preview and review the launch checklist."},"demo-knowledge-page"),output:["status: pending_approval · Notion page not created","状态：等待审批 · 尚未创建 Notion 页面"],working:["Preparing the exact Notion page for approval…","正在准备 Notion 页面完整内容，等待确认…"]},
 ]},
];
export const findAppWorkflow=(id:string)=>APP_WORKFLOW_EXAMPLES.find(example=>example.id===id);
export const translateCopy=(copy:Copy,tr:(en:string,zh:string)=>string)=>tr(copy[0],copy[1]);
