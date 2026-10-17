import { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { useMarketingPlayback } from "./use-marketing-playback.js";
import { APP_WORKFLOW_EXAMPLES, translateCopy } from "./app-workflow-examples.js";
import "./app-workflow-showcase.css";
export function AppWorkflowShowcase(){
 const {tr,locale}=useI18n(),[selected,setSelected]=useState(0),example=APP_WORKFLOW_EXAMPLES[selected]!;
 const {ref,step,setStep,playing,setPlaying,running,reducedMotion}=useMarketingPlayback(example.traces.length,2400);
 useEffect(()=>{setStep(0);},[selected,setStep]);
 return <section className="appWorkflowShowcase" id="arc-workflows" ref={ref} data-running={running} aria-labelledby="appWorkflowsTitle">
 <header className="modernSectionIntro"><span className="eyebrow">{tr("ONE REQUEST · ACROSS YOUR TOOLSTACK","一句需求 · 串联你的工具")}</span><h2 id="appWorkflowsTitle">{tr("Real work rarely stays in one app.","真正的工作，不会只在一个应用里。")}</h2><p>{tr("Let your AI connect the context, prepare the work and bring the next decision to you. These Connect workflows use the same Apps foundation that Arc Agent will build on.","让 AI 串联上下文、准备工作，再把下一步决策交给你。这些 Connect 工作流与未来 Arc Agent 共用同一套 Apps 基础。")}</p></header>
 <div className="appWorkflowTabs" role="group" aria-label={tr("Example workflows","示例工作流")}>{APP_WORKFLOW_EXAMPLES.map((item,index)=><button key={item.id} type="button" aria-pressed={selected===index} onClick={()=>setSelected(index)}>{translateCopy(item.label,tr)}</button>)}</div>
 <article className="appWorkflowPanel" data-workflow={example.id}>
  <div className="appWorkflowStory"><span className="appWorkflowNumber">0{selected+1}</span><h3>{translateCopy(example.title,tr)}</h3><blockquote>{translateCopy(example.request,tr)}</blockquote><p>{translateCopy(example.result,tr)}</p><span className="appWorkflowPermissions">{translateCopy(example.permission,tr)}</span><a href={localizedWebsiteHref("/integrations?provider="+(example.id==="release"?"vercel":example.id==="video"?"runway":"google_drive"),locale)}>{tr("Explore these connections","查看相关连接")} ↗</a></div>
  <div className="appWorkflowAction"><div className="appWorkflowMap"><span className="appWorkflowArc"><img src="/remote-arc.svg" alt="Remote Arc" width="48" height="48"/></span><span className="appWorkflowLink" aria-hidden="true"/><div className="appWorkflowBrands">{example.brands.map(brand=><span key={brand.brand}><i data-brand={brand.brand}><img src={"/app-brands/"+brand.brand+".svg"} alt="" width="30" height="30"/></i><strong>{brand.name}</strong></span>)}</div></div>
  <ol className="appWorkflowSteps">{example.traces.map((trace,index)=><li key={index} data-active={index===step} data-complete={index<step}><button type="button" onClick={()=>{setStep(index);setPlaying(false);}} aria-current={index===step?"step":undefined}><span>{index<step?"✓":String(index+1).padStart(2,"0")}</span><div><strong>{translateCopy(trace.working,tr).replace(/…$/,"")}</strong><small>{translateCopy(trace.output,tr)}</small></div></button></li>)}</ol>
  <footer><span>{tr("SIMULATED WORKFLOW · YOUR APPROVAL","工作流示意 · 由你审批")}</span><button type="button" onClick={()=>setPlaying(value=>!value)} disabled={reducedMotion} aria-label={playing?tr("Pause workflow animation","暂停工作流动画"):tr("Play workflow animation","播放工作流动画")}>{reducedMotion?tr("Manual preview","手动预览"):playing?tr("Pause","暂停"):tr("Play","播放")}</button></footer>
  {example.id==="video"&&<a className="appWorkflowRunway" href="https://runwayml.com" target="_blank" rel="noreferrer">Powered by Runway ↗</a>}
  </div>
 </article><p className="appWorkflowDisclosure">{tr("Example data. No accounts are connected and no actions or paid generation run in this demonstration. Apps need provider configuration and user authorization. Arc Agent remains in development; Connect Apps ships independently.","示例数据。本演示不会连接账号、执行操作或付费生成。Apps 需要平台配置与用户授权。Arc Agent 仍在开发，Connect Apps 独立发布。")}</p>
 </section>;
}