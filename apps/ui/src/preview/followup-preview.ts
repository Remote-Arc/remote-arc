import {renderFollowupEmail} from '../../../../packages/protocol/src/followup-email.js';
import {personalizeFollowupText} from '../../../../packages/protocol/src/followup-templates.js';
import type {Contact,Mail,NextStep,Person,BatchDetail,BatchRecipient} from '../features/admin/followups/followup-model.js';

// Isolated, persistent browser fixtures. No provider or production API is called.
export function createFollowupPreview(storage:Pick<Storage,'getItem'|'setItem'>){
 const days=(n:number)=>new Date(Date.now()+n*86400000).toISOString();
 const base={status:'new',note:null,next_followup_at:null,consent_at:null,suppressed_at:null,last_contact_at:null,feedback_count:0};
 const people:Person[]=[
  {...base,id:'preview-followup-user',name:'Alex Chen',email:'alex@example.invalid',devices:1,apps:0,mcp_connections:0,calls:0,arc_runs:0},
  {...base,id:'preview-followup-active',name:'Taylor',email:'taylor@example.invalid',devices:2,apps:3,mcp_connections:1,calls:128,arc_runs:4,status:'waiting',feedback_count:1},
  {...base,id:'preview-followup-morgan',name:'Morgan Lee',email:'morgan@example.invalid',devices:1,apps:2,mcp_connections:1,calls:420,arc_runs:8,status:'contacted',consent_at:days(-14),last_contact_at:days(-7),next_followup_at:days(2)},
  {...base,id:'preview-followup-jordan',name:'Jordan Park',email:'jordan@example.invalid',devices:1,apps:0,mcp_connections:1,calls:36,arc_runs:1,status:'waiting',consent_at:days(-10),last_contact_at:days(-5),next_followup_at:days(-1)},
  {...base,id:'preview-followup-riley',name:'Riley',email:'riley@example.invalid',devices:2,apps:1,mcp_connections:1,calls:960,arc_runs:12,status:'resolved',last_contact_at:days(-4)},
  {...base,id:'preview-followup-sam',name:'Sam',email:'sam@example.invalid',devices:0,apps:0,mcp_connections:0,calls:0,arc_runs:0,suppressed_at:days(-3)},
 ];
 const key='remotearc-followup-preview-v1',batchKey='remotearc-followup-batches-preview-v1';
 let state:Record<string,{contact:Contact;messages:Mail[]}>=JSON.parse(storage.getItem(key)||'{}');
 type PreviewBatch={detail:BatchDetail;previews:Record<string,{user_id:string;subject:string;html_body:string}>;payload:string;updated:number};
 let batches:Record<string,PreviewBatch>=JSON.parse(storage.getItem(batchKey)||'{}');
 const persist=()=>{storage.setItem(key,JSON.stringify(state));storage.setItem(batchKey,JSON.stringify(batches));};
 const detail=(id:string)=>{const person=people.find(person=>person.id===id);return state[id]??(state[id]={contact:{status:person?.status||'new',note:'',next_followup_at:person?.next_followup_at||null,consent_at:person?.consent_at||null,consent_note:person?.consent_at?'Requested product support':'',suppressed_at:person?.suppressed_at||null},messages:[]});};
 const json=(value:unknown,status=200)=>Response.json(value,{status});
 const sender={from:'Remote Arc <support@remotearc.app>',replyTo:'support@remotearc.app'};
 const block=(id:string,permission=true)=>{const item=detail(id),person=people.find(person=>person.id===id);if(item.contact.suppressed_at)return 'recipient_suppressed';if(permission&&!item.contact.consent_at)return 'contact_permission_required';if(item.messages.some(mail=>['sending','unknown'].includes(mail.status)))return 'delivery_unconfirmed';if(item.messages.some(mail=>mail.sent_at&&Date.parse(mail.sent_at)>Date.now()-72*3600000)||person?.last_contact_at&&Date.parse(person.last_contact_at)>Date.now()-72*3600000)return 'contact_cooldown';return null;};
 const counts=(item:PreviewBatch)=>{const b=item.detail.batch;for(const status of ['pending','processing','sent','failed','unknown','skipped','cancelled'] as const)b[status]=item.detail.recipients.filter(person=>person.status===status).length;if(b.status==='queued'&&!b.pending&&!b.processing){b.status='completed';b.finished_at=new Date().toISOString();}};
 // Mirrors the Relay's next step and rolling 24-hour follow-up budget.
 const nextStep=(person:Person):NextStep=>person.calls>0||person.arc_runs>0?'active':!person.devices?'pair_computer':!person.mcp_connections?'connect_ai':'first_use';
 const emailBudget=()=>{const used=Object.values(state).flatMap(item=>item.messages).filter(mail=>mail.status==='sent'&&mail.sent_at&&Date.parse(mail.sent_at)>Date.now()-86400000).length;return{limit:60,used,remaining:Math.max(0,60-used)};};
 const batchView=(item:PreviewBatch,previewUser?:string|null)=>({...item.detail,emailBudget:emailBudget(),preview:item.previews[previewUser||'']||Object.values(item.previews)[0]||null});
 const advance=()=>{for(const item of Object.values(batches)){if(item.detail.batch.status!=='queued')continue;const steps=Math.min(20,Math.floor((Date.now()-item.updated)/500));if(!steps)continue;item.updated=Date.now();for(const recipient of item.detail.recipients.filter(person=>person.status==='pending').slice(0,steps)){const reason=block(recipient.user_id);if(reason){recipient.status='skipped';recipient.error_code=reason;continue;}const contact=detail(recipient.user_id),mail=contact.messages.find(mail=>mail.id===recipient.message_id)!;mail.status='sent';mail.sent_at=new Date().toISOString();recipient.status='sent';recipient.sent_at=mail.sent_at;recipient.attempts++;contact.contact.status='contacted';contact.contact.next_followup_at=null;}counts(item);persist();}};
 return {handle(url:URL,method:string,body?:BodyInit|null){
  if(!url.pathname.startsWith('/api/admin/followups'))return null;
  const path=url.pathname.slice('/api/admin/followups'.length),value=typeof body==='string'?JSON.parse(body):{};
  if(method==='GET')advance();
  if((!path||path==='/selection')&&method==='GET'){
   const segment=url.searchParams.get('segment')||'all',tab=url.searchParams.get('tab')||'all',query=(url.searchParams.get('query')||'').toLowerCase(),page=Number(url.searchParams.get('page')||0);
   const items=people.map(person=>({...person,computers:person.devices,next_step:nextStep(person),...detail(person.id).contact,queued_followups:Object.values(batches).filter(batch=>batch.detail.batch.status==='queued'&&batch.detail.recipients.some(item=>item.user_id===person.id&&['pending','processing'].includes(item.status))).length,last_contact_at:detail(person.id).messages.filter(mail=>mail.status==='sent').map(mail=>mail.sent_at!).sort().at(-1)||person.last_contact_at})).filter(person=>(person.email+' '+person.name).toLowerCase().includes(query)).filter(person=>segment==='all'||segment.startsWith('step:')&&person.next_step===segment.slice(5)&&!person.suppressed_at||segment==='device-only'&&person.devices>0&&!person.mcp_connections&&!person.suppressed_at||segment==='unconnected'&&!person.devices&&!person.apps||segment==='unused'&&!person.calls&&!person.arc_runs||segment==='active'&&(person.calls>0||person.arc_runs>0)||segment==='suppressed'&&person.suppressed_at||segment==='due'&&person.next_followup_at&&Date.parse(person.next_followup_at)<=Date.now()&&!person.suppressed_at);
   const pending=(person:Person)=>!person.suppressed_at&&person.status!=='resolved'&&(person.status==='new'||person.next_followup_at&&Date.parse(person.next_followup_at)<=Date.now());
   const matches=(person:Person,tab:string)=>tab==='all'||tab==='pending'&&pending(person)||tab==='contacted'&&!person.suppressed_at&&(person.last_contact_at||['contacted','waiting'].includes(person.status||''))||tab==='waiting'&&!person.suppressed_at&&person.status==='waiting'||tab==='resolved'&&!person.suppressed_at&&person.status==='resolved'||tab==='suppressed'&&person.suppressed_at;
   const totals=Object.fromEntries(['all','pending','contacted','waiting','resolved','suppressed'].map(tab=>[tab,items.filter(person=>matches(person,tab)).length]));totals.due=items.filter(person=>!person.suppressed_at&&person.status!=='resolved'&&person.next_followup_at&&Date.parse(person.next_followup_at)<=Date.now()).length;
   const filtered=items.filter(person=>matches(person,tab));const sort=url.searchParams.get('sort');if(sort==='name')filtered.sort((a,b)=>(a.name||a.email).localeCompare(b.name||b.email));if(sort==='last-contact')filtered.sort((a,b)=>(b.last_contact_at||'').localeCompare(a.last_contact_at||''));
   if(path==='/selection')return json({ids:filtered.slice(0,100).map(person=>person.id),total:filtered.length,limit:100});
   const everyone=people.map(person=>({...person,...detail(person.id).contact,next_step:nextStep(person)})),open=everyone.filter(person=>!person.suppressed_at);
   const funnel={registered:everyone.length,paired:everyone.filter(person=>person.devices>0).length,connected:everyone.filter(person=>person.devices>0&&person.mcp_connections).length,used:everyone.filter(person=>person.calls>0||person.arc_runs>0).length,...Object.fromEntries(['pair_computer','connect_ai','first_use','active'].map(step=>[step,open.filter(person=>person.next_step===step).length]))};
   return json({items:filtered.slice(page*30,(page+1)*30),total:filtered.length,emailConfigured:true,counts:totals,funnel,emailBudget:emailBudget(),page,pageSize:30});
  }
  if(path==='/bulk-status'&&method==='PATCH'){for(const id of value.userIds)if(!detail(id).contact.suppressed_at)detail(id).contact.status=value.status;persist();return json({ok:true});}
  if(path==='/batches'&&method==='GET')return json({items:Object.values(batches).map(item=>item.detail.batch).reverse(),limit:100});
  if(path==='/batches'&&method==='POST'){
   if(batches[value.id])return json(batchView(batches[value.id]!));
   const item:PreviewBatch={payload:JSON.stringify(value),updated:Date.now(),previews:{},detail:{batch:{id:value.id,title:value.title,template_id:value.templateId,locale:value.locale,status:'draft',created_at:new Date().toISOString(),queued_at:null,finished_at:null,total:value.userIds.length,pending:0,processing:0,sent:0,failed:0,unknown:0,skipped:0,cancelled:0},recipients:[],preview:null,sender,basis:value.basis,basisNote:value.basisNote,emailConfigured:true}};
   for(const userId of value.userIds){const person=people.find(person=>person.id===userId);if(!person)return json({error:'user_not_found'},404);const reason=block(userId,value.basis==='existing'),id=crypto.randomUUID(),site='https://remotearc.app'+(value.locale==='zh'?'/zh':''),values={name:person.name||'there',setupUrl:site+'/connect-ai',feedbackUrl:site+'/feedback?source='+encodeURIComponent('followup:'+id)};
    const subject=personalizeFollowupText(value.subject,value.locale,values),body=personalizeFollowupText(value.body,value.locale,values),rendered=renderFollowupEmail({...value,subject,body,...values,unsubscribeUrl:'https://remotearc.app/email/follow-up/unsubscribe?token=preview',replyTo:sender.replyTo});
    const recipient:BatchRecipient={user_id:userId,message_id:reason?null:id,name:person.name,email:person.email,subject:reason?null:subject,body:reason?null:body,status:reason?'skipped':'pending',error_code:reason,attempts:0,sent_at:null};item.detail.recipients.push(recipient);
    if(!reason){const mail:Mail={id,template_id:value.templateId,locale:value.locale,subject,body,status:'draft',created_at:new Date().toISOString(),sent_at:null,error_code:null,html_body:rendered.html,design_json:JSON.stringify(value.design),draft_revision:1,batch_id:value.id};detail(userId).messages.unshift(mail);item.previews[userId]={user_id:userId,subject,html_body:rendered.html};}
   }
   counts(item);batches[value.id]=item;persist();return json(batchView(item),201);
  }
  const batchMatch=path.match(/^\/batches\/([^/]+)(?:\/(queue|cancel))?$/);
  if(batchMatch){const item=batches[batchMatch[1]!];if(!item)return json({error:'batch_not_found'},404);
   if(method==='GET')return json(batchView(item,url.searchParams.get('previewUser')));
   if(batchMatch[2]==='queue'&&method==='POST'){if(['queued','completed'].includes(item.detail.batch.status))return json(batchView(item));if(item.detail.batch.status!=='draft')return json({error:'batch_not_ready'},409);if(!item.detail.batch.pending)return json({error:'no_eligible_recipients'},409);for(const recipient of item.detail.recipients){if(recipient.status!=='pending')continue;const contact=detail(recipient.user_id).contact;if(item.detail.basis!=='existing'&&!contact.consent_at){contact.consent_at=new Date().toISOString();contact.consent_note=(item.detail.basis==='support'?'User requested installation or product support':'User agreed to this product follow-up')+(item.detail.basisNote?': '+item.detail.basisNote:'');}}item.detail.batch.status='queued';item.detail.batch.queued_at=new Date().toISOString();item.updated=Date.now();persist();return json(batchView(item),202);}
   if(batchMatch[2]==='cancel'&&method==='POST'){if(['preparing','draft','queued'].includes(item.detail.batch.status)){item.detail.batch.status='cancelled';item.detail.batch.finished_at=new Date().toISOString();for(const recipient of item.detail.recipients)if(recipient.status==='pending'){recipient.status='cancelled';recipient.error_code='batch_cancelled';}counts(item);persist();}return json(batchView(item));}
   return json({error:'method_not_allowed'},405);
  }
  if(path==='/drafts'&&method==='POST'){
   if(!people.some(person=>person.id===value.userId))return json({error:'user_not_found'},404);
   const existing=Object.values(state).flatMap(item=>item.messages).find(mail=>mail.id===value.id),item=detail(value.userId),design=JSON.stringify(value.design);
   if(existing){if(existing.batch_id)return json({error:'batch_managed_message'},409);if(!item.messages.includes(existing))return json({error:'draft_conflict'},409);if(existing.subject===value.subject.trim()&&existing.body===value.body.trim()&&existing.template_id===value.templateId&&existing.locale===value.locale&&existing.design_json===design)return json({id:existing.id,status:existing.status,revision:existing.draft_revision,htmlBody:existing.html_body});if(existing.status!=='draft')return json({error:'draft_not_editable'},409);if(existing.draft_revision!==value.expectedRevision)return json({error:'draft_conflict'},409);}
   if(!value.subject.trim()||value.body.trim().length<20)return json({error:'invalid_message'},400);
   const site='https://remotearc.app'+(value.locale==='zh'?'/zh':''),rendered=renderFollowupEmail({...value,setupUrl:site+'/connect-ai',feedbackUrl:site+'/feedback?source='+encodeURIComponent('followup:'+value.id),unsubscribeUrl:'https://remotearc.app/email/follow-up/unsubscribe?token=preview',replyTo:sender.replyTo});
   const mail:Mail={id:value.id,template_id:value.templateId,locale:value.locale,subject:value.subject.trim(),body:value.body.trim(),status:'draft',created_at:existing?.created_at||new Date().toISOString(),sent_at:null,error_code:null,html_body:rendered.html,design_json:design,draft_revision:(existing?.draft_revision||0)+1};if(existing)Object.assign(existing,mail);else item.messages.unshift(mail);persist();return json({id:mail.id,status:'draft',revision:mail.draft_revision,htmlBody:mail.html_body},existing?200:201);
  }
  const send=path.match(/^\/([^/]+)\/send$/);
  if(send&&method==='POST'){
   const item=Object.values(state).find(item=>item.messages.some(mail=>mail.id===send[1])),mail=item?.messages.find(mail=>mail.id===send[1]);if(!item||!mail)return json({error:'draft_not_found'},404);if(mail.batch_id)return json({error:'batch_managed_message'},409);if(mail.status!=='draft')return json({id:mail.id,status:mail.status});if(value.expectedRevision!==undefined&&value.expectedRevision!==mail.draft_revision)return json({error:'draft_conflict'},409);const person=Object.keys(state).find(id=>state[id]===item)!,reason=block(person);if(reason)return json({error:reason},409);mail.status='sent';mail.sent_at=new Date().toISOString();item.contact.status='contacted';item.contact.next_followup_at=null;persist();return json({id:mail.id,status:'sent'});
  }
  const id=decodeURIComponent(path.slice(1));if(!people.some(person=>person.id===id))return json({error:'user_not_found'},404);const item=detail(id);
  if(method==='GET')return json({...item,messages:item.messages.map(mail=>{const batch=mail.batch_id?batches[mail.batch_id]:null,recipient=batch?.detail.recipients.find(person=>person.message_id===mail.id);return{...mail,batch_status:batch?.detail.batch.status,batch_recipient_status:recipient?.status,error_code:mail.error_code||recipient?.error_code||null};}),emailConfigured:true,sender,rewardAvailable:false});
  if(method==='PATCH'){if(value.permission&&value.consentNote.trim().length<8)return json({error:'permission_note_required'},400);Object.assign(item.contact,{status:value.status,note:value.note,next_followup_at:value.nextFollowupAt,consent_at:value.permission?(item.contact.consent_at||new Date().toISOString()):null,consent_note:value.consentNote,suppressed_at:item.contact.suppressed_at||(value.suppress?new Date().toISOString():null)});persist();return json({ok:true});}
  return json({error:'method_not_allowed'},405);
 }};
}
