import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkLiteralPath,createPlan,digest,executePlan,identity,parseArgs,platformInfo,protectedReason,protectionRules,writePlan} from '../skills/safe-cleanup/scripts/safe-cleanup.mjs';

// Every test works in a fresh temporary fixture; no real user directory is ever a target.
const helper=fileURLToPath(new URL('../skills/safe-cleanup/scripts/safe-cleanup.mjs',import.meta.url));
const win=process.platform==='win32';
const old=new Date(Date.now()-10*86400000);
function fixture(){
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ra-safe-cleanup-')));
 const home=path.join(base,'home'),cache=path.join(base,'cache'),outside=path.join(base,'outside'),plans=path.join(base,'plans');
 for(const dir of [path.join(home,'Documents'),path.join(cache,'sub','deep'),outside,plans])fs.mkdirSync(dir,{recursive:true});
 const files={a:path.join(cache,'a.bin'),b:path.join(cache,'sub','b.bin'),c:path.join(cache,'sub','deep','c.bin')};
 fs.writeFileSync(files.a,Buffer.alloc(1000));fs.writeFileSync(files.b,Buffer.alloc(2000));fs.writeFileSync(files.c,'c');
 fs.writeFileSync(path.join(outside,'precious.txt'),'keep me');fs.writeFileSync(path.join(outside,'b.bin'),'outside twin');
 fs.writeFileSync(path.join(home,'Documents','thesis.docx'),'keep me');
 const rules=protectionRules({home});
 return {base,home,cache,outside,plans,files,rules,deps:{rules},cleanup:()=>fs.rmSync(base,{recursive:true,force:true})};
}
const link=(target,at)=>fs.symlinkSync(target,at,win?'junction':'dir');
const exists=p=>{try{fs.lstatSync(p);return true;}catch{return false;}};
function planned(f,extra={}){const output=path.join(f.plans,`plan-${Math.random().toString(16).slice(2)}.json`);const preview=writePlan({targets:[f.cache],output,...extra},f.deps);return {output,preview,plan:JSON.parse(fs.readFileSync(output,'utf8'))};}
const journalPaths=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line).path):[];

test('execute removes exactly the approved plan; later additions and outside files survive',()=>{
 const f=fixture();
 try{
  const {output,preview,plan}=planned(f);
  assert.equal(preview.hash,plan.hash);assert.match(preview.hash,/^[a-f0-9]{64}$/);assert.equal(preview.permanent,true);assert.equal(preview.recoverable,false);
  assert.equal(plan.totals.files,3);assert.equal(plan.totals.bytes,3001);assert.equal(plan.totals.dirs,2,'sub and sub/deep, root kept by default');
  const late=path.join(f.cache,'sub','late.txt');fs.writeFileSync(late,'created after preview');
  const report=executePlan({planFile:output,hash:preview.hash},f.deps);
  assert.equal(report.status,'partial');assert.equal(report.removedFiles,3);assert.equal(report.removedBytes,3001);
  assert.equal(report.notRemoved['not-empty'],1,'sub is kept because it gained a file');
  assert(exists(late)&&exists(f.cache)&&!exists(f.files.a)&&!exists(path.join(f.cache,'sub','deep')));
  assert.equal(fs.readFileSync(path.join(f.outside,'precious.txt'),'utf8'),'keep me');
  const approved=new Set([...plan.files,...plan.dirs].map(e=>e.path));
  const removed=journalPaths(output+'.journal.jsonl');assert.equal(removed.length,4);
  assert(removed.every(p=>approved.has(p)),'Journal only contains approved paths');
  assert.equal(JSON.parse(fs.readFileSync(output+'.report.json','utf8')).status,'partial');
 }finally{f.cleanup();}
});

test('dry run matches the preview and deletes nothing',()=>{
 const f=fixture();
 try{
  const {output,preview}=planned(f);
  const dry=executePlan({planFile:output,hash:preview.hash,dryRun:true},f.deps);
  assert.equal(dry.status,'dry_run');assert.equal(dry.wouldRemoveFiles,preview.totals.files);assert.equal(dry.wouldRemoveBytes,preview.totals.bytes);assert.equal(dry.wouldRemoveDirs,preview.totals.dirs);
  assert(Object.values(f.files).every(exists));assert(!exists(output+'.journal.jsonl'));
 }finally{f.cleanup();}
});

test('wrong hash, tampered plan or rehashed plan outside the roots deletes nothing',()=>{
 const f=fixture();
 try{
  const {output,preview,plan}=planned(f);
  assert.throws(()=>executePlan({planFile:output,hash:'0'.repeat(64)},f.deps),{code:'HASH_MISMATCH'});
  assert.throws(()=>executePlan({planFile:output},f.deps),{code:'HASH_REQUIRED'});
  const target=path.join(f.outside,'precious.txt'),st=fs.lstatSync(target,{bigint:true});
  const tampered={...plan,files:[...plan.files,{path:target,dev:String(st.dev),ino:String(st.ino),size:String(st.size),mtimeNs:String(st.mtimeNs)}]};
  fs.writeFileSync(output,JSON.stringify(tampered));
  assert.throws(()=>executePlan({planFile:output,hash:preview.hash},f.deps),{code:'HASH_MISMATCH'});
  tampered.hash=digest(tampered);fs.writeFileSync(output,JSON.stringify(tampered));
  assert.throws(()=>executePlan({planFile:output,hash:tampered.hash},f.deps),{code:'PLAN_INVALID'});
  const traversal={...plan,files:[{...plan.files[0],path:path.join(f.cache,'..','outside','precious.txt')}]};traversal.hash=digest(traversal);fs.writeFileSync(output,JSON.stringify(traversal));
  assert.throws(()=>executePlan({planFile:output,hash:traversal.hash},f.deps),{code:'PLAN_INVALID'});
  assert(exists(target)&&Object.values(f.files).every(exists));
 }finally{f.cleanup();}
});

test('symlinks and junctions inside a target are never followed or removed',()=>{
 const f=fixture();
 try{
  const at=path.join(f.cache,'sub','escape');link(f.outside,at);
  const {output,preview,plan}=planned(f);
  assert(!plan.files.some(e=>e.path.startsWith(at)));assert.equal(plan.totals.skipped['link-not-followed'],1);
  assert(!plan.dirs.some(e=>e.path===path.join(f.cache,'sub')),'A folder holding a link is not removed');
  executePlan({planFile:output,hash:preview.hash},f.deps);
  assert(exists(at)&&fs.lstatSync(at).isSymbolicLink());assert.equal(fs.readFileSync(path.join(f.outside,'precious.txt'),'utf8'),'keep me');
 }finally{f.cleanup();}
});

test('a target that is itself a link is refused',()=>{
 const f=fixture();
 try{const at=path.join(f.base,'cache-link');link(f.cache,at);assert.throws(()=>createPlan({targets:[at]},f.deps),{code:'TARGET_IS_LINK'});}finally{f.cleanup();}
});

test('a folder swapped for a junction after preview cannot redirect deletion',()=>{
 const f=fixture();
 try{
  const {output,preview}=planned(f);
  const sub=path.join(f.cache,'sub');fs.renameSync(sub,path.join(f.base,'moved-sub'));link(f.outside,sub);
  const report=executePlan({planFile:output,hash:preview.hash},f.deps);
  assert.equal(report.status,'partial');assert(report.notRemoved['parent-changed']>=1);
  assert.equal(fs.readFileSync(path.join(f.outside,'b.bin'),'utf8'),'outside twin');assert(exists(path.join(f.outside,'precious.txt')));
  assert(!exists(f.files.a),'Unaffected approved entries still run');
 }finally{f.cleanup();}
});

test('a root replaced after preview stops the whole plan before deleting',()=>{
 const f=fixture();
 try{
  const {output,preview}=planned(f);
  fs.renameSync(f.cache,path.join(f.base,'old-cache'));fs.mkdirSync(f.cache);fs.writeFileSync(path.join(f.cache,'a.bin'),'new');
  assert.throws(()=>executePlan({planFile:output,hash:preview.hash},f.deps),{code:'ROOT_CHANGED'});
  assert.equal(fs.readFileSync(path.join(f.cache,'a.bin'),'utf8'),'new');
 }finally{f.cleanup();}
});

test('files that change between preview and execute are kept',()=>{
 const f=fixture();
 try{
  const {output,preview}=planned(f);
  fs.appendFileSync(f.files.b,'more');fs.rmSync(f.files.c);fs.writeFileSync(f.files.c,'replaced');
  const report=executePlan({planFile:output,hash:preview.hash},f.deps);
  assert.equal(report.notRemoved['changed-since-plan'],2);assert(exists(f.files.b)&&exists(f.files.c)&&!exists(f.files.a));
 }finally{f.cleanup();}
});

test('locked or denied files are reported without widening the deletion',()=>{
 const f=fixture();
 try{
  const {output,preview}=planned(f);
  const locked={...fs,realpathSync:fs.realpathSync,unlinkSync(p){if(p===f.files.b)throw Object.assign(new Error('busy'),{code:'EBUSY'});return fs.unlinkSync(p);}};
  const report=executePlan({planFile:output,hash:preview.hash},{...f.deps,fs:locked});
  assert.equal(report.status,'partial');assert.equal(report.notRemoved['locked-or-denied:EBUSY'],1);assert.equal(report.notRemoved['not-empty'],1);
  assert(exists(f.files.b)&&exists(path.join(f.cache,'sub'))&&!exists(f.files.c)&&!exists(f.files.a));
  assert.deepEqual(report.problems.map(x=>x.path).sort(),[f.files.b,path.join(f.cache,'sub')].sort());
 }finally{f.cleanup();}
});

test('cancellation and timeouts stop between entries and report what was not attempted',()=>{
 const f=fixture();
 try{
  let {output,preview}=planned(f);
  const report=executePlan({planFile:output,hash:preview.hash},{...f.deps,onEntry(){fs.writeFileSync(output+'.cancel','stop');}});
  assert.equal(report.status,'cancelled');assert.equal(report.removedFiles,1);assert(report.notAttempted>=3);
  assert.equal(journalPaths(output+'.journal.jsonl').length,1);
  ({output,preview}=planned(f));
  let clock=Date.now();
  const timed=executePlan({planFile:output,hash:preview.hash,maxSeconds:1},{...f.deps,now:()=>(clock+=600)});
  assert.equal(timed.status,'timed_out');assert(timed.notAttempted>0);
 }finally{f.cleanup();}
});

test('expired, foreign or already executed plans are refused',()=>{
 const f=fixture();
 try{
  const {output,preview}=planned(f);
  assert.throws(()=>executePlan({planFile:output,hash:preview.hash},{...f.deps,now:()=>Date.now()+2*3600000}),{code:'PLAN_EXPIRED'});
  assert.throws(()=>executePlan({planFile:output,hash:preview.hash},{...f.deps,env:{...identity(),host:'another-pc'}}),{code:'PLAN_HOST_MISMATCH'});
  executePlan({planFile:output,hash:preview.hash},f.deps);
  assert.throws(()=>executePlan({planFile:output,hash:preview.hash},f.deps),{code:'PLAN_ALREADY_EXECUTED'});
 }finally{f.cleanup();}
});

test('protected folders, project roots and the Undo store are refused or skipped',()=>{
 const f=fixture();
 try{
  const repo=path.join(f.base,'project');fs.mkdirSync(path.join(repo,'.git'),{recursive:true});fs.mkdirSync(path.join(repo,'src'));fs.mkdirSync(path.join(repo,'node_modules','pkg'),{recursive:true});fs.writeFileSync(path.join(repo,'node_modules','pkg','i.js'),'x');
  const undo=path.join(f.home,'.remotearc','undo');fs.mkdirSync(undo,{recursive:true});
  const appData=path.join(f.home,'AppData','Local','Temp','app-cache');fs.mkdirSync(appData,{recursive:true});
  for(const target of [f.home,path.join(f.home,'Documents'),path.join(f.home,'Documents'),f.base,path.join(f.home,'AppData'),path.join(f.home,'AppData','Local'),repo,path.join(repo,'src'),undo])
   assert.throws(()=>createPlan({targets:[target]},f.deps),{code:'PROTECTED_TARGET'},target);
  if(win||process.platform==='darwin')assert.throws(()=>createPlan({targets:[path.join(f.home,'DOCUMENTS')]},f.deps),{code:'PROTECTED_TARGET'});
  assert.equal(createPlan({targets:[path.join(repo,'node_modules')]},f.deps).plan.totals.files,1);
  assert.equal(createPlan({targets:[appData]},f.deps).plan.roots[0].recognized,true);
  fs.mkdirSync(path.join(f.cache,'vendored','.git'),{recursive:true});fs.writeFileSync(path.join(f.cache,'vendored','keep.c'),'x');
  fs.mkdirSync(path.join(f.cache,'.remotearc','undo'),{recursive:true});fs.writeFileSync(path.join(f.cache,'.remotearc','undo','1.json'),'{}');
  assert.throws(()=>createPlan({targets:[f.cache,path.join(f.cache,'sub')]},f.deps),{code:'OVERLAPPING_TARGETS'});
  const {output,preview,plan}=planned(f);
  assert.equal(plan.totals.skipped['nested-repository'],1);assert.equal(plan.totals.skipped['protected-metadata'],1);
  executePlan({planFile:output,hash:preview.hash},f.deps);
  assert(exists(path.join(f.cache,'vendored','keep.c'))&&exists(path.join(f.cache,'.remotearc','undo','1.json')));
 }finally{f.cleanup();}
});

test('protection rules are case-insensitive on Windows and macOS and cover system locations',()=>{
 const w=protectionRules({platform:'win32',home:'C:\\Users\\Ann',env:{SystemRoot:'C:\\Windows',OneDrive:'C:\\Users\\Ann\\OneDrive'}});
 for(const p of ['c:\\USERS\\ann\\documents\\x','C:\\Users\\Ann','C:\\Users','C:\\WINDOWS\\System32','C:\\Program Files\\App','C:\\Users\\Ann\\OneDrive\\cache','C:\\Users\\Ann\\.remotearc\\undo','C:\\Users\\Ann\\AppData','D:\\work\\.git\\objects'])assert(protectedReason(w,p),p);
 for(const p of ['C:\\Windows\\Temp\\x','C:\\Users\\Ann\\AppData\\Local\\Temp','D:\\cache\\npm'])assert.equal(protectedReason(w,p),null,p);
 const m=protectionRules({platform:'darwin',home:'/Users/ann',env:{}});
 for(const p of ['/users/ANN/documents/a','/System/Library','/Library/Preferences','/usr/local','/Users','/private/var/folders','/Users/ann/Library'])assert(protectedReason(m,p),p);
 for(const p of ['/Users/ann/Library/Caches/com.app','/Library/Caches/x','/private/var/folders/ab/T/x'])assert.equal(protectedReason(m,p),null,p);
 const l=protectionRules({platform:'linux',home:'/home/ann',env:{}});
 assert(protectedReason(l,'/home/Ann/Documents')===null,'Linux is case-sensitive');assert(protectedReason(l,'/home/ann/Documents/x'));assert.equal(protectedReason(l,'/home/ann/.cache/pip'),null);
});

test('ambiguous, relative, network and shell-quoted paths are refused before any filesystem access',()=>{
 const w=platformInfo('win32'),p=platformInfo('linux');
 for(const input of ['cache','C:cache','\\\\server\\share\\cache','\\\\?\\C:\\cache','//server/share','C:\\cache\\..\\Users','C:\\cache\\*','C:\\cache" & rd /s /q C:\\','%TEMP%\\x','C:\\','C:\\cache:stream','C:\\cache\\ ',' C:\\cache','C:\\a\nb'])assert.throws(()=>checkLiteralPath(w,input),undefined,JSON.stringify(input));
 for(const input of ['tmp/x','/','~/cache','$HOME/cache','/tmp/../etc','/tmp/./x','/tmp/$(rm -rf ~)','/tmp/`x`'])assert.throws(()=>checkLiteralPath(p,input),undefined,input);
 assert.equal(checkLiteralPath(w,"D:\\cache\\O'Brien"),"D:\\cache\\O'Brien");assert.equal(checkLiteralPath(p,'/tmp/cache dir'),'/tmp/cache dir');
 assert.throws(()=>parseArgs(['plan','--target','/tmp/x','--output','/tmp/p.json','--force']),{code:'INVALID_OPTION'});
 assert.throws(()=>parseArgs(['execute','--plan','/tmp/p.json','--hash']),{code:'MISSING_OPTION'});
 assert.throws(()=>parseArgs(['delete','--target','/']),{code:'INVALID_ACTION'});
});

test('age filter, mounted volumes and hard links are reflected in the plan',()=>{
 const f=fixture();
 try{
  fs.utimesSync(f.files.a,old,old);fs.utimesSync(f.files.b,old,old);
  let {plan}=planned(f,{olderThanDays:7});
  assert.deepEqual(plan.files.map(e=>e.path).sort(),[f.files.a,f.files.b].sort());assert.equal(plan.totals.recentFilesKept,1);
  assert(!plan.dirs.some(e=>e.path===path.join(f.cache,'sub')),'Folders with recent files stay');
  const mounted=path.join(f.cache,'sub');
  const otherVolume={...fs,lstatSync(p,o){const st=fs.lstatSync(p,o);if(p!==mounted)return st;return Object.assign(Object.create(Object.getPrototypeOf(st)),st,{dev:st.dev+1n});}};
  ({plan}=createPlan({targets:[f.cache]},{...f.deps,fs:otherVolume}));
  assert.equal(plan.totals.skipped['other-volume'],1);assert(!plan.files.some(e=>e.path.startsWith(mounted)));
  fs.linkSync(f.files.a,path.join(f.cache,'a-hardlink.bin'));
  ({plan}=planned(f));assert.equal(plan.totals.sharedHardlinkBytes,2000);
 }finally{f.cleanup();}
});

test('plan output must be outside the targets and never overwrites',()=>{
 const f=fixture();
 try{
  assert.throws(()=>writePlan({targets:[f.cache],output:path.join(f.cache,'plan.json')},f.deps),{code:'UNSAFE_OUTPUT'});
  const output=path.join(f.plans,'plan.json');fs.writeFileSync(output,'existing');
  assert.throws(()=>writePlan({targets:[f.cache],output},f.deps),{code:'UNSAFE_OUTPUT'});assert.equal(fs.readFileSync(output,'utf8'),'existing');
 }finally{f.cleanup();}
});

test('CLI plan, dry-run, execute and cancel round trip on a fixture',()=>{
 const f=fixture();
 try{
  const run=args=>{const r=spawnSync(process.execPath,[helper,...args],{encoding:'utf8'});return {status:r.status,body:JSON.parse(r.stdout)};};
  const output=path.join(f.plans,'cli-plan.json');
  const planned_=run(['plan','--target',f.cache,'--output',output]);assert.equal(planned_.status,0,JSON.stringify(planned_.body));
  assert.equal(planned_.body.totals.files,3);assert.match(planned_.body.next,/execute --plan/);
  assert.equal(run(['execute','--plan',output,'--hash','f'.repeat(64)]).body.code,'HASH_MISMATCH');
  assert.equal(run(['execute','--plan',output,'--hash',planned_.body.hash,'--dry-run']).body.status,'dry_run');
  assert(Object.values(f.files).every(exists));
  const done=run(['execute','--plan',output,'--hash',planned_.body.hash]);
  assert.equal(done.status,0);assert.equal(done.body.status,'completed');assert.equal(done.body.removedFiles,3);assert.equal(done.body.permanent,true);
  assert(!Object.values(f.files).some(exists)&&exists(f.cache)&&exists(path.join(f.outside,'precious.txt')));
  const refused=run(['plan','--target',path.parse(f.base).root,'--output',path.join(f.plans,'root.json')]);
  assert.equal(refused.status,1);assert.equal(refused.body.deleted,false);
  assert.equal(run(['cancel','--plan',output]).body.ok,true);assert(exists(output+'.cancel'));
 }finally{f.cleanup();}
});
