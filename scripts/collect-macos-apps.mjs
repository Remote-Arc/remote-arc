import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function collectMacosApps(directory,version){
  const manifest={version,notarized:true,minimumMacOS:'13.0',artifacts:{}};
  const sums=[];
  for(const arch of ['arm64','amd64']){
    const receipt=JSON.parse(await fs.readFile(path.join(directory,`macos-app-${arch}.json`),'utf8'));
    const filename=`RemoteArc-v${version}-macos-${arch}.dmg`;
    if(receipt.version!==version||receipt.arch!==arch||receipt.filename!==filename||receipt.notarized!==true||receipt.minimumMacOS!=='13.0')throw Error('Mac release receipt mismatch or not notarized: '+arch);
    const sha256=createHash('sha256').update(await fs.readFile(path.join(directory,filename))).digest('hex');
    if(receipt.sha256!==sha256)throw Error('Mac release checksum mismatch: '+arch);
    manifest.artifacts[arch]={filename,sha256};sums.push(`${sha256}  ${filename}`);
  }
  await fs.writeFile(path.join(directory,'macos-apps.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(directory,'MACOS-SHA256SUMS'),sums.join('\n')+'\n');
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const version=JSON.parse(await fs.readFile(path.join(root,'packages/cli/package.json'),'utf8')).version;
  await collectMacosApps(path.join(root,'work/macos-release'),version);
  console.log('PASS: two notarized Mac DMGs match this release and their receipts.');
}
