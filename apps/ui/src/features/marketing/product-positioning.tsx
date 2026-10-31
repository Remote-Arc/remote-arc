import {useI18n} from '../../app/i18n.js';
import {localizedWebsiteHref} from '../../lib/marketing-paths.js';
import {ProductIcon as Icon} from '../../components/product-icon.js';
export function ProductFocus(){
 const {tr,locale}=useI18n();
 const items=[
  {number:'01',icon:'apps' as const,label:tr('YOUR APPS','你的应用'),title:tr('Bring your tools together.','让常用应用一起工作。'),text:tr('Work across GitHub, Slack, Gmail, Notion and more with your connected accounts.','通过已连接账号，让 GitHub、Slack、Gmail、Notion 等应用协同工作。'),href:'/integrations',action:tr('Explore Apps','浏览应用')},
  {number:'02',icon:'device' as const,label:tr('INTELLIGENT FLEET','智能设备调度'),title:tr('The right computer for the job.','把工作，交给合适的电脑。'),text:tr('Match tools, operating systems, trusted workspaces and live capacity across your own machines.','根据工具、操作系统、可信目录及实时负载，匹配自己的设备。'),href:'/docs/device-fleet',action:tr('Explore your fleet','了解设备调度')},
  {number:'03',icon:'routine' as const,label:tr('TASKS & ROUTINES','任务与 ROUTINE'),title:tr('One request. Work that follows through.','一句交代，让工作有下文。'),text:tr('Delegate a task or set up repeating work through a conversation with Arc.','通过与 Arc 对话交代任务，或安排需要重复执行的工作。'),href:'/arc',action:tr('Meet Arc','认识 Arc')},
 ];
 return <section className="homePlatformIntro" aria-labelledby="home-platform-heading">
  <header className="homePlatformHeader">
   <div><span className="eyebrow">{tr('THE REMOTE ARC PLATFORM','REMOTE ARC 平台')}</span><h2 id="home-platform-heading">{tr('Agent infrastructure for real work across your apps and computers.','让 AI 跨应用与电脑完成真实工作的基础设施。')}</h2></div>
   <div className="homePlatformSummary">
    <p><strong>Arc</strong>{tr(' is your hosted AI agent, written by AI through Connect. Give it a goal and work with it directly.',' 是 AI 通过 Connect 写出来的托管 AI 智能体，直接与它交流，把目标交给它。')}</p>
    <p><strong>Connect</strong>{tr(' brings the same authorized Apps and device execution to the AI client you already use.',' 把同一套已授权的应用与设备执行能力，接入你已有的 AI 客户端。')}</p>
    <p>{tr('Remote Arc manages context, permissions, saved work, device selection and usage around model decisions, so work can move from a request to a result you can inspect.','Remote Arc 围绕模型的决策管理上下文、权限、已保存的工作、设备选择与用量，让需求逐步成为可核查的结果。')}</p>
    <p>{tr('Remote Arc is infrastructure that turns AI decisions into authorized, traceable actions in the real world. It lets AI operate your local computer, work on remote computers you authorize, and coordinate tasks across devices.','Remote Arc 是一套把 AI 的决策转换为经过授权、可追踪的真实操作的基础设施。Remote Arc 不仅让 AI 操作本机，也能让 AI 操作你授权的远程电脑，甚至跨设备协同执行。')}</p>
    <a href={localizedWebsiteHref('/docs/architecture',locale)}>{tr('How the platform works','了解平台如何工作')}<Icon name="arrowUpRight" size={15}/></a>
   </div>
  </header>
  <div className="productFocus">{items.map(item=><article key={item.number}><div className="productFocusTop"><span>{item.number} / {item.label}</span><Icon name={item.icon} size={19}/></div><h3>{item.title}</h3><p>{item.text}</p><a href={item.href}>{item.action}<Icon name="arrowUpRight" size={15}/></a></article>)}</div>
 </section>;
}
