import { DurableObject } from 'cloudflare:workers';
import {runArcStep} from './arc-chat-runtime.js';
import {advanceArcRoom,wakeArcRoom} from './arc-team-rooms.js';
import type {ArcEnv} from './arc-chat.js';
import {driveSlackEvent,runSlackJobs} from '../slack/slack-bot-jobs.js';

const slackEventId=/^T[A-Z0-9]{2,40}:Ev[A-Za-z0-9]{2,80}$/;

/**
 * A run, room or Slack event queue keeps working independently of an open
 * browser tab. Objects are created beside the D1 primary (see arcRuntime).
 */
export class ArcChatRuntime extends DurableObject<ArcEnv>{
 private running=false;
 async fetch(request:Request){
  const path=new URL(request.url).pathname;if(request.method!=='POST'||!['/start','/room','/slack'].includes(path))return new Response(null,{status:404});
  const input=await request.json<{runId?:string;roomId?:string;eventId?:string}>();
  if(path==='/slack'){
   // One object per Slack event; a later wake (account linked) runs it again now.
   const id=input.eventId;if(!id||!slackEventId.test(id))return new Response(null,{status:400});
   const current=await this.ctx.storage.get<string>('slackEventId');if(current&&current!==id)return new Response(null,{status:409});
   await this.ctx.storage.put('slackEventId',id);
   const alarm=await this.ctx.storage.getAlarm();if(alarm===null||alarm>Date.now())await this.ctx.storage.setAlarm(Date.now());
   return Response.json({queued:true});
  }
  const kind=path==='/room'?'room':'run',id=kind==='room'?input.roomId:input.runId;if(!id||!/^[\w-]{1,100}$/.test(id))return new Response(null,{status:400});
  const key=kind==='room'?'roomId':'runId',current=await this.ctx.storage.get<string>(key);if(current&&current!==id)return new Response(null,{status:409});
  if(await this.ctx.storage.get<string>(kind==='room'?'runId':'roomId'))return new Response(null,{status:409});
  await this.ctx.storage.put(key,id);
  if(!this.running&&await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+10);
  return Response.json({queued:true});
 }
 async alarm(){
  if(this.running)return;this.running=true;
  try{
   const slack=await this.ctx.storage.get<string>('slackEventId');
   if(slack){
    const next=await driveSlackEvent(this.env,slack);
    // A wake that arrived during this pass may already have set an earlier alarm.
    const pending=await this.ctx.storage.getAlarm();
    if(next!==null)await this.ctx.storage.setAlarm(pending===null?next:Math.min(pending,next));
    else if(pending===null)await this.ctx.storage.deleteAll();
    return;
   }
   const roomId=await this.ctx.storage.get<string>('roomId');
   if(roomId){if(await advanceArcRoom(this.env,roomId))await this.ctx.storage.setAlarm(Date.now()+30000);return;}
   const runId=await this.ctx.storage.get<string>('runId');if(!runId)return;
   if(await runArcStep(this.env,runId))await this.ctx.storage.setAlarm(Date.now()+50);
   else{
    const room=await this.env.DB.prepare('SELECT d.room_id FROM arc_employee_runs e JOIN arc_room_deliveries d ON d.id=e.delivery_id WHERE e.run_id=?1').bind(runId).first<{room_id:string}>();if(room)await wakeArcRoom(this.env,room.room_id);
    await runSlackJobs(this.env,{runId,limit:1});
    // If another worker held the Slack job's lease, look again shortly rather
    // than leaving the answer to the one-minute cron sweep.
    const slack=await this.env.DB.prepare("SELECT next_attempt_at,lease_until FROM slack_arc_events WHERE run_id=?1 AND status IN ('pending','processing','replying','waiting_run') LIMIT 1").bind(runId).first<{next_attempt_at:string;lease_until:string|null}>();
    if(slack)await this.ctx.storage.setAlarm(Math.max(Date.now()+2000,Math.min(Date.parse(slack.lease_until||'')||Infinity,Date.parse(slack.next_attempt_at))));
   }
  }catch(error){await this.ctx.storage.setAlarm(Date.now()+30000);throw error;}
  finally{this.running=false;}
 }
}
