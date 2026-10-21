import {useArcComposerInputs} from './arc-composer-inputs.js';
import {ArcComposerMenu,ArcComposerAttachments,ComposerGlyph} from './arc-composer-menu.js';
import {ArcMessageAttachments} from './arc-message-attachments.js';
import {ArcMessageReferences} from './arc-message-references.js';
import {ArcEmployeeDraftCard} from './arc-employee-draft.js';
import {Fragment,useEffect,useLayoutEffect,useId,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useArcChat} from './use-arc-chat.js';
import {ProductIcon as Icon,type ProductIconName} from './product-icon.js';
import './agent-chat-workspace.css';
import { OverviewGreeting } from './overview-greeting.js';
import { ArcHomeBrief } from './arc-home-brief.js';
import {ArcModelPicker} from './arc-model-picker.js';
import {arcTranscript} from './arc-transcript.js';
import {useArcSkillMentions,type ArcMention} from './arc-skill-mentions.js';
import {ArcVerificationScope,ArcRunReceipt} from './arc-verification-ui.js';
import {ArcTurnWork} from './arc-turn-work.js';
import {WorkspaceLoading} from './workspace-loading.js';
import './arc-chat-surface.css';
import './arc-verification.css';

type Props={navigationOpen:boolean;onNavigationChange:(open:boolean)=>void;activeTab:string;onOpenChat:()=>void;tr:(en:string,zh:string)=>string;accountId:string;accountName?:string|null;onlineDevices:number;totalDevices?:number;initialPrompt?:string;initialReferences?:ArcMention[];initialSessionId?:string;onOpenGoals:()=>void;onOpenRoutines:()=>void;onOpenActivity:()=>void;onOpenSettings:()=>void;onManageApps:()=>void;onManageDevices:()=>void;onManageTeams?:()=>void;onManageSkills?:()=>void};
const plugins=[remarkGfm];
export function ArcNativeChat({navigationOpen,onNavigationChange,activeTab,onOpenChat,tr,accountId,accountName,onlineDevices,totalDevices=onlineDevices,initialPrompt,initialReferences,initialSessionId,onOpenGoals,onOpenRoutines,onOpenActivity,onOpenSettings,onManageApps,onManageDevices,onManageSkills,onManageTeams}:Props){
 const atmosphereId=useId();
 const chat=useArcChat(accountId,initialSessionId),[draft,setDraft]=useState(initialPrompt||''),[searchOpen,setSearchOpen]=useState(false),[search,setSearch]=useState(''),[sidebarMount,setSidebarMount]=useState<Element|null>(null);
 const mobileOpen=navigationOpen,setMobileOpen=onNavigationChange;
 const editor=useRef<HTMLTextAreaElement>(null),scrollArea=useRef<HTMLDivElement>(null),drawer=useRef<HTMLDivElement>(null);
 const historyScroll=useRef<{top:number;height:number}|null>(null),followLatest=useRef(true);
 const draftRevision=useRef(0);
 useLayoutEffect(()=>{draftRevision.current++;},[draft]);
 const inputs=useArcComposerInputs(accountId,setDraft,tr);
 const [dragging,setDragging]=useState(false);
 const resourceRevision=JSON.stringify([chat.current?.employeeDrafts?.map(item=>[item.employeeId,item.status]),chat.current?.appConnections?.map(item=>[item.id,item.status])]);
 const mentions=useArcSkillMentions(accountId,draft,setDraft,editor,tr,initialReferences,resourceRevision);

 useEffect(()=>setSidebarMount(document.getElementById('arc-sidebar-nav-root')),[]);
  useEffect(()=>{if(initialSessionId)void chat.open(initialSessionId);},[initialSessionId,chat.open]);
 useLayoutEffect(()=>{const area=scrollArea.current,anchor=historyScroll.current;if(area&&anchor&&!chat.loadingHistory){area.scrollTop=anchor.top+area.scrollHeight-anchor.height;historyScroll.current=null;}},[chat.loadingHistory,chat.current?.messages.length]);
 useEffect(()=>{followLatest.current=true;},[chat.current?.session.id]);
 useEffect(()=>{const area=scrollArea.current;if(area&&!historyScroll.current&&followLatest.current)area.scrollTo({top:chat.current?area.scrollHeight:0,behavior:'instant'});},[chat.current?.session.id,chat.current?.messages.length,chat.run?.status]);
 const loadEarlier=async()=>{followLatest.current=false;const area=scrollArea.current;if(area)historyScroll.current={top:area.scrollTop,height:area.scrollHeight};if(!await chat.loadEarlier())historyScroll.current=null;};
 useEffect(()=>{
  if(!mobileOpen)return;const previous=document.activeElement as HTMLElement|null;
  const items=()=>Array.from(drawer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]')||[]).filter(e=>e.getClientRects().length);
  items()[0]?.focus();const key=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setMobileOpen(false);}if(e.key==='Tab'){const all=items(),first=all[0],last=all.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
 },[mobileOpen]);
 const beginNew=()=>{onOpenChat();chat.newChat();mentions.clear();inputs.clear();setDraft('');setMobileOpen(false);requestAnimationFrame(()=>editor.current?.focus());};
 const navigate=(fn:()=>void)=>{setMobileOpen(false);fn();};
 const examples:{icon:ProductIconName;title:string;detail:string;text:string}[]=[
  {icon:'tasks',title:tr('Move a project forward','推进项目工作'),detail:tr('Code, tests & a clear result','代码、测试与清晰结果'),text:tr('Inspect my project, identify a useful next step, do the work and verify the result.','检查我的项目，找到下一步最有用的工作，完成后验证结果。')},
  {icon:'routine',title:tr('Start a morning routine','安排晨间例行工作'),detail:tr('A daily head start','每天早上先行一步'),text:tr('Every morning at 9, summarize my email and calendar. Reuse the timezone and accounts already established in this conversation, and ask only for missing essential information.','每天早上 9 点汇总我的邮件和日程，沿用对话里已确定的时区和账号，缺少必要信息时再问我。')},
  {icon:'apps',title:tr('Bring my apps together','串联应用工作'),detail:tr('GitHub, Slack & more','GitHub、Slack 等应用'),text:tr('Look at my connected apps and turn recent project updates into a useful summary.','查看已连接的应用，将项目最近的进展整理成有用的摘要。')},
  {icon:'users',title:tr('Bring a team to the goal','让队友协作'),detail:tr('One goal, coordinated work','一个目标，协作完成'),text:tr('Create a developer, designer, business teammate and domain researcher. Organize them into a team, discuss Remote Arc’s product direction, and return their actual findings in this chat.','创建开发、设计、商务和领域专家四位队友，组队讨论 Remote Arc 的产品方向，把各自的实际分析和建议带回这个对话。')},
 ];
 const filtered=chat.sessions.filter(s=>s.title.toLowerCase().includes(search.trim().toLowerCase()));
 const sidebar=(mobile:boolean)=><nav className={'arcChatNavigation'+(mobile?' arcChatNavigationMobile':'')} aria-label={tr('Arc navigation','Arc 导航')}>
  <div className="arcSidebarSectionTitle">{tr('WORKSPACE','工作空间')}</div><button type="button" className="arcSidebarPrimary" aria-label={tr('New chat','新对话')} title={tr('New chat','新对话')} onClick={beginNew}><Icon name="add"/><span>{tr('New chat','新对话')}</span></button>
  <button type="button" className="arcSidebarAction" aria-label={tr('Tasks','任务')} title={tr('Tasks','任务')} aria-current={activeTab==='agent-goals'?'page':undefined} onClick={()=>navigate(onOpenGoals)}><Icon name="tasks"/><span>{tr('Tasks','任务')}</span></button>

  <button type="button" className="arcSidebarAction" aria-label={tr('Activity','活动')} title={tr('Activity','活动')} aria-current={activeTab==='agent-activity'?'page':undefined} onClick={()=>navigate(onOpenActivity)}><Icon name="activity"/><span>{tr('Activity','活动')}</span></button>
  <button type="button" className="arcSidebarAction" onClick={()=>{onOpenChat();mentions.openFor('employee');setMobileOpen(false);}}><Icon name="users"/><span>{tr('Teammates','队友')}</span></button>
  <div className="arcSidebarSectionTitle">{tr('TOOLS','工具')}</div>
  <button type="button" className="arcSidebarAction" aria-label={tr('Apps','应用')} title={tr('Apps','应用')} aria-current={activeTab==='agent-apps'?'page':undefined} onClick={()=>navigate(onManageApps)}><Icon name="apps"/><span>{tr('Apps','应用')}</span></button>
  <button type="button" className="arcSidebarAction" aria-label={tr('Devices','设备')} title={tr('Devices','设备')} aria-current={activeTab==='agent-devices'?'page':undefined} onClick={()=>navigate(onManageDevices)}><Icon name="device"/><span>{tr('Devices','设备')}</span></button>
  {onManageSkills&&<button type="button" className="arcSidebarAction" aria-label={tr('Skills','技能')} title={tr('Skills','技能')} aria-current={activeTab==='agent-skills'?'page':undefined} onClick={()=>navigate(onManageSkills)}><Icon name="spark"/><span>{tr('Skills','技能')}</span></button>}
  <div className="arcSidebarHistoryHeading"><span className="arcSidebarSectionTitle">{tr('RECENT CHATS','最近对话')}</span><button type="button" aria-label={tr('Search chat history','搜索对话历史')} aria-expanded={searchOpen} onClick={()=>setSearchOpen(!searchOpen)}><Icon name="search" size={14}/></button></div>
  {searchOpen&&<label className="arcSidebarSearch"><Icon name="search" size={14}/><span className="arcSrOnly">{tr('Search your chats','搜索你的对话')}</span><input autoFocus type="search" placeholder={tr('Find a conversation…','查找对话…')} value={search} onChange={e=>setSearch(e.target.value)}/></label>}
  <div className="arcSessionList">{filtered.length?filtered.map(s=><div className={'arcSessionRow'+(activeTab==='agent-chat'&&chat.current?.session.id===s.id?' selected':'')} key={s.id}>
   <button type="button" className="arcSessionOpen" title={s.title} aria-current={activeTab==='agent-chat'&&chat.current?.session.id===s.id?'page':undefined} onClick={()=>{onOpenChat();mentions.clear();void chat.open(s.id);setMobileOpen(false);}}><Icon name="chat"/><span>{s.title}</span></button>
   <button type="button" className="arcSessionDelete" aria-label={tr('Delete chat','删除对话')+': '+s.title} onClick={()=>void chat.remove(s.id)}><Icon name="trash"/></button>
  </div>):<div className="arcSidebarEmpty">{search?tr('No matching chats','没有匹配的对话'):tr('Your conversations will appear here','你的对话会出现在这里')}</div>}</div>
  {mobile&&<button type="button" className="arcSidebarAction" onClick={()=>navigate(onOpenSettings)}><Icon name="settings"/><span>{tr('Settings','设置')}</span></button>}
 </nav>;
 const errorText=(code:string)=>{
  if(code==='ARC_DEVICE_REQUIREMENTS_UNMET')return tr('No connected computer meets this request’s requirements. Review available tools, platform and workspace access.','当前没有电脑符合这次任务的工具、系统和目录要求，请检查可用设备与权限。');
  if(code==='ARC_VERIFICATION_PENDING')return tr('The selected result could not be verified. Review the receipt before continuing.','所选结果尚未核验完成，请查看回执后再继续。');
  if(code==='ARC_VERIFICATION_FAILED')return tr('A required check did not pass. Review the evidence and any acknowledged changes.','必要检查未通过，请核对证据与已确认的变更。');
  if(code==='ARC_VERIFICATION_CONNECTION_REQUIRED')return tr('Choose an active account for this task.','请为此任务选择有效的已连接账户。');
  if(code==='MODEL_ALREADY_DISPATCHED')return tr('This request stopped before a new model call could start. Refresh your allowance, then send a new message.','这次请求未能启动新的模型调用。刷新额度后，可以发送新消息继续。');
  if(/ARC_FUNDING/.test(code))return tr('Arc’s shared model allowance is temporarily unavailable. Your conversation is saved.','Arc 的共享模型额度暂不可用，对话已保存。');
  if(/ARC_TRIAL_EXPIRED/.test(code))return tr('Your trial has ended. Your conversations and connections are saved.','试用已结束，对话与连接仍保留。');
   if(/ARC_TRIAL_REQUIRED/.test(code))return tr('Activate your trial to work with Arc.','开启试用，让 Arc 开始工作。');
   if(/PAID_MODEL/.test(code))return tr('This model needs a paid model allowance. Choose Auto to continue.','此模型需要付费模型额度，可以选择 Auto 继续。');
  if(/NOT_CONFIGURED|MODEL_AUTH|CHAT_UNAVAILABLE/.test(code))return tr('Arc is not ready in this workspace yet. Your administrator needs to finish platform setup.','此工作空间的 Arc 尚未就绪，需要管理员完成平台配置。');
  if(code==='MODEL_INCOMPLETE_RESPONSE')return tr('The model did not return a complete next step. Saved actions and observations remain available below.','模型未返回完整的下一步，已执行的操作与实际返回仍保留在下方记录中。');
  if(code==='ARC_TOKEN_LIMIT')return tr('This run used its token allowance. Your results are saved; send a new message to continue.','本次运行的 token 额度已用完。结果已保留，可以发送新消息继续。');
  if(code==='ARC_CREDITS_EXHAUSTED'||code==='BILLING_CREDITS_EXHAUSTED')return tr('Your available Credits have been used. Choose a plan or top up to continue.','可用 Credits 已用完，可选择套餐或补充额度后继续。');
  if(/BUDGET|QUOTA/.test(code))return tr('A usage budget or provider limit was reached. Your results are saved. Check your allowance before continuing.','触发了用量预算或服务商限制。结果已保留，请核对额度后继续。');
  if(/TIME_LIMIT|STEP_LIMIT/.test(code))return tr('This run reached its work limit. The results above are saved; you can continue in a new message.','本次运行已达到工作上限。上方结果已保存，可以发送新消息继续。');
  if(/INTERRUPTED|UNKNOWN/.test(code))return tr('The last action could not be confirmed. Check its result before repeating it.','无法确认最后一次操作的结果，请核实后再决定是否重复。');
  if(/BUSY/.test(code))return tr('A run is already working in this chat. Let it finish or stop it before sending another message.','此对话已有工作正在执行，请等待完成或停止后再发送。');
  return tr('Arc could not complete this request. Your conversation is saved.','Arc 暂时无法完成这次请求，对话已保存。');
 };
 async function submit(event:FormEvent){
  event.preventDefault();
  const value=draft.trim()||(inputs.attachmentIds.length?tr('Please review the attached files.','请查看所附文件。'):inputs.location?tr('Please use the attached place for this request.','请结合所附地点处理这次请求。'):'');
  const revision=draftRevision.current,references=mentions.selected,attachmentIds=inputs.attachmentIds,place=inputs.location;
  if(value&&!inputs.blocked&&await chat.send(value,references.filter(item=>item.kind==='skill').map(item=>item.id),undefined,references.filter(item=>item.kind==='app').map(item=>item.id),references.filter(item=>item.kind==='employee').map(item=>item.id),{attachmentIds,...(place?{location:place}:{})})){
   if(draftRevision.current===revision)setDraft('');
   mentions.consume(references);inputs.consume(attachmentIds,place);
  }
 }
 const onKeyDown=(event:KeyboardEvent<HTMLTextAreaElement>)=>{if(mentions.onKeyDown(event))return;if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!chat.busy&&!chat.running)event.currentTarget.form?.requestSubmit();}};
 const composer=<div className="arcChatBottom"><form className={'arcChatComposer'+(chat.running?' isWorking':'')+(dragging?' isDragging':'')} onDragOver={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();setDragging(true);}}} onDragLeave={e=>{if(!(e.relatedTarget instanceof Node)||!e.currentTarget.contains(e.relatedTarget))setDragging(false);}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();setDragging(false);inputs.addFiles(e.dataTransfer.files);}}} onSubmit={event=>{followLatest.current=true;void submit(event);}}>
  <label className="arcSrOnly" htmlFor="arc-chat-input">{tr('Message Arc','发送消息给 Arc')}</label>
  {mentions.menu}<ArcComposerAttachments inputs={inputs} tr={tr}/>{mentions.chips}
  <textarea ref={editor} id="arc-chat-input" rows={2} maxLength={6000} value={draft} placeholder={tr('Tell Arc what you want to get done.','把你想完成的事告诉 Arc。')} onChange={e=>mentions.onChange(e.target.value,e.target.selectionStart)} onPaste={e=>{if(e.clipboardData.files.length){e.preventDefault();inputs.addFiles(e.clipboardData.files);}}} onKeyDown={onKeyDown} {...mentions.inputProps}/>
  <div className="arcChatComposerBottom"><div className="arcChatTools">
   <ArcComposerMenu inputs={inputs} editor={editor} tr={tr} disabled={chat.running||chat.busy} onReferences={kind=>mentions.openFor(kind)}/><ArcModelPicker models={chat.service?.models||[]} value={chat.modelId} disabled={chat.running||chat.busy} onChange={chat.setModelId} tr={tr}/>
   <button type="button" onClick={onManageDevices} title={tr('Manage computers','管理电脑')}><Icon name="device" size={14}/>{onlineDevices} {tr(onlineDevices===1?'device':'devices','台设备')}</button>
  </div><div className="arcComposerActions"><button type="button" className="arcVoiceButton" disabled={chat.running||chat.busy||!inputs.voiceSupported} data-listening={inputs.listening} onClick={inputs.toggleVoice} aria-label={inputs.listening?tr('Stop voice input','停止语音输入'):tr('Voice input','语音输入')} title={inputs.voiceSupported?tr('Voice input','语音输入'):tr('Voice input is not supported by this browser','此浏览器暂不支持语音输入')}><ComposerGlyph name="mic"/></button>{chat.running?<button type="button" className="arcChatSend arcChatStop" onClick={()=>void chat.cancel()} aria-label={tr('Stop run','停止运行')}><Icon name="stop"/></button>:<button type="submit" className="arcChatSend" disabled={(!draft.trim()&&!inputs.attachmentIds.length&&!inputs.location)||inputs.blocked||chat.busy||(!chat.service?.enabled||!chat.service.access.canUse)} aria-label={tr('Send message','发送消息')}><Icon name="arrowUp"/></button>}</div></div>
  </form><p className="arcChatDisclaimer">{chat.service?.access.status==='eligible'?tr('Start your free trial above to send your first message. No card needed.','请先点击上方“开启免费试用”，即可发送首条消息，无需银行卡。'):chat.service?.preview?tr('Interactive preview · simulated replies · no real tools or charges.','交互预览 · 模拟回复 · 不执行真实工具或产生费用。'):tr('Arc carries out your request and brings the results back here.','Arc 会推进工作，并把结果带回这里。')}</p></div>;
  const access=chat.service?.access;
  const trial=access&&<div className="arcTrialStatus" data-state={access.status}>
    <div><Icon name={access.status==='active'?'spark':'shield'} size={17}/><span><strong>{access.status==='eligible'?access.trialDays?tr(`Your next ${access.trialDays} days, with Arc.`,`接下来的 ${access.trialDays} 天，与 Arc 一起。`):tr('Your work, with Arc.','让 Arc 和你一起工作。'):access.status==='active'?tr(`${access.daysRemaining} days left in your trial`, `试用剩余 ${access.daysRemaining} 天`):access.status==='paid'?tr('Arc workspace is active','Arc 工作空间已启用'):tr('Your trial has ended','试用已结束')}</strong>{access.status==='eligible'&&<small>{tr('No card. No model API key. Starts when you activate it.','无需银行卡或模型 API Key，主动开启后才计时。')}</small>}{access.status==='expired'&&<small>{tr('Your conversations, results and connections are saved.','对话、结果与连接仍然保留。')}</small>}</span></div>
    {access.status==='eligible'?<button className="arcRadiantCta" type="button" disabled={!chat.service?.enabled||chat.busy} onClick={()=>void chat.startTrial()}>{tr('Start free trial','开启免费试用')}<Icon name="arrowUpRight" size={14}/></button>:access.status==='active'&&access.daysRemaining<=3?<a href="/checkout">{tr('Keep working with Arc','继续使用 Arc')}<Icon name="arrowUpRight" size={14}/></a>:access.canUse?<span>{tr('Daily usage','今日用量')} · {access.dailyUsedPercent}%</span>:<a href="/checkout">{tr('View plans','查看套餐')}<Icon name="arrowUpRight" size={14}/></a>}
  </div>;

 const failure=chat.error||chat.run?.error||'',failureCode=/^[A-Z_]{1,100}$/.test(failure)?failure:'CHAT_UNAVAILABLE';
 const transcript=arcTranscript(chat.current?.messages||[]);
 const beforeWork=new Map<string,NonNullable<typeof chat.run>>(),afterWork=new Map<string,NonNullable<typeof chat.run>>();
 const receiptAt=new Map<string,NonNullable<NonNullable<typeof chat.run>['receipt']>>();
 for(const run of chat.current?.runs||[]){const messages=transcript.map(entry=>entry.message).filter(message=>message.run_id===run.id),answers=messages.filter(message=>message.role==='assistant'),first=answers[0],last=answers.at(-1),user=messages.find(message=>message.role==='user');if(first)beforeWork.set(first.id,run);else if(user)afterWork.set(user.id,run);if(last&&run.receipt?.scope)receiptAt.set(last.id,run.receipt);}
 const loadingConversation=!chat.current&&Boolean(chat.selectedSessionId);
 const work=(run:NonNullable<typeof chat.run>)=><ArcTurnWork run={run} messages={chat.current?.messages.filter(message=>message.run_id===run.id)||[]} tr={tr} errorText={errorText} delegations={chat.current?.delegations?.filter(item=>item.sourceRunId===run.id)} connectionRequests={chat.current?.appConnections?.filter(request=>request.sourceRunId===run.id)} onConnectionChanged={chat.refreshCurrent}/>;
 const failureNotice=failure&&<div className={'arcChatError'+(chat.current?' arcChatErrorInline':'')} role="alert"><p>{errorText(failure)}{/PAID_MODEL|ARC_TRIAL_EXPIRED/.test(failure)&&<a href="/checkout">{tr('View plans','查看套餐')} <Icon name="arrowUpRight" size={13}/></a>}</p><details className="arcChatErrorDetails"><summary>{tr('Error details','错误详情')}</summary><code>{failureCode}</code>{chat.run?.id&&<small>{tr('Run','运行')} · {chat.run.id}</small>}</details></div>;
 return <section className="arcChatShell" data-state={chat.current?'conversation':loadingConversation?'loading':'welcome'} aria-label={tr('Arc chat','Arc 对话')}>
  {sidebarMount&&createPortal(sidebar(false),sidebarMount)}
  <div className="arcChatAtmosphere" aria-hidden="true"><div className="arcChatAurora"/><svg className="arcChatOrbits" viewBox="0 0 1800 1100" preserveAspectRatio="xMidYMid slice" fill="none"><defs><linearGradient id={atmosphereId} x1="180" y1="0" x2="1580" y2="900" gradientUnits="userSpaceOnUse"><stop stopColor="#7dd3fc" stopOpacity="0"/><stop offset=".42" stopColor="#7dd3fc" stopOpacity=".52"/><stop offset=".75" stopColor="#bae6fd" stopOpacity=".12"/><stop offset="1" stopColor="#7dd3fc" stopOpacity="0"/></linearGradient></defs><g stroke={'url(#'+atmosphereId+')'}><path d="M-320 640C60 20 560-110 1090 65S1680 570 2110 540"/><path d="M-350 675C35-10 560-150 1110 30S1730 600 2160 565"/><path d="M-380 710C10-40 560-190 1130-5S1780 630 2210 590"/><path d="M-440 780C-40-100 560-270 1170-75S1880 690 2310 640"/></g></svg><div className="arcChatHorizon"/></div><header className="arcChatTopbar"><div className="arcChatTopLeft"><button type="button" className="arcChatMobileMenu" aria-label={tr('Open chat history','打开对话历史')} onClick={()=>setMobileOpen(true)}><Icon name="menu"/></button><span className="arcChatBrand">Arc</span><span className="arcChatBeta">{tr('Personal agent','个人智能体')}</span></div><div className="arcChatTopRight"><button type="button" className="arcChatTopLink" onClick={onOpenGoals}><Icon name="tasks"/>{tr('Tasks','任务')}</button><button type="button" className="arcChatTopNew" onClick={beginNew} aria-label={tr('New chat','新对话')}><Icon name="add"/></button></div></header>
  <div className="arcChatScroll" ref={scrollArea} onScroll={event=>{const area=event.currentTarget;followLatest.current=area.scrollHeight-area.scrollTop-area.clientHeight<100;}}>{loadingConversation?<div className="arcConversationLoading" aria-busy={chat.opening}>{chat.opening||!chat.error?<WorkspaceLoading label={tr('Opening conversation…','正在打开对话…')} variant="rows"/>:<><p>{tr('Could not load this conversation.','无法加载此对话。')}</p><button type="button" onClick={()=>void chat.open(chat.selectedSessionId||initialSessionId!)}>{tr('Try again','重试')}</button></>}</div>:!chat.current?<div className="arcChatWelcome"><div className="arcChatStar" aria-hidden="true"><img src="/remote-arc.svg" alt=""/></div><span className="arcChatWelcomeEyebrow">{tr('A LITTLE LESS BUSYWORK','少一点琐事，多一点进展')}</span><OverviewGreeting name={accountName||null} tr={tr}/><p>{tr('Tell Arc your goal. It organizes the work and brings the results back here.','交代目标，让 Arc 组织工作并交付结果。')}</p>{access?.status==='eligible'&&trial}{composer}<ArcHomeBrief enabled={showBrief(chat.service)} onlineDevices={onlineDevices} totalDevices={totalDevices} tr={tr} onTasks={onOpenGoals} onRoutines={onOpenRoutines} onDevices={onManageDevices} onReview={(prompt,sessionId)=>{setDraft(prompt);if(sessionId)void chat.open(sessionId).then(()=>requestAnimationFrame(()=>editor.current?.focus()));else editor.current?.focus();}}/><div className="arcChatIdeas">{examples.map(example=><button type="button" className="arcChatIdea" key={example.title} onClick={()=>{setDraft(example.text);editor.current?.focus();}}><span className="arcChatIdeaIcon"><Icon name={example.icon}/></span><strong>{example.title}</strong><span>{example.detail}</span><span className="arcChatIdeaArrow"><Icon name="arrowUpRight" size={14}/></span></button>)}</div></div>:<div className="arcChatMessages" role="log" aria-label={tr('Chat messages','对话消息')}>
   {chat.current?.hasMore&&<button className="arcLoadHistory" type="button" disabled={chat.loadingHistory} onClick={()=>void loadEarlier()}>{chat.loadingHistory?tr('Loading earlier messages…','正在加载更早消息…'):tr('Load earlier messages','加载更早消息')}</button>}{transcript.map(entry=>{if(entry.kind!=='message')return null;const message=entry.message;return <Fragment key={message.id}>{beforeWork.has(message.id)&&work(beforeWork.get(message.id)!)}<div className={'arcChatMessage '+message.role}>{message.role==='assistant'&&<span className="arcMessageAvatar"><img src="/remote-arc.svg" alt="Arc" width={21} height={21}/></span>}<div className="arcMessageBody"><ArcMessageAttachments attachments={message.attachments} location={message.location} tr={tr}/><ArcMessageReferences message={message} tr={tr}/>{message.role==='user'?<span className="arcMessageText">{message.text}</span>:<div className="arcMessageMarkdown"><Markdown remarkPlugins={plugins} skipHtml components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{message.text}</Markdown></div>}{message.verification&&<ArcVerificationScope scope={message.verification} tr={tr}/>}{receiptAt.has(message.id)&&<ArcRunReceipt receipt={receiptAt.get(message.id)!} tr={tr}/>}</div></div>{afterWork.has(message.id)&&work(afterWork.get(message.id)!)}{chat.current?.employeeDrafts?.filter(draft=>draft.sourceRunId===message.run_id&&transcript.filter(item=>item.message.run_id===draft.sourceRunId).at(-1)?.message.id===message.id).map(draft=><ArcEmployeeDraftCard key={draft.id} draft={draft} tr={tr}/>)}</Fragment>;})}
   {chat.error&&failureNotice}
  </div>}</div>
  {!chat.current&&failureNotice}
  {chat.service&&!chat.service.enabled&&!chat.service.preview&&!chat.error&&<div className="arcChatServiceNotice" role="status">{tr('Arc is being set up for this workspace. Your connected apps and computers are available in Connect.','此工作空间正在配置 Arc。已连接的应用和电脑仍可在 Connect 中使用。')}</div>}
  {(chat.current||access?.status!=='eligible')&&trial}
  {chat.current&&composer}
  {mobileOpen&&createPortal(<div className="arcChatMobileBackdrop" role="presentation" onClick={()=>setMobileOpen(false)}><div ref={drawer} className="arcChatMobileDrawer" role="dialog" aria-modal="true" aria-label={tr('Chat history','对话历史')} onClick={e=>e.stopPropagation()}><div className="arcMobileDrawerHeader"><strong>Arc</strong><button type="button" aria-label={tr('Close','关闭')} onClick={()=>setMobileOpen(false)}><Icon name="close"/></button></div>{sidebar(true)}</div></div>,document.querySelector('.appFrame')||document.body)}
 </section>;
}
const showBrief = (service: {enabled:boolean;preview?:boolean} | null) => Boolean(service?.enabled || service?.preview);

