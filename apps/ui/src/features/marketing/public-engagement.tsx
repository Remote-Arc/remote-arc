import { useEffect,useState, type FormEvent } from "react";
import { useI18n } from "../../app/i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "./public-engagement.css";

type Category = "early_access" | "feedback";
const IS_PREVIEW = import.meta.env.VITE_UI_PREVIEW === "1";

export function EngagementPage({category}: {category:Category}) {
  const {tr,locale}=useI18n();
  const isLead=category==="early_access";
  return <main className="engagementPage">
    <a className="engagementBack" href={localizedWebsiteHref(isLead?"/arc":"/",locale)}>← {tr("Back to Remote Arc", "返回 Remote Arc")}</a>
    <span className="engagementEyebrow">{isLead?tr("ARC · FUTURE CAPABILITIES","ARC · 未来能力"):tr("REMOTE ARC · PRODUCT FEEDBACK","REMOTE ARC · 产品反馈")}</span>
    <h1>{isLead?tr("Help shape Arc’s next capabilities.","一起定义 Arc 接下来的能力。"):tr("Help shape what comes next.","一起把 Remote Arc 做得更好。")}</h1>
    <p className="engagementIntro">{isLead?tr("What work would you trust Arc to handle? Tell us about your workflow. Submitting this form does not start a trial or provide model credits.","你希望把什么工作交给 Arc？告诉我们你的工作场景。提交表单不会启动试用或发放模型额度。"):tr("Share an idea, report an issue, or tell us what would make your work easier.","分享想法、反馈问题，或告诉我们怎样才能让你的工作更轻松。")}</p>
    {isLead&&<p className="engagementIntro"><a href="https://agent.remotearc.app/dashboard/agent/chat">{tr("Arc is available now. Open the workspace to start your trial.","Arc 现已可用，打开工作空间即可开启试用。")} ↗</a></p>}
    <EngagementForm category={category}/>
  </main>;
}

/** Support and Feedback use the same submission API and administrative inbox. */
export function EngagementForm({category="feedback",context="feedback"}: {category?:Category;context?:"feedback"|"support"|"enterprise"}) {
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
  const [requestId]=useState(()=>crypto.randomUUID());
  const [rewardInfo,setRewardInfo]=useState<{enabled:boolean;policy:{versionId:string;calls:number;validDays:number;perUserLimit:number}|null;account:{email:string;availableCalls:number}|null}|null>(null);
  const [rewardStatus,setRewardStatus]=useState('');
  useEffect(()=>{if(isLead||context!=='feedback'||IS_PREVIEW)return;const controller=new AbortController();void fetch('/api/public/feedback-reward',{credentials:'same-origin',signal:controller.signal}).then(async response=>{if(response.ok){const value=await response.json();if(!controller.signal.aborted){setRewardInfo(value);if(value.enabled&&value.account?.email)setEmail(current=>current||value.account.email);}}}).catch(()=>{});return()=>controller.abort();},[isLead,context]);
  const source=context==="enterprise"?"enterprise":context==="support"?"support":new URLSearchParams(location.search).get("source")?.slice(0,64)||"website";
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(IS_PREVIEW){setError(tr("This is a design preview; submission storage is disabled. Please try after launch.", "这是设计预览，暂未连接表单存储。请在正式上线后提交。"));return;}
    if(!consent){setError(tr("Please confirm the contact/privacy agreement.", "请先同意联系与隐私说明。"));return;}
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/public/engagement",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({category,email,name,message,source,consent,website,requestId,...(rewardInfo?.enabled&&rewardInfo.account&&rewardInfo.policy?{rewardVersionId:rewardInfo.policy.versionId}:{})})});
      if(!response.ok){const detail=await response.json().catch(()=>({})) as {error?:string};throw new Error(detail.error==="rate_limited"?tr("Too many submissions. Try again in a minute.","提交过于频繁，请稍后再试。"):tr("Submission unavailable. Please retry later.","暂时无法提交，请稍后重试。"));}
      const result=await response.json();setRewardStatus(result.reward?.status||'');setDone(true);
    }catch(cause){setError(cause instanceof Error?cause.message:tr("Network error. Please retry.","网络错误，请重试。"));}
    finally{setBusy(false);}
  }
  return done?<div className="engagementSuccess" role="status"><span aria-hidden="true">✓</span><h2>{tr("Thanks. We received your submission.","感谢！我们已经收到。")}</h2><p>{tr("Your information was saved. We'll only contact you about your request.","信息已保存。我们只会就本次请求与你联系。")}</p>{rewardStatus&&<p>{rewardStatus==='pending'?tr('Your reward application is awaiting review. Approved calls will appear in your account.','奖励申请已进入审核，通过后调用次数会发放到你的账号。'):rewardStatus==='granted'?tr('Your feedback reward has been granted.','反馈奖励已发放。'):tr('Your feedback was saved. This submission did not qualify for a reward; check sign-in, current terms and the per-person limit.','反馈已保存，本次未取得奖励资格，请核对登录账号、当前规则和每人领取上限。')}</p>}{rewardStatus&&<a href="https://agent.remotearc.app/settings?section=billing">{tr('View account allowance','查看账号额度')} ↗</a>}<a href={localizedWebsiteHref("/",locale)}>{tr("Return home","返回首页")} ↗</a></div>:<form className="engagementForm" onSubmit={event=>void submit(event)}>
      {rewardInfo?.enabled&&rewardInfo.policy&&<aside className="engagementReward"><strong>{tr('Feedback reward','反馈奖励')} · {rewardInfo.policy.calls.toLocaleString()} Connect {tr('calls','次调用')}</strong><p>{tr('Approved feedback earns '+rewardInfo.policy.calls+' calls, valid for '+rewardInfo.policy.validDays+' days after approval. Up to '+rewardInfo.policy.perUserLimit+' reward(s) per account, subject to the published campaign cap.','有效反馈经审核后可获得 '+rewardInfo.policy.calls+' 次调用，发放后 '+rewardInfo.policy.validDays+' 天内有效；每个账号最多领取 '+rewardInfo.policy.perUserLimit+' 次，受活动总额度限制。')}</p>{rewardInfo.account?<small>{tr('Use the signed-in account’s email: ','请使用已登录账号的邮箱：')+rewardInfo.account.email}</small>:<a href={'https://agent.remotearc.app/auth/login?return_to='+encodeURIComponent('https://remotearc.app'+location.pathname+location.search)}>{tr('Sign in to apply for a reward','登录后申请奖励')} ↗</a>}</aside>}
      <label htmlFor="lead-name">{tr("Your name (optional)","你的称呼（选填）")}</label><input id="lead-name" autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder={tr("How should we address you?","我们该怎么称呼你？")}/>
      <label htmlFor="lead-email">{tr("Email address","电子邮箱")} <span>*</span></label><input id="lead-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
      <label htmlFor="lead-message">{isLead?tr("What would you delegate to Arc?","你想让 Arc 完成什么？"):context==="enterprise"?tr("Your team and requirements","团队与需求"):context==="support"?tr("How can we help?","需要我们帮助你解决什么？"):tr("What would you like us to know?","你有什么体验或建议？")} <span>*</span></label>
      <textarea id="lead-message" required minLength={10} maxLength={3000} rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder={isLead?tr("E.g. every morning, summarize my GitHub issues and prepare an email draft.","例如：每天早上汇总 GitHub Issue，并准备一封邮件草稿。"):context==="enterprise"?tr("Tell us about your team size, use cases, deployment and support needs.","请介绍团队规模、使用场景、部署与支持需求。"):context==="support"?tr("What happened, what did you expect, and which app or device was involved? Include a safe error message if available.","发生了什么、你期望的结果，以及涉及的应用或设备。可以附上不含敏感信息的错误提示。"):tr("Describe the feature, issue, or improvement you'd like.","描述功能、问题或你希望改进的地方。")}/>
      {context==="support"&&<p className="engagementFinePrint">{tr("Please leave out passwords, API keys, access tokens and private file contents.","请勿提交密码、API Key、访问 Token 或私人文件内容。")}</p>}
      <div className="engagementBotField" aria-hidden="true"><label htmlFor="lead-website">Website</label><input id="lead-website" autoComplete="off" tabIndex={-1} value={website} onChange={e=>setWebsite(e.target.value)}/></div>
      <label className="engagementConsent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{tr("I agree that Remote Arc may store this message and contact me about it. I understand I can request deletion.","我同意 Remote Arc 保存本次信息并就此联系我。我了解可以申请删除这些数据。")} <a href={localizedWebsiteHref("/privacy",locale)} target="_blank" rel="noreferrer">{tr("Privacy policy","隐私政策")}</a></span></label>
      {IS_PREVIEW&&<p className="engagementPreviewWarning">{tr("UI preview only — no real submissions are stored here.","当前是 UI 预览环境，不会真正保存表单。")}</p>}
      {error&&<p className="engagementError" role="alert">{error}</p>}
      <button className="engagementSubmit" disabled={busy||!consent}>{busy?tr("Submitting…","提交中…"):isLead?tr("Request early access","申请抢先体验"):context==="enterprise"?tr("Send enterprise enquiry","提交企业咨询"):context==="support"?tr("Send to support","发送给支持团队"):tr("Send feedback","提交反馈")} ↗</button>
      <p className="engagementFinePrint">{tr("No marketing spam. Your information is kept private and is not displayed to other users.","不会发送无关营销邮件。你的信息仅供授权管理员查看，不会向其他用户公开。")}</p>
    </form>;
}
