import {useI18n} from './i18n.js';
import {ProductIcon as Icon} from './product-icon.js';
export function ProductFocus(){
 const {tr}=useI18n();
 const items=[
  {number:'01',icon:'apps' as const,label:tr('YOUR APPS','你的应用'),title:tr('Bring your tools together.','让常用应用一起工作。'),text:tr('Work across GitHub, Slack, Gmail, Notion and more with your connected accounts.','通过已连接账号，让 GitHub、Slack、Gmail、Notion 等应用协同工作。'),href:'/integrations',action:tr('Explore Apps','浏览应用')},
  {number:'02',icon:'device' as const,label:tr('INTELLIGENT FLEET','智能设备调度'),title:tr('The right computer for the job.','把工作，交给合适的电脑。'),text:tr('Match tools, operating systems, trusted workspaces and live capacity across your own machines.','根据工具、操作系统、可信目录及实时负载，匹配自己的设备。'),href:'/docs/device-fleet',action:tr('Explore your fleet','了解设备调度')},
  {number:'03',icon:'routine' as const,label:tr('TASKS & ROUTINES','任务与 ROUTINE'),title:tr('One request. Work that follows through.','一句交代，让工作有下文。'),text:tr('Delegate a task or set up repeating work, through a conversation with Arc.','通过对话把任务交给 Arc，或安排需要重复执行的工作。'),href:'/arc',action:tr('Meet Arc','认识 Arc')},
 ];
 return <section className="productFocus" aria-label={tr('One platform, three connected capabilities','一个平台，三种相互衔接的能力')}>{items.map(item=><article key={item.label}><div className="productFocusTop"><span>{item.number} / {item.label}</span><Icon name={item.icon} size={19}/></div><h2>{item.title}</h2><p>{item.text}</p><a href={item.href}>{item.action}<Icon name="arrowUpRight" size={15}/></a></article>)}</section>;
}
