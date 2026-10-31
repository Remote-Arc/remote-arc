import {useEffect,useState} from 'react';
import Markdown from 'react-markdown';
import {arcRequest} from '../chat/use-arc-chat.js';
export function ArcTeamArchive({roomId,tr}:{roomId:string;tr:(en:string,zh:string)=>string}){
 const [messages,setMessages]=useState<{id:string;role:string;text:string;speaker?:{name:string}}[]|null>(null),[error,setError]=useState(false);
 useEffect(()=>{const controller=new AbortController();void arcRequest<{messages:NonNullable<typeof messages>}>('rooms/'+encodeURIComponent(roomId),undefined,controller.signal).then(value=>{if(!controller.signal.aborted)setMessages(value.messages.filter(m=>['user','assistant'].includes(m.role)&&!m.id.endsWith(':intent')));}).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[roomId]);
 return <details className="arcTeamArchive"><summary>{tr('Previous team work — read only','历史团队工作记录（只读）')}</summary><p>{tr('Continue new work in Arc Chat. Your previous messages remain here.','新的工作统一在 Arc Chat 继续，过去的消息保留在这里。')}</p>{error&&<p role="status">{tr('Could not load this record.','暂时无法读取这段记录。')}</p>}{messages?.map(message=><article key={message.id}><strong>{message.role==='user'?tr('You','你'):message.speaker?.name||'Arc'}</strong><Markdown skipHtml>{message.text}</Markdown></article>)}</details>;
}
