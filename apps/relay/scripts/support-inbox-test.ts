import assert from 'node:assert/strict';
import {createWorkerFixture,ADMIN,MCP} from './worker-fixture.js';
import {handleAdminServiceRequest} from '../src/admin/admin-service.js';
import {handleInboundSupportEmail,ingestSupportMessage} from '../src/admin/support-inbox.js';
const {sql,env,addUser,sessionCookie}=createWorkerFixture();
addUser('support-operator','admin');
addUser('ordinary-user');
Object.assign(env,{APP_TOKEN_KEY:Buffer.alloc(32,4).toString('base64'),SENDPULSE_API_KEY:'fixture-sendpulse',FOLLOWUP_EMAIL_PROVIDER:'sendpulse',SUPPORT_FORWARD_TO:'verified-inbox@example.test'});
const adminCookie=await sessionCookie('support-operator'),userCookie=await sessionCookie('ordinary-user');
const endpoint=ADMIN+'/api/admin/support-inbox';
const api=(path='',method='GET',body?:unknown,cookie=adminCookie,origin=ADMIN)=>
  handleAdminServiceRequest(new Request(endpoint+path,{method,headers:{cookie,origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),env as any);
const read=async(response:Response,status=200)=>{const value=await response.json() as any;assert.equal(response.status,status,JSON.stringify(value));return value;};
assert.equal((await api('','GET',undefined,userCookie)).status,403);
assert.equal((await api('','GET',undefined,'')).status,401);
assert.equal((await api('','GET',undefined,adminCookie,'https://evil.test')).status,200,'GET is cookie protected');
assert.equal((await api('','POST',{},adminCookie)).status,405);
assert.equal((await api('/no-such-thread','POST',{})).status,404);
assert.equal((await handleAdminServiceRequest(new Request(MCP+'/api/admin/support-inbox'),env as any)).status,404);
const messageId='<a1@example.test>';
const incoming={sender:'malakai@example.test',subject:'Google sign-in blocked',body:'Need help with Google OAuth',messageId,inReplyTo:''};
const added=await ingestSupportMessage(env as any,incoming);
assert.equal(added.stored,true);const threadId=added.threadId!;
assert.equal((await ingestSupportMessage(env as any,incoming)).reason,'duplicate');
assert.equal((await read(await api())).items.length,1);
assert.equal((await read(await api('/'+threadId))).messages[0].body,incoming.body);
assert(!JSON.stringify(sql.prepare('SELECT * FROM support_messages').get()).includes(incoming.body),'No plaintext in D1');
const follow=await ingestSupportMessage(env as any,{...incoming,messageId:'<a2@example.test>',subject:'Re: Google sign-in blocked',body:'Following up',inReplyTo:messageId});
assert.equal(follow.threadId,threadId);
const statuses=await read(await api('/'+threadId+'/status','PATCH',{status:'resolved'}));assert.equal(statuses.status,'resolved');
assert.equal((await api('/'+threadId+'/status','PATCH',{status:'open'},adminCookie,'https://evil.test')).status,403);
assert.equal((await read(await api('/'+threadId))).thread.status,'resolved');
let sends=0;
const previousFetch=globalThis.fetch;
try{
  globalThis.fetch=async(url,options)=>{
    sends++;assert.equal(String(url),'https://api.sendpulse.com/smtp/emails');
    const payload=JSON.parse(String(options?.body));
    assert.equal(payload.email.from.email,'support@remotearc.app');
    assert.equal(payload.email.reply_to.email,'support@remotearc.app');
    assert.equal(payload.email.to[0].email,'malakai@example.test');
    assert(payload.email.subject.startsWith('Re: '));
    return Response.json({result:true,id:'sendpulse-fixture'});
  };
  const req=crypto.randomUUID(),reply='Thanks, please try again.';
  assert.equal((await api('/'+threadId+'/reply','POST',{requestId:'bad',message:reply})).status,400);
  (env as any).SENDPULSE_HOURLY_EMAIL_LIMIT='0';
  assert.equal((await read(await api('/'+threadId+'/reply','POST',{requestId:crypto.randomUUID(),message:reply}),429)).error,'support_email_capacity_exhausted');
  assert.equal(sends,0,'A blocked support send never reaches SendPulse');
  delete (env as any).SENDPULSE_HOURLY_EMAIL_LIMIT;
  const sent=await read(await api('/'+threadId+'/reply','POST',{requestId:req,message:reply}));
  assert.equal(sent.status,'sent');assert.equal(sends,1);
  const repeated=await read(await api('/'+threadId+'/reply','POST',{requestId:req,message:reply}));
  assert.equal(repeated.duplicate,true);assert.equal(sends,1);
  const conversation=await read(await api('/'+threadId));
  assert.equal(conversation.messages.length,3);
  assert.equal(conversation.messages[2].body,reply);
  assert.equal(conversation.thread.status,'waiting');
  globalThis.fetch=async()=>{sends++;throw Error('simulated network interruption');};
  const unknown=await read(await api('/'+threadId+'/reply','POST',{requestId:crypto.randomUUID(),message:'Another response'}),202);
  assert.equal(unknown.status,'unknown');
  assert.equal((await read(await api('/'+threadId+'/reply','POST',{requestId:crypto.randomUUID(),message:'Do not resend'}),409)).error,'previous_delivery_unconfirmed');
  assert.equal(sends,2);
  assert.equal((await api('/'+threadId+'/reconcile','PATCH',{messageId:'wrong',outcome:'failed',evidence:'provider delivery not found'})).status,400);
  const unknownRow=sql.prepare("SELECT id FROM support_messages WHERE delivery_status='unknown'").get() as {id:string};
  assert.equal((await api('/'+threadId+'/reconcile','PATCH',{messageId:unknownRow.id,outcome:'failed',evidence:'short'})).status,400);
  assert.equal((await read(await api('/'+threadId+'/reconcile','PATCH',{messageId:unknownRow.id,outcome:'failed',evidence:'SendPulse log verified no delivery'}))).status,'failed');
  assert.equal((await api('/'+threadId+'/reconcile','PATCH',{messageId:unknownRow.id,outcome:'failed',evidence:'SendPulse log verified no delivery'})).status,409);
  assert.equal(sql.prepare('SELECT delivery_reviewed_by FROM support_messages WHERE id=?').get(unknownRow.id)?.delivery_reviewed_by,'support-operator');
}finally{globalThis.fetch=previousFetch;}
let forwarded='';
const raw='From: customer@example.test\r\nTo: support@remotearc.app\r\nSubject: Help from email worker\r\nMessage-ID: <worker@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nThe worker retained and forwarded this message.';
const fake={
  to:'support@remotearc.app',from:'customer@example.test',rawSize:raw.length,
  raw:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(raw));controller.close();}}),
  async forward(to:string){forwarded=to;},
  setReject(){throw Error('should not reject');}
};
await handleInboundSupportEmail(fake as any,env as any);
assert.equal(forwarded,'verified-inbox@example.test');
assert.equal((await read(await api())).items.length,2);
assert.equal((await read(await api('/'+(await read(await api())).items.find((t:any)=>t.sender_email==='customer@example.test').id))).messages[0].body,'The worker retained and forwarded this message.');
console.log('Support inbox ingestion, forwarding, encryption, access control, idempotent SendPulse replies and uncertain delivery checks passed.');
