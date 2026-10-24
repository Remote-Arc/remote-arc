import {MEDIA_DEMOS} from '../../../packages/docs/src/media-gallery.js';
const prefix='/media/demo-gallery/';
const files=new Set(MEDIA_DEMOS.flatMap(item=>[item.video,item.poster]));
export type DemoMediaBucket={
 head(key:string):Promise<{size:number;httpEtag:string;uploaded:Date}|null>;
 get(key:string,options?:{range:{offset:number;length:number}}):Promise<{body:ReadableStream<Uint8Array>}|null>;
};
const missing=()=>new Response('Media not found',{status:404,headers:{'cache-control':'no-store'}});
export async function serveDemoMedia(request:Request,bucket:DemoMediaBucket|undefined):Promise<Response>{
 const name=new URL(request.url).pathname.slice(prefix.length);
 if(!new URL(request.url).pathname.startsWith(prefix)||!files.has(name))return missing();
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
 if(!bucket)return new Response('Media temporarily unavailable',{status:503,headers:{'cache-control':'no-store'}});
 const key='demo-gallery/'+name,object=await bucket.head(key);if(!object)return missing();
 const headers=new Headers({'content-type':name.endsWith('.mp4')?'video/mp4':'image/webp','cache-control':'public, max-age=31536000, immutable','accept-ranges':'bytes','etag':object.httpEtag,'last-modified':object.uploaded.toUTCString(),'x-content-type-options':'nosniff','content-disposition':'inline'});
 const etags=request.headers.get('if-none-match')?.split(',').map(tag=>tag.trim().replace(/^W\//,''));
 if(etags?.some(tag=>tag==='*'||tag===object.httpEtag))return new Response(null,{status:304,headers});
 if(request.method==='HEAD'){headers.set('content-length',String(object.size));return new Response(null,{headers});}
 const range=request.headers.get('range'),ifRange=request.headers.get('if-range');let offset=0,length=object.size,status=200;
 if(range&&(!ifRange||ifRange===object.httpEtag||ifRange===object.uploaded.toUTCString())){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid=()=>new Response(null,{status:416,headers:{'content-range':'bytes */'+object.size,'accept-ranges':'bytes','cache-control':'no-store'}});
  if(!match||(!match[1]&&!match[2]))return invalid();
  if(match[1]){offset=Number(match[1]);const end=match[2]?Math.min(Number(match[2]),object.size-1):object.size-1;if(!Number.isSafeInteger(offset)||offset>=object.size||end<offset||!Number.isSafeInteger(end))return invalid();length=end-offset+1;}
  else{const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return invalid();length=Math.min(suffix,object.size);offset=object.size-length;}
  status=206;headers.set('content-range','bytes '+offset+'-'+(offset+length-1)+'/'+object.size);
 }
 const body=await bucket.get(key,status===206?{range:{offset,length}}:undefined);if(!body||!('body' in body))return missing();
 headers.set('content-length',String(length));return new Response(body.body,{status,headers});
}
