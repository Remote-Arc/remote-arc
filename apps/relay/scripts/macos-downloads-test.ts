import assert from 'node:assert/strict';
import { handleMacAppDownload } from '../src/agent-downloads.js';
let version = '0.6.6';
const manifest = () => ({version,notarized:true,minimumMacOS:'13.0',artifacts:Object.fromEntries(['arm64','amd64'].map(arch=>[arch,{filename:`RemoteArc-v${version}-macos-${arch}.dmg`,sha256:'a'.repeat(64)}]))});
const releaseFetch = (async (url,init) => {
  assert.equal(url,'https://github.com/Remote-Arc/remote-arc/releases/latest/download/macos-apps.json');
  assert.equal(init?.cache,'no-store');assert.equal(new Headers(init?.headers).get('authorization'),null);
  return Response.json(manifest());
}) as typeof fetch;
const request = (suffix='') => new Request('https://remotearc.app/api/downloads/macos'+suffix+'?url=https://untrusted.invalid');
assert.deepEqual(await (await handleMacAppDownload(request(),releaseFetch)).json(),{available:true,version,minimumMacOS:'13.0'});
for(const arch of ['amd64','arm64']){
  const response=await handleMacAppDownload(request('/'+arch),releaseFetch);
  assert.equal(response.status,302);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('location'),`https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${version}/RemoteArc-v${version}-macos-${arch}.dmg`);
}
version='0.6.7';assert((await handleMacAppDownload(request('/arm64'),releaseFetch)).headers.get('location')?.includes('/remotelink-v0.6.7/'));
for(const bad of [{...manifest(),notarized:false},{...manifest(),artifacts:{}},{...manifest(),version:'0.6.8-rc.1'},null]){
  const fetcher=(async()=>Response.json(bad)) as typeof fetch;
  assert.equal((await handleMacAppDownload(request('/arm64'),fetcher)).status,503);
  assert.deepEqual(await (await handleMacAppDownload(request(),fetcher)).json(),{available:false});
}
assert.deepEqual(await (await handleMacAppDownload(request(),(async()=>new Response(null,{status:404})) as typeof fetch)).json(),{available:false});
assert.equal((await handleMacAppDownload(request('/linux'),releaseFetch)).status,404);
assert.equal((await handleMacAppDownload(new Request(request(),{method:'POST'}),releaseFetch)).status,405);
console.log('PASS: latest stable signed/notarized Mac packages, exact fixed-origin filenames, no-store and safe curl fallback');
