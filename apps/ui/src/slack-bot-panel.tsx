import {useEffect,useState} from 'react';
import {useI18n} from './i18n.js';
import {UI_PREVIEW} from './preview.js';
import './slack-bot-panel.css';

type Link={team_id:string;slack_user_id:string;team_name:string|null;app_id:string|null;installation_status:string|null};
type Installation={team_id:string;team_name:string;app_id:string;status:string};
type State={configured:boolean;links:Link[];installations?:Installation[];modelId?:string;models?:{id:string;label:string}[];canSelectModel?:boolean};
export function SlackBotPanel(){
 const {tr}=useI18n(),[state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();fetch('/api/slack/status',{signal:controller.signal}).then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(typeof value.configured!=='boolean'||!Array.isArray(value.links))throw Error();setState(value);setError('');}).catch(()=>{if(!controller.signal.aborted)setError(tr('Could not load Slack Bot settings.','无法加载 Slack Bot 设置。'));});return()=>controller.abort();},[revision,tr]);
 async function install(){
  if(UI_PREVIEW||busy)return;setBusy(true);setError('');
  try{const response=await fetch('/api/slack/install',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),body=await response.json();if(!response.ok)throw Error();const url=new URL(body.authorizationUrl);if(url.origin!=='https://slack.com'||url.pathname!=='/oauth/v2/authorize')throw Error();location.assign(url.href);}
  catch{setError(tr('Slack Bot installation could not start. Please try again.','无法开始安装 Slack Bot，请重试。'));setBusy(false);}
 }
 async function unlink(link:Link){
  if(UI_PREVIEW||busy)return;setBusy(true);setError('');
  try{const response=await fetch('/api/slack/unlink',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({teamId:link.team_id,slackUserId:link.slack_user_id})});if(!response.ok)throw Error();setRevision(value=>value+1);}
  catch{setError(tr('Could not disconnect this Slack identity.','无法解除此 Slack 身份的关联。'));}finally{setBusy(false);}
 }
 async function changeModel(modelId:string){
  if(UI_PREVIEW||busy)return;setBusy(true);setError('');
  try{const response=await fetch('/api/slack/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({modelId})});if(!response.ok)throw Error();setRevision(value=>value+1);}
  catch{setError(tr('Could not change the Slack model. Check your plan and try again.','无法更改 Slack 模型，请检查套餐后重试。'));}finally{setBusy(false);}
 }
 return <section className="slackBotPanel" aria-label={tr('Remote Arc Bot in Slack','Slack 中的 Remote Arc Bot')}>
  <header><div><h3>{tr('Chat with Remote Arc in Slack','在 Slack 中与 Remote Arc 对话')}</h3><p>{tr('Uses your Arc plan, credits and connected tools.','使用你自己的 Arc 套餐、额度和已连接工具。')}</p></div><button className="appsManagerRefresh" type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>{tr('Refresh','刷新')}</button></header>
  {error&&<p role="alert">{error}</p>}
  {!state&&!error&&<p role="status">{tr('Loading…','正在加载…')}</p>}
  {state&&<>
   <label className="slackBotModel">{tr('Model for Slack conversations','Slack 对话模型')}<select value={state.modelId||'auto'} disabled={busy||UI_PREVIEW||!state.canSelectModel} onChange={event=>void changeModel(event.target.value)}>{(state.models||[{id:'auto',label:'Auto'}]).map(model=><option value={model.id} key={model.id}>{model.label}</option>)}</select><small>{state.canSelectModel?tr('Applies to new Slack requests.','对新的 Slack 请求生效。'):tr('Free trial uses Auto. Plus and higher plans can choose other models.','免费试用使用 Auto。Plus 及以上套餐可以选择其他模型。')}</small></label>
   <div className="slackBotLinks">{state.links.map(link=><article key={link.team_id+':'+link.slack_user_id}><div><strong>{link.team_name||link.team_id}</strong><small>{link.slack_user_id} · {link.installation_status==='active'?tr('Linked','已关联'):tr('Reinstall required','需要重新安装')}</small></div><div>{link.app_id&&link.installation_status==='active'&&<a href={'https://slack.com/app_redirect?team='+encodeURIComponent(link.team_id)+'&app='+encodeURIComponent(link.app_id)} target="_blank" rel="noreferrer">{tr('Open chat','打开对话')} ↗</a>}<button type="button" disabled={busy||UI_PREVIEW} onClick={()=>void unlink(link)}>{tr('Disconnect identity','解除身份关联')}</button></div></article>)}
   {(state.installations||[]).filter(installation=>!state.links.some(link=>link.team_id===installation.team_id)).map(installation=><article key={installation.team_id}><div><strong>{installation.team_name}</strong><small>{tr('Installed · send a message to link your account','已安装 · 发送消息关联你的账号')}</small></div><a href={'https://slack.com/app_redirect?team='+encodeURIComponent(installation.team_id)+'&app='+encodeURIComponent(installation.app_id)} target="_blank" rel="noreferrer">{tr('Open chat','打开对话')} ↗</a></article>)}
   </div>
   {!state.links.length&&<p>{tr('Install the Bot, open Remote Arc in Slack Apps and send a message to link your account.','安装 Bot 后，在 Slack 的应用中打开 Remote Arc，发送消息即可关联你的账号。')}</p>}
   <button type="button" className="appsManagerPrimary" disabled={busy||UI_PREVIEW||!state.configured} onClick={()=>void install()}>{tr('Add Remote Arc Bot to Slack','把 Remote Arc Bot 添加到 Slack')}</button>
   {!state.configured&&<small>{tr('Slack Bot setup is not complete yet.','Slack Bot 配置尚未完成。')}</small>}
  </>}
 </section>;
}
