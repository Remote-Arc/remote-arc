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

const originalFetch=globalThis.fetch;
let mediaCalls=0;
try{
 globalThis.fetch=async(input,init)=>{
  mediaCalls++;assert.equal(String(input),'https://remotearc.app/media/demo-gallery/basketball-return-zh-fa20c92cf5e6.mp4');
  const headers=new Headers(init?.headers);assert.equal(headers.get('range'),'bytes=0-2');
  assert.equal(headers.get('if-none-match'),'"example-etag"');assert.equal(headers.get('if-range'),'"example-etag"');
  assert.equal(headers.has('cookie'),false);assert.equal(headers.has('authorization'),false);
  assert.equal(init?.redirect,'error');
  return new Response(init?.method==='HEAD'?null:'mp4',{status:206,headers:{'content-type':'video/mp4','content-range':'bytes 0-2/100','accept-ranges':'bytes'}});
 };
 const mediaPath='/media/demo-gallery/basketball-return-zh-fa20c92cf5e6.mp4';
 const request=(method='GET')=>new Request('https://preview.example'+mediaPath+'?ignored=1',{method,headers:{range:'bytes=0-2','if-none-match':'"example-etag"','if-range':'"example-etag"',cookie:'private=value',authorization:'Bearer private'}});
 const video=await worker.fetch(request(),env);
 assert.equal(video.status,206);assert.equal(await video.text(),'mp4');assert.equal(video.headers.get('accept-ranges'),'bytes');
 assert.equal(await (await worker.fetch(request('HEAD'),env)).text(),'');
 assert.equal((await worker.fetch(new Request('https://preview.example/media/demo-gallery/unknown.mp4'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://preview.example'+mediaPath,{method:'POST'}),env)).status,405);
 assert.equal(mediaCalls,2,'Only known public GET/HEAD assets may use the fallback');
 const bound={...env,PUBLIC_MEDIA:{head:async()=>({size:3,httpEtag:'"bound"',uploaded:new Date('2026-10-25')}),get:async()=>({body:new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('r2!'));controller.close();}})})}};
 const direct=await worker.fetch(new Request('https://preview.example'+mediaPath),bound);
 assert.equal(await direct.text(),'r2!');assert.equal(mediaCalls,2,'Bound previews use their R2 bucket');
 globalThis.fetch=async()=>{throw new Error('offline');};
 const unavailable=await worker.fetch(request(),env);assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('cache-control'),'no-store');
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: preview media fallback preserves range/HEAD, restricts assets and methods, strips private headers and prefers a bound R2 bucket');
