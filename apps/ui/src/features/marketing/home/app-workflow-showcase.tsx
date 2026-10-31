import { useEffect, useState } from "react";
import { useI18n } from "../../../app/i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { useMarketingPlayback } from "./use-marketing-playback.js";
import { APP_WORKFLOW_EXAMPLES, translateCopy } from "./app-workflow-examples.js";
import "./app-workflow-showcase.css";
export function AppWorkflowShowcase(){
 const {tr,locale}=useI18n(),[selected,setSelected]=useState(0),example=APP_WORKFLOW_EXAMPLES[selected]!;
 const {ref,step,setStep,playing,setPlaying,running,reducedMotion}=useMarketingPlayback(example.traces.length,2400);
 useEffect(()=>{setStep(0);},[selected,setStep]);
 return <section className="appWorkflowShowcase" id="arc-workflows" ref={ref} data-running={running} aria-labelledby="appWorkflowsTitle">
 <header className="modernSectionIntro"><span className="eyebrow">{tr("ONE REQUEST · ACROSS YOUR TOOLSTACK","一句需求 · 串联你的工具")}</span><h2 id="appWorkflowsTitle">{tr("Real work rarely stays in one app.","真正的工作，不会只在一个应用里。")}</h2><p>{tr("Let your AI connect the context, carry out the work and return results you can inspect. These Connect workflows use the same Apps foundation that Arc Agent will build on.","让 AI 串联上下文、执行工作，并返回可检查的结果。这些 Connect 工作流与未来 Arc Agent 共用同一套 Apps 基础。")}</p></header>
 <div className="appWorkflowTabs" role="group" aria-label={tr("Example workflows","示例工作流")}>{APP_WORKFLOW_EXAMPLES.map((item,index)=><button key={item.id} type="button" aria-pressed={selected===index} onClick={()=>setSelected(index)}>{translateCopy(item.label,tr)}</button>)}</div>
 <article className="appWorkflowPanel" data-workflow={example.id}>
  <div className="appWorkflowStory"><span className="appWorkflowNumber">0{selected+1}</span><h3>{translateCopy(example.title,tr)}</h3><blockquote>{translateCopy(example.request,tr)}</blockquote><p>{translateCopy(example.result,tr)}</p><span className="appWorkflowPermissions">{translateCopy(example.permission,tr)}</span><a href={localizedWebsiteHref("/integrations?provider="+example.connectionProvider,locale)}>{tr("Explore these connections","查看相关连接")} ↗</a></div>
  <div className="appWorkflowAction"><div className="appWorkflowMap"><span className="appWorkflowArc"><img src="/remote-arc.svg" alt="Remote Arc" width="48" height="48"/></span><span className="appWorkflowLink" aria-hidden="true"/><div className="appWorkflowBrands">{example.brands.map(brand=><span key={brand.brand}><i data-brand={brand.brand}><img src={"/app-brands/"+brand.brand+".svg"} alt="" width="30" height="30"/></i><strong>{brand.name}</strong></span>)}</div></div>
  <ol className="appWorkflowSteps">{example.traces.map((trace,index)=><li key={index} data-active={index===step} data-complete={index<step}><button type="button" onClick={()=>{setStep(index);setPlaying(false);}} aria-current={index===step?"step":undefined}><span>{index<step?"✓":String(index+1).padStart(2,"0")}</span><div><strong>{translateCopy(trace.working,tr).replace(/…$/,"")}</strong><small>{translateCopy(trace.output,tr)}</small></div></button></li>)}</ol>
  <footer><span>{tr("SIMULATED WORKFLOW · CONNECTED ACCOUNTS","模拟工作流 · 已授权的账号")}</span><button type="button" onClick={()=>setPlaying(value=>!value)} disabled={reducedMotion} aria-label={playing?tr("Pause workflow animation","暂停工作流动画"):tr("Play workflow animation","播放工作流动画")}>{reducedMotion?tr("Manual preview","手动预览"):playing?tr("Pause","暂停"):tr("Play","播放")}</button></footer>
  {example.id==="video"&&<a className="appWorkflowRunway" href="https://runwayml.com" target="_blank" rel="noreferrer">Powered by Runway ↗</a>}
  </div>
 </article><p className="appWorkflowDisclosure">{tr("Illustrative examples. This demo does not connect accounts, run actions or generate paid media. Connect your own accounts to use available apps.","示例演示，不连接账号、执行操作或进行付费生成。连接你自己的账号，即可使用已开放的应用。")}</p>
 </section>;
}
