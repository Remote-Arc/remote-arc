import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ChatService} from './use-arc-chat.js';
import {ProductIcon as Icon} from './product-icon.js';

type Props={models:ChatService['models'];value:string;disabled:boolean;onChange:(id:string)=>void;tr:(en:string,zh:string)=>string};
function ModelMark({model}:{model:ChatService['models'][number]}){
 if(model.provider==='openrouter')return <span className="arcModelMonogram" aria-hidden="true">{model.id.startsWith('minimax')?'M':model.id.startsWith('deepseek')?'D':model.id.startsWith('glm')?'G':'K'}</span>;
 return <img src={model.id==='auto'?'/remote-arc.svg':model.provider==='anthropic'?'/ai-claude.svg':'/ai-openai.svg'} alt=""/>;
}
export function ArcModelPicker({models,value,disabled,onChange,tr}:Props){
 const [position,setPosition]=useState<{left:number;bottom:number;width:number}|null>(null);
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),id=useId();
 const options:ChatService['models']=models.length?models:[{id:'auto',label:'Auto',provider:'arc',premium:false,configured:true}];
 const selected=options.find(m=>m.id===value)||options[0]!;
 const close=(focus=false)=>{setPosition(null);if(focus)trigger.current?.focus();};
 useEffect(()=>{
  if(!position)return;
  menu.current?.querySelector<HTMLElement>('[aria-selected=true]:not(:disabled),[role=option]:not(:disabled)')?.focus();
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setPosition(null);};
  const dismiss=()=>setPosition(null);
  const onScroll=(event:Event)=>{if(!menu.current?.contains(event.target as Node))setPosition(null);};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('scroll',onScroll,true);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('scroll',onScroll,true);};
 },[position]);
 useEffect(()=>{if(disabled)setPosition(null);},[disabled]);
 return <div className="arcModelPicker"><button ref={trigger} type="button" className="arcModelTrigger" disabled={disabled} aria-label={tr('Choose model','选择模型')} aria-haspopup="listbox" aria-expanded={Boolean(position)} aria-controls={position?id:undefined} onClick={()=>{if(position){close();return;}const rect=trigger.current!.getBoundingClientRect(),width=Math.min(300,innerWidth-24);setPosition({left:Math.max(12,Math.min(rect.left,innerWidth-width-12)),bottom:innerHeight-rect.top+9,width});}}><ModelMark model={selected}/><span>{selected.id==='auto'?'Auto':selected.label}</span><Icon name="chevron" size={12}/></button>
 {position&&createPortal(<div ref={menu} id={id} className="arcModelMenu" style={{...position,maxHeight:Math.min(360,innerHeight-position.bottom-12)}} role="listbox" aria-label={tr('Choose model','选择模型')} onKeyDown={event=>{
   const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)')||[]),index=items.indexOf(document.activeElement as HTMLButtonElement);
   if(event.key==='Escape'){event.preventDefault();close(true);}else if(event.key==='Tab'){event.preventDefault();close(true);}else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
  }}>
  {['auto','openai','anthropic','openrouter'].map(group=>{const rows=options.filter(m=>group==='auto'?m.id==='auto':m.id!=='auto'&&m.provider===group);return rows.length>0&&<div className="arcModelGroup" key={group}>{group!=='auto'&&<div className="arcModelGroupLabel">{group==='openrouter'?tr('Open models','开放模型'):group.toUpperCase()}</div>}{rows.map(model=><button type="button" role="option" aria-selected={value===model.id} disabled={!model.configured||model.requiresPaid} key={model.id} onClick={()=>{onChange(model.id);close(true);}}><ModelMark model={model}/><span><strong>{model.id==='auto'?'Auto':model.label}</strong><small>{!model.configured?tr('Currently unavailable','暂不可用'):model.requiresPaid?tr('Plus / Pro','Plus / Pro'):model.id==='auto'?tr('Automatic selection','自动选择'):null}</small></span>{value===model.id&&<Icon name="check" size={16}/>}</button>)}</div>;})}
 </div>,document.body)}
 </div>;
}
