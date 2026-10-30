import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {DeviceRegistry} from '../src/devices/registry.js';
import {sha256Hex} from '../src/auth/auth.js';
import {handleMonitorState} from '../src/analytics/monitor.js';
import {recordDeviceConnection,readDeviceReliability,evaluateDeviceReliability,purgeDeviceReliability,type ReliabilityNotification} from '../src/analytics/device-reliability.js';

const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
const db={prepare(query:string){const statement=sql.prepare(query);const bound=(args:any[])=>({async first(){return statement.get(...args)||null;},async all(){return{results:statement.all(...args)};},async run(){return{success:true,meta:{changes:Number(statement.run(...args).changes)}};}});return{...bound([]),bind(...args:any[]){assert(!args.includes(undefined),query);return bound(args);}};}} as unknown as D1Database;
const env={DB:db},now=Date.now(),minute=60000;
for(const role of ['admin','user']){
  sql.prepare('INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)').run(role,role,role+'@example.invalid',role,new Date(now).toISOString());
  sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(await sha256Hex(role),role,new Date(now+86400000).toISOString(),new Date(now).toISOString());
}
for(const id of ['d0','d1','d2','d3','private'])sql.prepare('INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)').run(id,id==='private'?'admin':'user','fixture','linux','fixture-'+id,new Date(now).toISOString());
const metadata={platform:'win32',agentVersion:'0.6.5-rc.1'},notifications:ReliabilityNotification[]=[];
const notify=async(n:ReliabilityNotification)=>{notifications.push(n);};
assert.equal((await readDeviceReliability(env,now)).coverage,'no_samples');
await recordDeviceConnection(env,'user','private','connected',metadata,now);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM device_connection_buckets').get()!.n,0,'A socket cannot record another owner’s device');

// Real Registry lifecycle: repeated hello is not a reconnect; duplicate close/error is not a second close.
const jobs:Promise<unknown>[]=[],socket={data:{userId:'user',deviceId:'d0'} as any,deserializeAttachment(){return this.data;},serializeAttachment(value:unknown){this.data=value;},close(){}};
const registry=new DeviceRegistry({getWebSockets:()=>[socket],waitUntil:(job:Promise<unknown>)=>jobs.push(job)} as unknown as DurableObjectState,env as never);
const hello=JSON.stringify({type:'hello',device:metadata,tools:[]});
registry.webSocketMessage(socket as never,hello);registry.webSocketMessage(socket as never,hello);
await Promise.all(jobs.splice(0));
registry.webSocketClose(socket as never);registry.webSocketError(socket as never);await Promise.all(jobs.splice(0));
assert.equal(sql.prepare("SELECT SUM(connects) n FROM device_connection_buckets WHERE device_id='d0'").get()!.n,1);
assert.equal(sql.prepare("SELECT SUM(disconnects) n FROM device_connection_buckets WHERE device_id='d0'").get()!.n,1);
sql.exec('DELETE FROM device_connection_buckets');

for(let i=0;i<20;i++)await recordDeviceConnection(env,'user','d0','connected',metadata,now);
let snapshot=await readDeviceReliability(env,now);
assert.equal(snapshot.scope,'single_device');assert.equal(snapshot.windows[0]!.counts.reconnects,19);
await evaluateDeviceReliability(env,snapshot,notify,now);
assert.equal(notifications.length,0,'A noisy single device cannot trigger a fleet alert');
for(const id of ['d1','d2'])for(let i=0;i<6;i++)await recordDeviceConnection(env,'user',id,'connected',{...metadata,platform:id==='d1'?'darwin':'linux'},now);
snapshot=await readDeviceReliability(env,now+5*minute);
assert.equal(snapshot.scope,'multiple_devices');assert.equal(snapshot.groups.length,3);
await Promise.all([evaluateDeviceReliability(env,snapshot,notify,now+5*minute),evaluateDeviceReliability(env,snapshot,notify,now+5*minute)]);
assert.equal(notifications.length,0,'A threshold crossing must remain unhealthy before alerting');
await Promise.all([evaluateDeviceReliability(env,snapshot,notify,now+10*minute),evaluateDeviceReliability(env,snapshot,notify,now+10*minute)]);
assert.equal(notifications.length,1,'Overlapping crons claim at most one notification');assert.equal(notifications[0]!.phase,'firing');
await evaluateDeviceReliability(env,snapshot,notify,now+15*minute);
assert.equal(notifications.length,1,'Repeated failures respect the 10-minute cooldown');

const missing={DB:{prepare(){throw Error('Bearer fixture-secret; personal contents');}}} as never;
assert.equal((await readDeviceReliability(missing)).coverage,'unavailable');
await evaluateDeviceReliability(env,await readDeviceReliability(missing),notify,now+20*minute);
assert.equal(notifications.length,1,'Missing observations cannot send recovery');
for(const id of ['d0','d1','d2'])await recordDeviceConnection(env,'user',id,'heartbeat',metadata,now+21*minute);
await evaluateDeviceReliability(env,await readDeviceReliability(env,now+21*minute),notify,now+21*minute);
assert.equal(notifications.length,1,'Recovery must remain below threshold');
for(const id of ['d0','d1','d2'])await recordDeviceConnection(env,'user',id,'heartbeat',metadata,now+26*minute);
await evaluateDeviceReliability(env,await readDeviceReliability(env,now+26*minute),notify,now+26*minute);
assert.equal(notifications.length,2);assert.equal(notifications[1]!.phase,'healthy');
await evaluateDeviceReliability(env,await readDeviceReliability(env,now+31*minute),notify,now+31*minute);
assert.equal(notifications.length,2,'A recovered signal is sent once');

// Only numeric counters, owner-checked identity and fixed labels reach storage.
const secret='fixture-do-not-store',malicious={platform:secret,agentVersion:'1.2.3-'+secret,name:secret,hostname:secret,command:secret,url:secret};
await recordDeviceConnection(env,'user','d3','connected',malicious,now);
const stored=sql.prepare("SELECT * FROM device_connection_buckets WHERE device_id='d3'").get()!;
assert.equal(stored.platform,'unknown');assert.equal(stored.agent_version,'unknown');assert(!JSON.stringify(stored).includes(secret));
for(let i=0;i<70;i++)await recordDeviceConnection(env,'user','d3','connected',metadata,now);
assert.equal(sql.prepare("SELECT connects FROM device_connection_buckets WHERE device_id='d3'").get()!.connects,60,'Bound per-device/minute counters');
sql.prepare("UPDATE devices SET revoked_at=? WHERE id='d3'").run(new Date(now).toISOString());
const before=Number(sql.prepare("SELECT SUM(connects) n FROM device_connection_buckets WHERE device_id='d3'").get()!.n);
await recordDeviceConnection(env,'user','d3','connected',metadata,now);
assert.equal(sql.prepare("SELECT SUM(connects) n FROM device_connection_buckets WHERE device_id='d3'").get()!.n,before);
assert(!(await readDeviceReliability(env,now)).groups.some(g=>g.agentVersion==='unknown'),'Revoked devices leave the aggregate');
await recordDeviceConnection(env,'user','d0','connected',metadata,now-31*86400000);
await purgeDeviceReliability(env,now);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM device_connection_buckets WHERE bucket_start<?').get(new Date(now-30*86400000).toISOString())!.n,0);

const monitorEnv={...env,PUBLIC_ORIGIN:'https://mcp.example.invalid',REGISTRY:{getByName:()=>({fetch:async()=>Response.json([])})}} as never;
const request=(user?:string)=>new Request('https://admin.example.invalid/api/monitor',{headers:user?{cookie:'rl_session='+user}:{}});
assert.equal((await handleMonitorState(request(),monitorEnv)).status,401);
assert.equal((await handleMonitorState(request('user'),monitorEnv)).status,403);
const stateBefore=sql.prepare('SELECT * FROM service_reliability_state').all();
const response=await handleMonitorState(request('admin'),monitorEnv);assert.equal(response.status,200);
const body=await response.json() as any;assert(body.deviceReliability.windows.length===3);
assert(!JSON.stringify(body.deviceReliability).includes('device_id'));
assert.deepEqual(sql.prepare('SELECT * FROM service_reliability_state').all(),stateBefore,'Admin GET is read-only and never evaluates/sends');
sql.close();
console.log('PASS: real SQLite lifecycle/ownership/privacy, bounded counters, platform/version trends, sustained multi-device alerts, concurrent claims, cooldown, observed recovery, missing telemetry, retention and admin-only read API');
