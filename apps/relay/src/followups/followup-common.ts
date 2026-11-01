import {z} from 'zod';
import type {FollowupSenderEnv} from '../platform/email-sender.js';
import type {EmailCapacityEnv} from '../platform/email-capacity.js';
export type FollowupEnv=FollowupSenderEnv&EmailCapacityEnv&{PUBLIC_ORIGIN:string;APP_ORIGIN?:string;MARKETING_ORIGIN?:string;FOLLOWUP_DAILY_EMAIL_LIMIT?:string;FOLLOWUP_HOURLY_EMAIL_LIMIT?:string;FOLLOWUP_MONTHLY_EMAIL_LIMIT?:string};
export const designSchema=z.object({layout:z.enum(['letter','spotlight','digest']),accent:z.string().regex(/^#[\da-f]{6}$/i),eyebrow:z.string().max(100),headline:z.string().max(200),intro:z.string().max(500),buttonLabel:z.string().max(80),highlights:z.array(z.object({title:z.string().max(100),body:z.string().max(600)}).strict()).max(3)}).strict();
export const stamp=()=>new Date().toISOString();
export type Contact={user_id:string;email:string;name:string|null;consent_at:string|null;suppressed_at:string|null;unsubscribe_token:string};
export type Message={id:string;user_id:string;subject:string;body:string;template_id:string;locale:'en'|'zh';recipient_email:string;status:string;created_at:string;provider_id:string|null;design_json:string|null;html_body:string|null;text_body:string|null;draft_revision:number;batch_id?:string|null};
export async function ensureContact(env:FollowupEnv,userId:string){
 await env.DB.prepare(`INSERT OR IGNORE INTO user_followup_contacts(user_id,unsubscribe_token,updated_at) SELECT id,?2,?3 FROM users WHERE id=?1`).bind(userId,crypto.randomUUID(),stamp()).run();
 return env.DB.prepare('SELECT c.*,u.email,u.name FROM user_followup_contacts c JOIN users u ON u.id=c.user_id WHERE c.user_id=?1').bind(userId).first<Contact>();
}
export function followupLinks(env:FollowupEnv,id:string,locale:string){
 const site=new URL(env.MARKETING_ORIGIN||'https://remotearc.app').origin,prefix=locale==='zh'?'/zh':'';
 return {feedbackUrl:site+prefix+'/feedback?source='+encodeURIComponent('followup:'+id),setupUrl:site+prefix+'/connect-ai'};
}
