import type {ChatMessage} from './use-arc-chat.js';
export type TranscriptEntry={kind:'message';message:ChatMessage}|{kind:'execution';id:string;runId:string;events:ChatMessage[]};
/** Legacy intent messages remain available as audit data, without duplicating
 * every tool event in the visible conversation. Final replies always remain. */
export function arcTranscript(messages:ChatMessage[]):TranscriptEntry[]{
 const entries:TranscriptEntry[]=[];let group:Extract<TranscriptEntry,{kind:'execution'}>|null=null,anchor='initial';
 for(const message of messages){
  if(message.role==='user')anchor=message.id;
  const runId=message.run_id||(message.id.includes(':')?message.id.split(':')[0]!:'legacy:'+anchor);
  const intent=message.role==='assistant'&&message.id.endsWith(':intent');
  if(message.role==='tool'||intent){
   if(!group||group.runId!==runId){group={kind:'execution',id:'execution:'+runId,runId,events:[]};entries.push(group);}
   if(message.role==='tool')group.events.push(message);
  }else{entries.push({kind:'message',message});group=null;}
 }
 return entries.filter(entry=>entry.kind==='message'||entry.events.length>0);
}
