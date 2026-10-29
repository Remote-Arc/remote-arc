import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {collectMacosApps} from './collect-macos-apps.mjs';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'remotearc-mac-manifest-'));
const version='0.6.6';
try{
  for(const arch of ['arm64','amd64']){
    const filename=`RemoteArc-v${version}-macos-${arch}.dmg`;
    const bytes=Buffer.from('fixture-'+arch);
    await fs.writeFile(path.join(dir,filename),bytes);
    await fs.writeFile(path.join(dir,`macos-app-${arch}.json`),JSON.stringify({version,arch,filename,notarized:true,minimumMacOS:'13.0',sha256:createHash('sha256').update(bytes).digest('hex')}));
  }
  const manifest=await collectMacosApps(dir,version);
  assert.equal(Object.keys(manifest.artifacts).length,2);
  assert.equal(manifest.notarized,true);
  assert.match(await fs.readFile(path.join(dir,'MACOS-SHA256SUMS'),'utf8'),/RemoteArc-v0.6.6-macos-arm64.dmg/);
  const receiptPath=path.join(dir,'macos-app-arm64.json');
  const good=JSON.parse(await fs.readFile(receiptPath,'utf8'));
  for(const change of [{notarized:false},{version:'0.6.5'},{sha256:'0'.repeat(64)},{filename:'other.dmg'},{minimumMacOS:'12.0'}]){
    await fs.writeFile(receiptPath,JSON.stringify({...good,...change}));
    await assert.rejects(()=>collectMacosApps(dir,version),/mismatch|not notarized/);
  }
}finally{
  for(const name of ['macos-app-arm64.json','macos-app-amd64.json','macos-apps.json','MACOS-SHA256SUMS',`RemoteArc-v${version}-macos-arm64.dmg`,`RemoteArc-v${version}-macos-amd64.dmg`])await fs.unlink(path.join(dir,name)).catch(()=>{});
  await fs.rmdir(dir);
}
console.log('PASS: only matching notarized receipts and actual DMG hashes enter the release manifest; unsigned/stale/tampered packages rejected');
