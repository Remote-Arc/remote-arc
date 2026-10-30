#!/usr/bin/env node
// Safe Cleanup helper: plan -> user approves the printed hash -> execute exactly that plan.
// Standalone (Node 18.15+, no dependencies). Deletion is permanent; nothing is moved to a
// Recycle Bin and Remote Arc Local Undo cannot restore it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const TOOL='remote-arc-safe-cleanup',PLAN_VERSION=1;
const DAY=86400000,LIST_LIMIT=200;
const VCS=new Set(['.git','.hg','.svn']),GUARDED=new Set([...VCS,'.remotearc']);
// Inside a version-controlled project only regenerable output directories may be cleaned.
const BUILD_DIRS=new Set(['node_modules','dist','build','out','target','coverage','.next','.nuxt','.turbo','.cache','.parcel-cache','.svelte-kit','.angular','.gradle','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','.tox','.venv','venv','bin','obj','deriveddata','tmp','temp','.tmp','logs']);
const CACHE_NAME=/(^|[\\/])(?:[^\\/]*cache[^\\/]*|caches|temp|tmp|\.tmp|logs?|crashdumps|crashpad|deriveddata|node_modules|__pycache__|\.npm|\.yarn|\.pnpm-store|\.gradle|\.m2|\.nuget|\.cargo[\\/]registry|go[\\/]pkg[\\/]mod|pip|dist|build|out|target|coverage|\.next|\.turbo)(?:[\\/]|$)/i;

export function fault(code,message,details){return Object.assign(new Error(message),{code,...(details?{details}:{})});}

export function platformInfo(platform=process.platform){
 const P=platform==='win32'?path.win32:path.posix;
 return {platform,P,insensitive:platform==='win32'||platform==='darwin'};
}
function key(info,p){const n=info.P.normalize(p);const trimmed=n.length>info.P.parse(n).root.length?n.replace(/[\\/]+$/,''):n;return info.insensitive?trimmed.toLowerCase():trimmed;}
export function samePath(info,a,b){return key(info,a)===key(info,b);}
export function isWithin(info,child,parent){
 const c=key(info,child),p=key(info,parent),sep=info.P.sep;
 return c===p||c.startsWith(p.endsWith(sep)?p:p+sep);
}
const isAncestor=(info,a,b)=>!samePath(info,a,b)&&isWithin(info,b,a);

/** Reject anything a shell, a quoting layer or a vague request could have changed. */
export function checkLiteralPath(info,input,label='target'){
 if(typeof input!=='string'||!input.trim())throw fault('INVALID_PATH',`Pass a non-empty absolute ${label}.`);
 if(input!==input.trim()||/[\0\r\n\t]/.test(input))throw fault('INVALID_PATH',`${label} has surrounding whitespace or control characters.`);
 if(/[*?"`|<>]/.test(input)||/%[^%\\/]+%/.test(input)||/\$(?:\{|\(|[A-Za-z_])/.test(input)||input.startsWith('~'))
  throw fault('AMBIGUOUS_PATH',`${label} contains wildcards, quotes or unexpanded variables: ${input}`);
 if(info.platform==='win32'){
  if(/^[\\/]{2}/.test(input))throw fault('NETWORK_OR_DEVICE_PATH',`UNC, network and device-namespace paths are not cleaned: ${input}`);
  if(!/^[A-Za-z]:[\\/]/.test(input))throw fault('RELATIVE_PATH',`${label} must be a full drive path such as D:\\cache, not relative or drive-relative: ${input}`);
  if(/:/.test(input.slice(2)))throw fault('AMBIGUOUS_PATH',`Alternate data streams and extra colons are not allowed: ${input}`);
 }else if(!input.startsWith('/'))throw fault('RELATIVE_PATH',`${label} must be absolute: ${input}`);
 if(input.split(/[\\/]+/).some(part=>part==='.'||part==='..'))throw fault('PATH_TRAVERSAL',`${label} must not contain . or .. segments: ${input}`);
 const resolved=info.P.resolve(input);
 if(key(info,resolved)===key(info,info.P.parse(resolved).root))throw fault('VOLUME_ROOT',`Refusing a filesystem or drive root: ${input}`);
 return resolved;
}

function realOr(fsx,p){try{return fsx.realpathSync.native(p);}catch{return p;}}
function xdgDirs(fsx,home){
 try{return fsx.readFileSync(path.join(home,'.config','user-dirs.dirs'),'utf8').split('\n').map(line=>/^XDG_\w+_DIR="(.+)"$/.exec(line.trim())?.[1]).filter(Boolean).map(v=>v.replace(/^\$HOME/,home)).filter(v=>v!==home&&path.isAbsolute(v));}catch{return [];}
}

/**
 * deny: never clean the location, anything inside it, or any ancestor of it.
 * exact: mixed-purpose parents (home, AppData, Library...) that must not be a target themselves.
 * allow: cache/temp carve-outs inside a deny entry.
 */
export function protectionRules({platform=process.platform,home=os.homedir(),env=process.env,fs:fsx=fs}={}){
 const info=platformInfo(platform),J=(...p)=>info.P.join(...p),deny=[],exact=[],allow=[];
 const homeDirs=['Documents','Desktop','Downloads','Pictures','Music','Videos','Movies','Public','Templates','OneDrive','iCloud Drive','Dropbox','Google Drive','.ssh','.gnupg','.aws','.azure','.kube','.docker','.password-store','.remotearc','.config/gcloud','.mozilla','.thunderbird','.config/google-chrome','.config/chromium','.config/microsoft-edge','.local/share/keyrings','Library/Keychains','Library/Mail','Library/Messages','Library/Mobile Documents','Library/Safari','Library/Application Support/Google/Chrome','Library/Application Support/Microsoft Edge','Library/Application Support/Firefox','Library/CloudStorage','AppData/Roaming/Microsoft/Credentials','AppData/Roaming/Microsoft/Protect','AppData/Local/Microsoft/Credentials','AppData/Roaming/Mozilla','AppData/Local/Google/Chrome/User Data','AppData/Local/Microsoft/Edge/User Data','AppData/Local/Packages'];
 deny.push(...homeDirs.map(d=>J(home,...d.split('/'))),...xdgDirs(fsx,home));
 exact.push(home,...['AppData','AppData/Local','AppData/Roaming','AppData/LocalLow','Library','Library/Application Support','Library/Containers','.config','.local','.local/share','Projects','projects','source','src','code','Code','repos','workspace','go','.cargo','.rustup','.npm','.m2'].map(d=>J(home,...d.split('/'))));
 if(platform==='win32'){
  for(const name of ['OneDrive','OneDriveConsumer','OneDriveCommercial'])if(env[name])deny.push(env[name]);
  const drive=(env.SystemDrive||'C:')+'\\',sys=env.SystemRoot||env.windir||J(drive,'Windows');
  deny.push(sys,env.ProgramFiles||J(drive,'Program Files'),env['ProgramFiles(x86)']||J(drive,'Program Files (x86)'),env.ProgramData||J(drive,'ProgramData'),J(drive,'System Volume Information'),J(drive,'$Recycle.Bin'),J(drive,'Recovery'),J(drive,'Boot'),J(drive,'PerfLogs'));
  exact.push(J(drive,'Users'));
  allow.push(J(sys,'Temp'));
 }else{
  deny.push(...['/bin','/sbin','/usr','/etc','/boot','/lib','/lib32','/lib64','/libx32','/opt','/root','/srv','/proc','/sys','/dev','/run','/snap','/var/lib','/var/db','/var/spool','/var/mail','/System','/Applications','/Library','/private/etc','/private/var/db','/private/var/root','/cores']);
  exact.push('/home','/Users','/Volumes','/mnt','/media','/var','/private','/private/var','/private/var/folders','/var/folders');
  allow.push('/Library/Caches','/Library/Logs');
 }
 // Compare both the configured spelling and the resolved one (8.3 names, /tmp -> /private/tmp).
 const both=list=>[...new Set(list.flatMap(p=>[info.P.resolve(p),realOr(fsx,p)]))];
 return {info,home:realOr(fsx,home),deny:both(deny),exact:both(exact),allow:both(allow)};
}

/** Returns a refusal reason for a candidate path, or null. Purely string based. */
export function protectedReason(rules,p){
 const {info}=rules;
 const parts=key(info,p).split(/[\\/]+/);
 const guarded=parts.find(part=>GUARDED.has(part));
 if(guarded)return guarded==='.remotearc'?'Remote Arc Undo/config store':'version-control metadata';
 for(const d of rules.deny){
  if(isWithin(info,p,d)&&!rules.allow.some(a=>isWithin(info,a,d)&&isWithin(info,p,a)))return `protected location ${d}`;
  if(isAncestor(info,p,d))return `contains protected location ${d}`;
 }
 for(const e of rules.exact){
  if(samePath(info,p,e))return `mixed-purpose folder ${e}; choose a specific cache/temp/build subfolder`;
  if(isAncestor(info,p,e))return `contains mixed-purpose folder ${e}`;
 }
 return null;
}

function lstatBig(fsx,p){return fsx.lstatSync(p,{bigint:true});}
function freeBytes(fsx,p){try{const s=fsx.statfsSync(p);return Number(s.bavail)*Number(s.bsize);}catch{return null;}}
function hasVcs(fsx,dir){for(const name of VCS)try{fsx.lstatSync(path.join(dir,name));return name;}catch{}return null;}

/** Resolve and vet one target root against the live filesystem. */
export function inspectRoot(input,{rules,fs:fsx=fs}){
 const {info}=rules,resolved=checkLiteralPath(info,input);
 let st;try{st=lstatBig(fsx,resolved);}catch(error){throw fault('TARGET_MISSING',`Target cannot be inspected (${error.code||error.message}): ${input}`);}
 if(st.isSymbolicLink())throw fault('TARGET_IS_LINK',`Target is a symlink or junction; pass the real folder after reviewing where it points: ${input}`);
 if(!st.isDirectory()&&!st.isFile())throw fault('TARGET_NOT_REGULAR',`Target is not a regular file or folder: ${input}`);
 const canonical=fsx.realpathSync.native(resolved);
 for(const candidate of [resolved,canonical]){const reason=protectedReason(rules,candidate);if(reason)throw fault('PROTECTED_TARGET',`Refusing ${candidate}: ${reason}.`);}
 const parent=info.P.dirname(canonical);
 if(st.isDirectory()&&lstatBig(fsx,parent).dev!==st.dev)throw fault('MOUNT_POINT',`Target is the root of a mounted volume: ${canonical}`);
 if(st.isDirectory()&&hasVcs(fsx,canonical))throw fault('PROTECTED_TARGET',`Refusing ${canonical}: it is a version-controlled project root.`);
 let repo=null;
 for(let dir=parent;;dir=info.P.dirname(dir)){if(hasVcs(fsx,dir)){repo=dir;break;}if(info.P.dirname(dir)===dir)break;}
 if(repo&&!BUILD_DIRS.has(info.P.basename(canonical).toLowerCase()))throw fault('PROTECTED_TARGET',`Refusing ${canonical}: inside project ${repo}; only build/cache output folders (${[...BUILD_DIRS].slice(0,8).join(', ')}, ...) can be cleaned there.`);
 return {input,path:canonical,kind:st.isDirectory()?'directory':'file',dev:String(st.dev),ino:String(st.ino),recognized:Boolean(repo)||CACHE_NAME.test(canonical),insideProject:repo};
}

const entryOf=(p,st)=>({path:p,dev:String(st.dev),ino:String(st.ino),size:String(st.size),mtimeNs:String(st.mtimeNs)});
export function digest(plan){const {hash,...body}=plan;return createHash('sha256').update(JSON.stringify(body)).digest('hex');}

/**
 * Scan without following links, crossing volumes or entering protected/VCS subtrees.
 * A directory is planned for removal only if everything inside it is planned too.
 */
export function createPlan({targets,olderThanDays=0,removeRoot=false,maxEntries=250000,maxSeconds=120},{rules=protectionRules(),fs:fsx=fs,now=Date.now,env=identity()}={}){
 const {info}=rules,started=now(),cutoff=olderThanDays>0?BigInt(Math.floor(started-olderThanDays*DAY))*1000000n:null;
 if(!Array.isArray(targets)||!targets.length||targets.length>20)throw fault('MISSING_OPTION','Pass 1-20 --target paths.');
 const roots=targets.map(t=>inspectRoot(t,{rules,fs:fsx}));
 for(const a of roots)for(const b of roots)if(a!==b&&isWithin(info,a.path,b.path))throw fault('OVERLAPPING_TARGETS',`Targets overlap: ${a.path} is inside ${b.path}.`);
 const files=[],dirs=[],skipped=[],skipCounts={};let count=0,bytes=0n,sharedBytes=0n,recentFiles=0,recentBytes=0n;
 const skip=(p,reason)=>{skipCounts[reason]=(skipCounts[reason]||0)+1;if(skipped.length<LIST_LIMIT)skipped.push({path:p,reason});};
 const budget=()=>{if(++count>maxEntries)throw fault('PLAN_TOO_LARGE',`More than ${maxEntries} entries; choose a narrower target.`);if(now()-started>maxSeconds*1000)throw fault('SCAN_TIMEOUT',`Scan exceeded ${maxSeconds}s; choose a narrower target.`);};
 const takeFile=(p,st)=>{
  if(cutoff!==null&&st.mtimeNs>cutoff){recentFiles++;recentBytes+=st.size;skip(p,'newer-than-cutoff');return false;}
  files.push(entryOf(p,st));bytes+=st.size;if(st.nlink>1n)sharedBytes+=st.size;return true;
 };
 // Returns true when the directory will be empty after the plan runs.
 const walk=(dir,rootDev)=>{
  let names;try{names=fsx.readdirSync(dir);}catch(error){skip(dir,'unreadable:'+(error.code||'ERROR'));return false;}
  let complete=true;
  for(const name of names){
   budget();const p=info.P.join(dir,name);let st;
   try{st=lstatBig(fsx,p);}catch(error){skip(p,'unreadable:'+(error.code||'ERROR'));complete=false;continue;}
   if(GUARDED.has(name.toLowerCase())){skip(p,'protected-metadata');complete=false;continue;}
   if(st.isSymbolicLink()){skip(p,'link-not-followed');complete=false;continue;}
   if(st.isDirectory()){
    if(String(st.dev)!==rootDev){skip(p,'other-volume');complete=false;continue;}
    const reason=protectedReason(rules,p);if(reason){skip(p,'protected');complete=false;continue;}
    if(hasVcs(fsx,p)){skip(p,'nested-repository');complete=false;continue;}
    if(walk(p,rootDev))dirs.push(entryOf(p,st));else complete=false;
   }else if(st.isFile()){if(!takeFile(p,st))complete=false;}
   else{skip(p,'special-file');complete=false;}
  }
  return complete;
 };
 for(const root of roots){
  const st=lstatBig(fsx,root.path);
  if(root.kind==='file'){takeFile(root.path,st);continue;}
  const empty=walk(root.path,root.dev);
  if(removeRoot&&empty)dirs.push(entryOf(root.path,st));
  root.freeBytes=freeBytes(fsx,root.path);
 }
 const plan={tool:TOOL,version:PLAN_VERSION,createdAt:new Date(started).toISOString(),host:env.host,user:env.user,platform:info.platform,
  options:{olderThanDays,removeRoot},roots,files,dirs,
  totals:{files:files.length,dirs:dirs.length,bytes:Number(bytes),sharedHardlinkBytes:Number(sharedBytes),recentFilesKept:recentFiles,recentBytesKept:Number(recentBytes),skipped:skipCounts}};
 plan.hash=digest(plan);
 return {plan,skipped};
}

export function identity(){let user='';try{user=os.userInfo().username;}catch{}return {host:os.hostname(),user};}

export function previewOf(plan,skipped,planFile){
 const groups=new Map();
 for(const f of plan.files){const root=plan.roots.find(r=>isWithin(platformInfo(plan.platform),f.path,r.path));const rel=root&&root.kind==='directory'?path[plan.platform==='win32'?'win32':'posix'].relative(root.path,f.path).split(/[\\/]/)[0]:f.path;const k=(root?.path||'')+'|'+rel;const g=groups.get(k)||{root:root?.path,entry:rel,files:0,bytes:0};g.files++;g.bytes+=Number(f.size);groups.set(k,g);}
 return {ok:true,action:'plan',planFile,hash:plan.hash,permanent:true,recoverable:false,
  roots:plan.roots.map(r=>({path:r.path,input:r.input,recognizedCacheLocation:r.recognized,insideProject:r.insideProject,freeBytes:r.freeBytes??null})),
  totals:plan.totals,largest:[...groups.values()].sort((a,b)=>b.bytes-a.bytes).slice(0,20),skippedSample:skipped.slice(0,20),
  approval:'Show the user every root path, totals.bytes/files, the largest entries, skipped reasons and the full hash. Execute only after explicit approval of this hash. Roots with recognizedCacheLocation=false need the user to confirm that exact folder is disposable.',
  next:`node safe-cleanup.mjs execute --plan "${planFile}" --hash ${plan.hash}`};
}

function readPlan(fsx,planFile){
 let plan;try{plan=JSON.parse(fsx.readFileSync(planFile,'utf8'));}catch(error){throw fault('PLAN_UNREADABLE',`Cannot read plan ${planFile}: ${error.message}`);}
 if(plan?.tool!==TOOL||plan.version!==PLAN_VERSION||!Array.isArray(plan.roots)||!Array.isArray(plan.files)||!Array.isArray(plan.dirs))throw fault('PLAN_INVALID','Not a Safe Cleanup plan of this version.');
 return plan;
}
function sameEntry(st,e){return String(st.dev)===e.dev&&String(st.ino)===e.ino&&String(st.size)===e.size&&String(st.mtimeNs)===e.mtimeNs;}

/**
 * Delete exactly the approved plan. Every root and entry is re-verified first; any
 * change, link swap or protection hit skips that entry instead of widening the action.
 */
export function executePlan({planFile,hash,dryRun=false,maxSeconds=900,maxPlanAgeMinutes=60},{rules=protectionRules(),fs:fsx=fs,now=Date.now,env=identity(),onEntry}={}){
 const {info}=rules,started=now();
 if(!/^[a-f0-9]{64}$/.test(hash||''))throw fault('HASH_REQUIRED','Pass the full 64-character --hash the user approved.');
 const plan=readPlan(fsx,planFile);
 if(plan.hash!==hash||digest(plan)!==hash)throw fault('HASH_MISMATCH','Plan content does not match the approved hash; nothing was deleted. Re-plan and get approval again.');
 if(plan.platform!==info.platform||plan.host!==env.host||plan.user!==env.user)throw fault('PLAN_HOST_MISMATCH','Plan was created on another device, user or platform.');
 const age=started-Date.parse(plan.createdAt);
 if(!(age>=0&&age<=maxPlanAgeMinutes*60000))throw fault('PLAN_EXPIRED',`Plan is older than ${maxPlanAgeMinutes} minutes; re-plan so the preview reflects the disk now.`);
 // Whole-plan gates: nothing is deleted unless every root still is what was approved.
 for(const root of plan.roots){
  let current;try{current=inspectRoot(root.input,{rules,fs:fsx});}catch(error){throw fault('ROOT_CHANGED',`Root ${root.path} no longer passes checks: ${error.message}`);}
  if(!samePath(info,current.path,root.path)||current.dev!==root.dev||current.ino!==root.ino)throw fault('ROOT_CHANGED',`Root ${root.path} was replaced or now resolves elsewhere.`);
 }
 const owner=p=>plan.roots.find(r=>r.kind==='directory'?isWithin(info,p,r.path):samePath(info,p,r.path));
 for(const e of [...plan.files,...plan.dirs]){
  if(typeof e?.path!=='string'||!owner(e.path)||e.path.split(/[\\/]+/).some(x=>x==='..'||x==='.')||protectedReason(rules,e.path))throw fault('PLAN_INVALID',`Plan entry outside approved roots: ${e?.path}`);
 }
 const journalFile=planFile+'.journal.jsonl',cancelFile=planFile+'.cancel',reportFile=planFile+'.report.json';
 let journal=null;
 if(!dryRun){try{journal=fsx.openSync(journalFile,'wx');}catch(error){throw fault(error.code==='EEXIST'?'PLAN_ALREADY_EXECUTED':'JOURNAL_FAILED',error.code==='EEXIST'?`This plan already ran (${journalFile}). Re-plan for another pass.`:`Cannot create journal: ${error.message}`);}}
 const log=record=>{if(journal!==null)fsx.writeSync(journal,JSON.stringify({at:new Date(now()).toISOString(),...record})+'\n');};
 const before=Object.fromEntries(plan.roots.map(r=>[r.path,freeBytes(fsx,r.kind==='directory'?r.path:info.P.dirname(r.path))]));
 const result={removedFiles:0,removedDirs:0,removedBytes:0,wouldRemoveFiles:0,wouldRemoveDirs:0,wouldRemoveBytes:0},notRemoved={},problems=[];
 const miss=(p,reason)=>{notRemoved[reason]=(notRemoved[reason]||0)+1;if(problems.length<LIST_LIMIT)problems.push({path:p,reason});};
 let status=dryRun?'dry_run':'completed',done=0;
 // Runs synchronously, so cancellation is a file the caller creates (cancel action).
 const stopReason=()=>{if(fsx.existsSync(cancelFile))return 'cancelled';if(now()-started>maxSeconds*1000)return 'timed_out';return null;};
 // The parent must still resolve to the approved directory, so a folder swapped for a
 // junction/symlink after planning cannot redirect the delete.
 const parentOk=p=>{try{return samePath(info,fsx.realpathSync.native(info.P.dirname(p)),info.P.dirname(p));}catch{return false;}};
 const total=plan.files.length+plan.dirs.length;
 try{
  for(const [kind,list] of [['file',plan.files],['dir',plan.dirs]]){
   for(const e of list){
    const stop=stopReason();if(stop){status=stop;break;}
    done++;onEntry?.(e,kind);
    if(!parentOk(e.path)){miss(e.path,'parent-changed');continue;}
    let st;try{st=lstatBig(fsx,e.path);}catch(error){miss(e.path,error.code==='ENOENT'?'already-missing':'unreadable:'+(error.code||'ERROR'));continue;}
    if(st.isSymbolicLink()||(kind==='file'?!st.isFile():!st.isDirectory())){miss(e.path,'type-changed');continue;}
    if(kind==='file'?!sameEntry(st,e):String(st.dev)!==e.dev||String(st.ino)!==e.ino){miss(e.path,'changed-since-plan');continue;}
    if(dryRun){if(kind==='file'){result.wouldRemoveFiles++;result.wouldRemoveBytes+=Number(e.size);}else result.wouldRemoveDirs++;continue;}
    try{
     if(kind==='file'){fsx.unlinkSync(e.path);result.removedFiles++;result.removedBytes+=Number(e.size);}
     else{fsx.rmdirSync(e.path);result.removedDirs++;}
     log({op:kind==='file'?'unlink':'rmdir',path:e.path,size:kind==='file'?Number(e.size):0});
    }catch(error){const code=error.code||'ERROR';miss(e.path,kind==='dir'&&['ENOTEMPTY','EEXIST'].includes(code)?'not-empty':code==='ENOENT'?'already-missing':['EBUSY','EPERM','EACCES'].includes(code)?'locked-or-denied:'+code:'failed:'+code);}
   }
   if(status==='cancelled'||status==='timed_out')break;
  }
 }finally{if(journal!==null)fsx.closeSync(journal);}
 if(status==='completed'&&Object.keys(notRemoved).length)status='partial';
 const after=Object.fromEntries(plan.roots.map(r=>[r.path,freeBytes(fsx,r.kind==='directory'?r.path:info.P.dirname(r.path))]));
 const report={ok:status==='completed'||status==='dry_run',action:dryRun?'dry-run':'execute',status,hash,planFile,permanent:!dryRun,recoverable:false,
  undo:'Not covered by Recycle Bin or Remote Arc Local Undo.',...result,notAttempted:total-done,notRemoved,problems,
  freeBytesBefore:before,freeBytesAfter:after,journal:dryRun?null:journalFile,durationMs:now()-started,
  note:'Free space can grow less than removedBytes because of hard links, open handles, snapshots, compression or filesystem delay.'};
 if(!dryRun)try{fsx.writeFileSync(reportFile,JSON.stringify(report,null,1));report.reportFile=reportFile;}catch{}
 return report;
}

const OPTIONS={plan:['target','output','older-than-days','remove-root','max-entries','max-seconds'],execute:['plan','hash','dry-run','max-seconds','max-plan-age-minutes'],cancel:['plan']};
const FLAGS=new Set(['remove-root','dry-run']);
function number(value,min,max,label){const n=Number(value);if(!String(value).trim()||!Number.isFinite(n)||n<min||n>max)throw fault('INVALID_LIMIT',`--${label} must be ${min}-${max}.`);return n;}
export function parseArgs(argv){
 const [action,...args]=argv,allowed=OPTIONS[action];
 if(!allowed)throw fault('INVALID_ACTION','Use plan, execute or cancel.');
 const o={target:[]};
 for(let i=0;i<args.length;i++){
  const k=args[i]?.startsWith('--')?args[i].slice(2):null;
  if(!k||!allowed.includes(k))throw fault('INVALID_OPTION',`Unknown option ${args[i]} for ${action}.`);
  if(FLAGS.has(k)){o[k]=true;continue;}
  const v=args[++i];if(v===undefined||v.startsWith('--'))throw fault('MISSING_OPTION',`--${k} needs a value.`);
  if(k==='target')o.target.push(v);else if(k in o)throw fault('INVALID_OPTION',`--${k} given twice.`);else o[k]=v;
 }
 if(action==='plan'){
  if(!o.output)throw fault('MISSING_OPTION','--output <absolute plan.json> is required.');
  return {action,targets:o.target,output:o.output,olderThanDays:number(o['older-than-days']??0,0,3650,'older-than-days'),removeRoot:Boolean(o['remove-root']),maxEntries:number(o['max-entries']??250000,1,2000000,'max-entries'),maxSeconds:number(o['max-seconds']??120,1,3600,'max-seconds')};
 }
 if(!o.plan)throw fault('MISSING_OPTION','--plan <plan.json> is required.');
 if(action==='cancel')return {action,planFile:o.plan};
 return {action,planFile:o.plan,hash:o.hash,dryRun:Boolean(o['dry-run']),maxSeconds:number(o['max-seconds']??900,1,86400,'max-seconds'),maxPlanAgeMinutes:number(o['max-plan-age-minutes']??60,1,1440,'max-plan-age-minutes')};
}

export function writePlan(request,deps={}){
 const fsx=deps.fs||fs,rules=deps.rules||protectionRules({fs:fsx}),{info}=rules;
 const output=checkLiteralPath(info,request.output,'--output');
 const {plan,skipped}=createPlan(request,{...deps,rules,fs:fsx});
 const outReal=info.P.join(realOr(fsx,info.P.dirname(output)),info.P.basename(output));
 if(plan.roots.some(r=>isWithin(info,outReal,r.path)||isWithin(info,output,r.path)))throw fault('UNSAFE_OUTPUT','Write the plan outside the cleanup targets.');
 try{fsx.mkdirSync(info.P.dirname(output),{recursive:true});fsx.writeFileSync(output,JSON.stringify(plan),{flag:'wx'});}catch(error){throw fault('UNSAFE_OUTPUT',error.code==='EEXIST'?`Plan file already exists; choose a new --output: ${output}`:`Cannot write plan: ${error.message}`);}
 return previewOf(plan,skipped,output);
}

export function main(argv=process.argv.slice(2),deps={}){
 const request=parseArgs(argv);
 if(request.action==='plan')return writePlan(request,deps);
 if(request.action==='cancel'){(deps.fs||fs).writeFileSync(request.planFile+'.cancel',new Date().toISOString());return {ok:true,action:'cancel',cancelFile:request.planFile+'.cancel'};}
 return executePlan(request,deps);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=main(process.argv.slice(2));console.log(JSON.stringify(result,null,1));process.exitCode=result.ok?0:2;}
 catch(error){console.log(JSON.stringify({ok:false,code:error.code||'ERROR',message:error.message,deleted:false}));process.exitCode=1;}
}
