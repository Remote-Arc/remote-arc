import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {recoverLegacyAdminClient} from '../src/admin/admin-client-recovery.js';
import {PRODUCT_CACHE,PRODUCT_SW} from '../src/pwa-config.js';

const publicRoot=new URL('../public/',import.meta.url), origin='https://admin.remotearc.app';
for(const [name,start] of [['manifest.webmanifest','/dashboard/connect/overview'],['admin.webmanifest','/']]) {
  const manifest=JSON.parse(fs.readFileSync(new URL(name!,publicRoot),'utf8'));
  assert.equal(manifest.start_url,start); assert.equal(manifest.display,'standalone'); assert.equal(manifest.scope,'/');
  for(const size of [192,512]) {
    const icon=manifest.icons.find((value:any)=>value.sizes===`${size}x${size}`);assert.ok(icon);
    const bytes=fs.readFileSync(new URL('.'+icon.src,publicRoot));assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
  }
}
const registrations:string[]=[], removed:string[]=[];
assert.equal(await recoverLegacyAdminClient({hostname:'admin.remotearc.app',origin,controlled:true,getRegistrations:async()=>[{scope:origin+'/',active:{scriptURL:origin+PRODUCT_SW},unregister:async()=>{registrations.push('new');return true;}}],cacheKeys:async()=>['remote-arc-shell-v1',PRODUCT_CACHE,'unrelated'],deleteCache:async key=>{removed.push(key);return true;},reload:()=>{throw Error('New PWA must not be reloaded');}}),false);
assert.deepEqual(registrations,[]);assert.deepEqual(removed,['remote-arc-shell-v1']);

const handlers=new Map<string,(event:any)=>void>(), stores=new Map<string,Map<string,Response>>();
const key=(value:any)=>typeof value==='string'?new URL(value,origin).href:value.url;
const cache=(name:string)=>{if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name)!;return{async addAll(paths:string[]){for(const path of paths)data.set(key(path),new Response(path==='/offline.html'?'Offline shell':'asset'));},async put(request:any,response:Response){data.set(key(request),response);},async keys(){return [...data.keys()].map(url=>new Request(url));},async delete(request:any){return data.delete(key(request));}};};
let offline=false,networkCalls=0;
vm.runInNewContext(fs.readFileSync(new URL('sw.js',publicRoot),'utf8'),{URL,Response,self:{location:{origin},addEventListener:(name:string,handler:any)=>handlers.set(name,handler),skipWaiting(){},clients:{claim(){}}},caches:{open:async(name:string)=>cache(name),keys:async()=>[...stores.keys()],delete:async(name:string)=>stores.delete(name),match:async(request:any)=>{for(const store of stores.values()){const value=store.get(key(request));if(value)return value.clone();}}},fetch:async(request:any)=>{networkCalls++;if(offline)throw Error('offline');return new Response('private or network content',{headers:{'cache-control':new URL(request.url).pathname.includes('private')?'no-store':'public'}});}});
async function lifecycle(name:string){let work:Promise<unknown>|undefined;handlers.get(name)!({waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;}
await lifecycle('install');stores.set('remote-arc-shell-v1',new Map());stores.set('unrelated',new Map());await lifecycle('activate');assert.ok(!stores.has('remote-arc-shell-v1'));assert.ok(stores.has('unrelated'));
async function request(path:string,method='GET',mode='cors'){let response:Promise<Response>|undefined;handlers.get('fetch')!({request:{url:origin+path,method,mode},respondWith:(promise:Promise<Response>)=>{response=promise;}});return response?{handled:true,response:await response}:{handled:false};}
for(const path of ['/api/arc/sessions','/api/admin/operations','/auth/login','/oauth/token','/mcp'])assert.equal((await request(path)).handled,false);
assert.equal((await request('/assets/main.js','POST')).handled,false);
assert.equal((await request('/manifest.webmanifest')).handled,false,'Manifests always refresh from the network');
const online=await request('/?section=operations','GET','navigate');assert.equal(await online.response!.text(),'private or network content');assert.ok(!stores.get(PRODUCT_CACHE)!.has(origin+'/?section=operations'));
offline=true;const fallback=await request('/dashboard/agent/chat','GET','navigate');assert.equal(await fallback.response!.text(),'Offline shell');offline=false;
const before=networkCalls;await request('/fonts/InterVariable.woff2');await request('/fonts/InterVariable.woff2');assert.equal(networkCalls,before+1);
await request('/assets/private.js');assert.ok(!stores.get(PRODUCT_CACHE)!.has(origin+'/assets/private.js'));
console.log('PASS: distinct installable Agent/Admin manifests, valid icons, new-worker recovery, offline fallback, sensitive data bypass and static-only caching');
