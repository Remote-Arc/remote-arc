import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {executeArcTool,runArcStep,arcToolInputError} from '../src/arc-chat-runtime.js';
import {arcMessages} from '../src/arc-chat.js';
/** Scripted inference, real artifact I/O and HTTP. No customer device, provider or paid model. */
export async function testArcOutcomes({sql,env,api,create,decode,decisions,tool,reply,row}:any){
 const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'arc-outcome-')),project=path.join(workspace,'portfolio'),file=path.join(project,'index.html');
 const deviceId='outcome-windows',tools=['list_directory','read_file','write_file','start_process','process_status','process_output','stop_process'];
 const previousRegistry=env.REGISTRY,server=http.createServer(async(request,response)=>{try{response.setHeader('content-type','text/html');response.end(await fs.readFile(file));}catch{response.writeHead(404);response.end('Missing');}});
 let writes=0,starts=0,url='';
 const at=new Date().toISOString();
 sql.prepare('INSERT INTO devices(id,user_id,name,platform,hostname,workspace_roots,allowed_tools,credential_hash,created_at,last_seen) VALUES(?,?,?,?,?,?,?,?,?,?)').run(deviceId,'owner','Authorized Windows fixture','win32','outcome-host',JSON.stringify([workspace]),JSON.stringify(tools),'fixture-device-hash',at,at);
 sql.prepare('INSERT INTO devices(id,user_id,name,platform,workspace_roots,credential_hash,created_at,last_seen) VALUES(?,?,?,?,?,?,?,?)').run('foreign-outcome','other','Foreign computer','linux',JSON.stringify([workspace]),'foreign-fixture-hash',at,at);
 env.REGISTRY={getByName:(key:string)=>({fetch:async(input:Request|string,init?:RequestInit)=>{assert.equal(key,'user:owner');const request=input instanceof Request?input:new Request(input,init);if(new URL(request.url).pathname==='/devices')return Response.json([{id:deviceId,status:'online',tools,capabilities:['device_policy_v1']}]);const payload=await request.json() as any,args=payload.arguments||payload.args;assert.equal(payload.deviceId||payload.device_id,deviceId);let result;
 if(payload.tool==='write_file'){const target=path.resolve(args.path);assert(target.startsWith(project+path.sep));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,args.content);writes++;result={path:target,bytes:Buffer.byteLength(args.content),written:true};}
 else if(payload.tool==='read_file')result={path:args.path,content:await fs.readFile(args.path,'utf8')};
 else if(payload.tool==='start_process'){assert.equal(args.command,'fixture-preview');starts++;server.listen(0,'127.0.0.1');await once(server,'listening');url='http://127.0.0.1:'+(server.address() as any).port;result={process_id:'preview-fixture',status:'running',stdout:url};}
 else if(payload.tool==='process_output'){const response=await fetch(url);const content=await response.text();assert.equal(response.status,200);assert(content.includes('Alex Portfolio'));result={process_id:'preview-fixture',status:'running',stdout:JSON.stringify({url,httpStatus:response.status,expectedHeading:true})};}
 else throw Error('Unexpected fixture tool '+payload.tool);return Response.json({result});}})};
 try{
  const rejected=await executeArcTool(env,{user_id:'owner'} as any,tool('select_device',{requiredTools:tools,platform:'linux'})) as any;
  assert.equal(rejected.code,'ARC_DEVICE_REQUIREMENTS_UNMET');assert.equal(rejected.dispatched,false);assert.deepEqual(rejected.availableDevices.map((d:any)=>d.id),[deviceId]);assert.equal(starts,0);assert.equal(writes,0);
  assert(arcToolInputError('device_tool',{deviceId,tool:'write_file',arguments:{path:file,text:'wrong property'}}),'Malformed file writes are corrected before dispatch');
  const session=await create(),response=await decode(await api('sessions/'+session+'/messages','POST',{text:'Create a working portfolio website for fictional Alex. Use the authorized Windows computer and verify its local preview.',requestId:crypto.randomUUID(),skillIds:['arc-website']}),202);
  decisions.push(tool('read_skill',{id:'arc-website'}),tool('select_device',{requiredTools:tools,platform:'linux'}),tool('select_device',{requiredTools:tools}),tool('device_tool',{deviceId,tool:'write_file',arguments:{path:file,content:'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Alex Portfolio</title><h1>Alex Portfolio</h1><p>A synthetic acceptance website.</p></html>'}}),tool('device_tool',{deviceId,tool:'read_file',arguments:{path:file}}),tool('device_tool',{deviceId,tool:'start_process',arguments:{command:'fixture-preview',cwd:workspace,background:true}}),tool('device_tool',{deviceId,tool:'process_output',arguments:{process_id:'preview-fixture'}}),reply('Saved the actual portfolio files and checked the local preview.'));
  while(await runArcStep(env,response.run.id)){}
  assert.equal(row(response.run.id).status,'succeeded');assert.equal(writes,1);assert.equal(starts,1);assert((await fs.stat(file)).size>100);assert.equal((await fetch(url)).status,200);
  const history=await arcMessages(env,'owner',session);assert(history.some(message=>message.tool==='select_device'&&String(message.result).includes('ARC_DEVICE_REQUIREMENTS_UNMET')));assert(history.some(message=>String(message.result).includes('httpStatus')));
  const source=path.join(project,'source.csv'),report=path.join(project,'report.md');await fs.writeFile(source,'category,amount\nA,5\nB,7\n');const reportSession=await create(),reportRun=await decode(await api('sessions/'+reportSession+'/messages','POST',{text:'Create a saved report from the authorized source.csv and verify its total and output.',requestId:crypto.randomUUID(),skillIds:['arc-report']}),202);
  decisions.push(tool('read_skill',{id:'arc-report'}),tool('device_tool',{deviceId,tool:'read_file',arguments:{path:source}}),tool('device_tool',{deviceId,tool:'write_file',arguments:{path:report,content:'# Synthetic report\nA: 5\nB: 7\nTotal: 12\nSource: source.csv'}}),tool('device_tool',{deviceId,tool:'read_file',arguments:{path:report}}),reply('The saved report total is 12; the file was read back.'));
  while(await runArcStep(env,reportRun.run.id)){}assert.equal(row(reportRun.run.id).status,'succeeded');assert((await fs.readFile(report,'utf8')).includes('Total: 12'));
  console.log('PASS: Arc recovers a Linux mismatch, selects only an owned Windows device, writes a real website and verifies live local HTTP through the production dispatcher (scripted model, no fees)');
 }finally{env.REGISTRY=previousRegistry;if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));assert.equal(path.dirname(path.resolve(workspace)),path.resolve(os.tmpdir()));assert(path.basename(workspace).startsWith('arc-outcome-'));await fs.rm(workspace,{recursive:true,force:true});sql.prepare('DELETE FROM devices WHERE id IN (?,?)').run(deviceId,'foreign-outcome');}
}
