import {WorkspaceLoading} from './workspace-loading.js';
import {useEffect,useId,useRef,useState,type KeyboardEvent,type RefObject} from 'react';
import {arcRequest} from './use-arc-chat.js';
export type ArcMention={kind:'skill'|'app';id:string;name:string;description?:string;provider?:string};
type Tr=(en:string,zh:string)=>string;
export function skillMentionAt(text:string,caret:number){const match=/(?:^|\s)@([^\s@]{0,60})$/.exec(text.slice(0,caret));return match?{start:caret-match[1]!.length-1,end:caret,query:match[1]!}:null;}
/** References stay structured. Labels are display data, never pasted instructions or authorization. */
export function useArcSkillMentions(accountId:string,draft:string,setDraft:(value:string)=>void,editor:RefObject<HTMLTextAreaElement|null>,tr:Tr,initial:ArcMention[]=[]){
 const id=useId(),[open,setOpen]=useState(false),[items,setItems]=useState<ArcMention[]>([]),[selected,setSelected]=useState<ArcMention[]>(initial),[query,setQuery]=useState(''),[index,setIndex]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const range=useRef<ReturnType<typeof skillMentionAt>>(null),loaded=useRef(false);
 useEffect(()=>{loaded.current=false;setItems([]);setSelected(initial);setOpen(false);},[accountId]);
 useEffect(()=>{
  if(!open||loaded.current)return;const controller=new AbortController();setLoading(true);setError(false);
  void Promise.allSettled([arcRequest<{skills:Omit<ArcMention,'kind'>[]}>('skills',undefined,controller.signal),fetch('/api/apps',{credentials:'same-origin',signal:controller.signal,headers:{accept:'application/json'}}).then(async response=>{if(!response.ok)throw Error('APPS_UNAVAILABLE');return response.json() as Promise<{apps:{provider:string;name:string}[];connections:{id:string;provider:string;status:string;accountLabel?:string}[]}>;})]).then(([skills,apps])=>{
   if(controller.signal.aborted)return;const next:ArcMention[]=[];
   if(skills.status==='fulfilled')next.push(...skills.value.skills.map(skill=>({...skill,kind:'skill' as const})));
   if(apps.status==='fulfilled'){const names=new Map(apps.value.apps.map(app=>[app.provider,app.name]));next.push(...apps.value.connections.filter(connection=>connection.status==='active').map(connection=>({kind:'app' as const,id:connection.id,name:names.get(connection.provider)||connection.provider,description:connection.accountLabel||'',provider:connection.provider})));}
   setItems(next);loaded.current=skills.status==='fulfilled'&&apps.status==='fulfilled';setError(!loaded.current);
  }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
 },[open,accountId,retry]);
 const key=(item:ArcMention)=>item.kind+':'+item.id;
 const atLimit=(item:ArcMention)=>selected.filter(value=>value.kind===item.kind).length>=(item.kind==='skill'?3:5);
 const visible=items.filter(item=>!selected.some(value=>key(value)===key(item))&&!atLimit(item)&&[item.name,item.description,item.provider].join(' ').toLowerCase().includes(query.toLowerCase())).slice(0,30);
 const choose=(item:ArcMention)=>{if(atLimit(item))return;setSelected(values=>values.some(value=>key(value)===key(item))?values:[...values,item]);setOpen(false);const token=range.current;setDraft(token?draft.slice(0,token.start)+draft.slice(token.end):draft);range.current=null;requestAnimationFrame(()=>{editor.current?.focus();if(token)editor.current?.setSelectionRange(token.start,token.start);});};
 const onKeyDown=(event:KeyboardEvent<HTMLElement>)=>{if(!open||event.nativeEvent.isComposing)return false;if(event.key==='Escape'){event.preventDefault();setOpen(false);return true;}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setIndex(value=>Math.max(0,Math.min(visible.length-1,value+(event.key==='ArrowDown'?1:-1))));return true;}if(event.key==='Enter'){event.preventDefault();if(visible[index])choose(visible[index]!);return true;}return false;};
 const listId=id+'-references',activeId=visible[index]?id+'-'+index:undefined;
 return{selected,clear:()=>{setSelected([]);setOpen(false);},onKeyDown,
 inputProps:{role:'combobox','aria-haspopup':'listbox' as const,'aria-autocomplete':'list' as const,'aria-expanded':open,'aria-controls':open?listId:undefined,'aria-activedescendant':open?activeId:undefined},
 onChange:(text:string,caret:number)=>{setDraft(text);range.current=skillMentionAt(text,caret);setQuery(range.current?.query||'');setIndex(0);setOpen(Boolean(range.current)&&selected.length<8);},
 button:<button type="button" disabled={selected.length>=8} aria-label={tr('Mention an app or skill','引用应用或技能')} aria-expanded={open} aria-controls={open?listId:undefined} onClick={()=>{range.current=null;setQuery('');setIndex(0);setOpen(value=>!value);}}>@ {tr('Apps & Skills','应用与技能')}</button>,
 chips:selected.length>0&&<div className="arcMentionChips">{selected.map(item=><span key={key(item)} data-kind={item.kind} title={item.description}>@{item.name}<button type="button" aria-label={tr('Remove reference','移除引用')+': '+item.name} onClick={()=>setSelected(values=>values.filter(value=>key(value)!==key(item)))}>×</button></span>)}</div>,
 menu:open&&<div className="arcSkillMentionMenu"><label>{tr('Apps & Skills','应用与技能')}<input type="search" value={query} placeholder={tr('Find an app or skill…','查找应用或技能…')} onChange={event=>{setQuery(event.target.value);setIndex(0);}} onKeyDown={onKeyDown} aria-controls={listId} aria-activedescendant={activeId}/></label>{loading?<WorkspaceLoading label={tr('Loading references…','正在加载可引用项…')} variant="compact"/>:<>{error&&<p role="status">{tr('Some references could not load.','部分引用项未能加载。')} <button type="button" onClick={()=>setRetry(value=>value+1)}>{tr('Retry','重试')}</button></p>}<div id={listId} role="listbox" aria-label={tr('Apps and skills','应用和技能')}>{visible.map((item,i)=><button id={id+'-'+i} type="button" role="option" aria-selected={i===index} key={key(item)} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(item)}><strong>@{item.name} <small>{item.kind==='app'?tr('App','应用'):tr('Skill','技能')}</small></strong><small>{item.description}</small></button>)}{!visible.length&&<p>{tr('No matches. Connect an app or add a skill in your workspace.','没有匹配项，请先连接应用或添加技能。')}</p>}</div></>}<footer>{tr('Choose a reference, then describe your goal.','选择引用，再描述你的目标。')}<button type="button" onClick={()=>setOpen(false)}>{tr('Close','关闭')}</button></footer></div>};
}
