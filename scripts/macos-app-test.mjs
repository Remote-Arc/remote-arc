import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { macosBuildOptions, buildMacosApp } from './build-macos-app.mjs';

assert.throws(()=>macosBuildOptions([],{},'linux'),/macOS/);
assert.throws(()=>macosBuildOptions(['--arch=bad'],{},'darwin'),/architectures/);
assert.throws(()=>macosBuildOptions(['--release'],{},'darwin'),/Developer ID/);
assert.throws(()=>macosBuildOptions(['--release'],{MACOS_SIGNING_IDENTITY:'Apple Development: someone'},'darwin'),/Developer ID/);
assert.throws(()=>macosBuildOptions(['--release'],{MACOS_SIGNING_IDENTITY:'Developer ID Application: Example (TEAM)'},'darwin'),/notarytool/);
assert.equal(macosBuildOptions(['--arch=arm64','--release'],{MACOS_SIGNING_IDENTITY:'Developer ID Application: Example (TEAM)',MACOS_NOTARY_PROFILE:'test-only'},'darwin').release,true);
if (process.platform !== 'darwin') {
  console.log('PASS: Mac release configuration fails closed without distribution signing/notarization; real App acceptance runs on macOS CI.');
} else {
  const result = await buildMacosApp(process.argv.slice(2));
  const {app,dmg,arch} = result;
  const run = (command,args) => {
    const executed=spawnSync(command,args,{encoding:'utf8',timeout:30000});
    assert.equal(executed.status,0,executed.stderr || executed.stdout);
    return executed.stdout;
  };
  for (const name of ['RemoteArc','remotelink']) assert((await fs.stat(path.join(app,'Contents/MacOS',name))).mode & 0o111);
  assert((await fs.stat(path.join(app,'Contents/Resources/RemoteArc.icns'))).size>0);
  run('plutil',['-lint',path.join(app,'Contents/Info.plist')]);
  const machine = arch === 'amd64' ? 'x86_64' : 'arm64';
  for (const name of ['RemoteArc','remotelink']) assert(run('lipo',['-archs',path.join(app,'Contents/MacOS',name)]).includes(machine));
  if ((process.arch === 'arm64' ? 'arm64' : 'amd64') === arch) assert.match(run(path.join(app,'Contents/MacOS/RemoteArc'),['--self-test']),/PASS:/);
  const mount = path.join(path.dirname(dmg),'mounted-test');
  await fs.mkdir(mount);
  let attached=false;
  try {
    run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);attached=true;
    assert.equal(await fs.readlink(path.join(mount,'Applications')),'/Applications');
    const mountedApp = path.join(mount,'Remote Arc.app');
    run('codesign',['--verify','--deep','--strict',mountedApp]);
    // Verify mode bits survive the actual distributable container, not just staging.
    for (const name of ['RemoteArc','remotelink']) assert((await fs.stat(path.join(mountedApp,'Contents/MacOS',name))).mode & 0o111);
    if ((process.arch === 'arm64' ? 'arm64' : 'amd64') === arch) assert.match(run(path.join(mountedApp,'Contents/MacOS/RemoteArc'),['--self-test']),/PASS:/);
  } finally { if(attached)run('hdiutil',['detach',mount]); }
  console.log('PASS: actual DMG mounts, Applications link, App signatures/icon/metadata, bundled architecture/version and preserved executable permissions');
}
