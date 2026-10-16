import { useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-roadmap.css";

const requestAccess = "mailto:support@remotearc.app?subject=" +
  encodeURIComponent("Arc early access") +
  "&body=" + encodeURIComponent("The workflow I'd like Arc to handle is: ");

const phases = [
  {id:"00",name:"Foundation",zhName:"连接基础",status:"available",enStatus:"AVAILABLE TODAY",zhStatus:"现已可用",subtitle:"CONNECT / RELIABILITY",zhSubtitle:"连接与可靠性",description:"Remote MCP, device permissions and durable task foundations already power Remote Arc. Organization boundaries and controlled production releases are being hardened.",zhDescription:"Remote MCP、设备权限和持久任务基础已支持 Remote Arc。组织隔离与受控生产发布正在加强。",bullets:["Remote MCP · connected devices","Permissioned execution · durable tasks","Organization and release safeguards"],zhBullets:["远程 MCP 与设备连接","受控执行与持久任务","组织隔离与发布保护"],state:"live"},
  {id:"01",name:"Arc Chat",zhName:"Arc Chat",status:"building",enStatus:"IN DEVELOPMENT",zhStatus:"开发中",subtitle:"HOSTED CHAT / AUTO",zhSubtitle:"托管对话与 Auto",description:"First-party AI chat, audited model routing and bounded execution. Auto must be reliably useful before we invite public users.",zhDescription:"第一方 AI 对话、可审计的模型路由与受限任务执行。Auto 必须经过可靠性验证，才能开放给用户。",bullets:["Chat and task history","Auto model routing","Provider-cost hard limits"],zhBullets:["聊天与任务记录","Auto 模型路由","模型费用硬上限"],state:"active"},
  {id:"02",name:"Billing",zhName:"收费系统",status:"planned",enStatus:"PUBLIC BETA GATE",zhStatus:"公开测试前完成",subtitle:"PAYMENTS / SAFETY",zhSubtitle:"支付与预算保护",description:"Subscription checkout, trusted payment webhooks, customer usage transparency and strictly capped trials must ship before anyone can spend our hosted-model budget publicly.",zhDescription:"正式开放 Arc 前必须先完成订阅支付、可信支付通知、用量展示和有硬限额的试用，确保用户不会无限消耗托管模型成本。",bullets:["Subscriptions and checkout","Usage ledger and spending caps","Bounded, abuse-resistant free trials"],zhBullets:["订阅与收款","用量账本和硬预算限制","防滥用的限量免费试用"],state:"planned"},
  {id:"03",name:"Apps + Routines",zhName:"应用与自动任务",status:"planned",enStatus:"PLANNED",zhStatus:"规划中",subtitle:"CONNECT / AUTOMATE",zhSubtitle:"连接与自动化",description:"Reliable integrations, reusable routines, approvals and evidence of the work done. Expand the catalog after the first workflows succeed.",zhDescription:"稳定的应用集成、可复用的自动任务、审批与可检查的执行证据。先保证核心场景可靠，再扩展应用目录。",bullets:["Selected core app integrations","Recurring tasks and approvals","Visible results and recovery"],zhBullets:["第一批核心应用连接","定期任务与审批","执行结果与恢复能力"],state:"planned"},
  {id:"04",name:"Teach Arc",zhName:"教会 Arc",status:"exploring",enStatus:"EXPLORING",zhStatus:"探索中",subtitle:"SKILLS / ECOSYSTEM",zhSubtitle:"技能与生态",description:"Reusable skills learned from approved demonstrations, a growing app ecosystem and more capable AI teammates — only once the core proves its value.",zhDescription:"从已授权的操作演示中生成可复用技能，再逐步扩展应用生态和 AI 队友协作，前提是核心能力已经验证其价值。",bullets:["Teach from approved examples","Reusable skills","An extensible connector ecosystem"],zhBullets:["从授权示例中学习","可复用技能","可扩展的连接器生态"],state:"planned"}
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
      <p>{tr("A clear look at what works today, what we're building and what comes later. No invented release dates.", "清楚展示已经可用的、正在建设的和未来规划的能力，不承诺未经确认的发布日期。")}</p>
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
          <span>{tr("Progress is directional, not a delivery-date promise.", "开发状态代表方向，不是上线日期承诺。")}</span>
          <a href={active===0?"/connect-ai":requestAccess}>{active===0?tr("Use Connect today", "现在使用 Connect"):tr("Request early access", "申请抢先体验")} <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </section>

    <footer className="arcTimelineFooter">
      <p>{tr("Follow the build. Shape the next milestone.", "关注开发进展，参与定义下一步。")}</p>
      <div><a href={localizedWebsiteHref("/arc",locale)}>{tr("Meet Arc", "认识 Arc")} ↗</a><a href={requestAccess}>{tr("Tell us what to build", "告诉我们你的需求")} ↗</a></div>
      <small>{tr("Connect is available today; Arc Hosted and its model credits are not yet public.", "Connect 现已可用；Arc Hosted 与托管模型额度尚未公开开放。")}</small>
    </footer>
  </main>;
}
