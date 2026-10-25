#!/usr/bin/env node
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {MEDIA_DEMOS} from '../packages/docs/src/media-gallery.ts';
import {IMAGE_DEMOS} from '../packages/docs/src/image-gallery.ts';
const GALLERY_ASSETS=[...MEDIA_DEMOS.flatMap(item=>[{name:item.video,sha256:item.sha256},{name:item.poster,sha256:item.posterSha256}]),...IMAGE_DEMOS.flatMap(item=>[{name:item.image,sha256:item.sha256},{name:item.thumb,sha256:item.thumbSha256}])];
const galleryContentType=(name)=>name.endsWith('.mp4')?'video/mp4':name.endsWith('.png')?'image/png':'image/webp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),index=args.indexOf('--directory'),upload=args.includes('--upload');
if(index<0||!args[index+1])throw Error('Usage: node scripts/media-gallery-publish.mjs --directory <prepared media directory> [--upload]. Without --upload, only verify local files.');
const directory=path.resolve(args[index+1]),files=GALLERY_ASSETS;
for(const file of files){
 if(!/^[a-z0-9-]+-[a-f0-9]{12}\.(mp4|webp|png)$/.test(file.name))throw Error('Invalid gallery filename');
 const local=path.join(directory,file.name),hash=createHash('sha256');for await(const chunk of createReadStream(local))hash.update(chunk);
 if(hash.digest('hex')!==file.sha256)throw Error('SHA-256 mismatch: '+file.name);
 const stat=await fs.stat(local);if(!stat.size)throw Error('Empty gallery asset');
 console.log(JSON.stringify({file:file.name,bytes:stat.size,key:'demo-gallery/'+file.name,verified:true,upload}));
}
if(upload)for(const file of files){
 const result=spawnSync(process.execPath,[path.join(root,'apps/relay/node_modules/wrangler/bin/wrangler.js'),'r2','object','put','remote-arc-public-media/demo-gallery/'+file.name,'--file',path.join(directory,file.name),'--remote','--content-type',galleryContentType(file.name),'--cache-control','public, max-age=31536000, immutable','--config',path.join(root,'apps/relay/wrangler.jsonc')],{stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw Error('R2 upload failed: '+file.name);
}
