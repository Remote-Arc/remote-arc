import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {DeviceRegistry} from '../src/devices/registry.js';
import {createWorkerFixture,ADMIN,AGENT} from './worker-fixture.js';
import {callDevice} from '../src/devices/device-call.js';
import {readDeviceExecutionHealth} from '../src/analytics/device-execution-health.js';
import {recordProductEvent} from '../src/analytics/product-events.js';
import {setTaskKeepAwake} from '../src/tasks/automations.js';

const now=Date.now();
const socket=(deviceId:string,at=now)=>({
  readyState:1,data:{userId:'owner',deviceId,device:{platform:'darwin',agentVersion:'0.6.5',lastSeen:new Date(at).toISOString(),connectedAt:new Date(at).toISOString()},tools:['read_file'],capabilities:['device_policy_v1']} as any,
  sent:[] as any[],closed:[] as number[],
  deserializeAttachment(){return this.data;},serializeAttachment(value:unknown){this.data=value;},
  send(value:string){this.sent.push(JSON.parse(value));},close(code:number){this.closed.push(code);this.readyState=3;},
});
const stale=socket('mac',now-120001),fresh=socket('mac');
let sockets=[stale];
const registry=new DeviceRegistry({getWebSockets:()=>sockets} as unknown as DurableObjectState);
const devices=()=>registry.fetch(new Request('https://registry/devices',{headers:{'x-remote-link-user-id':'owner'}}));
const call=()=>registry.fetch(new Request('https://registry/call',{method:'POST',headers:{'x-remote-link-user-id':'owner','content-type':'application/json'},body:JSON.stringify({deviceId:'mac',tool:'read_file',arguments:{path:'private-canary'}})}));
assert.equal((await registry.fetch(new Request('https://registry/call',{method:'POST',headers:{'x-remote-link-user-id':'other','content-type':'application/json'},body:JSON.stringify({deviceId:'mac',tool:'read_file'})}))).status,404);
assert.equal(stale.closed.length,0,'Another user cannot retire this device connection');
const listed=await (await devices()).json() as any[];
assert.equal(listed[0].status,'offline','An open socket with an expired signal must not advertise Online');
assert.equal(listed[0].connection_state,'stale');
assert.equal((await call()).status,404,'Do not dispatch another operation into an expired connection');
assert.equal(stale.sent.length,0);assert(stale.closed.length>0,'Retire the stale connection so waking Agents reconnect');

// A healthy connection wins over a stale connection, even when the stale one
// advertises the newer policy capability. Never execute on both sockets.
stale.readyState=1;stale.data.device.connectedAt=new Date(now+1000).toISOString();
fresh.data.capabilities=[];sockets=[stale,fresh];
const pending=call();await setImmediate();assert.equal(fresh.sent.length,1);assert.equal(stale.sent.length,0);
registry.webSocketMessage(fresh as never,JSON.stringify({type:'result',id:fresh.sent[0].id,result:{ok:true}}));
assert.equal((await pending).status,200);
const interrupted=call();await setImmediate();registry.webSocketClose(fresh as never);
assert.equal((await interrupted).status,504,'Disconnect settles the pending request as unknown without replay');
assert.equal(fresh.sent.length,2);

// The existing browser extension sends application-level ping, not repeated
// hello. Use receipt time and never trust the client-supplied timestamp.
mock.timers.enable({apis:['Date'],now});
try{
  const browser=socket('browser',now-120001);browser.data.device.platform='browser';sockets=[browser];
  registry.webSocketMessage(browser as never,JSON.stringify({type:'ping',at:now+86400000}));
  const entry=(await (await devices()).json() as any[])[0];assert.equal(entry.status,'online');
  mock.timers.tick(120000);assert.equal((await (await devices()).json() as any[])[0].status,'online');
  mock.timers.tick(1);
  assert.equal((await (await devices()).json() as any[])[0].status,'offline','A spoofed future ping cannot extend presence');
}finally{mock.timers.reset();}

// Drive the actual Worker and real SQLite schema: MCP failures are often HTTP
// 200, so the health endpoint must use the recorded device outcome.
const f=createWorkerFixture();
try{
  f.addUser('owner');f.addUser('admin','admin');f.addUser('other');
  const at=new Date().toISOString();
  f.sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,workspace_roots) VALUES('mac','owner','Example Mac','darwin','fixture',?,'[\"read_file\"]','[]')").run(at);
  f.state.tool=()=>Response.json({error:'device call timed out'},{status:504});
  const identity={userId:'owner',clientId:'test-client',grantId:'test-grant'} as never;
  await assert.rejects(callDevice(f.env as never,identity,'mac','read_file',{path:'private-path-canary'}),/device call timed out/);
  assert.equal(f.state.calls.length,1,'An uncertain call must never be replayed');
  assert.equal(f.sql.prepare("SELECT error_code FROM product_events WHERE name='device.tool.completed'").get()?.error_code,'DEVICE_TIMEOUT');
  const cookie=await f.sessionCookie('admin'),userCookie=await f.sessionCookie('owner');
  assert.equal((await f.call(ADMIN+'/api/monitor')).status,401);
  assert.equal((await f.call(ADMIN+'/api/monitor',{headers:{cookie:userCookie}})).status,403);
  assert.equal((await f.call(AGENT+'/api/monitor',{headers:{cookie}})).status,404);
  const health=await (await f.call(ADMIN+'/api/monitor',{headers:{cookie}})).json() as any;
  assert.equal(health.deviceExecution.timeouts,1);assert.equal(health.deviceExecution.affectedDevices,1);
  assert.equal(health.deviceExecution.devices[0].deviceId,'mac');
  assert.equal(health.worker.errors15m,0,'Keep device execution issues separate from Worker 5xx');
  assert.equal(health.status,'degraded');
  assert(!JSON.stringify(health.deviceExecution).includes('private-path-canary'));
  // Events from browser telemetry, other owners, revoked devices or outside
  // the window must not make a valid device look unhealthy.
  const baseline=await readDeviceExecutionHealth(f.env as never);
  for(const event of [
    {source:'browser' as const,userId:'owner'},
    {source:'server' as const,userId:'other'},
  ])await recordProductEvent(f.env as never,{...event,domain:'devices',name:'device.tool.completed',outcome:'failed',entityId:'mac',errorCode:'DEVICE_TIMEOUT'});
  assert.equal((await readDeviceExecutionHealth(f.env as never)).timeouts,baseline.timeouts);
  const future=await readDeviceExecutionHealth(f.env as never,Date.now()+16*60000);
  assert.equal(future.coverage,'no_samples');assert.equal(future.status,'unknown','No observations cannot prove recovery');
  f.state.tool=()=>Response.json({result:{content:'private-file-canary'}});
  await callDevice(f.env as never,identity,'mac','read_file',{path:'private-path-canary'});
  const answered=await readDeviceExecutionHealth(f.env as never);assert.equal(answered.successfulCalls,1);assert(answered.devices[0].lastSuccessfulCallAt);
  assert(!JSON.stringify(answered).includes('private-file-canary'));
  f.sql.prepare("UPDATE devices SET automation_permissions='{\"keep_awake\":true}' WHERE id='mac'").run();
  f.state.tool=()=>Response.json({result:{supported:true,active:false}});
  await assert.rejects(setTaskKeepAwake(f.env as never,{id:'power-fixture',user_id:'owner',device_id:'mac',action_json:'{"keep_awake":true}'} as never,180),/could not acquire/);
  assert.equal((await readDeviceExecutionHealth(f.env as never)).keepAwakeFailures,1,'A failed power lease must not disappear behind a successful tool response');
  const jobs:Promise<unknown>[]=[];const redundant=socket('mac',Date.now()-120001),connected=socket('mac',Date.now());
  const mixedRegistry=new DeviceRegistry({getWebSockets:()=>[redundant,connected],waitUntil:(job:Promise<unknown>)=>jobs.push(job)} as unknown as DurableObjectState,f.env as never);
  await mixedRegistry.fetch(new Request('https://registry/devices',{headers:{'x-remote-link-user-id':'owner'}}));await Promise.all(jobs);
  assert.equal((await readDeviceExecutionHealth(f.env as never)).staleSignals,0,'A redundant old socket is not a device outage while a fresh connection exists');
  const expired=socket('mac',Date.now()-120001);
  const actualRegistry=new DeviceRegistry({getWebSockets:()=>[expired],waitUntil:(job:Promise<unknown>)=>jobs.push(job)} as unknown as DurableObjectState,f.env as never);
  await actualRegistry.fetch(new Request('https://registry/devices',{headers:{'x-remote-link-user-id':'owner'}}));await Promise.all(jobs);
  assert.equal((await readDeviceExecutionHealth(f.env as never)).staleSignals,1);
  assert(!JSON.stringify(f.sql.prepare("SELECT * FROM product_events WHERE name='device.presence.stale'").all()).includes('private-'));
  f.state.online=[{id:'mac',status:'offline',connection_state:'stale',lastSeen:new Date().toISOString(),tools:['read_file']}];
  const owner=await (await f.call(AGENT+'/api/devices',{headers:{cookie:userCookie}})).json() as any[];
  assert.equal(owner[0].status,'offline','The consumer endpoint must not turn a stale registry entry back into Online');
  assert.equal(owner[0].connection_state,'stale');assert.deepEqual(owner[0].tools,[]);
  const unavailable=await readDeviceExecutionHealth({DB:{prepare(){throw Error('private-database-canary');}}} as never);
  assert.equal(unavailable.coverage,'unavailable');assert.equal(unavailable.status,'unknown');assert(!JSON.stringify(unavailable).includes('private-database-canary'));
  f.sql.prepare("UPDATE devices SET revoked_at=? WHERE id='mac'").run(new Date().toISOString());
  assert.equal((await readDeviceExecutionHealth(f.env as never)).affectedDevices,0,'Revoked devices do not affect current service health');
  for(let index=0;index<21;index++){
    const id='bounded-'+index;f.sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,'owner','Example device','darwin',?,?)").run(id,id,at);
    await recordProductEvent(f.env as never,{domain:'devices',name:'device.tool.completed',source:'server',outcome:'failed',userId:'owner',entityId:id,errorCode:'DEVICE_TIMEOUT'});
  }
  const bounded=await readDeviceExecutionHealth(f.env as never);assert.equal(bounded.affectedDevices,21);assert.equal(bounded.devices.length,20);assert.equal(bounded.truncated,true);
  console.log('PASS: stale sockets, no replay, fresh socket selection, browser ping freshness and real Worker/Admin device timeout visibility');
}finally{f.sql.close();}
