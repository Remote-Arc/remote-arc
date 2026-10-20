import {z} from 'zod';
import {seal,unseal} from './app-oauth.js';
import {sha256Hex} from './auth.js';
import type {ArcEnv} from './arc-chat.js';
import {ARC_OUTCOME_SKILLS,arcOutcomeSkill} from './arc-outcome-skills.js';
import {ARC_VERIFICATION_SKILLS,arcVerificationSkill} from './arc-verification-skills.js';

type SkillRow={id:string;name:string;description:string;source_url:string|null;content_ciphertext:string;content_hash:string;created_at:string};
const context=(user:string,id:string)=>`arc-skill:${user}:${id}`;
export const arcSkillInput=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(500).default(''),sourceUrl:z.string().url().max(1000).refine(value=>new URL(value).protocol==='https:','HTTPS required').optional(),content:z.string().trim().min(20).max(12000).refine(value=>new TextEncoder().encode(value).length<=16000,'Skill too large')}).strict();
const summary=(row:SkillRow)=>({id:row.id,name:row.name,description:row.description,sourceUrl:row.source_url,createdAt:row.created_at,origin:'imported' as const,version:row.content_hash,owner:'account'});
export async function listArcSkills(env:ArcEnv,userId:string){
 const rows=(await env.DB.prepare('SELECT id,name,description,source_url,content_hash,created_at FROM arc_skills WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50').bind(userId).all<SkillRow>()).results;
 return {skills:[...rows.map(summary),...ARC_VERIFICATION_SKILLS.map(({content,...skill})=>({...skill,createdAt:null})),...ARC_OUTCOME_SKILLS.map(({content,...skill})=>({...skill,createdAt:null}))]};
}
export async function saveArcSkill(env:ArcEnv,userId:string,value:unknown){
 const input=arcSkillInput.parse(value),hash=await sha256Hex(input.content),id=crypto.randomUUID();
 await env.DB.prepare(`INSERT OR IGNORE INTO arc_skills(id,user_id,name,description,source_url,content_ciphertext,content_hash,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE (SELECT COUNT(*) FROM arc_skills WHERE user_id=?2)<50`).bind(id,userId,input.name,input.description,input.sourceUrl||null,await seal(env,input.content,context(userId,id)),hash,new Date().toISOString()).run();
 const row=await env.DB.prepare('SELECT id,name,description,source_url,content_hash,created_at FROM arc_skills WHERE user_id=?1 AND content_hash=?2').bind(userId,hash).first<SkillRow>();
 if(!row)throw new Error('ARC_SKILL_LIMIT');
 return summary(row);
}
export async function readArcSkill(env:ArcEnv,userId:string,id:string){
 const guide=arcVerificationSkill(id)||arcOutcomeSkill(id);if(guide)return guide;
 const row=await env.DB.prepare('SELECT * FROM arc_skills WHERE id=?1 AND user_id=?2').bind(id,userId).first<SkillRow>();
 if(!row)throw new Error('ARC_SKILL_NOT_FOUND');
 return {...summary(row),content:await unseal<string>(env,row.content_ciphertext,context(userId,id))};
}
export async function removeArcSkill(env:ArcEnv,userId:string,id:string){
 const result=await env.DB.prepare('DELETE FROM arc_skills WHERE id=?1 AND user_id=?2').bind(id,userId).run();
 return {deleted:Boolean(result.meta.changes)};
}
