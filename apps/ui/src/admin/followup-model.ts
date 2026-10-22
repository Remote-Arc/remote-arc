import {followupTemplate} from '../../../../packages/protocol/src/followup-templates.js';
import {DEFAULT_FOLLOWUP_DESIGN,type FollowupDesign} from '../../../../packages/protocol/src/followup-email.js';
export type Person={id:string;email:string;name:string|null;devices:number;apps:number;calls:number;arc_runs:number;mcp_connections?:number;status:string|null;note:string|null;next_followup_at:string|null;consent_at:string|null;suppressed_at:string|null;last_contact_at:string|null;feedback_count:number};
export type Contact={status:string;note:string;next_followup_at:string|null;consent_at:string|null;consent_note:string;suppressed_at:string|null};
export type Mail={id:string;template_id:string;locale:'en'|'zh';subject:string;body:string;status:string;created_at:string;sent_at:string|null;error_code:string|null;html_body:string|null;design_json:string|null;draft_revision:number};
export type ContactDetail={contact:Contact;messages:Mail[];rewardAvailable?:boolean;emailConfigured:boolean;sender?:{from:string;replyTo:string}|null};
export type EmailDraft={id:string;templateId:string;locale:'en'|'zh';subject:string;body:string;design:FollowupDesign;revision:number|null;savedFingerprint:string|null;html:string|null;edited:boolean};
export const followupTime=(value:string|null)=>value?new Date(value).toLocaleString():'—';
export const draftFingerprint=(draft:EmailDraft)=>JSON.stringify([draft.templateId,draft.locale,draft.subject.trim(),draft.body.trim(),draft.design]);
export const draftDirty=(draft:EmailDraft)=>draftFingerprint(draft)!==draft.savedFingerprint;
export function newFollowupDraft(person:Person,locale:'en'|'zh',templateId=person.devices>0&&person.mcp_connections===0?'finish-mcp':'experience'):EmailDraft{
 const id=crypto.randomUUID(),site='https://remotearc.app'+(locale==='zh'?'/zh':'');
 const text=followupTemplate(templateId,locale,{name:person.name||(locale==='zh'?'朋友':'there'),setupUrl:site+'/connect-ai',feedbackUrl:site+'/feedback?source='+encodeURIComponent('followup:'+id)});
 return{id,templateId,locale,...text,design:{...DEFAULT_FOLLOWUP_DESIGN,highlights:[]},revision:null,savedFingerprint:null,html:null,edited:false};
}
export function savedFollowupDraft(mail:Mail):EmailDraft{
 let design={...DEFAULT_FOLLOWUP_DESIGN,highlights:[]} as FollowupDesign;
 try{if(mail.design_json)design={...design,...JSON.parse(mail.design_json)};}catch{/* Legacy drafts without a design use the default. */}
 const draft:EmailDraft={id:mail.id,templateId:mail.template_id,locale:mail.locale,subject:mail.subject,body:mail.body,design,revision:mail.draft_revision||1,savedFingerprint:null,html:mail.html_body,edited:false};
 return{...draft,savedFingerprint:draftFingerprint(draft)};
}
export class FollowupApiError extends Error{constructor(message:string,readonly data:Record<string,unknown>={}){super(message);}}
export async function followupApi<T>(path:string,options?:RequestInit){
 const response=await fetch('/api/admin/followups'+path,{credentials:'same-origin',...options,headers:{'content-type':'application/json',...options?.headers}});
 const data=await response.json().catch(()=>({error:'invalid_response'}));
 if(!response.ok)throw new FollowupApiError(data.error||'request_failed',data);
 return data as T;
}
