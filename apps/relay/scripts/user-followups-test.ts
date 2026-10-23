import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sha256Hex} from '../src/auth.js';
import {handleAdminServiceRequest} from '../src/admin-service.js';
import {handleFollowupUnsubscribe,type FollowupEnv} from '../src/user-followups.js';
import {FOLLOWUP_TEMPLATES,followupTemplate} from '../../../packages/protocol/src/followup-templates.js';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
const db={prepare(query:string){const statement=sql.prepare(query);const bound=(args:unknown[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){const r=statement.run(...args);return{success:true,meta:{changes:Number(r.changes)}};}});return{...bound([]),bind(...args:unknown[]){assert(!args.includes(undefined),query);return bound(args);}};}} as unknown as D1Database;
const now=new Date().toISOString(),future=new Date(Date.now()+86400000).toISOString(),origin='https://admin.remotearc.app';
for(const id of ['admin','person','other']){
 sql.prepare('INSERT INTO users(id,google_sub,email,name,role,created_at) VALUES(?,?,?,?,?,?)').run(id,id,id+'@example.invalid',id,id==='admin'?'admin':'user',now);
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex('followup-'+id),id,future,now);
}
const env={DB:db,PUBLIC_ORIGIN:'https://mcp.remotearc.app',ADMIN_ORIGIN:origin,RESEND_API_KEY:'fixture-key',EMAIL_FROM:'Remote Arc <hello@example.invalid>'} as any;
const request=(path='',method='GET',value?:unknown,actor='admin',requestOrigin=origin)=>new Request(origin+'/api/admin/followups'+path,{method,headers:{cookie:'rl_session=followup-'+actor,origin:requestOrigin,'content-type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});
const api=(path='',method='GET',value?:unknown,actor='admin',requestOrigin=origin)=>handleAdminServiceRequest(request(path,method,value,actor,requestOrigin),env);
const decode=async(response:Response,status=200)=>{const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;};
assert.equal((await api('','GET',undefined,'person')).status,403);
assert.equal((await api('','GET',undefined,'nobody')).status,401);
assert.equal((await api('/person','PATCH',{},'admin','https://evil.invalid')).status,403);
assert.equal((await handleAdminServiceRequest(new Request('https://mcp.remotearc.app/api/admin/followups'),env)).status,404);
const listing=await decode(await api('?segment=unconnected'));assert.equal(listing.total,3);assert(listing.emailConfigured);
sql.prepare('INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)').run('paired','person','Computer','windows','fixture-device',now);
assert.deepEqual((await decode(await api('?segment=device-only'))).items.map((person:any)=>person.id),['person']);
const expired=new Date(Date.now()-86400000).toISOString();
sql.prepare('INSERT INTO oauth_tokens(access_token_hash,client_id,user_id,resource,scope,expires_at,refresh_expires_at,created_at,grant_id) VALUES(?,?,?,?,?,?,?,?,?)').run('mcp-fixture','fixture-client','person','https://mcp.remotearc.app','devices:read',expired,future,now,'fixture-grant');
assert.equal((await decode(await api('?segment=device-only'))).total,0,'A refreshable MCP authorization counts as connected');
sql.prepare('UPDATE oauth_tokens SET refresh_expires_at=?').run(expired);
assert.equal((await decode(await api('?segment=device-only'))).total,1,'An expired authorization does not count as connected');
sql.prepare('UPDATE oauth_tokens SET expires_at=?,revoked_at=?').run(future,now);
assert.equal((await decode(await api('?segment=device-only'))).total,1,'Revoked authorizations do not hide unfinished MCP setup');
sql.prepare('UPDATE oauth_tokens SET revoked_at=NULL').run();
assert.equal((await decode(await api('?segment=device-only'))).total,0,'A valid MCP access token counts as connected');
sql.prepare('DELETE FROM oauth_tokens').run();
for(const from of [undefined,'','   ']){
 const status=await decode(await handleAdminServiceRequest(request(),{...env,FOLLOWUP_FROM:from}));
 assert.equal(status.emailConfigured,true,'An optional sender override must not disable the existing email channel');
 const detail=await decode(await handleAdminServiceRequest(request('/person'),{...env,FOLLOWUP_FROM:from,FOLLOWUP_REPLY_TO:from}));
 assert.deepEqual(detail.sender,{from:'Remote Arc <support@remotearc.app>',replyTo:'support@remotearc.app'},'Login sender settings and blank overrides must not replace the follow-up support sender');
}
for(const key of [undefined,'','   ']){
 const status=await decode(await handleAdminServiceRequest(request(),{...env,RESEND_API_KEY:key}));
 assert.equal(status.emailConfigured,false,'A missing or blank Resend key must keep sending disabled');
}
const profile={status:'waiting',note:'Help requested through support',nextFollowupAt:now,permission:true,consentNote:'Support request on 2026-10-19',suppress:false};
await decode(await api('/person','PATCH',profile));assert.equal((await decode(await api('?segment=due'))).total,1);
const createDraft=async(userId='person')=>{const id=crypto.randomUUID(),text=followupTemplate('experience','en',{name:'Person',setupUrl:'https://remotearc.app/connect-ai',feedbackUrl:'https://remotearc.app/feedback?source=followup:'+id});const input={id,userId,templateId:'experience',locale:'en',...text,design:{layout:'spotlight',accent:'#244b46',eyebrow:'From the team',headline:'Your next result',intro:'A personal follow-up.',buttonLabel:'Share your feedback',highlights:[{title:'Arc',body:'Your AI teammate'}]}};const draft=await decode(await api('/drafts','POST',input),201);assert.equal(draft.htmlBody,sql.prepare('SELECT html_body FROM user_followup_messages WHERE id=?').get(id)?.html_body,'Review receives the exact saved HTML');assert.equal((await decode(await api('/drafts','POST',input))).htmlBody,draft.htmlBody,'Draft replay returns the same reviewed snapshot');assert.equal((await api('/drafts','POST',{...input,design:{...input.design,accent:'#ffffff'}})).status,409,'Reviewed design is immutable for this draft ID');return draft.id as string;};
const id=await createDraft();
const original=sql.prepare('SELECT * FROM user_followup_messages WHERE id=?').get(id)!;
const changed={id,userId:'person',templateId:'experience',locale:'en',subject:'Updated support follow-up',body:String(original.body)+'\n\nA saved draft can still be edited.',design:JSON.parse(String(original.design_json)),expectedRevision:1};
const edited=await decode(await api('/drafts','POST',changed));assert.equal(edited.revision,2);assert(edited.htmlBody.includes('Updated support follow-up'));
assert.equal((await decode(await api('/drafts','POST',changed))).revision,2,'Retried saves return the same revision');
assert.equal((await decode(await api('/drafts','POST',{...changed,body:changed.body+' Stale edit.'}),409)).error,'draft_conflict');
assert.equal((await decode(await api('/drafts','POST',{...changed,userId:'other',expectedRevision:2}),409)).error,'draft_conflict','Draft ownership cannot be changed');
assert.equal((await decode(await api('/'+id+'/send','POST',{expectedRevision:1}),409)).error,'draft_conflict','An outdated reviewed snapshot is never sent');
const detail=await decode(await api('/person'));assert.equal(detail.messages[0].draft_revision,2);assert.deepEqual(detail.sender,{from:'Remote Arc <support@remotearc.app>',replyTo:'support@remotearc.app'});assert(detail.emailConfigured);assert(!JSON.stringify(detail).includes('fixture-key'));
let sends=0;const native=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 assert.equal(String(input),'https://api.resend.com/emails');sends++;
 assert.equal(new Headers(options?.headers).get('idempotency-key'),'followup/'+id);
 const body=JSON.parse(String(options?.body));assert.equal(body.from,detail.sender.from);assert.equal(body.reply_to,detail.sender.replyTo);assert.deepEqual(body.to,['person@example.invalid']);assert(body.text.includes('/email/follow-up/unsubscribe?token='));assert(body.headers['List-Unsubscribe-Post']);assert(body.html.includes('role="presentation"'));assert(body.html.includes('Share your feedback'));assert(body.html.includes('Your next result'));assert.equal(body.html,sql.prepare('SELECT html_body FROM user_followup_messages WHERE id=?').get(id)?.html_body,'Sending uses the exact saved HTML snapshot');assert(!/<img[^>]+(?:token=|person%40|person@)/i.test(body.html),'Brand image is static, with no recipient tracking');
 return Response.json({id:'provider-fixture'});
};
try{
 for(const key of [undefined,'','   ']){
  await decode(await handleAdminServiceRequest(request('/'+id+'/send','POST',{}),{...env,RESEND_API_KEY:key}),503);
  assert.equal(sql.prepare('SELECT status FROM user_followup_messages WHERE id=?').get(id)?.status,'draft');
 }
 assert.equal(sends,0,'Disabled channels never dispatch or claim a reviewed draft');
 const [first,second]=await Promise.all([api('/'+id+'/send','POST',{}),api('/'+id+'/send','POST',{})]);
 assert([200,409].includes(first.status));assert([200,409].includes(second.status));assert.equal(sends,1);
 assert.equal((await decode(await api('/'+id+'/send','POST',{}))).status,'sent');assert.equal(sends,1);
 assert.equal((await decode(await api('/drafts','POST',{...changed,subject:'Cannot edit a sent email',expectedRevision:2}),409)).error,'draft_not_editable');
 const later=await createDraft();assert.equal((await api('/'+later+'/send','POST',{})).status,409);assert.equal(sends,1,'72 hour cooldown blocks another draft');
 env.FOLLOWUP_FROM=' Remote Arc Support <help@example.invalid> ';env.FOLLOWUP_REPLY_TO=' replies@example.invalid ';
 const other=await createDraft('other');assert.equal((await decode(await api('/'+other+'/send','POST',{}),409)).error,'contact_permission_required');
 await decode(await api('/other','PATCH',{...profile,nextFollowupAt:null}));
 const configured=await decode(await api('/other'));assert.deepEqual(configured.sender,{from:'Remote Arc Support <help@example.invalid>',replyTo:'replies@example.invalid'});
 globalThis.fetch=async(_input,options)=>{const payload=JSON.parse(String(options?.body));assert.equal(payload.from,configured.sender.from,'Dedicated follow-up sender overrides remain authoritative');assert.equal(payload.reply_to,configured.sender.replyTo);assert(payload.text.includes(configured.sender.replyTo));sends++;throw Error('simulated ambiguous timeout');};
 assert.equal((await api('/'+other+'/send','POST',{})).status,502);assert.equal((await decode(await api('/'+other+'/send','POST',{}))).status,'unknown');assert.equal(sends,2,'Unknown deliveries never trigger a blind resend');
 const contact=sql.prepare('SELECT * FROM user_followup_contacts WHERE user_id=?').get('person')!;
 const unsubscribe='https://remotearc.app/email/follow-up/unsubscribe?token='+contact.unsubscribe_token;
 assert.equal((await handleFollowupUnsubscribe(new Request(unsubscribe),env as FollowupEnv)).status,200);
 assert.equal(sql.prepare('SELECT suppressed_at FROM user_followup_contacts WHERE user_id=?').get('person')?.suppressed_at,null,'Mail scanners following GET links cannot unsubscribe');
 await handleFollowupUnsubscribe(new Request(unsubscribe,{method:'POST'}),env);
 await decode(await api('/person','PATCH',profile));
 assert((await decode(await api('/person'))).contact.suppressed_at,'Admin cannot undo a recipient unsubscribe');
 assert.equal((await decode(await api('/'+later+'/send','POST',{}),409)).error,'recipient_suppressed');
 sql.prepare(`INSERT INTO website_submissions(id,category,email,name,message,source,status,consent_at,created_at,updated_at) VALUES('feedback-fixture','feedback','person@example.invalid','Person','Useful feedback',?,'new',?,?,?)`).run('followup:'+id,now,now,now);
 assert.equal((await decode(await api('?query=person'))).items[0].feedback_count,1);
 for(const template of FOLLOWUP_TEMPLATES)for(const locale of ['en','zh'] as const){const rendered=followupTemplate(template.id,locale,{name:'Example',setupUrl:'https://example.invalid/setup',feedbackUrl:'https://example.invalid/form'});assert(!rendered.body.includes('{{'));assert(!/[\r\n]/.test(rendered.subject));}
 console.log('User follow-ups: admin host/RBAC/CSRF, active MCP segmentation, editable versioned drafts, stale review protection, contact consent, draft replay, concurrent dispatch, cooldown, ambiguous delivery, unsubscribe and feedback attribution passed. No real emails sent.');
}finally{globalThis.fetch=native;sql.close();}
