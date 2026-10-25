import assert from 'node:assert/strict';
import {previewRuntimeConfig} from '../src/preview-config.js';
import worker from '../src/preview-worker.js';
import {createArcPreview} from '../src/arc-preview.js';

assert.equal(previewRuntimeConfig({}).arcAvailable,true);
for(const value of ['0','true','invalid',''])assert.equal(previewRuntimeConfig({ARC_PREVIEW_ENABLED:value}).arcAvailable,false);
assert.equal(previewRuntimeConfig({ARC_PREVIEW_ENABLED:'1'}).arcAvailable,true);
assert.equal(previewRuntimeConfig({}).billingAvailable,false);
let assets=0;
const env={ASSETS:{fetch:async()=>{assets++;return new Response('asset');}},ARC_PREVIEW_ENABLED:'0'};
const disabled=await worker.fetch(new Request('https://preview.example/api/runtime-config'),env);
assert.equal(disabled.headers.get('cache-control'),'no-store');assert.equal((await disabled.json()).arcAvailable,false);assert.equal(assets,0);
assert.equal((await worker.fetch(new Request('https://preview.example/api/runtime-config',{method:'POST'}),env)).status,405);
assert.equal(await (await worker.fetch(new Request('https://preview.example/api/runtime-config',{method:'HEAD'}),env)).text(),'');
assert.equal(await (await worker.fetch(new Request('https://preview.example/assets/app.js'),env)).text(),'asset');

const arc=createArcPreview(),otherTab=createArcPreview();
const decode=async(path:string,method='GET',body?:unknown)=>{const response=arc.handle('/api/arc/'+path,method,body===undefined?undefined:JSON.stringify(body));assert(response);return{status:response.status,body:await response.json()};};
const created=await decode('sessions','POST',{modelId:'auto'}),id=created.body.id;assert.equal(created.status,201);
assert.equal(otherTab.handle('/api/arc/sessions/'+id,'GET',undefined)?.status,404);
const input={text:'Show a preview',modelId:'auto',requestId:'preview-request'};
const first=await decode('sessions/'+id+'/messages','POST',input),replay=await decode('sessions/'+id+'/messages','POST',input);assert.equal(first.status,202);assert.equal(first.body.run.id,replay.body.run.id);
assert.equal((await decode('sessions/'+id+'/messages','POST',{...input,text:'different'})).status,409);
await decode('sessions/'+id);await decode('sessions/'+id);const completed=await decode('sessions/'+id);assert.equal(completed.body.runs[0].status,'succeeded');assert.match(completed.body.messages.at(-1).text,/simulated/);assert.match(completed.body.messages.at(-1).text,/No model was called/);
const next=await decode('sessions/'+id+'/messages','POST',{...input,text:'取消测试',requestId:'second-request'});await decode('sessions/'+id+'/cancel','POST',{runId:next.body.run.id});assert.equal((await decode('sessions/'+id)).body.runs[0].status,'cancelled');
await decode('sessions/'+id,'DELETE');assert.equal((await decode('sessions/'+id)).status,404);
assert.equal(arc.handle('/api/apps/call','POST','{}'),null);
console.log('PASS: server-controlled preview flags, uncached config, invalid-value closure, per-tab simulation, replay, cancellation and no App dispatch');
