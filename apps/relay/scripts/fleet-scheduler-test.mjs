import assert from "node:assert/strict";
import { rankFleetDevices, selectFleetDevice } from "../src/fleet-scheduler.js";

const permissions = { background_tasks:true, scheduled_tasks:true, adaptive_agent:true, source_agent:true, keep_awake:true };
const operations = ["start_process","process_status","process_output","stop_process","read_file","write_file","edit_block"];
const device = (id, platform, opts={}) => ({
  id, name:id, platform, status:"online", execution_paused:false,
  tools:operations, workspace_roots:platform==="win32"?["E:\\Coding"]:["/workspace"],
  automation_permissions:permissions, keep_awake_available:true,
  ...opts,
});
const mac=device("mac","darwin");
const windows=device("windows","win32");
const linux=device("linux","linux");
const browser=device("browser","browser",{tools:["browser_read_page"],workspace_roots:[]});

const choose=(devices, active, criteria)=>rankFleetDevices(devices,new Map(Object.entries(active)),criteria);
const terminal={requiredTools:["start_process"],automation:true,kind:"agent_goal",controller:"source"};

assert.equal(choose([mac,windows,linux,browser],{mac:2,windows:0,linux:1},terminal)[0].device.id,"windows","busy Mac must not win");
const wslTwin=device("wsl-twin","linux",{hostname:"SamPC"});
const winTwin=device("win-twin","win32",{hostname:"SamPC"});
const macOther=device("mac-other","darwin",{hostname:"MacBook"});
assert.equal(choose([wslTwin,winTwin,macOther],{"win-twin":2},terminal)[0].device.id,"mac-other","Windows and WSL on the same host must share load");
assert.equal(choose([mac,windows],{mac:{running:0,recent_calls:3},windows:{running:0,recent_calls:0}},terminal)[0].device.id,"windows","recent interactive agent activity must count");
assert.equal(choose([mac,windows],{mac:{running:0,recent_calls:0},windows:{running:0,recent_calls:2}},terminal)[0].device.id,"mac","an idle Mac may be used when PC is busier");
assert.equal(choose([mac,windows,linux],{mac:3,windows:0,linux:0},{...terminal,workspace:"/workspace/repo"})[0].device.id,"linux","local workspace remains pinned to matching machine");
assert.deepEqual(choose([mac,windows,linux],{mac:0,windows:0,linux:0},{...terminal,platform:"darwin"}).map(x=>x.device.id),["mac"],"Mac-only work cannot move");
assert.deepEqual(choose([mac,windows,linux],{}, {...terminal,workspace:"/workspace-fake"}),[],"prefix bypass rejected");
assert.deepEqual(choose([mac,windows,linux],{}, {...terminal,workspace:"/workspace/../other"}),[],"non-canonical workspace must not be trusted");
assert.equal(choose([windows],{}, {...terminal,workspace:"e:\\coding\\repo"})[0].device.id,"windows","Windows path matching must be case insensitive");
assert.deepEqual(choose([windows],{}, {...terminal,workspace:"E:\\CodingOutside"}),[],"Windows prefix boundary checked");
assert.deepEqual(choose([device("offline","linux",{status:"offline"}),browser],{},terminal),[]);
assert.deepEqual(choose([device("paused","linux",{execution_paused:true})],{},terminal),[]);
assert.deepEqual(choose([device("readonly","linux",{tools:["read_file"]})],{},terminal),[]);
assert.deepEqual(choose([device("no-source","linux",{automation_permissions:{...permissions,source_agent:false}})],{},terminal),[]);
assert.deepEqual(choose([device("no-bg","linux",{automation_permissions:{...permissions,background_tasks:false}})],{},terminal),[]);
assert.deepEqual(choose([device("no-schedule","linux",{automation_permissions:{...permissions,scheduled_tasks:false}})],{}, {...terminal,scheduled:true}),[]);
assert.deepEqual(choose([device("no-keepawake","linux",{keep_awake_available:false})],{}, {...terminal,keepAwake:true}),[]);
assert.deepEqual(choose([mac,linux],{linux:1,mac:0},{...terminal,platform:"linux"}).map(x=>x.device.id),["linux"]);

const now=new Date().toISOString();
const stored=(d)=>({
 id:d.id,name:d.name,platform:d.platform,arch:"x64",hostname:d.id,created_at:now,last_seen:now,
 allowed_tools:JSON.stringify(d.tools),workspace_roots:JSON.stringify(d.workspace_roots),
 sensitive_paths:"[]",sensitive_allow_paths:"[]",protect_sensitive_paths:1,undo_enabled:1,
 automation_permissions:JSON.stringify(d.automation_permissions),background_enabled:1,background_service:"test",
 background_seen_at:now,
});
const rows=[stored(mac),stored(windows)];
const registry={
 getByName(scope){return {async fetch(){return Response.json(scope==="user:owner"
   ?[{id:"mac",tools:operations,status:"online"},{id:"windows",tools:operations,status:"online"}]:[]);}};},
};
const db={
 prepare(sql){return {bind(user){assert.equal(user,"owner");return {
   async all(){return {results:sql.includes("COUNT(*)")?[{device_id:"mac",running:2,recent_calls:1}]:rows};}
 };}};},
};
const selection=await selectFleetDevice({DB:db,REGISTRY:registry,PUBLIC_ORIGIN:"https://example.test"},"owner",terminal);
assert.equal(selection.device_id,"windows");
assert.equal(selection.running,0);
assert.equal(selection.eligible_count,2);
await assert.rejects(selectFleetDevice({DB:db,REGISTRY:registry,PUBLIC_ORIGIN:"https://example.test"},"owner",{...terminal,platform:"linux"}),/No online Fleet device/);
console.log("Fleet scheduler tests passed: capability, owner scope, permissions, workspace, platform, online state, load");
