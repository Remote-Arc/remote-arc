import type {ArcDelegationProgress} from '@remotearc/protocol';
import {TeamAvatar} from './arc-team-avatar.js';
import './arc-team-progress.css';
type Tr=(en:string,zh:string)=>string;
export function ArcTeamProgress({items,tr}:{items:ArcDelegationProgress[];tr:Tr}){
 if(!items.length)return null;
 const members=items.flatMap(item=>item.members),completed=members.filter(member=>member.status==='completed').length;
 const label=(state:string)=>state==='completed'?tr('Completed','已完成'):state==='working'?tr('Working','进行中'):state==='queued'?tr('Queued','等待执行'):state==='paused'?tr('Paused','已暂停'):state==='cancelled'?tr('Stopped','已停止'):state==='unknown'?tr('Needs attention','需要关注'):tr('Could not finish','未能完成');
 return <section className="arcTeamProgress" aria-label={tr('Team progress','队友进度')}><div className="arcTeamProgressHeading"><strong>{tr('Team progress','队友进度')}</strong><span aria-live="polite">{completed}/{members.length} {tr('completed','已完成')}</span></div>{members.length?members.map(member=><div className="arcTeamProgressMember" key={member.id} data-status={member.status}><TeamAvatar employee={{name:member.name,avatar:member.avatar}} size={28}/><div className="arcTeamProgressText"><strong>{member.name}</strong><span>{member.status==='working'?(member.activity||tr('Working on the assignment…','正在处理分工…')):member.status==='queued'?tr('Waiting for an available work slot','等待可用的执行位置'):label(member.status)}</span></div><small className="arcTeamProgressState"><i aria-hidden="true"/>{label(member.status)}</small></div>):<p>{label(items[0]!.status)}</p>}</section>;
}
