import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url),runtimeRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=runtimeRequire('miniflare'),{build}=runtimeRequire('esbuild');
const text='你好，邮件运行时回归 🧪',html='<p>'+text+'</p>';
const bundle=await build({stdin:{contents:`
 import {deliverEmail} from './src/platform/email-delivery-provider.ts';
 export default {async fetch(request){
  const provider=new URL(request.url).searchParams.get('provider');
  try{return Response.json(await deliverEmail({provider,apiKey:'fixture-runtime-key',from:'Remote Arc <sender@example.test>',replyTo:'reply@example.test'},
   {idempotencyKey:'fixture-stable-email',to:'recipient@example.test',subject:'Worker runtime verification',text:${JSON.stringify(text)},html:${JSON.stringify(html)}},2000));}
  catch(error){return Response.json({error:error.message},{status:500});}
 }};
`,resolveDir:path.resolve(import.meta.dirname,'..')},bundle:true,format:'esm',platform:'browser',write:false});
let status=200,mode='accepted',expectedProvider='resend',calls=0;
const worker=new Miniflare(convertV4MiniflareOptions({workers:[{name:'email-runtime-regression',modules:true,compatibilityDate:'2026-09-20',script:bundle.outputFiles[0].text,outboundService:async request=>{
 calls++;
 assert.equal(request.url,expectedProvider==='resend'?'https://api.resend.com/emails':'https://api.sendpulse.com/smtp/emails','Only the selected fixed provider may receive credentials');
 assert.equal(request.method,'POST');
 assert.equal(request.headers.get('authorization'),'Bearer fixture-runtime-key');
 const payload=await request.json();
 if(expectedProvider==='resend'){
  assert.equal(request.headers.get('idempotency-key'),'fixture-stable-email');
  assert.equal(payload.html,html);assert.equal(payload.text,text);
  assert.equal(payload.from,'Remote Arc <sender@example.test>');
  assert.deepEqual(payload.to,['recipient@example.test']);
 }else{
  assert.equal(Buffer.from(payload.email.html,'base64').toString('utf8'),html);
  assert.equal(payload.email.text,text);
  assert.deepEqual(payload.email.from,{name:'Remote Arc',email:'sender@example.test'});
  assert.deepEqual(payload.email.reply_to,{email:'reply@example.test'});
  assert.deepEqual(payload.email.to,[{email:'recipient@example.test'}]);
 }
 if(status>=300&&status<400)return new Response(null,{status,headers:{location:'https://untrusted.invalid/credential-trap'}});
 if(mode==='missing-id')return Response.json({result:true});
 return Response.json({id:expectedProvider+'-fixture',result:true},{status});
}}]}));
try{
 for(const provider of ['resend','sendpulse']){
  expectedProvider=provider;status=200;mode='accepted';
  let before=calls;
  let result=await (await worker.dispatchFetch('https://test.invalid/?provider='+provider)).json();
  assert.deepEqual(result,{status:'sent',providerId:provider+'-fixture',errorCode:null},provider+' must deliver through the real Cloudflare Workers runtime');
  assert.equal(calls,before+1,'Exactly one provider request is made');
  for(status of [301,302,303,307,308]){
   before=calls;
   result=await (await worker.dispatchFetch('https://test.invalid/?provider='+provider)).json();
   assert.deepEqual(result,{status:'failed',providerId:null,errorCode:'provider_'+status});
   assert.equal(calls,before+1,'A redirect must never forward credentials or replay an email');
  }
  status=200;mode='missing-id';before=calls;
  result=await (await worker.dispatchFetch('https://test.invalid/?provider='+provider)).json();
  assert.deepEqual(result,{status:'unknown',providerId:null,errorCode:'provider_200'});
  assert.equal(calls,before+1,'An ambiguous response must never trigger a blind retry');
 }
 console.log('PASS: Resend and SendPulse email delivery in workerd, Unicode payloads, exact provider selection, blocked redirects and ambiguous-response accounting. No network or real emails.');
}finally{await worker.dispose();}
