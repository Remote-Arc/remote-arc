import { useState } from "react";
import { useI18n } from "./i18n.js";
import "./arc-interest-form.css";

type Kind = "early_access" | "feedback";

export function ArcInterestForm({ defaultKind = "early_access", source = "arc" }: { defaultKind?: Kind; source?: "arc" | "roadmap" | "home" }) {
  const {tr,locale} = useI18n();
  const [kind,setKind]=useState<Kind>(defaultKind);
  const [email,setEmail]=useState("");
  const [name,setName]=useState("");
  const [company,setCompany]=useState("");
  const [message,setMessage]=useState("");
  const [website,setWebsite]=useState("");
  const [state,setState]=useState<"idle"|"saving"|"saved"|"error">("idle");
  const [error,setError]=useState("");
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(state==="saving")return;
    setState("saving");setError("");
    try{
      const r=await fetch("/api/public/arc-interest",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({kind,email,name,company,message,website,locale,source})
      });
      if(!r.ok){
        if(r.status===429)throw new Error(tr("Too many attempts. Please try later.","提交太频繁，请稍后再试。"));
        if(r.status===404||r.status===501)throw new Error(tr("The form backend is not enabled in this preview yet.","当前预览环境尚未接入表单后端。"));
        throw new Error(tr("Couldn't submit. Please try again.","提交失败，请稍后重试。"));
      }
      setState("saved");setMessage("");
    }catch(e){setState("error");setError(e instanceof Error?e.message:String(e));}
  };
  return <section className="arcInterest" id="arc-interest" aria-labelledby="arc-interest-heading">
    <span className="arcInterestKicker">REMOTE ARC / {tr("EARLY ACCESS & FEEDBACK", "抢先体验与反馈")}</span>
    <h2 id="arc-interest-heading">{tr("What should Arc help you do?","你希望 Arc 帮你做什么？")}</h2>
    <p>{tr("Tell us your workflow, or share your experience with Remote Arc. We read every submission.","留下你希望自动完成的工作，或告诉我们使用 Remote Arc 的真实感受。")}</p>
    {import.meta.env.VITE_UI_PREVIEW === "1" && <p className="arcInterestPreview">{tr("Preview mode: submissions are disabled until the backend is released.","预览模式：正式后端发布前不会保存提交。")}</p>}
    <div className="arcInterestSwitch" role="group" aria-label={tr("Form type","反馈类型")}>
      <button type="button" className={kind==="early_access"?"selected":""} aria-pressed={kind==="early_access"} onClick={()=>{setKind("early_access");setState("idle");}}>{tr("Request early access","申请抢先体验")}</button>
      <button type="button" className={kind==="feedback"?"selected":""} aria-pressed={kind==="feedback"} onClick={()=>{setKind("feedback");setState("idle");}}>{tr("Share feedback","告诉我们你的体验")}</button>
    </div>
    {state==="saved"?<div className="arcInterestSuccess" role="status"><strong>{tr("Thanks — we received it.","已收到，谢谢你的反馈！")}</strong><p>{tr("We'll review your message. No AI subscription or account was created.","我们会查看你的留言。此操作不会为你创建付费套餐。")}</p><button type="button" onClick={()=>setState("idle")}>{tr("Send another message","再提交一条")}</button></div>:
    <form className="arcInterestForm" onSubmit={submit}>
      <label>{tr("Email *","邮箱 *")}<input type="email" name="email" maxLength={255} required autoComplete="email" placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <div className="arcInterestRow">
        <label>{tr("Name","称呼")}<input name="name" maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder={tr("Optional","选填")}/></label>
        <label>{tr("Company / project","公司 / 项目")}<input name="company" maxLength={120} value={company} onChange={e=>setCompany(e.target.value)} placeholder={tr("Optional","选填")}/></label>
      </div>
      <label>{kind==="early_access"?tr("What would you delegate to Arc? *","希望 Arc 帮你完成什么？*"):tr("How was your Remote Arc experience? *","使用 Remote Arc 的体验如何？*")}
        <textarea required minLength={8} maxLength={2000} rows={4} placeholder={tr("Tell us the real task, tools and expected outcome...","告诉我们具体任务、使用的工具和期望的结果……")} value={message} onChange={e=>setMessage(e.target.value)}/></label>
      <div className="arcInterestTrap" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={e=>setWebsite(e.target.value)}/></label></div>
      <div className="arcInterestBottom"><span>{tr("Used only to respond about your request. No promotional subscription is added automatically.","邮箱仅用于回复你的留言，不会自动订阅营销邮件。")} <a href="/privacy">{tr("Privacy","隐私政策")}</a></span><button disabled={state==="saving"} type="submit">{state==="saving"?tr("Sending...","提交中……"):tr("Submit","提交")} ↗</button></div>
      {state==="error"&&<p role="alert" className="arcInterestError">{error}</p>}
    </form>}
  </section>;
}
