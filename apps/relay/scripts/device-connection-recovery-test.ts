import assert from 'node:assert/strict';
import {createWorkerFixture,AGENT} from './worker-fixture.js';
import {DeviceRegistry} from '../src/devices/registry.js';
import {rankFleetDevices} from '../src/devices/fleet-scheduler.js';

const f=createWorkerFixture();
try{
  f.addUser('recovery-owner');f.addUser('recovery-other');
  const cookie=await f.sessionCookie('recovery-owner'),other=await f.sessionCookie('recovery-other');
  f.sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,workspace_roots) VALUES('recovery-mac','recovery-owner','Example Mac','darwin','preserve-pairing',?,'[\"read_file\"]','[]')").run(f.now);
  const seen:any[]=[];let state='reconnect_requested';
  f.state.registry=async request=>{
    if(new URL(request.url).pathname==='/devices')return Response.json(f.state.online);
    assert.equal(new URL(request.url).pathname,'/reconnect','Recovery cannot dispatch a tool');
    seen.push({owner:request.headers.get('x-remote-link-user-id'),body:await request.json()});
    return Response.json({state,connected:state==='connection_present'?1:0,retired:state==='reconnect_requested'?1:0});
  };
  const request=(auth=cookie,origin=AGENT,id='recovery-mac',body='{}')=>f.call(AGENT+'/api/devices/'+id+'/reconnect',{method:'POST',headers:{...(auth?{cookie:auth}:{}),origin,'content-type':'application/json'},body});
  assert.equal((await request('')).status,401);
  assert.equal((await request(other)).status,404);
  assert.equal((await request(cookie,'https://other.invalid')).status,403);
  assert.equal((await request(cookie,AGENT,'missing')).status,404);
  assert.equal(seen.length,0,'Denied requests never touch a device connection');
  f.limits.auth=false;assert.equal((await request()).status,429);f.limits.auth=true;
  assert.equal(seen.length,0,'Rate limits apply before any connection cleanup');
  const response=await request();assert.equal(response.status,200);
  assert.equal((await response.json() as any).state,'reconnect_requested');
  assert(seen.every(item=>item.owner==='recovery-owner'&&item.body.deviceId==='recovery-mac'));
  assert.equal(f.sql.prepare("SELECT credential_hash FROM devices WHERE id='recovery-mac'").get()?.credential_hash,'preserve-pairing');
  assert.equal(f.state.calls.length,0,'Recovery never retries an uncertain command or charges a tool call');
  state='connection_present';assert.equal((await (await request()).json() as any).state,'connection_present');
  state='device_unreachable';assert.equal((await (await request()).json() as any).state,'device_unreachable','A sleeping device is not reported restored');

  // The owner device list distinguishes a fresh connection from an unanswered
  // dispatch. A later successful call clears that warning, not a mere heartbeat.
  f.state.online=[{id:'recovery-mac',status:'online',connection_state:'connected',lastSeen:new Date().toISOString(),tools:['read_file']}];
  const audit=(success:number,outcome:string,at:string,user='recovery-owner')=>f.sql.prepare("INSERT INTO audit_events(id,user_id,device_id,event_type,tool_name,success,outcome,created_at) VALUES(?,?, 'recovery-mac','mcp.tool_call','read_file',?,?,?)").run(crypto.randomUUID(),user,success,outcome,at);
  audit(0,'device_timeout',new Date(Date.now()-60000).toISOString());
  const devices=async()=>await (await f.call(AGENT+'/api/devices',{headers:{cookie}})).json() as any[];
  assert.equal((await devices())[0].execution_health,'response_unknown');
  assert.equal(rankFleetDevices(await devices() as never,new Map(),{requiredTools:['read_file']}).length,0,'Fleet skips a device with an unanswered request');
  audit(1,'allowed',new Date(Date.now()-10000).toISOString(),'recovery-other');
  assert.equal((await devices())[0].execution_health,'response_unknown','Another owner cannot clear the response warning');
  state='connection_present';await request();
  assert.equal((await devices())[0].execution_health,'response_unknown','Checking presence cannot confirm an unanswered operation');
  audit(1,'allowed',new Date(Date.now()-10000).toISOString());
  assert.equal((await devices())[0].execution_health,'observed');
  assert.equal(rankFleetDevices(await devices() as never,new Map(),{requiredTools:['read_file']}).length,1);
  const realDB=f.env.DB as D1Database;
  f.env.DB={...realDB,prepare(query:string){if(query.includes('lastTimeout'))throw Error('no such column: outcome');return realDB.prepare(query);}};
  assert.equal((await devices())[0].execution_health,'unknown','Missing optional telemetry must preserve device access');f.env.DB=realDB;
  state='private-invalid-state';const bad=await request();assert.equal(bad.status,503);assert(!(await bad.text()).includes('private-invalid-state'));
  console.log('PASS: owner/CSRF guarded connection recovery, preserved pairing, no tool replay or false restore, and execution warning cleared only by observed success');
}finally{await Promise.all(f.pending);f.sql.close();}

const now=Date.now();
const socket=(at:number)=>({readyState:1,data:{userId:'owner',deviceId:'mac',lastSignalAt:at,tools:[]} as any,closed:0,
  deserializeAttachment(){return this.data;},serializeAttachment(value:unknown){this.data=value;},close(){this.closed++;this.readyState=3;},send(){throw Error('Recovery cannot execute device commands');}});
const old=socket(now-120001),fresh=socket(now);
const registry=new DeviceRegistry({getWebSockets:()=>[old,fresh]} as unknown as DurableObjectState);
const response=await registry.fetch(new Request('https://registry/reconnect',{method:'POST',headers:{'x-remote-link-user-id':'owner'},body:JSON.stringify({deviceId:'mac'})}));
assert.equal(response.status,200);assert.equal((await response.json() as any).state,'connection_present');
assert.equal(old.closed,1);assert.equal(fresh.closed,0,'A working connection must never be reset by the recovery button');
