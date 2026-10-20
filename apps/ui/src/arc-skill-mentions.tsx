import {WorkspaceLoading} from './workspace-loading.js';
import {useEffect,useId,useRef,useState,type KeyboardEvent,type RefObject} from 'react';
import {arcRequest} from './use-arc-chat.js';

type Skill={id:string;name:string;description:string};
type Tr=(en:string,zh:string)=>string;
export function skillMentionAt(text:string,caret:number){
 const match=/(?:^|\s)@([^\s@]{0,60})$/.exec(text.slice(0,caret));
 return match?{start:caret-match[1]!.length-1,end:caret,query:match[1]!}:null;
}
/** References are sent as IDs, never inferred from an ambiguous display name. */
export function useArcSkillMentions(accountId:string,draft:string,setDraft:(value:string)=>void,editor:RefObject<HTMLTextAreaElement|null>,tr:Tr){
 const id=useId(),[open,setOpen]=useState(false),[skills,setSkills]=useState<Skill[]>([]),[selected,setSelected]=useState<Skill[]>([]),[query,setQuery]=useState(''),[index,setIndex]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 const range=useRef<ReturnType<typeof skillMentionAt>>(null),loaded=useRef(false);
 useEffect(()=>{loaded.current=false;setSkills([]);setSelected([]);setOpen(false);},[accountId]);
 useEffect(()=>{
  if(!open||loaded.current)return;
  const controller=new AbortController();setLoading(true);setError(false);
  void arcRequest<{skills:Skill[]}>('skills',undefined,controller.signal).then(data=>{if(!controller.signal.aborted){setSkills(data.skills);loaded.current=true;}}).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[open,accountId,retry]);
 const visible=skills.filter(skill=>!selected.some(item=>item.id===skill.id)&&[skill.name,skill.description].join(' ').toLowerCase().includes(query.toLowerCase())).slice(0,20);
 const choose=(skill:Skill)=>{
  if(selected.length>=3)return;
  setSelected(items=>items.some(item=>item.id===skill.id)?items:[...items,skill]);setOpen(false);
  const token=range.current;const next=token?draft.slice(0,token.start)+draft.slice(token.end):draft;
  setDraft(next);range.current=null;requestAnimationFrame(()=>{editor.current?.focus();if(token)editor.current?.setSelectionRange(token.start,token.start);});
 };
 const onKeyDown=(event:KeyboardEvent<HTMLElement>)=>{
  if(!open||event.nativeEvent.isComposing)return false;
  if(event.key==='Escape'){event.preventDefault();setOpen(false);return true;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setIndex(value=>Math.max(0,Math.min(visible.length-1,value+(event.key==='ArrowDown'?1:-1))));return true;}
  if(event.key==='Enter'){event.preventDefault();if(visible[index])choose(visible[index]!);return true;}
  return false;
 };
 const listId=id+'-skills',activeId=visible[index]?id+'-'+index:undefined;
 return{selected,clear:()=>{setSelected([]);setOpen(false);},onKeyDown,
  inputProps:{role:'combobox','aria-haspopup':'listbox' as const,'aria-autocomplete':'list' as const,'aria-expanded':open,'aria-controls':open?listId:undefined,'aria-activedescendant':open?activeId:undefined},
  onChange:(text:string,caret:number)=>{setDraft(text);range.current=skillMentionAt(text,caret);setQuery(range.current?.query||'');setIndex(0);setOpen(Boolean(range.current)&&selected.length<3);},
  button:<button type="button" disabled={selected.length>=3} aria-label={tr('Mention a skill','引用技能')} aria-expanded={open} aria-controls={open?listId:undefined} onClick={()=>{range.current=null;setQuery('');setIndex(0);setOpen(value=>!value);}}>@ {tr('Skills','技能')}</button>,
  chips:selected.length>0&&<div className="arcMentionChips">{selected.map(skill=><span key={skill.id}>@{skill.name}<button type="button" aria-label={tr('Remove skill','移除技能')+': '+skill.name} onClick={()=>setSelected(items=>items.filter(item=>item.id!==skill.id))}>×</button></span>)}</div>,
  menu:open&&<div className="arcSkillMentionMenu"><label>{tr('Reuse a skill','复用技能')}<input type="search" value={query} placeholder={tr('Find a skill…','查找技能…')} onChange={event=>{setQuery(event.target.value);setIndex(0);}} onKeyDown={onKeyDown} aria-controls={listId} aria-activedescendant={activeId}/></label>{loading?<WorkspaceLoading label={tr('Loading skills…','正在加载技能…')} variant="compact"/>:error?<p role="alert">{tr('Could not load your library.','无法加载技能库。')} <button type="button" onClick={()=>setRetry(value=>value+1)}>{tr('Retry','重试')}</button></p>:<div id={listId} role="listbox" aria-label={tr('Skills','技能')}>{visible.map((skill,i)=><button id={id+'-'+i} type="button" role="option" aria-selected={i===index} key={skill.id} onMouseEnter={()=>setIndex(i)} onClick={()=>choose(skill)}><strong>@{skill.name}</strong><small>{skill.description}</small></button>)}{!visible.length&&<p>{tr('No matching skills. Import a SKILL.md in Skills.','没有匹配的技能，可先在技能页面导入 SKILL.md。')}</p>}</div>}<footer>{tr('Choose a skill, then describe the result you want.','选择技能后，描述你希望得到的结果。')}<button type="button" onClick={()=>setOpen(false)}>{tr('Close','关闭')}</button></footer></div>
 };
}
