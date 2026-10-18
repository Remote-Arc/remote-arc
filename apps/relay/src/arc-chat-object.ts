import { DurableObject } from 'cloudflare:workers';
import { runArcStep } from './arc-chat-runtime.js';
import type { ArcEnv } from './arc-chat.js';

/** A run keeps working independently of an open browser tab. */
export class ArcChatRuntime extends DurableObject<ArcEnv>{
 private running=false;
 async fetch(request:Request){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/start')return new Response(null,{status:404});
  const {runId}=await request.json<{runId:string}>();if(!/^[\w-]{1,100}$/.test(runId))return new Response(null,{status:400});
  const current=await this.ctx.storage.get<string>('runId');if(current&&current!==runId)return new Response(null,{status:409});
  await this.ctx.storage.put('runId',runId);
  if(!this.running&&await this.ctx.storage.getAlarm()===null)await this.ctx.storage.setAlarm(Date.now()+10);
  return Response.json({queued:true});
 }
 async alarm(){
  if(this.running)return;
  this.running=true;
  try{
  const runId=await this.ctx.storage.get<string>('runId');if(!runId)return;
  if(await runArcStep(this.env,runId))await this.ctx.storage.setAlarm(Date.now()+50);
  }finally{this.running=false;}
 }
}
