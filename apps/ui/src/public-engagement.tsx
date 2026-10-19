import { useState, type FormEvent } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./public-engagement.css";

type Category = "early_access" | "feedback";
const IS_PREVIEW = import.meta.env.VITE_UI_PREVIEW === "1";

export function EngagementPage({category}: {category:Category}) {
  const {tr,locale}=useI18n();
  const isLead=category==="early_access";
  return <main className="engagementPage">
    <a className="engagementBack" href={localizedWebsiteHref(isLead?"/arc":"/",locale)}>← {tr("Back to Remote Arc", "返回 Remote Arc")}</a>
    <span className="engagementEyebrow">{isLead?tr("ARC · EARLY ACCESS","ARC · 抢先体验"):tr("REMOTE ARC · PRODUCT FEEDBACK","REMOTE ARC · 产品反馈")}</span>
    <h1>{isLead?tr("Be among the first to work with Arc.","成为第一批体验 Arc 的人。"):tr("Help shape what comes next.","一起把 Remote Arc 做得更好。")}</h1>
    <p className="engagementIntro">{isLead?tr("What work would you trust Arc to handle? Tell us about your workflow. Submitting this form does not start a trial or provide model credits.","你希望把什么工作交给 Arc？告诉我们你的工作场景。提交表单不会启动试用或发放模型额度。"):tr("Share an idea, report an issue, or tell us what would make your work easier.","分享想法、反馈问题，或告诉我们怎样才能让你的工作更轻松。")}</p>
    <EngagementForm category={category}/>
  </main>;
}

/** Support and Feedback use the same submission API and administrative inbox. */
export function EngagementForm({category="feedback",context="feedback"}: {category?:Category;context?:"feedback"|"support"}) {
  const {tr,locale}=useI18n();
  const isLead=category==="early_access";
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [message,setMessage]=useState("");
  const [consent,setConsent]=useState(false);
  const [website,setWebsite]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [error,setError]=useState("");
  const source=context==="support"?"support":new URLSearchParams(location.search).get("source")?.slice(0,64)||"website";
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(IS_PREVIEW){setError(tr("This is a design preview; submission storage is disabled. Please try after launch.", "这是设计预览，暂未连接表单存储。请在正式上线后提交。"));return;}
    if(!consent){setError(tr("Please confirm the contact/privacy agreement.", "请先同意联系与隐私说明。"));return;}
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/public/engagement",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({category,email,name,message,source,consent,website})});
      if(!response.ok){const detail=await response.json().catch(()=>({})) as {error?:string};throw new Error(detail.error==="rate_limited"?tr("Too many submissions. Try again in a minute.","提交过于频繁，请稍后再试。"):tr("Submission unavailable. Please retry later.","暂时无法提交，请稍后重试。"));}
      setDone(true);
    }catch(cause){setError(cause instanceof Error?cause.message:tr("Network error. Please retry.","网络错误，请重试。"));}
    finally{setBusy(false);}
  }
  return done?<div className="engagementSuccess" role="status"><span aria-hidden="true">✓</span><h2>{tr("Thanks. We received your submission.","感谢！我们已经收到。")}</h2><p>{tr("Your information was saved. We'll only contact you about your request.","信息已保存。我们只会就本次请求与你联系。")}</p><a href={localizedWebsiteHref("/",locale)}>{tr("Return home","返回首页")} ↗</a></div>:<form className="engagementForm" onSubmit={event=>void submit(event)}>
      <label htmlFor="lead-name">{tr("Your name (optional)","你的称呼（选填）")}</label><input id="lead-name" autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder={tr("How should we address you?","我们该怎么称呼你？")}/>
      <label htmlFor="lead-email">{tr("Email address","电子邮箱")} <span>*</span></label><input id="lead-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
      <label htmlFor="lead-message">{isLead?tr("What would you delegate to Arc?","你想让 Arc 完成什么？"):context==="support"?tr("How can we help?","需要我们帮助你解决什么？"):tr("What would you like us to know?","你有什么体验或建议？")} <span>*</span></label>
      <textarea id="lead-message" required minLength={10} maxLength={3000} rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder={isLead?tr("E.g. every morning, summarize my GitHub issues and prepare an email draft.","例如：每天早上汇总 GitHub Issue，并准备一封邮件草稿。"):context==="support"?tr("What happened, what did you expect, and which app or device was involved? Include a safe error message if available.","发生了什么、你期望的结果，以及涉及的应用或设备。可以附上不含敏感信息的错误提示。"):tr("Describe the feature, issue, or improvement you'd like.","描述功能、问题或你希望改进的地方。")}/>
      {context==="support"&&<p className="engagementFinePrint">{tr("Please leave out passwords, API keys, access tokens and private file contents.","请勿提交密码、API Key、访问 Token 或私人文件内容。")}</p>}
      <div className="engagementBotField" aria-hidden="true"><label htmlFor="lead-website">Website</label><input id="lead-website" autoComplete="off" tabIndex={-1} value={website} onChange={e=>setWebsite(e.target.value)}/></div>
      <label className="engagementConsent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{tr("I agree that Remote Arc may store this message and contact me about it. I understand I can request deletion.","我同意 Remote Arc 保存本次信息并就此联系我。我了解可以申请删除这些数据。")} <a href={localizedWebsiteHref("/privacy",locale)} target="_blank" rel="noreferrer">{tr("Privacy policy","隐私政策")}</a></span></label>
      {IS_PREVIEW&&<p className="engagementPreviewWarning">{tr("UI preview only — no real submissions are stored here.","当前是 UI 预览环境，不会真正保存表单。")}</p>}
      {error&&<p className="engagementError" role="alert">{error}</p>}
      <button className="engagementSubmit" disabled={busy||!consent}>{busy?tr("Submitting…","提交中…"):isLead?tr("Request early access","申请抢先体验"):context==="support"?tr("Send to support","发送给支持团队"):tr("Send feedback","提交反馈")} ↗</button>
      <p className="engagementFinePrint">{tr("No marketing spam. Your information is kept private and is not displayed to other users.","不会发送无关营销邮件。你的信息仅供授权管理员查看，不会向其他用户公开。")}</p>
    </form>;
}
