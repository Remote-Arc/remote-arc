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
const profile={status:'waiting',note:'Help requested through support',nextFollowupAt:now,permission:true,consentNote:'Support request on 2026-10-19',suppress:false};
await decode(await api('/person','PATCH',profile));assert.equal((await decode(await api('?segment=due'))).total,1);
const createDraft=async(userId='person')=>{const id=crypto.randomUUID(),text=followupTemplate('experience','en',{name:'Person',setupUrl:'https://remotearc.app/connect-ai',feedbackUrl:'https://remotearc.app/feedback?source=followup:'+id});const input={id,userId,templateId:'experience',locale:'en',...text,design:{layout:'spotlight',accent:'#244b46',eyebrow:'From the team',headline:'Your next result',intro:'A personal follow-up.',buttonLabel:'Share your feedback',highlights:[{title:'Arc',body:'Your AI teammate'}]}};const draft=await decode(await api('/drafts','POST',input),201);assert.equal((await decode(await api('/drafts','POST',input))).id,id);assert.equal((await api('/drafts','POST',{...input,design:{...input.design,accent:'#ffffff'}})).status,409,'Reviewed design is immutable for this draft ID');return draft.id as string;};
const id=await createDraft();
let sends=0;const native=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 assert.equal(String(input),'https://api.resend.com/emails');sends++;
 assert.equal(new Headers(options?.headers).get('idempotency-key'),'followup/'+id);
 const body=JSON.parse(String(options?.body));assert.deepEqual(body.to,['person@example.invalid']);assert(body.text.includes('/email/follow-up/unsubscribe?token='));assert(body.headers['List-Unsubscribe-Post']);assert(body.html.includes('role="presentation"'));assert(body.html.includes('Share your feedback'));assert(body.html.includes('Your next result'));assert.equal(body.html,sql.prepare('SELECT html_body FROM user_followup_messages WHERE id=?').get(id)?.html_body,'Sending uses the exact saved HTML snapshot');assert(!/<img[^>]+(?:token=|person%40|person@)/i.test(body.html),'Brand image is static, with no recipient tracking');
 return Response.json({id:'provider-fixture'});
};
try{
 const [first,second]=await Promise.all([api('/'+id+'/send','POST',{}),api('/'+id+'/send','POST',{})]);
 assert([200,409].includes(first.status));assert([200,409].includes(second.status));assert.equal(sends,1);
 assert.equal((await decode(await api('/'+id+'/send','POST',{}))).status,'sent');assert.equal(sends,1);
 const later=await createDraft();assert.equal((await api('/'+later+'/send','POST',{})).status,409);assert.equal(sends,1,'72 hour cooldown blocks another draft');
 const other=await createDraft('other');assert.equal((await decode(await api('/'+other+'/send','POST',{}),409)).error,'contact_permission_required');
 await decode(await api('/other','PATCH',{...profile,nextFollowupAt:null}));
 globalThis.fetch=async()=>{sends++;throw Error('simulated ambiguous timeout');};
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
 console.log('User follow-ups: admin host/RBAC/CSRF, segmentation, contact consent, draft replay, concurrent dispatch, cooldown, ambiguous delivery, unsubscribe and feedback attribution passed. No real emails sent.');
}finally{globalThis.fetch=native;sql.close();}
