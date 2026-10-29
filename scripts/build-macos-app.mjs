import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
export function macosBuildOptions(args, env, platform = process.platform) {
  if (platform !== 'darwin') throw Error('Build the macOS App on macOS with Xcode command-line tools.');
  const arch = args.find(value => value.startsWith('--arch='))?.slice(7) || (process.arch === 'arm64' ? 'arm64' : 'amd64');
  if (!['amd64','arm64'].includes(arch)) throw Error('Supported Mac architectures: amd64, arm64.');
  const release = args.includes('--release');
  const identity = env.MACOS_SIGNING_IDENTITY || '-';
  if (release && !identity.startsWith('Developer ID Application: ')) throw Error('Release requires MACOS_SIGNING_IDENTITY: a Developer ID Application certificate, not Apple Development.');
  if (release && !env.MACOS_NOTARY_PROFILE && !(env.MACOS_NOTARY_KEY_PATH && env.MACOS_NOTARY_KEY_ID && env.MACOS_NOTARY_ISSUER_ID)) {
    throw Error('Release requires a notarytool keychain profile or App Store Connect notarization API key.');
  }
  return {arch, release, identity};
}
function run(executable, args, options = {}) {
  const result = spawnSync(executable,args,{cwd:root,encoding:'utf8',...options});
  if (result.error || result.status !== 0) throw Error(`${executable} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout.trim();
}
const xml = value => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));

export async function buildMacosApp(args = process.argv.slice(2), env = process.env) {
  const {arch, release, identity} = macosBuildOptions(args,env);
  const version = JSON.parse(await fs.readFile(path.join(root,'packages/cli/package.json'),'utf8')).version;
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw Error('Invalid release version.');
  const output = path.join(root,'work/macos-app',arch);
  await fs.mkdir(output,{recursive:true});
  const temporary = await fs.mkdtemp(path.join(output,'build-'));
  const staging = path.join(temporary,'volume');
  const app = path.join(staging,'Remote Arc.app');
  const macOS = path.join(app,'Contents/MacOS');
  const resources = path.join(app,'Contents/Resources');
  await fs.mkdir(macOS,{recursive:true});await fs.mkdir(resources,{recursive:true});
  const minimum = '13.0';
  const target = `${arch === 'amd64' ? 'x86_64' : 'arm64'}-apple-macos${minimum}`;
  const goBinary = path.join(macOS,'remotelink');
  run('go',['build','-trimpath','-buildvcs=false','-ldflags',`-s -w -X main.version=${version}`,'-o',goBinary,'./cmd/remotelink'],{
    cwd:path.join(root,'apps/agent'),env:{...env,GOOS:'darwin',GOARCH:arch,CGO_ENABLED:'0'},
  });
  run('xcrun',['swiftc','-swift-version','5','-O','-target',target,'-framework','AppKit','-framework','ServiceManagement',
    path.join(root,'apps/macos/RemoteArc.swift'),'-o',path.join(macOS,'RemoteArc')]);
  await fs.chmod(goBinary,0o755);await fs.chmod(path.join(macOS,'RemoteArc'),0o755);
  const iconGenerator = path.join(temporary,'make-icon');
  run('xcrun',['swiftc',path.join(root,'apps/macos/MakeIcon.swift'),'-o',iconGenerator]);
  const iconset = path.join(temporary,'RemoteArc.iconset');
  run(iconGenerator,[iconset]);
  run('iconutil',['-c','icns',iconset,'-o',path.join(resources,'RemoteArc.icns')]);
  const info = {
    CFBundleIdentifier:'app.remotearc.agent',CFBundleName:'Remote Arc',CFBundleDisplayName:'Remote Arc',
    CFBundleExecutable:'RemoteArc',CFBundlePackageType:'APPL',CFBundleShortVersionString:version.replace(/-.*/,''),RemoteArcAgentVersion:version,
    CFBundleVersion:version.replace(/-.*/,''),CFBundleIconFile:'RemoteArc',LSMinimumSystemVersion:minimum,
    NSHighResolutionCapable:true,LSUIElement:true,
    NSAppleEventsUsageDescription:'Remote Arc controls a browser only when you enable browser tasks for this computer.',
  };
  await fs.writeFile(path.join(app,'Contents/Info.plist'),'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'+
    Object.entries(info).map(([key,value])=>`<key>${xml(key)}</key>${typeof value==='boolean'?`<${value}/>`:`<string>${xml(value)}</string>`}`).join('\n')+'\n</dict></plist>\n');
  await fs.writeFile(path.join(app,'Contents/PkgInfo'),'APPL????');
  const signing = release ? ['--options','runtime','--timestamp'] : [];
  // Sign nested executable first; never use --deep to conceal missing nested signatures.
  run('codesign',['--force','--sign',identity,...signing,'--entitlements',path.join(root,'apps/macos/entitlements.plist'),goBinary]);
  run('codesign',['--force','--sign',identity,...signing,app]);
  run('codesign',['--verify','--deep','--strict','--verbose=2',app]);
  const auth = !release ? [] : env.MACOS_NOTARY_PROFILE ? ['--keychain-profile',env.MACOS_NOTARY_PROFILE]
    : ['--key',env.MACOS_NOTARY_KEY_PATH,'--key-id',env.MACOS_NOTARY_KEY_ID,'--issuer',env.MACOS_NOTARY_ISSUER_ID];
  const notarize = file => {
    const result = JSON.parse(run('xcrun',['notarytool','submit',file,...auth,'--wait','--timeout','15m','--output-format','json'],{timeout:16*60*1000}));
    if (result.status !== 'Accepted') throw Error('Apple notarization was not Accepted; do not publish this artifact.');
  };
  if(release) {
    const archive = path.join(temporary,'RemoteArc.zip');
    run('ditto',['-c','-k','--keepParent',app,archive]);
    notarize(archive);
    run('xcrun',['stapler','staple',app]);
    run('xcrun',['stapler','validate',app]);
    run('spctl',['--assess','--type','execute','--verbose=2',app]);
  }
  await fs.symlink('/Applications',path.join(staging,'Applications'));
  const filename = `RemoteArc-v${version}-macos-${arch}.dmg`;
  const dmg = path.join(output,filename);
  // Refuse stale artifact replacement. A second build can use a clean CI workspace.
  try { await fs.access(dmg); throw Error('The DMG already exists. Use a fresh build workspace.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  run('hdiutil',['create','-volname','Remote Arc','-srcfolder',staging,'-format','UDZO',dmg]);
  if (release) {
    run('codesign',['--sign',identity,'--timestamp',dmg]);
    notarize(dmg);
    run('xcrun',['stapler','staple',dmg]);
    run('xcrun',['stapler','validate',dmg]);
    run('spctl',['--assess','--type','open','--context','context:primary-signature','--verbose=2',dmg]);
  }
  const checksum = createHash('sha256').update(await fs.readFile(dmg)).digest('hex');
  const manifest = {version,arch,filename,sha256:checksum,notarized:release,minimumMacOS:minimum};
  await fs.writeFile(path.join(output,`macos-app-${arch}.json`),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({...manifest,app,dmg},null,2));
  return {app,dmg,...manifest};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildMacosApp();
