import {useEffect,useId,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useArcChat,type ChatMessage} from './use-arc-chat.js';
import {ProductIcon as Icon,type ProductIconName} from './product-icon.js';
import './agent-chat-workspace.css';
import { OverviewGreeting } from './overview-greeting.js';
import { ArcHomeBrief } from './arc-home-brief.js';
import {ArcModelPicker} from './arc-model-picker.js';
import './arc-chat-surface.css';

type Props={navigationOpen:boolean;onNavigationChange:(open:boolean)=>void;activeTab:string;onOpenChat:()=>void;tr:(en:string,zh:string)=>string;accountId:string;accountName?:string|null;onlineDevices:number;totalDevices?:number;initialPrompt?:string;initialSessionId?:string;onOpenGoals:()=>void;onOpenRoutines:()=>void;onOpenActivity:()=>void;onOpenSettings:()=>void;onManageApps:()=>void;onManageDevices:()=>void;onManageSkills?:()=>void};
const plugins=[remarkGfm];
export function ArcNativeChat({navigationOpen,onNavigationChange,activeTab,onOpenChat,tr,accountId,accountName,onlineDevices,totalDevices=onlineDevices,initialPrompt,initialSessionId,onOpenGoals,onOpenRoutines,onOpenActivity,onOpenSettings,onManageApps,onManageDevices,onManageSkills}:Props){
 const atmosphereId=useId();
 const chat=useArcChat(accountId),[draft,setDraft]=useState(initialPrompt||''),[searchOpen,setSearchOpen]=useState(false),[search,setSearch]=useState(''),[sidebarMount,setSidebarMount]=useState<Element|null>(null);
 const mobileOpen=navigationOpen,setMobileOpen=onNavigationChange;
 const editor=useRef<HTMLTextAreaElement>(null),scrollArea=useRef<HTMLDivElement>(null),drawer=useRef<HTMLDivElement>(null);
 useEffect(()=>setSidebarMount(document.getElementById('arc-sidebar-nav-root')),[]);
  useEffect(()=>{if(initialSessionId)void chat.open(initialSessionId);},[initialSessionId,chat.open]);
 useEffect(()=>{const area=scrollArea.current;if(area)area.scrollTo({top:chat.current?area.scrollHeight:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[chat.current?.session.id,chat.current?.messages.length,chat.run?.status]);
 useEffect(()=>{
  if(!mobileOpen)return;const previous=document.activeElement as HTMLElement|null;
  const items=()=>Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')||[]).filter(e=>e.getClientRects().length);
  items()[0]?.focus();const key=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setMobileOpen(false);}if(e.key==='Tab'){const all=items(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[mobileOpen]);
 const beginNew=()=>{onOpenChat();chat.newChat();setDraft('');setMobileOpen(false);requestAnimationFrame(()=>editor.current?.focus());};
 const navigate=(fn:()=>void)=>{setMobileOpen(false);fn();};
 const examples:{icon:ProductIconName;title:string;detail:string;text:string}[]=[
  {icon:'tasks',title:tr('Move a project forward','推进项目工作'),detail:tr('Code, tests & a clear result','代码、测试与清晰结果'),text:tr('Inspect my project, identify a useful next step, do the work and verify the result.','检查我的项目，找到下一步最有用的工作，完成后验证结果。')},
  {icon:'routine',title:tr('Start a morning routine','安排晨间例行工作'),detail:tr('A daily head start','每天早上先行一步'),text:tr('Every morning at 9, summarize my email and calendar. Ask which timezone and accounts to use before scheduling it.','每天早上 9 点汇总我的邮件和日程。安排前先确认时区和使用哪些账号。')},
  {icon:'apps',title:tr('Bring my apps together','串联应用工作'),detail:tr('GitHub, Slack & more','GitHub、Slack 等应用'),text:tr('Look at my connected apps and turn recent project updates into a useful summary.','查看已连接的应用，将项目最近的进展整理成有用的摘要。')},
  {icon:'device',title:tr('Check my computers','检查电脑状态'),detail:tr('Devices & ongoing work','设备与持续工作'),text:tr('Check my connected computers and summarize what needs attention.','检查已连接的电脑，整理需要处理的问题。')},
 ];
 const filtered=chat.sessions.filter(s=>s.title.toLowerCase().includes(search.trim().toLowerCase()));
 const sidebar=(mobile:boolean)=><nav className={'arcChatNavigation'+(mobile?' arcChatNavigationMobile':'')} aria-label={tr('Arc navigation','Arc 导航')}>
  <div className="arcSidebarSectionTitle">{tr('WORKSPACE','工作空间')}</div><button type="button" className="arcSidebarPrimary" aria-label={tr('New chat','新对话')} title={tr('New chat','新对话')} onClick={beginNew}><Icon name="add"/><span>{tr('New chat','新对话')}</span></button>
  <button type="button" className="arcSidebarAction" aria-label={tr('Tasks','任务')} title={tr('Tasks','任务')} aria-current={activeTab==='agent-goals'?'page':undefined} onClick={()=>navigate(onOpenGoals)}><Icon name="tasks"/><span>{tr('Tasks','任务')}</span></button>

  <button type="button" className="arcSidebarAction" aria-label={tr('Activity','活动')} title={tr('Activity','活动')} aria-current={activeTab==='agent-activity'?'page':undefined} onClick={()=>navigate(onOpenActivity)}><Icon name="activity"/><span>{tr('Activity','活动')}</span></button>
  <div className="arcSidebarSectionTitle">{tr('TOOLS','工具')}</div>
  <button type="button" className="arcSidebarAction" aria-label={tr('Apps','应用')} title={tr('Apps','应用')} aria-current={activeTab==='agent-apps'?'page':undefined} onClick={()=>navigate(onManageApps)}><Icon name="apps"/><span>{tr('Apps','应用')}</span></button>
  <button type="button" className="arcSidebarAction" aria-label={tr('Devices','设备')} title={tr('Devices','设备')} aria-current={activeTab==='agent-devices'?'page':undefined} onClick={()=>navigate(onManageDevices)}><Icon name="device"/><span>{tr('Devices','设备')}</span></button>
  {onManageSkills&&<button type="button" className="arcSidebarAction" aria-label={tr('Skills','技能')} title={tr('Skills','技能')} aria-current={activeTab==='agent-skills'?'page':undefined} onClick={()=>navigate(onManageSkills)}><Icon name="spark"/><span>{tr('Skills','技能')}</span></button>}
  <div className="arcSidebarHistoryHeading"><span className="arcSidebarSectionTitle">{tr('RECENT CHATS','最近对话')}</span><button type="button" aria-label={tr('Search chat history','搜索对话历史')} aria-expanded={searchOpen} onClick={()=>setSearchOpen(!searchOpen)}><Icon name="search" size={14}/></button></div>
  {searchOpen&&<label className="arcSidebarSearch"><Icon name="search" size={14}/><span className="arcSrOnly">{tr('Search your chats','搜索你的对话')}</span><input autoFocus type="search" placeholder={tr('Find a conversation…','查找对话…')} value={search} onChange={e=>setSearch(e.target.value)}/></label>}
  <div className="arcSessionList">{filtered.length?filtered.map(s=><div className={'arcSessionRow'+(activeTab==='agent-chat'&&chat.current?.session.id===s.id?' selected':'')} key={s.id}>
   <button type="button" className="arcSessionOpen" title={s.title} aria-current={activeTab==='agent-chat'&&chat.current?.session.id===s.id?'page':undefined} onClick={()=>{onOpenChat();void chat.open(s.id);setMobileOpen(false);}}><Icon name="chat"/><span>{s.title}</span></button>
   <button type="button" className="arcSessionDelete" aria-label={tr('Delete chat','删除对话')+': '+s.title} onClick={()=>void chat.remove(s.id)}><Icon name="trash"/></button>
  </div>):<div className="arcSidebarEmpty">{search?tr('No matching chats','没有匹配的对话'):tr('Your conversations will appear here','你的对话会出现在这里')}</div>}</div>
  {mobile&&<button type="button" className="arcSidebarAction" onClick={()=>navigate(onOpenSettings)}><Icon name="settings"/><span>{tr('Settings','设置')}</span></button>}
 </nav>;
 const errorText=(code:string)=>{
  if(code==='MODEL_ALREADY_DISPATCHED')return tr('This request stopped before a new model call could start. Refresh your allowance, then send a new message.','这次请求未能启动新的模型调用。刷新额度后，可以发送新消息继续。');
  if(/ARC_FUNDING/.test(code))return tr('Arc’s shared model allowance is temporarily unavailable. Your conversation is saved.','Arc 的共享模型额度暂不可用，对话已保存。');
  if(/ARC_TRIAL_EXPIRED/.test(code))return tr('Your trial has ended. Your conversations and connections are saved.','试用已结束，对话与连接仍保留。');
   if(/ARC_TRIAL_REQUIRED/.test(code))return tr('Activate your trial to work with Arc.','开启试用，让 Arc 开始工作。');
   if(/PAID_MODEL/.test(code))return tr('This model needs a paid model allowance. Choose Auto to continue.','此模型需要付费模型额度，可以选择 Auto 继续。');
  if(/NOT_CONFIGURED|MODEL_AUTH|CHAT_UNAVAILABLE/.test(code))return tr('Arc is not ready in this workspace yet. Your administrator needs to finish platform setup.','此工作空间的 Arc 尚未就绪，需要管理员完成平台配置。');
  if(/BUDGET|QUOTA|TOKEN_LIMIT/.test(code))return tr('The model allowance for this run or account has been reached.','本次运行或账号的模型额度已用完。');
  if(/TIME_LIMIT|STEP_LIMIT/.test(code))return tr('This run reached its work limit. The results above are saved; you can continue in a new message.','本次运行已达到工作上限。上方结果已保存，可以发送新消息继续。');
  if(/INTERRUPTED|UNKNOWN/.test(code))return tr('The last action could not be confirmed. Check its result before repeating it.','无法确认最后一次操作的结果，请核实后再决定是否重复。');
  if(/BUSY/.test(code))return tr('A run is already working in this chat. Let it finish or stop it before sending another message.','此对话已有工作正在执行，请等待完成或停止后再发送。');
  return tr('Arc could not complete this request. Your conversation is saved.','Arc 暂时无法完成这次请求，对话已保存。');
 };
 async function submit(event:FormEvent){event.preventDefault();const value=draft.trim();if(value&&await chat.send(value))setDraft(previous=>previous.trim()===value?'':previous);}
 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!chat.busy&&!chat.running)event.currentTarget.form?.requestSubmit();}};
 const composer=<div className="arcChatBottom"><form className={'arcChatComposer'+(chat.running?' isWorking':'')} onSubmit={event=>void submit(event)}>
  <label className="arcSrOnly" htmlFor="arc-chat-input">{tr('Message Arc','发送消息给 Arc')}</label>
  <textarea ref={editor} id="arc-chat-input" rows={2} maxLength={6000} value={draft} placeholder={tr('What would you like to get done?','你想完成什么工作？')} onChange={e=>setDraft(e.target.value)} onKeyDown={onKeyDown}/>
  <div className="arcChatComposerBottom"><div className="arcChatTools">
   <ArcModelPicker models={chat.service?.models||[]} value={chat.modelId} disabled={chat.running||chat.busy} onChange={chat.setModelId} tr={tr}/>
   <button type="button" onClick={onManageDevices} title={tr('Manage computers','管理电脑')}><Icon name="device" size={14}/>{onlineDevices} {tr(onlineDevices===1?'device':'devices','台设备')}</button>
   <button type="button" onClick={onManageApps}><Icon name="apps" size={14}/>{tr('Apps','应用')}</button>
  </div>{chat.running?<button type="button" className="arcChatSend arcChatStop" onClick={()=>void chat.cancel()} aria-label={tr('Stop run','停止运行')}><Icon name="stop"/></button>:<button type="submit" className="arcChatSend" disabled={!draft.trim()||chat.busy||(!chat.service?.enabled||!chat.service.access.canUse)} aria-label={tr('Send message','发送消息')}><Icon name="arrowUp"/></button>}</div>
  </form><p className="arcChatDisclaimer">{chat.service?.access.status==='eligible'?tr('Start your free trial above to send your first message. No card needed.','请先点击上方“开启免费试用”，即可发送首条消息，无需银行卡。'):chat.service?.preview?tr('Interactive preview · simulated replies · no real tools or charges.','交互预览 · 模拟回复 · 不执行真实工具或产生费用。'):tr('Your tools. Your computers. One conversation.','你的工具，你的电脑，一次对话。')}</p></div>;
  const access=chat.service?.access;
  const trial=access&&<div className="arcTrialStatus" data-state={access.status}>
    <div><Icon name={access.status==='active'?'spark':'shield'} size={17}/><span><strong>{access.status==='eligible'?access.trialDays?tr(`Your next ${access.trialDays} days, with Arc.`,`接下来的 ${access.trialDays} 天，与 Arc 一起。`):tr('Your work, with Arc.','让 Arc 和你一起工作。'):access.status==='active'?tr(`${access.daysRemaining} days left in your trial`, `试用剩余 ${access.daysRemaining} 天`):access.status==='paid'?tr('Arc workspace is active','Arc 工作空间已启用'):tr('Your trial has ended','试用已结束')}</strong>{access.status==='eligible'&&<small>{tr('No card. No model API key. Starts when you activate it.','无需银行卡或模型 API Key，主动开启后才计时。')}</small>}{access.status==='expired'&&<small>{tr('Your conversations, results and connections are saved.','对话、结果与连接仍然保留。')}</small>}</span></div>
    {access.status==='eligible'?<button className="arcRadiantCta" type="button" disabled={!chat.service?.enabled||chat.busy} onClick={()=>void chat.startTrial()}>{tr('Start free trial','开启免费试用')}<Icon name="arrowUpRight" size={14}/></button>:access.status==='active'&&access.daysRemaining<=3?<a href="/settings?section=billing">{tr('Keep working with Arc','继续使用 Arc')}<Icon name="arrowUpRight" size={14}/></a>:access.canUse?<span>{tr('Daily usage','今日用量')} · {access.dailyUsedPercent}%</span>:<a href="/settings?section=billing">{tr('View plans','查看套餐')}<Icon name="arrowUpRight" size={14}/></a>}
  </div>;
 const toolLabel=(message:ChatMessage)=>{const args=message.arguments as Record<string,unknown>|undefined;return String(args?.operation||args?.tool||message.tool||'Tool').replaceAll('_',' ');};
 const failure=chat.error||chat.run?.error||'',failureCode=/^[A-Z_]{1,100}$/.test(failure)?failure:'CHAT_UNAVAILABLE';
 const failureNotice=failure&&<div className={'arcChatError'+(chat.current?' arcChatErrorInline':'')} role="alert"><p>{errorText(failure)}{/PAID_MODEL|ARC_TRIAL_EXPIRED/.test(failure)&&<a href="/settings?section=billing">{tr('View plans','查看套餐')} <Icon name="arrowUpRight" size={13}/></a>}</p><details className="arcChatErrorDetails"><summary>{tr('Error details','错误详情')}</summary><code>{failureCode}</code>{chat.run?.id&&<small>{tr('Run','运行')} · {chat.run.id}</small>}</details></div>;
 return <section className="arcChatShell" data-state={chat.current?'conversation':'welcome'} aria-label={tr('Arc chat','Arc 对话')}>
  {sidebarMount&&createPortal(sidebar(false),sidebarMount)}
  <div className="arcChatAtmosphere" aria-hidden="true"><div className="arcChatAurora"/><svg className="arcChatOrbits" viewBox="0 0 1800 1100" preserveAspectRatio="xMidYMid slice" fill="none"><defs><linearGradient id={atmosphereId} x1="180" y1="0" x2="1580" y2="900" gradientUnits="userSpaceOnUse"><stop stopColor="#7dd3fc" stopOpacity="0"/><stop offset=".42" stopColor="#7dd3fc" stopOpacity=".52"/><stop offset=".75" stopColor="#bae6fd" stopOpacity=".12"/><stop offset="1" stopColor="#7dd3fc" stopOpacity="0"/></linearGradient></defs><g stroke={'url(#'+atmosphereId+')'}><path d="M-320 640C60 20 560-110 1090 65S1680 570 2110 540"/><path d="M-350 675C35-10 560-150 1110 30S1730 600 2160 565"/><path d="M-380 710C10-40 560-190 1130-5S1780 630 2210 590"/><path d="M-440 780C-40-100 560-270 1170-75S1880 690 2310 640"/></g></svg><div className="arcChatHorizon"/></div><header className="arcChatTopbar"><div className="arcChatTopLeft"><button type="button" className="arcChatMobileMenu" aria-label={tr('Open chat history','打开对话历史')} onClick={()=>setMobileOpen(true)}><Icon name="menu"/></button><span className="arcChatBrand">Arc</span><span className="arcChatBeta">{tr('Personal agent','个人智能体')}</span></div><div className="arcChatTopRight"><button type="button" className="arcChatTopLink" onClick={onOpenGoals}><Icon name="tasks"/>{tr('Tasks','任务')}</button><button type="button" className="arcChatTopNew" onClick={beginNew} aria-label={tr('New chat','新对话')}><Icon name="add"/></button></div></header>
  <div className="arcChatScroll" ref={scrollArea}>{!chat.current?<div className="arcChatWelcome"><div className="arcChatStar" aria-hidden="true"><img src="/remote-arc.svg" alt=""/></div><span className="arcChatWelcomeEyebrow">{tr('A LITTLE LESS BUSYWORK','少一点琐事，多一点进展')}</span><OverviewGreeting name={accountName||null} tr={tr}/><p>{tr('Your apps, your computers, your next step. All in one conversation.','连接你的应用与电脑，在一次对话里推进工作。')}</p>{access?.status==='eligible'&&trial}{composer}<ArcHomeBrief enabled={showBrief(chat.service)} onlineDevices={onlineDevices} totalDevices={totalDevices} tr={tr} onTasks={onOpenGoals} onRoutines={onOpenRoutines} onDevices={onManageDevices} onReview={(prompt,sessionId)=>{setDraft(prompt);if(sessionId)void chat.open(sessionId).then(()=>requestAnimationFrame(()=>editor.current?.focus()));else editor.current?.focus();}}/><div className="arcChatIdeas">{examples.map(example=><button type="button" className="arcChatIdea" key={example.title} onClick={()=>{setDraft(example.text);editor.current?.focus();}}><span className="arcChatIdeaIcon"><Icon name={example.icon}/></span><strong>{example.title}</strong><span>{example.detail}</span><span className="arcChatIdeaArrow"><Icon name="arrowUpRight" size={14}/></span></button>)}</div></div>:<div className="arcChatMessages" role="log" aria-label={tr('Chat messages','对话消息')}>
   {chat.current.messages.map(message=>message.role==='tool'?<details key={message.id} className={'arcToolEvent '+message.status}><summary><span className="arcToolEventIcon"><Icon name={message.status==='completed'?'check':message.status==='unknown'?'history':'activity'}/></span><strong>{toolLabel(message)}</strong><span>{message.status==='completed'?tr('Completed','已完成'):message.status==='unknown'?tr('Check result','待核实'):tr('Working','执行中')}</span><Icon name="chevron" size={14}/></summary><div><h4>{tr('Arguments','参数')}</h4><pre>{JSON.stringify(message.arguments,null,2)}</pre>{message.result!==undefined&&<><h4>{tr('Result','结果')}</h4><pre>{typeof message.result==='string'?message.result:JSON.stringify(message.result,null,2)}</pre></>}</div></details>:<div key={message.id} className={'arcChatMessage '+message.role}>{message.role==='assistant'&&<span className="arcMessageAvatar"><img src="/remote-arc.svg" alt="Arc" width={21} height={21}/></span>}<div className="arcMessageBody">{message.role==='user'?<span className="arcMessageText">{message.text}</span>:<div className="arcMessageMarkdown"><Markdown remarkPlugins={plugins} skipHtml components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{message.text}</Markdown></div>}</div></div>)}
   {chat.running&&<div className="arcRunProgress" role="status"><span className="arcThinkingDots" aria-hidden="true"><i/><i/><i/></span><span>{chat.run?.status==='working'?tr('Working with your tools…','正在调用你的工具…'):tr('Thinking about the next step…','正在思考下一步…')}</span><small>{chat.run?.step||0}/{chat.run?.maxSteps||8}</small></div>}
   {failureNotice}
  </div>}</div>
  {!chat.current&&failureNotice}
  {chat.service&&!chat.service.enabled&&!chat.service.preview&&!chat.error&&<div className="arcChatServiceNotice" role="status">{tr('Arc is being set up for this workspace. Your connected apps and computers are available in Connect.','此工作空间正在配置 Arc。已连接的应用和电脑仍可在 Connect 中使用。')}</div>}
  {(chat.current||access?.status!=='eligible')&&trial}
  {chat.current&&composer}
  {mobileOpen&&createPortal(<div className="arcChatMobileBackdrop" role="presentation" onClick={()=>setMobileOpen(false)}><div ref={drawer} className="arcChatMobileDrawer" role="dialog" aria-modal="true" aria-label={tr('Chat history','对话历史')} onClick={e=>e.stopPropagation()}><div className="arcMobileDrawerHeader"><strong>Arc</strong><button type="button" aria-label={tr('Close','关闭')} onClick={()=>setMobileOpen(false)}><Icon name="close"/></button></div>{sidebar(true)}</div></div>,document.querySelector('.appFrame')||document.body)}
 </section>;
}
const showBrief = (service: {enabled:boolean;preview?:boolean} | null) => Boolean(service?.enabled || service?.preview);
