import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {components,Runtime,checkedPath,validateSubtitles,main,run} from '../skills/media-runtime/local-media.mjs';

async function temporary(callback){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-media-test-'));
 try{return await callback(root);}finally{assert(path.basename(root).startsWith('ra-media-test-'));await fs.rm(root,{recursive:true,force:true});}
}
test('large-model requests stop before touching disk or network, including mixed requests',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network');};
 try{
  for(const component of ['qwen','qwen-tts','qwen3-tts','ace-step','acestep','maps,qwen-tts']){
   await assert.rejects(main(['ensure','--workspace',path.resolve('nonexistent-media-test'),'--components',component]),{code:'APPROVAL_REQUIRED'});
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('unknown/empty components cannot start setup',()=>{
 assert.throws(()=>components(''),{code:'INVALID_COMPONENT'});
 assert.throws(()=>components('curl-something'),{code:'INVALID_COMPONENT'});
 assert.deepEqual(components('maps,whisper,maps'),['maps','whisper']);
 assert.deepEqual(components('remotion,maps,remotion'),['remotion','maps']);
});
test('filesystem traversal and escaping symlinks are rejected',()=>temporary(async root=>{
 const workspace=path.join(root,'workspace'),outside=path.join(root,'outside');await fs.mkdir(workspace);await fs.mkdir(outside);
 await assert.rejects(checkedPath(workspace,'../outside/out.mp4'),{code:'OUTSIDE_WORKSPACE'});
 await fs.symlink(outside,path.join(workspace,'link'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(checkedPath(workspace,'link/output.mp4'),{code:'OUTSIDE_WORKSPACE'});
 assert.equal(await checkedPath(workspace,'new/out.mp4'),path.join(workspace,'new','out.mp4'));
}));
test('checksum mismatch leaves no executable or partial download',()=>temporary(async root=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('corrupt bytes');
 try{
  const runtime=new Runtime(root),target=path.join(root,'binary');
  await assert.rejects(runtime.download('https://example.invalid/binary',target,{sha256:'0'.repeat(64)}),{code:'CHECKSUM_MISMATCH'});
  await assert.rejects(fs.access(target));await assert.rejects(fs.access(target+'.part'));
 }finally{globalThis.fetch=original;}
}));
test('verified cache is reused without network and download size is bounded',()=>temporary(async root=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('too big');};
 try{
  const runtime=new Runtime(root),target=path.join(root,'cached');await fs.writeFile(target,'ok');
  const digest=createHash('sha256').update('ok').digest('hex');
  await runtime.download('https://example.invalid/binary',target,{sha256:digest});assert.equal(calls,0);
  await assert.rejects(runtime.download('https://example.invalid/binary',path.join(root,'limited'),{maxBytes:2}),{code:'DOWNLOAD_LIMIT'});
  await assert.rejects(fs.access(path.join(root,'limited.part')));
 }finally{globalThis.fetch=original;}
}));
test('subtitle timing validation rejects silence, backwards cues and out-of-range times',()=>{
 const cue=(a,b,text='Hello')=>'1\n'+a+' --> '+b+'\n'+text+'\n';
 assert.deepEqual(validateSubtitles(cue('00:00:00,000','00:00:01,000'),2),{cues:1,lastCueEnd:1});
 assert.throws(()=>validateSubtitles('',2),{code:'NO_SPEECH'});
 assert.throws(()=>validateSubtitles(cue('00:00:02,000','00:00:01,000'),3),{code:'INVALID_SUBTITLES'});
 assert.throws(()=>validateSubtitles(cue('00:00:00,000','00:00:10,000'),2),{code:'INVALID_SUBTITLES'});
 assert.throws(()=>validateSubtitles(cue('00:00:01,000','00:00:02,000')+cue('00:00:00,000','00:00:01,000'),3),{code:'INVALID_SUBTITLES'});
});
test('existing final outputs are preserved before setup or rendering',()=>temporary(async root=>{
 const runtime=new Runtime(root),output=path.join(root,'film.mp4');await fs.writeFile(output,'existing user file');
 runtime.ensure=async()=>{throw Error('setup must not run');};
 await assert.rejects(runtime.render('openfilm',root,output),{code:'OUTPUT_EXISTS'});
 assert.equal(await fs.readFile(output,'utf8'),'existing user file');
 await assert.rejects(fs.access(output+'.artifact.json'));
}));
test('failed subprocesses cannot be mistaken for completed output',async()=>{
 await assert.rejects(run(process.execPath,['-e','process.exit(7)'],{quiet:true}),{code:'COMMAND_FAILED'});
});

test('Remotion requires an explicit composition before setup and never overwrites user output',()=>temporary(async root=>{
 const project=path.join(root,'film');await fs.mkdir(path.join(project,'src'),{recursive:true});await fs.writeFile(path.join(project,'src/index.tsx'),'registered composition');
 const runtime=new Runtime(root);runtime.ensure=async()=>{throw Error('setup must not run');};
 await assert.rejects(runtime.render('remotion',project,path.join(root,'new.mp4')),{code:'COMPOSITION_REQUIRED'});
 const output=path.join(root,'existing.mp4');await fs.writeFile(output,'user output');
 await assert.rejects(runtime.render('remotion',project,output,{composition:'Main'}),{code:'OUTPUT_EXISTS'});
 assert.equal(await fs.readFile(output,'utf8'),'user output');
}));
test('artifact receipts require actual nonempty files',()=>temporary(async root=>{
 const runtime=new Runtime(root),output=path.join(root,'result');await fs.writeFile(output,'');
 await assert.rejects(runtime.artifact(output,{kind:'map'}),{code:'EMPTY_OUTPUT'});
 await fs.writeFile(output,'actual bytes');const receipt=await runtime.artifact(output,{kind:'map'});
 assert.equal(receipt.verified,true);assert.equal(receipt.bytes,12);
 assert.equal(receipt.sha256,createHash('sha256').update('actual bytes').digest('hex'));
 assert.deepEqual(JSON.parse(await fs.readFile(output+'.artifact.json','utf8')),receipt);
}));
