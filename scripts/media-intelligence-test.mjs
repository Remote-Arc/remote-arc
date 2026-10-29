import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ENGINE,parseRequest,preflight,runWorker} from '../skills/media-runtime/media-intelligence.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('bounded CLI rejects arbitrary yt-dlp flags, malformed limits and invalid input before setup',()=>{
 const base=['download','--workspace',root,'--url','https://www.youtube.com/watch?v=example','--output','evidence','--kind','audio'];
 const parsed=parseRequest(base);assert.equal(parsed.maxBytes,128*1024**2);assert.equal(parsed.maxSeconds,600);
 for(const extra of [['--cookies','secret'],['--exec','sh'],['--max-mb','513'],['--end','90','--start','100'],['--max-seconds','NaN'],['--kind','video']])assert.throws(()=>parseRequest([...base,...extra]));
 assert.throws(()=>parseRequest(['inspect','--workspace',root,'--url','file:///etc/passwd','--output','evidence']));
 assert.throws(()=>parseRequest(['transcript','--workspace',root,'--url','https://example.org','--output','evidence','--languages','en,--exec']));
 assert.throws(()=>parseRequest(['frames','--workspace',root,'--evidence','e','--output','f','--times','1,1']));
 assert.equal(ENGINE.version,'2026.10.26');assert.match(ENGINE.sha256,/^[a-f0-9]{64}$/);
});
test('preflight preserves existing outputs, receipts and workspace boundaries',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ra-evidence-test-'));
 try{
  await fs.writeFile(path.join(temp,'kept'),'original');
  for(const output of ['kept','../escape'])await assert.rejects(preflight({action:'report',workspace:temp,output}));
  await fs.writeFile(path.join(temp,'report.md.artifact.json'),'receipt');await assert.rejects(preflight({action:'report',workspace:temp,output:'report.md'}));
  assert.equal(await fs.readFile(path.join(temp,'kept'),'utf8'),'original');
  await assert.rejects(preflight({action:'find',workspace:temp,evidence:'../missing'}));
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('worker failure, timeout and disk budget never become a verified result',async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ra-worker-test-'));
 const interpreter={command:process.execPath,prefix:[]},worker=path.join(temp,'worker.cjs');
 try{
  await fs.writeFile(worker,"process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({verified:false,code:'SOURCE_AUTH_REQUIRED',message:'Public access unavailable'}));process.exitCode=1;});");
  await assert.rejects(runWorker({workspace:temp},{python:interpreter,worker}),{code:'SOURCE_AUTH_REQUIRED'});
  await fs.writeFile(worker,"process.stdin.resume();setInterval(()=>{},1000);");
  await assert.rejects(runWorker({workspace:temp},{python:interpreter,worker,timeout:200}),{code:'TIMEOUT'});
  const output=path.join(temp,'out');await fs.mkdir(output);
  await fs.writeFile(worker,"const fs=require('node:fs');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{fs.writeFileSync(JSON.parse(s).output+'/partial',Buffer.alloc(100000));setInterval(()=>{},1000);});");
  await assert.rejects(runWorker({workspace:temp,output},{python:interpreter,worker,byteBudget:1000}),{code:'DOWNLOAD_LIMIT'});
  assert.equal(JSON.parse(await fs.readFile(path.join(output,'failure.json'),'utf8')).verified,false);
  const fast=path.join(temp,'fast');await fs.mkdir(fast);
  await fs.writeFile(worker,"const fs=require('node:fs');let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{fs.writeFileSync(JSON.parse(s).output+'/partial',Buffer.alloc(100000));console.log(JSON.stringify({verified:true}));});");
  await assert.rejects(runWorker({workspace:temp,output:fast},{python:interpreter,worker,byteBudget:1000}),{code:'DOWNLOAD_LIMIT'});
 }finally{await fs.rm(temp,{recursive:true,force:true});}
});
test('Python evidence workflow: retrieval decisions, caption parsing, offsets, tampering and citations',()=>{
 const candidates=process.platform==='win32'?['python','python3']:['python3','python'];
 const command=candidates.find(exe=>spawnSync(exe,['-c','import sys;sys.exit(0 if sys.version_info >= (3,11) else 1)'],{windowsHide:true}).status===0);
 assert(command,'Python 3.11+ is required to validate the packaged media worker');
 const result=spawnSync(command,['-B','-X','utf8',path.join(root,'scripts/media-intelligence-test.py')],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},windowsHide:true});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
