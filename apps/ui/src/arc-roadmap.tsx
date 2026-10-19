import { useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-roadmap.css";

const requestAccess = "/early-access?source=roadmap";

const phases = [
 {id:"00",name:"Connected foundation",zhName:"连接基础设施",enStatus:"AVAILABLE TODAY",zhStatus:"现已可用",subtitle:"AN OPEN BRIDGE TO THE REAL WORLD",zhSubtitle:"连接 AI 与真实世界",description:"Give AI a common way to reach apps, computers and the work already happening across them. Connect is our starting point: an open connection layer that stays under your control.",zhDescription:"让 AI 通过统一的连接层触达应用、电脑与正在发生的工作。以 Connect 为起点，构建由用户掌控、面向开放生态的连接基础设施。",bullets:["Apps, computers and AI clients","Interoperable connections","User-owned access and control"],zhBullets:["连接应用、电脑与 AI 客户端","开放互通的连接能力","由用户掌控访问与权限"],state:"live"},
 {id:"01",name:"A personal agent",zhName:"通用个人智能体",enStatus:"BUILDING",zhStatus:"正在构建",subtitle:"FROM REQUEST TO REAL OUTCOME",zhSubtitle:"从理解意图，到交付结果",description:"Build an agent that understands what you want, coordinates tools across your digital world and follows work through to a result you can inspect. Arc is the next step toward that ambition.",zhDescription:"构建理解意图、协调数字世界中的工具，并持续推进到可核验结果的个人智能体。Arc 是走向这一目标的下一步。",bullets:["Natural-language delegation","Work across apps and devices","Continuity, evidence and recovery"],zhBullets:["用自然语言交代工作","跨应用与设备协同","持续执行、核验与恢复"],state:"active"},
 {id:"02",name:"Agents for every industry",zhName:"垂类 SaaS Agent",enStatus:"LONG-TERM EXPLORATION",zhStatus:"长期探索",subtitle:"A FOUNDATION FOR SPECIALIZED WORK",zhSubtitle:"为专业场景提供智能体能力",description:"Explore the infrastructure businesses need to build agents for their own industries: domain knowledge, connected tools and dependable execution. Help teams turn specialized expertise into services people can use.",zhDescription:"探索为企业提供构建垂类 SaaS Agent 所需的基础能力，将行业知识、应用连接与可靠执行结合，让专业经验成为可交付的服务。",bullets:["Domain-specific knowledge and workflows","Reusable agent infrastructure","Business-owned context and controls"],zhBullets:["行业知识与专业工作流程","可复用的智能体基础设施","企业掌控上下文与权限"],state:"planned"},
 {id:"03",name:"Your device steward",zhName:"智能设备 AI 管家",enStatus:"LONG-TERM EXPLORATION",zhStatus:"长期探索",subtitle:"ONE AGENT, BEYOND THE SCREEN",zhSubtitle:"从电脑，走向更多智能设备",description:"Explore a general agent that helps coordinate personal computers and, over time, compatible smart devices. Understand their state, look after ongoing work and act within boundaries set by the people who own them.",zhDescription:"探索能够协调个人电脑，并逐步触达兼容智能设备的通用 Agent。理解设备状态、照看持续工作，始终在设备主人设定的范围内行动。",bullets:["Awareness across personal devices","Help with everyday digital operations","Owner-defined boundaries"],zhBullets:["跨个人设备的状态感知","照看日常数字事务","由设备主人定义行动边界"],state:"planned"},
 {id:"04",name:"An agent infrastructure layer",zhName:"下一代 AI 基础设施",enStatus:"OUR NORTH STAR",zhStatus:"长期愿景",subtitle:"A COMMON FOUNDATION FOR AGENTS THAT ACT",zhSubtitle:"让智能体拥有可靠的行动基础",description:"Our long-term ambition is an open infrastructure layer for agents that act in the real world. Bring connections, context and execution together so personal agents, industry services and device intelligence can grow on a shared foundation.",zhDescription:"我们的长期目标，是成为面向真实世界行动的下一代 AI 基础设施。汇聚连接、上下文与执行能力，让个人智能体、行业服务与设备智能建立在共同基础之上。",bullets:["Open ecosystem and interoperability","Personal and industry agents","Reliable execution in the real world"],zhBullets:["开放生态与互操作","个人与行业智能体","面向真实世界的可靠执行"],state:"planned"}
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
      <p>{tr("From connecting your tools to a shared foundation for agents that act.", "从连接工具出发，走向让智能体可靠行动的共同基础。")}</p>
    </header>

    <section className="arcTimelineMain" aria-label={tr("Explore our product direction", "查看我们的产品方向")}>
      <div className="arcTimelineTop"><span>{tr("OUR DIRECTION", "发展方向")}</span><span>{tr("EXPLORE THE VISION", "点击查看愿景")} <span aria-hidden="true">→</span></span></div>
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
        <div className="arcTimelinePanelMeta"><span>{tr("DIRECTION", "方向")} / {selected.id}</span><span className={"arcTimelinePanelState arcTimelinePanelState--"+selected.state}>{isZh?selected.zhStatus:selected.enStatus}</span></div>
        <h2>{isZh?selected.zhName:selected.name}</h2>
        <p className="arcTimelinePanelSub">{isZh?selected.zhSubtitle:selected.subtitle}</p>
        <p className="arcTimelinePanelDesc">{isZh?selected.zhDescription:selected.description}</p>
        <div className="arcTimelineHighlights">
          {(isZh?selected.zhBullets:selected.bullets).map((item,index)=><span key={item}><i aria-hidden="true">{index+1}</i>{item}</span>)}
        </div>
        <div className="arcTimelinePanelBottom">
          <span>{tr("Long-term directions are exploratory, without a committed release date.", "长期方向仍在探索中，不代表已承诺的功能或上线日期。")}</span>
          <a href={active===0?localizedWebsiteHref("/connect-ai",locale):active===1?"https://agent.remotearc.app/dashboard/agent/chat":localizedWebsiteHref(requestAccess,locale)}>{active===0?tr("Use Connect today", "现在使用 Connect"):active===1?tr("Open Arc", "打开 Arc"):tr("Express interest", "登记体验意向")} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </section>

    <footer className="arcTimelineFooter">
      <p>{tr("Follow the build. Shape the next milestone.", "关注开发进展，参与定义下一步。")}</p>
      <div><a href={localizedWebsiteHref("/arc",locale)}>{tr("Meet Arc", "认识 Arc")} ↗</a><a href={localizedWebsiteHref("/feedback?source=roadmap",locale)}>{tr("Tell us what to build", "告诉我们你的需求")} ↗</a></div>
      <small>{tr("Arc and Connect are available now. Share your ideas for what comes next.", "Arc 和 Connect 现已可用，欢迎提出下一阶段的需求。")}</small>
    </footer>
  </main>;
}
