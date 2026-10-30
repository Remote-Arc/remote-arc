import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {configureClaudeReviewer} from './configure-claude-reviewer.mjs';

const config={accountId:'test-account',token:'test-cloudflare-token',email:'anthropic-reviewer@remotearc.app',password:'fixture-only-strong-password-12345',deviceId:'anthropic-fixture-test'};
const names=['ANTHROPIC_REVIEWER_EMAIL','ANTHROPIC_REVIEWER_PASSWORD_SHA256','ANTHROPIC_REVIEWER_DEMO_DEVICE_ID'];
test('provision only the independent Anthropic secrets, hash the password, retain OpenAI',async()=>{
 const writes=[];
 const fetcher=async(url,init)=>{
  assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/test-account/workers/scripts/remote-link-relay/secrets');
  if(init.method==='GET')return Response.json({success:true,result:[{name:'REVIEWER_EMAIL',type:'secret_text'},{name:'REVIEWER_PASSWORD_SHA256',type:'secret_text'}]});
  assert.equal(init.method,'PUT');writes.push(JSON.parse(init.body));return Response.json({success:true});
 };
 assert.deepEqual(await configureClaudeReviewer(config,fetcher),{created:true});
 assert.deepEqual(writes.map(item=>item.name),names);
 assert.equal(writes[1].text,createHash('sha256').update(config.password).digest('hex'));
 assert(writes.every(item=>item.text!==config.password));
});
test('retain existing credentials and refuse a partial configuration without any writes',async()=>{
 for(const count of [1,3]){
  let calls=0;
  const fetcher=async(_url,init)=>{calls++;assert.equal(init.method,'GET');return Response.json({success:true,result:names.slice(0,count).map(name=>({name,type:'secret_text'}))});};
  if(count===3)assert.deepEqual(await configureClaudeReviewer(config,fetcher),{created:false});
  else await assert.rejects(configureClaudeReviewer(config,fetcher),/Partial/);
  assert.equal(calls,1);
 }
});
test('validate inputs before networking and omit secret values from provider errors',async()=>{
 await assert.rejects(configureClaudeReviewer({...config,password:'short'},()=>{throw Error('Unexpected request');}),/strong password/);
 await assert.rejects(configureClaudeReviewer(config,async()=>Response.json({success:false,errors:[{message:config.password}]},{status:403})),error=>!error.message.includes(config.password)&&/403/.test(error.message));
});
