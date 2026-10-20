import {ArcReferenceIcon} from './arc-reference-icon.js';
import type {ArcMention} from './arc-skill-mentions.js';
import {workflowExperience} from './arc-skill-experience.js';
import type {ChatMessage} from './use-arc-chat.js';

export function ArcMessageReferences({message,tr}:{message:ChatMessage;tr:(en:string,zh:string)=>string}){
 const items:ArcMention[]=[
  ...(message.teammates||[]).map(person=>({kind:'employee' as const,...person,description:person.responsibility})),
  ...(message.apps||[]).map(app=>({kind:'app' as const,...app})),
  ...(message.skills||[]).map(skill=>({kind:'skill' as const,...skill,name:workflowExperience(skill.id,tr)?.title||skill.name})),
 ];
 return items.length?<div className="arcMessageSkills arcMessageReferences">{items.map(item=><span className="arcContextChip" key={item.kind+':'+item.id} title={item.description||item.name}><ArcReferenceIcon item={item}/><span className="arcReferenceName">{item.name}</span></span>)}</div>:null;
}
