import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleReviewerLogin,handleLoginPage} from '../src/reviewer.js';
import {handleGoogleLogin,handleGoogleCallback,sha256Hex,type OAuthIdentity} from '../src/auth.js';
import {handleEmailCodeRequest} from '../src/email-auth.js';
import {getDevicesForUser} from '../src/device.js';
import {callDevice} from '../src/device-call.js';
import {REVIEWER_USER_IDS} from '../src/reviewer-identity.js';

const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(file=>file.endsWith('.sql')).sort()) {
 sql.exec(fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
}
let beforeRun:((query:string)=>void)|undefined;
const db={prepare(query:string){
 const bound=(args:any[])=>({
  async first(){return sql.prepare(query).get(...args)??null;},
  async all(){return{results:sql.prepare(query).all(...args)};},
  async run(){return this.runSync();},
  runSync(){beforeRun?.(query);return{success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},
 });
 return{...bound([]),bind(...args:any[]){return bound(args);}};
},async batch(statements:any[]){return statements.map(statement=>statement.runSync());}} as unknown as D1Database;
const origin='https://mcp.remotearc.app';
const passwords=['fixture-openai-password','fixture-anthropic-password'];
const emails=['openai-reviewer@example.test','anthropic-reviewer@example.test'];
const devices=['fixture-openai','fixture-anthropic'];
const env={DB:db,PUBLIC_ORIGIN:origin,APP_ORIGIN:origin,MARKETING_ORIGIN:'https://remotearc.app',
 GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',ALLOW_SIGNUPS:'1',
 RESEND_API_KEY:'fixture-only',EMAIL_AUTH_SECRET:'fixture-only',
 REVIEWER_EMAIL:emails[0],REVIEWER_PASSWORD_SHA256:await sha256Hex(passwords[0]!),REVIEWER_DEMO_DEVICE_ID:devices[0],
 ANTHROPIC_REVIEWER_EMAIL:emails[1],ANTHROPIC_REVIEWER_PASSWORD_SHA256:await sha256Hex(passwords[1]!),ANTHROPIC_REVIEWER_DEMO_DEVICE_ID:devices[1],
 REGISTRY:{getByName:()=>({fetch:async(request:Request)=>{
  assert.equal(request.method,'GET','Fixture calls must never reach a real Agent');
  return Response.json([]);
 }})}} as any;
const form=(path:string,values:Record<string,string>)=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});
const login=(index:number,options=env,extra={})=>handleReviewerLogin(form('/auth/reviewer',{email:emails[index]!,password:passwords[index]!,return_to:'/overview',...extra}),options);
const identity=(index:number):OAuthIdentity=>({userId:REVIEWER_USER_IDS[index]!,clientId:'fixture-client',grantId:null,scope:'devices:read computer:read computer:write',resource:origin+'/mcp'});
const call=(index:number,tool:string,args:Record<string,unknown>,options=env)=>callDevice(options,identity(index),devices[index]!,tool,args);
const user=(id:string,email:string)=>sql.prepare("INSERT INTO users(id,google_sub,email,name,created_at) VALUES(?,?,?,'Real user',?)").run(id,id,email,new Date().toISOString());
const device=(id:string,userId:string)=>sql.prepare("INSERT INTO devices(id,user_id,name,platform,arch,hostname,credential_hash,created_at,last_seen) VALUES(?,?,'Real computer','win32','x64','real-host',?,?,?)").run(id,userId,'unchanged-'+id,new Date().toISOString(),new Date().toISOString());
const sessions=()=>Number(sql.prepare('SELECT COUNT(*) n FROM sessions').get()!.n);

try {
 assert.equal((await login(0,{DB:db,PUBLIC_ORIGIN:origin})).status,404);
 assert.equal((await login(1,env,{password:passwords[0]})).status,401);
 assert.equal(sessions(),0);
 assert.match(await (await handleLoginPage(new Request(origin+'/auth/login'),{...env,REVIEWER_EMAIL:undefined,REVIEWER_PASSWORD_SHA256:undefined})).text(),/auth\/reviewer/);
 for(const index of [0,1]) {
  const response=await login(index,env,{email:' '+emails[index]!.toUpperCase()+' '});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),origin+'/overview');
  assert.match(response.headers.get('set-cookie')!,/HttpOnly/);
  assert.equal(sql.prepare('SELECT user_id FROM devices WHERE id=?').get(devices[index])?.user_id,REVIEWER_USER_IDS[index]);
  assert.equal(sql.prepare('SELECT is_demo FROM business_cohort_users WHERE user_id=?').get(REVIEWER_USER_IDS[index])?.is_demo,1);
  assert.notEqual(sql.prepare('SELECT credential_hash FROM devices WHERE id=?').get(devices[index])?.credential_hash,await sha256Hex('reviewer-fixture:'+devices[index]));
  const listed=await getDevicesForUser(env,REVIEWER_USER_IDS[index]!);
  assert.equal(listed.length,1);assert.equal(listed[0]!.id,devices[index]);assert.equal(listed[0]!.status,'online');
  assert((await call(index,'list_directory',{path:'/review-demo'}) as any[]).some(file=>file.name==='README.md'));
  await call(index,'write_file',{path:'/review-demo/note.txt',content:'owner-'+index});
 }
 await assert.rejects(callDevice(env,identity(0),devices[1]!,'read_file',{path:'/review-demo/note.txt'}),/not found|revoked/);
 assert.match(JSON.stringify(await call(1,'read_file',{path:'/review-demo/note.txt'})),/owner-1/);
 const credential=sql.prepare('SELECT credential_hash FROM devices WHERE id=?').get(devices[0])?.credential_hash;
 assert.equal((await login(0)).status,302);
 assert.notEqual(sql.prepare('SELECT credential_hash FROM devices WHERE id=?').get(devices[0])?.credential_hash,credential);
 await assert.rejects(call(0,'read_file',{path:'/review-demo/note.txt'}),/not found/);
 assert.match(JSON.stringify(await call(1,'read_file',{path:'/review-demo/note.txt'})),/owner-1/,'One reviewer login must not reset the other workspace');
 await call(1,'undo_last_change',{});
 await assert.rejects(call(1,'read_file',{path:'/review-demo/note.txt'}),/not found/);
 await assert.rejects(call(1,'read_file',{path:'/etc/passwd'}),/only allows/);
 await assert.rejects(call(1,'start_process',{command:'rm -rf /'}),/review|allow|support/);
 await assert.rejects(call(1,'browser_runner_start',{}),/disabled/);

 const before=sessions();
 assert.equal((await login(1,{...env,ANTHROPIC_REVIEWER_EMAIL:' '+emails[0]!.toUpperCase()+' '})).status,401);
 assert.equal((await login(0,{...env,ANTHROPIC_REVIEWER_EMAIL:emails[0]})).status,503);
 assert.equal((await login(1,{...env,ANTHROPIC_REVIEWER_DEMO_DEVICE_ID:devices[0]})).status,503);
 user('ordinary','Taken@Example.test');device('ordinary-device','ordinary');
 const originalDevice=sql.prepare('SELECT * FROM devices WHERE id=?').get('ordinary-device');
 assert.equal((await login(1,{...env,ANTHROPIC_REVIEWER_EMAIL:'taken@example.test'},{email:'taken@example.test'})).status,503);
 assert.equal((await login(1,{...env,ANTHROPIC_REVIEWER_EMAIL:'changed@example.test'},{email:'changed@example.test'})).status,503);
 assert.equal((await login(1,{...env,ANTHROPIC_REVIEWER_DEMO_DEVICE_ID:'ordinary-device'})).status,503);
 assert.deepEqual(sql.prepare('SELECT * FROM devices WHERE id=?').get('ordinary-device'),originalDevice);
 assert.equal(sessions(),before);
 const wrongFixture={...env,ANTHROPIC_REVIEWER_DEMO_DEVICE_ID:'ordinary-device'};
 const ordinaryDevices=await getDevicesForUser(wrongFixture,'ordinary');
 assert.equal(ordinaryDevices[0]!.status,'offline','A configured ID cannot spoof a real device as online');
 await assert.rejects(callDevice(wrongFixture,{...identity(1),userId:'ordinary'},'ordinary-device','read_file',{path:'/review-demo/README.md'}),/owner mismatch/);
 // Reproduce a device being claimed by a different user between the preflight and UPSERT.
 let injected=false;
 beforeRun=query=>{if(!injected&&query.includes('INSERT INTO devices')){injected=true;device('race-device','ordinary');}};
 assert.equal((await login(1,{...env,ANTHROPIC_REVIEWER_DEMO_DEVICE_ID:'race-device'})).status,503);
 beforeRun=undefined;
 assert.equal(sql.prepare('SELECT user_id FROM devices WHERE id=?').get('race-device')?.user_id,'ordinary');
 assert.equal(sessions(),before);

 // Both alternative authentication routes must preserve the reserved identities.
 const originalFetch=globalThis.fetch;
 try {
  globalThis.fetch=async()=>{throw new Error('Reviewer OTP must never send email');};
  for(const email of emails) {
   assert.equal((await handleEmailCodeRequest(form('/auth/email/request',{email}),env)).status,200);
   assert.equal(sql.prepare('SELECT email FROM email_login_challenges WHERE email=?').get(email),undefined);
  }
  for(const index of [0,1]) {
   for(const configured of [true,false]) {
    const options=configured?env:{...env,REVIEWER_EMAIL:undefined,ANTHROPIC_REVIEWER_EMAIL:undefined};
    const start=await handleGoogleLogin(new Request(origin+'/auth/google'),options);
    const state=new URL(start.headers.get('location')!).searchParams.get('state')!;
    globalThis.fetch=async(input)=>String(input).includes('userinfo')
     ?Response.json({sub:'google-reviewer-'+index,email:emails[index],email_verified:true})
     :Response.json({access_token:'fixture-token'});
    const response=await handleGoogleCallback(new Request(origin+'/auth/google/callback?state='+state+'&code=test'),options);
    assert.equal(response.status,403);
    assert.equal(sql.prepare('SELECT google_sub FROM users WHERE id=?').get(REVIEWER_USER_IDS[index])?.google_sub,REVIEWER_USER_IDS[index]);
   }
  }
 } finally {globalThis.fetch=originalFetch;}
 assert.equal(sessions(),before);
 console.log('PASS: two reviewer logins, isolated online fixtures/read/write/undo/reset, collision and race protection, random credentials, OTP/Google denial and demo cohort isolation');
} finally {sql.close();}
