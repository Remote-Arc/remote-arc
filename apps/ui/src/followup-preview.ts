import {renderFollowupEmail} from '../../../packages/protocol/src/followup-email.js';
import type {Contact,Mail,Person} from './admin/followup-model.js';

// Isolated browser fixtures. No provider or production API is called here.
export function createFollowupPreview(storage:Pick<Storage,'getItem'|'setItem'>){
 const people:Person[]=[
  {id:'preview-followup-user',name:'Alex Chen',email:'alex@example.invalid',devices:1,apps:0,mcp_connections:0,calls:0,arc_runs:0,status:'new',note:null,next_followup_at:null,consent_at:null,suppressed_at:null,last_contact_at:null,feedback_count:0},
  {id:'preview-followup-active',name:'Taylor',email:'taylor@example.invalid',devices:2,apps:3,mcp_connections:1,calls:128,arc_runs:4,status:'waiting',note:null,next_followup_at:null,consent_at:null,suppressed_at:null,last_contact_at:null,feedback_count:1},
 ];
 const key='remotearc-followup-preview-v1';
 let state:Record<string,{contact:Contact;messages:Mail[]}>=JSON.parse(storage.getItem(key)||'{}');
 const persist=()=>storage.setItem(key,JSON.stringify(state));
 const detail=(id:string)=>state[id]??(state[id]={contact:{status:'new',note:'',next_followup_at:null,consent_at:null,consent_note:'',suppressed_at:null},messages:[]});
 const json=(value:unknown,status=200)=>Response.json(value,{status});
 const sender={from:'Remote Arc <support@remotearc.app>',replyTo:'support@remotearc.app'};
 return {handle(url:URL,method:string,body?:BodyInit|null){
  if(!url.pathname.startsWith('/api/admin/followups'))return null;
  const path=url.pathname.slice('/api/admin/followups'.length),value=typeof body==='string'?JSON.parse(body):{};
  if(!path&&method==='GET'){
   const segment=url.searchParams.get('segment')||'all',query=(url.searchParams.get('query')||'').toLowerCase();
   const items=people.map(person=>({...person,...detail(person.id).contact,last_contact_at:detail(person.id).messages.find(mail=>mail.status==='sent')?.sent_at||null})).filter(person=>(person.email+' '+person.name).toLowerCase().includes(query)).filter(person=>segment==='all'||segment==='device-only'&&person.devices>0&&!person.mcp_connections&&!person.suppressed_at||segment==='unconnected'&&!person.devices&&!person.apps||segment==='unused'&&!person.calls&&!person.arc_runs||segment==='active'&&(person.calls>0||person.arc_runs>0)||segment==='suppressed'&&person.suppressed_at||segment==='due'&&person.next_followup_at&&Date.parse(person.next_followup_at)<=Date.now()&&!person.suppressed_at);
   return json({items,total:items.length,emailConfigured:true});
  }
  if(path==='/drafts'&&method==='POST'){
   if(!people.some(person=>person.id===value.userId))return json({error:'user_not_found'},404);
   const existing=Object.values(state).flatMap(item=>item.messages).find(mail=>mail.id===value.id),item=detail(value.userId);
   const design=JSON.stringify(value.design);
   if(existing){
    if(!item.messages.includes(existing))return json({error:'draft_conflict'},409);
    if(existing.subject===value.subject.trim()&&existing.body===value.body.trim()&&existing.template_id===value.templateId&&existing.locale===value.locale&&existing.design_json===design)return json({id:existing.id,status:existing.status,revision:existing.draft_revision,htmlBody:existing.html_body});
    if(existing.status!=='draft')return json({error:'draft_not_editable'},409);
    if(existing.draft_revision!==value.expectedRevision)return json({error:'draft_conflict'},409);
   }
   if(!value.subject.trim()||value.body.trim().length<20)return json({error:'invalid_message'},400);
   const site='https://remotearc.app'+(value.locale==='zh'?'/zh':''),rendered=renderFollowupEmail({...value,setupUrl:site+'/connect-ai',feedbackUrl:site+'/feedback?source='+encodeURIComponent('followup:'+value.id),unsubscribeUrl:'https://remotearc.app/email/follow-up/unsubscribe?token=preview',replyTo:sender.replyTo});
   const mail:Mail={id:value.id,template_id:value.templateId,locale:value.locale,subject:value.subject.trim(),body:value.body.trim(),status:'draft',created_at:existing?.created_at||new Date().toISOString(),sent_at:null,error_code:null,html_body:rendered.html,design_json:design,draft_revision:(existing?.draft_revision||0)+1};
   if(existing)Object.assign(existing,mail);else item.messages.unshift(mail);persist();
   return json({id:mail.id,status:'draft',revision:mail.draft_revision,htmlBody:mail.html_body},existing?200:201);
  }
  const send=path.match(/^\/([^/]+)\/send$/);
  if(send&&method==='POST'){
   const item=Object.values(state).find(item=>item.messages.some(mail=>mail.id===send[1])),mail=item?.messages.find(mail=>mail.id===send[1]);
   if(!item||!mail)return json({error:'draft_not_found'},404);
   if(mail.status!=='draft')return json({id:mail.id,status:mail.status});
   if(value.expectedRevision!==undefined&&value.expectedRevision!==mail.draft_revision)return json({error:'draft_conflict'},409);
   if(item.contact.suppressed_at)return json({error:'recipient_suppressed'},409);
   if(!item.contact.consent_at)return json({error:'contact_permission_required'},409);
   if(item.messages.some(other=>['sending','unknown'].includes(other.status)||other.sent_at&&Date.parse(other.sent_at)>Date.now()-72*3600000))return json({error:'contact_cooldown_or_in_progress'},409);
   mail.status='sent';mail.sent_at=new Date().toISOString();item.contact.status='contacted';persist();return json({id:mail.id,status:mail.status});
  }
  const id=decodeURIComponent(path.slice(1));
  if(!people.some(person=>person.id===id))return json({error:'user_not_found'},404);
  const item=detail(id);
  if(method==='GET')return json({...item,emailConfigured:true,sender,rewardAvailable:false});
  if(method==='PATCH'){
   if(value.permission&&value.consentNote.trim().length<8)return json({error:'permission_note_required'},400);
   Object.assign(item.contact,{status:value.status,note:value.note,next_followup_at:value.nextFollowupAt,consent_at:value.permission?(item.contact.consent_at||new Date().toISOString()):null,consent_note:value.consentNote,suppressed_at:item.contact.suppressed_at||(value.suppress?new Date().toISOString():null)});persist();return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
 }};
}
