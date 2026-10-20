import { DurableObject } from 'cloudflare:workers';
import {runArcStep} from './arc-chat-runtime.js';
import {advanceArcRoom,wakeArcRoom} from './arc-team-rooms.js';
import type {ArcEnv} from './arc-chat.js';

/** A run or room queue keeps working independently of an open browser tab. */
export class ArcChatRuntime extends DurableObject<ArcEnv>{
 private running=false;
 async fetch(request:Request){
  const path=new URL(request.url).pathname;if(request.method!=='POST'||!['/start','/room'].includes(path))return new Response(null,{status:404});
  const input=await request.json<{runId?:string;roomId?:string}>(),kind=path==='/room'?'room':'run',id=kind==='room'?input.roomId:input.runId;if(!id||!/^[\w-]{1,100}$/.test(id))return new Response(null,{status:400});
  const key=kind==='room'?'roomId':'runId',current=await this.ctx.storage.get<string>(key);if(current&&current!==id)return new Response(null,{status:409});
  if(await this.ctx.storage.get<string>(kind==='room'?'runId':'roomId'))return new Response(null,{status:409});
  await this.ctx.storage.put(key,id);
  if(!this.running&&await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+10);
  return Response.json({queued:true});
 }
 async alarm(){
  if(this.running)return;this.running=true;
  try{
   const roomId=await this.ctx.storage.get<string>('roomId');
   if(roomId){if(await advanceArcRoom(this.env,roomId))await this.ctx.storage.setAlarm(Date.now()+30000);return;}
   const runId=await this.ctx.storage.get<string>('runId');if(!runId)return;
   if(await runArcStep(this.env,runId))await this.ctx.storage.setAlarm(Date.now()+50);
   else{const room=await this.env.DB.prepare('SELECT d.room_id FROM arc_employee_runs e JOIN arc_room_deliveries d ON d.id=e.delivery_id WHERE e.run_id=?1').bind(runId).first<{room_id:string}>();if(room)await wakeArcRoom(this.env,room.room_id);}
  }catch(error){await this.ctx.storage.setAlarm(Date.now()+30000);throw error;}
  finally{this.running=false;}
 }
}
