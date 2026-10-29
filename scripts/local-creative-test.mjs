import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CreativeRuntime,main,validateMcpRequest} from '../skills/media-runtime/local-creative.mjs';

async function temporary(callback){const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-creative-test-'));try{return await callback(root);}finally{assert(path.basename(root).startsWith('ra-creative-test-'));await fs.rm(root,{recursive:true,force:true});}}

test('invalid setup engines cannot touch the network or install',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected download');};
 try{await assert.rejects(main(['ensure','--workspace',path.resolve('absent-creative-test'),'--engine','unknown']),{code:'INVALID_ENGINE'});assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('rendering validates the scene, workspace and existing output before dependency setup',()=>temporary(async root=>{
 const runtime=new CreativeRuntime(root);runtime.ensure=async()=>{throw Error('Unexpected setup');};
 await assert.rejects(runtime.renderManim('scene.py','bad/name','out.mp4'),{code:'SCENE_REQUIRED'});
 await assert.rejects(runtime.renderManim('../scene.py','Main','out.mp4'),{code:'OUTSIDE_WORKSPACE'});
 await fs.writeFile(path.join(root,'film.mp4'),'original user artifact');
 await assert.rejects(runtime.renderManim('scene.py','Main','film.mp4'),{code:'OUTPUT_EXISTS'});
 assert.equal(await fs.readFile(path.join(root,'film.mp4'),'utf8'),'original user artifact');
}));
test('the bridge rejects remote-provider tools and invalid loopback ports before setup',()=>temporary(async root=>{
 const runtime=new CreativeRuntime(root);runtime.ensure=async()=>{throw Error('Unexpected setup');};
 await assert.rejects(runtime.mcp('9876@remote'),{code:'INVALID_PORT'});
 await fs.writeFile(path.join(root,'request.json'),JSON.stringify({tool:'generate_3d_model',arguments:{}}));
 await assert.rejects(runtime.mcp(9876,'request.json'),{code:'INVALID_MCP_REQUEST'});
 assert.throws(()=>validateMcpRequest({tool:'execute_blender_code',arguments:{code:'print(1)'}}),{code:'INVALID_MCP_REQUEST'});
 assert.equal(validateMcpRequest({tool:'get_scene_info',arguments:{}}).tool,'get_scene_info');
}));
test('shutdown is scoped to the selected session and cannot follow an escaping stop-file symlink',()=>temporary(async root=>{
 const workspace=path.join(root,'work'),outside=path.join(root,'user-file');await fs.mkdir(workspace);await fs.writeFile(outside,'preserve');
 const runtime=new CreativeRuntime(workspace),session=path.join(workspace,'session');await fs.mkdir(session);
 await fs.writeFile(path.join(session,'config.json'),JSON.stringify({workspace,session}));
 await fs.symlink(outside,path.join(session,'stop.request'),'file');
 await assert.rejects(runtime.stop(session),{code:'OUTSIDE_WORKSPACE'});assert.equal(await fs.readFile(outside,'utf8'),'preserve');
 await fs.unlink(path.join(session,'stop.request'));const result=await runtime.stop(session);assert.equal(result.status,'stop_requested');await runtime.stop(session);
}));
