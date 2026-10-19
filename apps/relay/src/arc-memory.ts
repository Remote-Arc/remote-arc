import {z} from 'zod';
import {seal,unseal} from './app-oauth.js';
import {sha256Hex} from './auth.js';
import type {ArcEnv,ArcRun} from './arc-chat.js';
import {ARC_MEMORY_LIMITS} from '@remotearc/protocol';

export {ARC_MEMORY_LIMITS};
type Preference={enabled:number;generation:number;updated_at:string};
type MemoryRow={id:string;kind:'fact'|'work';category:string;content_ciphertext:string;content_bytes:number;source_session_id:string|null;source_run_id:string|null;created_at:string;updated_at:string};
const aad=(userId:string,id:string)=>`arc-memory:${userId}:${id}`;
const bytes=(value:string)=>new TextEncoder().encode(value).byteLength;
function clip(value:string,maximum:number){let result=value;while(bytes(result)>maximum)result=result.slice(0,Math.max(0,result.length-50));return result;}
const secretPattern=/-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:sk|rk)_(?:test|live)_[\w]+|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]+|\bBearer\s+[A-Za-z0-9._-]{12,}|(?:password|密码|密钥|secret|access[_ -]?token)\s*[:=：]\s*\S+/i;
export const arcMemoryInput=z.object({content:z.string().trim().min(2).max(600).refine(s=>bytes(s)<=ARC_MEMORY_LIMITS.factBytes&&!secretPattern.test(s),'Use a short note without credentials'),category:z.enum(['preference','project','context']).default('context')}).strict();
export async function arcMemoryPreference(env:ArcEnv,userId:string){
  return await env.DB.prepare('SELECT enabled,generation,updated_at FROM arc_memory_preferences WHERE user_id=?1').bind(userId).first<Preference>()??{enabled:1,generation:0,updated_at:''};
}
async function rows(env:ArcEnv,userId:string){
  return(await env.DB.prepare('SELECT * FROM arc_memories WHERE user_id=?1 ORDER BY updated_at DESC,id LIMIT 140').bind(userId).all<MemoryRow>()).results;
}
export async function listArcMemory(env:ArcEnv,userId:string){
  const [preference,stored]=await Promise.all([arcMemoryPreference(env,userId),rows(env,userId)]);
  return{enabled:Boolean(preference.enabled),limits:ARC_MEMORY_LIMITS,bytes:stored.reduce((n,r)=>n+r.content_bytes,0),memories:await Promise.all(stored.map(async({content_ciphertext,...row})=>({...row,content:await unseal<string>(env,content_ciphertext,aad(userId,row.id))})))};
}
export async function configureArcMemory(env:ArcEnv,userId:string,enabled:boolean,clear=false){
  const at=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO arc_memory_preferences(user_id,enabled,generation,updated_at) VALUES(?1,?2,1,?3) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,generation=arc_memory_preferences.generation+1,updated_at=excluded.updated_at`).bind(userId,Number(enabled),at),
    ...(clear?[env.DB.prepare('DELETE FROM arc_memories WHERE user_id=?1').bind(userId)]:[]),
  ]);
  return{enabled,cleared:clear};
}
export async function removeArcMemory(env:ArcEnv,userId:string,id:string){
  const result=await env.DB.batch([
    env.DB.prepare('DELETE FROM arc_memories WHERE user_id=?1 AND id=?2').bind(userId,id),
    env.DB.prepare(`INSERT INTO arc_memory_preferences(user_id,enabled,generation,updated_at) VALUES(?1,1,1,?2) ON CONFLICT(user_id) DO UPDATE SET generation=arc_memory_preferences.generation+1,updated_at=excluded.updated_at`).bind(userId,new Date().toISOString()),
  ]);
  return{deleted:Boolean(result[0]?.meta.changes)};
}
export async function editArcMemory(env:ArcEnv,userId:string,id:string,value:unknown){
  const input=arcMemoryInput.parse(value),fingerprint=await sha256Hex(`${env.APP_TOKEN_KEY}:arc-memory:${userId}:${input.category}:${input.content}`);
  const duplicate=await env.DB.prepare("SELECT id FROM arc_memories WHERE user_id=?1 AND kind='fact' AND fingerprint=?2 AND id<>?3").bind(userId,fingerprint,id).first();
  if(duplicate)throw new Error('ARC_MEMORY_DUPLICATE');
  const result=await env.DB.prepare("UPDATE arc_memories SET category=?1,content_ciphertext=?2,content_bytes=?3,fingerprint=?4,source_session_id=NULL,source_run_id=NULL,updated_at=?5 WHERE id=?6 AND user_id=?7 AND kind='fact'").bind(input.category,await seal(env,input.content,aad(userId,id)),bytes(input.content),fingerprint,new Date().toISOString(),id,userId).run();
  if(!result.meta.changes)throw new Error('ARC_MEMORY_NOT_FOUND');
  return{id,saved:true};
}
/** Quotes come from the current user's message, never a website, file or model invention. */
export async function rememberArcFact(env:ArcEnv,userId:string,value:unknown,run?:ArcRun){
  const input=arcMemoryInput.parse(value),pref=await arcMemoryPreference(env,userId);
  if(!pref.enabled)throw new Error('ARC_MEMORY_DISABLED');
  if(run){
    if(run.user_id!==userId||run.automation_id)throw new Error('ARC_MEMORY_SOURCE_REQUIRED');
    const source=await env.DB.prepare("SELECT id,body_ciphertext FROM arc_chat_messages WHERE user_id=?1 AND run_id=?2 AND role='user' LIMIT 1").bind(userId,run.id).first<{id:string;body_ciphertext:string}>();
    if(!source)throw new Error('ARC_MEMORY_SOURCE_REQUIRED');
    const body=await unseal<{text:string}>(env,source.body_ciphertext,`arc-chat:${userId}:${source.id}`);
    if(!body.text.includes(input.content))throw new Error('ARC_MEMORY_QUOTE_REQUIRED');
  }
  const fingerprint=await sha256Hex(`${env.APP_TOKEN_KEY}:arc-memory:${userId}:${input.category}:${input.content}`),id=crypto.randomUUID(),at=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO arc_memories(id,user_id,kind,category,content_ciphertext,content_bytes,source_session_id,source_run_id,fingerprint,created_at,updated_at)
    SELECT ?1,?2,'fact',?3,?4,?5,?6,?7,?8,?9,?9
    WHERE (SELECT COUNT(*) FROM arc_memories WHERE user_id=?2 AND kind='fact')<100
      AND COALESCE((SELECT enabled FROM arc_memory_preferences WHERE user_id=?2),1)=1
      AND COALESCE((SELECT generation FROM arc_memory_preferences WHERE user_id=?2),0)=?10
      AND (?11 IS NULL OR COALESCE((SELECT updated_at FROM arc_memory_preferences WHERE user_id=?2),'')<?11)
    ON CONFLICT(user_id,kind,fingerprint) DO NOTHING`).bind(id,userId,input.category,await seal(env,input.content,aad(userId,id)),bytes(input.content),run?.session_id??null,run?.id??null,fingerprint,at,pref.generation,run?.created_at??null).run();
  const saved=await env.DB.prepare("SELECT id FROM arc_memories WHERE user_id=?1 AND kind='fact' AND fingerprint=?2").bind(userId,fingerprint).first<{id:string}>();
  if(!saved)throw new Error('ARC_MEMORY_LIMIT_OR_CHANGED');
  return{id:saved.id,saved:true};
}
/** Bounded conversation recaps use the existing reply, without another paid inference. */
export async function saveArcWorkMemory(env:ArcEnv,run:ArcRun,objective:string,answer:string){
  const pref=await arcMemoryPreference(env,run.user_id);
  if(!pref.enabled||pref.updated_at>=run.created_at||secretPattern.test(objective)||secretPattern.test(answer))return;
  const content=clip(`Request: ${clip(objective,700)}\nConversation recap: ${clip(answer,1100)}`,ARC_MEMORY_LIMITS.workBytes),id=`work:${run.id}`,at=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO arc_memories(id,user_id,kind,category,content_ciphertext,content_bytes,source_session_id,source_run_id,fingerprint,created_at,updated_at)
      SELECT ?1,?2,'work','work',?3,?4,?5,?6,?6,?7,?7
      WHERE COALESCE((SELECT enabled FROM arc_memory_preferences WHERE user_id=?2),1)=1
      AND COALESCE((SELECT generation FROM arc_memory_preferences WHERE user_id=?2),0)=?8
      AND COALESCE((SELECT updated_at FROM arc_memory_preferences WHERE user_id=?2),'')<?9`).bind(id,run.user_id,await seal(env,content,aad(run.user_id,id)),bytes(content),run.session_id,run.id,at,pref.generation,run.created_at),
    env.DB.prepare("DELETE FROM arc_memories WHERE user_id=?1 AND kind='work' AND id NOT IN (SELECT id FROM arc_memories WHERE user_id=?1 AND kind='work' ORDER BY updated_at DESC,id DESC LIMIT 40)").bind(run.user_id),
  ]);
}
const terms=(text:string)=>{const words=text.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,40}/gu)??[];const cjk=[...text.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap(m=>Array.from({length:m[0].length-1},(_,i)=>m[0].slice(i,i+2)));return[...new Set([...words,...cjk])].slice(0,80);};
/** Small per-owner scan; only relevant excerpts enter the paid model context. */
export async function arcMemoryContext(env:ArcEnv,userId:string,objective:string){
  if(!(await arcMemoryPreference(env,userId)).enabled)return[];
  const query=terms(objective),stored=await rows(env,userId);
  const candidates=await Promise.all(stored.map(async row=>{
    const content=await unseal<string>(env,row.content_ciphertext,aad(userId,row.id));
    return{row,content,score:query.filter(q=>content.toLocaleLowerCase().includes(q)).length+(row.category==='preference'?2:0)};
  }));
  candidates.sort((a,b)=>b.score-a.score||b.row.updated_at.localeCompare(a.row.updated_at));
  const result:Array<{id:string;category:string;content:string;sourceSessionId:string|null;updatedAt:string}>=[];
  for(const c of candidates){
    if(c.score===0||result.length===8)continue;
    const item={id:c.row.id,category:c.row.category,content:c.content,sourceSessionId:c.row.source_session_id,updatedAt:c.row.updated_at};
    if(bytes(JSON.stringify([...result,item]))<=ARC_MEMORY_LIMITS.contextBytes)result.push(item);
  }
  return result;
}
export async function arcDeviceContext(env:ArcEnv,userId:string){
  const devices=(await env.DB.prepare('SELECT id,name,platform,last_seen FROM devices WHERE user_id=?1 AND revoked_at IS NULL ORDER BY last_seen DESC LIMIT 8').bind(userId).all<{id:string;name:string;platform:string;last_seen:string|null}>()).results;
  return devices.map(d=>({id:d.id,name:d.name.slice(0,80),platform:d.platform,lastSeen:d.last_seen}));
}
