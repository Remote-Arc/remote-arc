import assert from 'node:assert/strict';
import {emailSender,followupEmailSender} from '../src/platform/email-sender.js';
import {sendFollowupViaProvider,utf8Base64} from '../src/followups/followup-provider.js';

const base={RESEND_API_KEY:'resend-fixture',SENDPULSE_API_KEY:'sendpulse-fixture'};
assert.equal(emailSender(base)?.apiKey,'resend-fixture','Login always stays on Resend');
assert.equal(followupEmailSender(base)?.provider,'resend','Legacy follow-ups default to Resend');
assert.equal(followupEmailSender({...base,FOLLOWUP_PROVIDER:'sendpulse'})?.provider,'sendpulse');
assert.equal(followupEmailSender({...base,FOLLOWUP_PROVIDER:'sendpulse',SENDPULSE_API_KEY:'  '}),null,'Missing SendPulse key must fail closed');
assert.equal(followupEmailSender({...base,FOLLOWUP_PROVIDER:'unknown'}),null,'Unknown providers must fail closed');
assert.equal(utf8Base64('<p>你好 🌏</p>'),Buffer.from('<p>你好 🌏</p>','utf8').toString('base64'));

const sender=followupEmailSender({...base,FOLLOWUP_PROVIDER:'sendpulse'})!;
const message={id:'test-id',recipient:'recipient@example.invalid',subject:'Follow up',html:'<p>你好 🌏</p>',text:'你好 🌏',unsubscribe:'https://remotearc.app/email/follow-up/unsubscribe?token=test',timeoutMs:2000};
let sends=0;
const transport=async(input:RequestInfo|URL,init?:RequestInit)=>{
 sends++;
 assert.equal(String(input),'https://api.sendpulse.com/smtp/emails');
 assert.equal(new Headers(init?.headers).get('authorization'),'Bearer sendpulse-fixture');
 assert.equal(new Headers(init?.headers).get('idempotency-key'),null,'SendPulse has no documented idempotency guarantee');
 const body=JSON.parse(String(init?.body));
 assert.deepEqual(body.email.from,{name:'Remote Arc',email:'support@remotearc.app'});
 assert.deepEqual(body.email.reply_to,{name:'Remote Arc',email:'support@remotearc.app'});
 assert.deepEqual(body.email.to,[{name:'',email:'recipient@example.invalid'}]);
 assert.equal(body.email.subject,'Follow up');
 assert.equal(body.email.html,Buffer.from(message.html).toString('base64'));
 assert.equal(body.email.text,message.text);
 return Response.json({result:true,id:'sendpulse-id'});
};
const success=await sendFollowupViaProvider(sender,message,transport as typeof fetch);
assert.deepEqual(success,{status:'sent',providerId:'sendpulse-id',errorCode:null});
assert.equal(sends,1,'One request per dispatch, no internal retries');
const failure=await sendFollowupViaProvider(sender,message,async()=>Response.json({message:'limit'},{status:429}));
assert.deepEqual(failure,{status:'failed',providerId:null,errorCode:'provider_429'});
const timeout=await sendFollowupViaProvider(sender,message,async()=>{throw new Error('timeout');});
assert.equal(timeout.status,'unknown','Ambiguous failures must never be silently retried');
const malformed=await sendFollowupViaProvider(sender,message,async()=>Response.json({result:true}));
assert.equal(malformed.status,'unknown','No provider ID means no confirmed receipt');
const legacy=await sendFollowupViaProvider(followupEmailSender(base)!,message,async(input,init)=>{
 assert.equal(String(input),'https://api.resend.com/emails');
 assert.equal(new Headers(init?.headers).get('idempotency-key'),'followup/test-id');
 const payload=JSON.parse(String(init?.body));
 assert.equal(payload.html,message.html);
 assert.equal(payload.headers['List-Unsubscribe'],'<'+message.unsubscribe+'>');
 return Response.json({id:'resend-id'});
});
assert.equal(legacy.status,'sent');
console.log('PASS: SendPulse authentication isolation, Unicode-safe payload, provider receipts, failure handling, and unchanged Resend dispatch.');
