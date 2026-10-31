import assert from 'node:assert/strict';
import {serveDemoMedia} from '../src/platform/demo-media.js';
import {IMAGE_DEMOS} from '../../../packages/docs/src/image-gallery.js';
import {GALLERY_ASSETS} from '../../../packages/docs/src/gallery-assets.js';
import {MEDIA_DEMOS,PUBLISHED_MEDIA_DEMOS} from '../../../packages/docs/src/media-gallery.js';
const data=new TextEncoder().encode('0123456789'),etag='"test-etag"',uploaded=new Date('2026-10-25T00:00:00Z');let gets=0,heads=0;
const bucket={async head(key:string){heads++;assert(key.startsWith('demo-gallery/'));return{size:data.length,httpEtag:etag,uploaded};},async get(_key:string,options?:{range:{offset:number;length:number}}){gets++;const bytes=options?data.slice(options.range.offset,options.range.offset+options.range.length):data;return{body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})};}} as unknown as R2Bucket;
const url='https://remotearc.app/media/demo-gallery/'+MEDIA_DEMOS[0]!.video;
const req=(method='GET',headers:Record<string,string>={})=>new Request(url,{method,headers});
assert.equal(await(await serveDemoMedia(req(),bucket)).text(),'0123456789');
const before=gets,head=await serveDemoMedia(req('HEAD'),bucket);assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');assert.equal(gets,before);
for(const [value,status,expected] of [['bytes=2-5',206,'2345'],['bytes=5-',206,'56789'],['bytes=-3',206,'789'],['bytes=0-99',206,'0123456789'],['bytes=99-',416,''],['bytes=4-2',416,''],['bytes=-0',416,''],['bytes=0-1,4-5',416,'']] as const){
 const response=await serveDemoMedia(req('GET',{range:value}),bucket);assert.equal(response.status,status,value);assert.equal(await response.text(),expected,value);
}
const partial=await serveDemoMedia(req('GET',{range:'bytes=2-5'}),bucket);assert.equal(partial.headers.get('content-range'),'bytes 2-5/10');assert.equal(partial.headers.get('content-length'),'4');
const conditional=await serveDemoMedia(req('GET',{'if-none-match':etag}),bucket);assert.equal(conditional.status,304);
const weak=await serveDemoMedia(req('GET',{'if-none-match':'W/'+etag}),bucket);assert.equal(weak.status,304);
const changed=await serveDemoMedia(req('GET',{range:'bytes=2-5','if-range':'"old-etag"'}),bucket);assert.equal(changed.status,200);assert.equal(await changed.text(),'0123456789');
const denied=await serveDemoMedia(req('POST'),bucket);assert.equal(denied.status,405);
const count=heads;assert.equal((await serveDemoMedia(new Request('https://remotearc.app/media/demo-gallery/private.mp4'),bucket)).status,404);assert.equal(heads,count,'Unknown names never read the bucket');
assert.equal((await serveDemoMedia(req(),undefined)).status,503);
const missing={head:async()=>null} as unknown as R2Bucket;assert.equal((await serveDemoMedia(req(),missing)).status,404);
console.log('PASS: public demo media allowlist, streaming, byte ranges/seeking, HEAD, ETags, cache and method boundaries');

assert.equal(new Set(GALLERY_ASSETS.map(item=>item.name)).size,GALLERY_ASSETS.length,'Each approved media filename is unique');
for(const file of GALLERY_ASSETS){assert.match(file.name,/^[a-z0-9-]+-[a-f0-9]{12}\.(mp4|webp|png)$/);assert.match(file.sha256,/^[a-f0-9]{64}$/);}
for(const item of IMAGE_DEMOS){const response=await serveDemoMedia(new Request('https://remotearc.app/media/demo-gallery/'+item.image),bucket);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');const thumb=await serveDemoMedia(new Request('https://remotearc.app/media/demo-gallery/'+item.thumb,{method:'HEAD'}),bucket);assert.equal(thumb.headers.get('content-type'),'image/webp');}
assert.deepEqual([...new Set(PUBLISHED_MEDIA_DEMOS.map(item=>item.language))].sort(),['en','zh']);
const pilots=PUBLISHED_MEDIA_DEMOS.filter(item=>item.id.startsWith('basketball-return-'));
assert.equal(pilots.length,2);
assert(pilots.every(item=>item.duration>=59.9&&item.audio==='music'),'The new pilot meets the full-minute, no-narration brief');
for(const id of ['basketball','why-24-hours','venus','pluto','aura-product','data-in-motion','world-connections','aura-focus-en','data-story-en','connected-world-en'])assert(PUBLISHED_MEDIA_DEMOS.some(item=>item.id===id),'Existing demo must remain visible: '+id);
console.log('PASS: English media metadata, original PNG references and shared allowlist integrity');
