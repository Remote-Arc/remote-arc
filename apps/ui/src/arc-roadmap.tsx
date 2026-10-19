import { useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-roadmap.css";

const requestAccess = "/early-access?source=roadmap";

const phases = [
  {id:"00",name:"Connect",zhName:"Connect",status:"available",enStatus:"AVAILABLE TODAY",zhStatus:"现已可用",subtitle:"YOUR AI / YOUR TOOLS",zhSubtitle:"你的 AI，你的工具",description:"Use your preferred AI chat with connected apps and your own computers. Manage account access and device permissions in one workspace.",zhDescription:"在熟悉的 AI 对话中使用已连接的应用与自己的电脑，在同一个工作空间管理账号访问与设备权限。",bullets:["Compatible MCP chats","Windows, Mac and Linux","Apps and account connections"],zhBullets:["兼容 MCP 的 AI 对话","Windows、Mac 与 Linux","应用与账号连接"],state:"live"},
  {id:"01",name:"Arc",zhName:"Arc",status:"building",enStatus:"COMING SOON",zhStatus:"即将推出",subtitle:"YOUR PERSONAL AGENT",zhSubtitle:"你的个人 AI 队友",description:"Give Arc a goal in your own words. Your personal agent will bring apps, computers and ongoing work into one conversation, with no model API key to set up.",zhDescription:"用自然语言告诉 Arc 你的目标，让个人 AI 队友把应用、电脑与持续工作汇聚到一次对话中，无需配置模型 API Key。",bullets:["One conversation for your work","Apps and computer tools","Saved conversations and results"],zhBullets:["用一次对话推进工作","调用应用与电脑工具","保存对话与执行结果"],state:"active"},
  {id:"02",name:"Tasks & Routines",zhName:"任务与例行工作",status:"building",enStatus:"COMING SOON",zhStatus:"即将推出",subtitle:"LESS REPEATING YOURSELF",zhSubtitle:"让重复工作少一点",description:"Ask for a one-off task or describe work you want repeated. Follow its progress and pick up from the saved state when it needs your attention.",zhDescription:"说出一次性任务，或描述想定期完成的工作。跟踪进度，在需要关注时从保存的状态继续。",bullets:["Create work through conversation","Set schedules in your own words","Follow progress and results"],zhBullets:["通过对话创建工作","用自然语言说明时间安排","查看进度与结果"],state:"active"},
  {id:"03",name:"Shared work",zhName:"协作空间",status:"planned",enStatus:"EXPLORING",zhStatus:"探索中",subtitle:"WORK BETTER TOGETHER",zhSubtitle:"与团队一起推进",description:"Bring shared work and the people responsible for it closer together, with clear access and a shared view of progress.",zhDescription:"让协作工作与负责的人联系得更紧密，明确访问范围，共同查看工作进展。",bullets:["Shared work context","Clear account access","Team progress"],zhBullets:["共享工作上下文","清晰的账号访问范围","团队工作进展"],state:"planned"},
  {id:"04",name:"Skills",zhName:"技能",status:"exploring",enStatus:"EXPLORING",zhStatus:"探索中",subtitle:"YOUR WAY OF WORKING",zhSubtitle:"按你的方式工作",description:"Save useful ways of working so your agent can repeat them with the right context and tools.",zhDescription:"保存有用的工作方法，让 AI 队友结合合适的上下文与工具重复使用。",bullets:["Reusable instructions","Your preferred tools","Repeatable work"],zhBullets:["可复用的指令","你偏好的工具","可以重复完成的工作"],state:"planned"}
] as const;

export function ArcRoadmapPageContent() {
  const {tr,locale} = useI18n();
  const [active,setActive] = useState(1);
  const selected = phases[active] ?? phases[1];
  const isZh=locale==="zh";
  return <main className="arcTimeline">
    <header className="arcTimelineHero">
      <img className="arcTimelineLogo" src="/remote-arc.svg" alt="" width="56" height="56" />
      <div className="arcTimelineEyebrow">REMOTE ARC / {tr("WHAT WE'RE BUILDING", "我们的开发方向")}</div>
      <h1>{tr("What's next for Remote Arc.", "Remote Arc，下一步。")}</h1>
      <p>{tr("More ways to connect your tools, delegate work and make room for what matters.", "连接更多工具，交给 AI 更多工作，为重要的事留出时间。")}</p>
    </header>

    <section className="arcTimelineMain" aria-label={tr("Explore our five development stages", "查看五个开发阶段")}>
      <div className="arcTimelineTop"><span>{tr("PRODUCT EVOLUTION", "产品进化")}</span><span>{tr("SELECT A PHASE TO EXPLORE", "点击阶段查看详情")} <span aria-hidden="true">→</span></span></div>
      <div className="arcTimelineTabs" role="tablist" aria-label={tr("Remote Arc roadmap phases", "Remote Arc 路线图阶段")}>
        {phases.map((phase,index)=><button
          key={phase.id}
          id={"arc-timeline-tab-"+phase.id}
          role="tab"
          type="button"
          tabIndex={active===index?0:-1}
          aria-controls="arc-timeline-panel"
          aria-selected={active===index}
          className={"arcTimelineTab"+(active===index?" arcTimelineTab--selected":"")}
          onClick={()=>setActive(index)}
          onKeyDown={event=>{
            if(event.key==="ArrowRight"||event.key==="ArrowLeft"||event.key==="Home"||event.key==="End"){
              event.preventDefault();
              const next=event.key==="Home"?0:event.key==="End"?phases.length-1:(active+(event.key==="ArrowRight"?1:-1)+phases.length)%phases.length;
              setActive(next);
              document.getElementById("arc-timeline-tab-"+phases[next]!.id)?.focus();
            }
          }}
        >
          <span className="arcTimelineTabHead"><i className={"arcTimelineDot arcTimelineDot--"+phase.state} aria-hidden="true" /><small>{phase.id}</small></span>
          <span className="arcTimelineTabLabel">{isZh?phase.zhName:phase.name}</span>
          <span className="arcTimelineTabStatus">{isZh?phase.zhStatus:phase.enStatus}</span>
        </button>)}
      </div>

      <article className="arcTimelinePanel" id="arc-timeline-panel" role="tabpanel" aria-labelledby={"arc-timeline-tab-"+selected.id}>
        <div className="arcTimelinePanelGlow" aria-hidden="true" />
        <div className="arcTimelinePanelMeta"><span>{tr("PHASE", "阶段")} / {selected.id}</span><span className={"arcTimelinePanelState arcTimelinePanelState--"+selected.state}>{isZh?selected.zhStatus:selected.enStatus}</span></div>
        <h2>{isZh?selected.zhName:selected.name}</h2>
        <p className="arcTimelinePanelSub">{isZh?selected.zhSubtitle:selected.subtitle}</p>
        <p className="arcTimelinePanelDesc">{isZh?selected.zhDescription:selected.description}</p>
        <div className="arcTimelineHighlights">
          {(isZh?selected.zhBullets:selected.bullets).map((item,index)=><span key={item}><i aria-hidden="true">{index+1}</i>{item}</span>)}
        </div>
        <div className="arcTimelinePanelBottom">
          <span>{tr("Planned features may change as we learn from your feedback.", "规划中的功能会根据你的反馈持续调整。")}</span>
          <a href={active===0?"/connect-ai":localizedWebsiteHref(requestAccess,locale)}>{active===0?tr("Use Connect today", "现在使用 Connect"):tr("Request early access", "申请抢先体验")} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </section>

    <footer className="arcTimelineFooter">
      <p>{tr("Follow the build. Shape the next milestone.", "关注开发进展，参与定义下一步。")}</p>
      <div><a href={localizedWebsiteHref("/arc",locale)}>{tr("Meet Arc", "认识 Arc")} ↗</a><a href={localizedWebsiteHref("/feedback?source=roadmap",locale)}>{tr("Tell us what to build", "告诉我们你的需求")} ↗</a></div>
      <small>{tr("Start with Connect today. Join early access for Arc.", "现在开始使用 Connect，也可以申请 Arc 抢先体验。")}</small>
    </footer>
  </main>;
}
