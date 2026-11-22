#!/usr/bin/env node
// Standalone, file-based media evidence. No ArcAgent, Studio or cloud-model dependency.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Runtime,checkedPath,fault,run} from './local-media.mjs';

export const ENGINE=Object.freeze({version:'2026.10.26',url:'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp',sha256:'e51e69e89489f199530f13d32a4342da3ddb2cf34842f364603a066db05afbf3'});
const MB=1024**2;
const OPTIONS={inspect:['url','output'],transcript:['url','output','languages'],download:['url','output','kind','start','end','max-seconds','max-mb','height'],index:['evidence','input','output','language'],frames:['evidence','output','times'],find:['evidence','query','limit'],report:['claims','output']};
const REQUIRED={inspect:['url','output'],transcript:['url','output'],download:['url','output','kind'],index:['evidence','input','output'],frames:['evidence','output','times'],find:['evidence','query'],report:['claims','output']};
function number(value,min,max,label){const result=Number(value);if(!String(value).trim()||!Number.isFinite(result)||result<min||result>max)throw fault('INVALID_LIMIT',`${label} must be ${min}–${max}.`);return result;}

export function parseRequest(argv){
 const [action,...args]=argv,allowed=OPTIONS[action];
 if(!allowed)throw fault('INVALID_ACTION','Use inspect, transcript, download, index, frames, find or report.');
 const options={};
 for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!args[i]?.startsWith('--')||!['workspace',...allowed].includes(key)||key in options||args[i+1]===undefined||args[i+1].startsWith('--'))throw fault('INVALID_OPTION','Use documented, unique --option value pairs.');options[key]=args[i+1];}
 if(!options.workspace||!path.isAbsolute(options.workspace))throw fault('WORKSPACE_REQUIRED','Pass an absolute --workspace path.');
 for(const key of REQUIRED[action])if(!options[key]?.trim())throw fault('MISSING_OPTION',`--${key} is required.`);
 const request={action,workspace:path.resolve(options.workspace)};
 for(const key of ['url','output','evidence','input','language','query','claims'])if(options[key]!==undefined)request[key]=options[key];
 if(request.url){let url;try{url=new URL(request.url);}catch{throw fault('INVALID_URL','Pass one public HTTP(S) video URL.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||request.url.length>4096)throw fault('INVALID_URL','Pass a public HTTP(S) page URL without credentials.');}
 if(action==='transcript'){request.languages=(options.languages||'zh,en').split(',');if(request.languages.length>8||request.languages.some(x=>!/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(x)))throw fault('INVALID_LANGUAGE','Use up to eight language codes, e.g. zh,en.');}
 if(action==='index'&&!/^(auto|[a-z]{2,3}(?:-[A-Za-z0-9]+)*)$/.test(request.language||'auto'))throw fault('INVALID_LANGUAGE','Use auto, zh, en or another language code.');
 if(action==='download'){
  if(!['audio','video'].includes(options.kind))throw fault('INVALID_KIND','Use --kind audio or video.');request.kind=options.kind;
  request.maxSeconds=number(options['max-seconds']??600,1,3600,'max-seconds');request.maxBytes=number(options['max-mb']??128,1,512,'max-mb')*MB;
  request.height=number(options.height??720,144,1080,'height');if(!Number.isInteger(request.height))throw fault('INVALID_LIMIT','Height must be an integer.');
  if(options.start!==undefined)request.start=number(options.start,0,7*86400,'start');if(options.end!==undefined)request.end=number(options.end,0.001,7*86400,'end');
  if(request.end!==undefined&&(request.end<=(request.start??0)||request.end-(request.start??0)>request.maxSeconds))throw fault('DURATION_LIMIT','Choose an interval within max-seconds.');
 }
 if(action==='frames'){request.times=options.times.split(',').map(x=>number(x,0,7*86400,'times'));if(!request.times.length||request.times.length>24||new Set(request.times).size!==request.times.length)throw fault('FRAME_LIMIT','Request 1–24 distinct original-video timestamps.');}
 if(action==='find'){request.limit=number(options.limit??20,1,100,'limit');if(!Number.isInteger(request.limit)||request.query.length>500)throw fault('INVALID_QUERY','Use a 1–500 character query and an integer result limit.');}
 return request;
}

export async function preflight(request){
 const stat=await fs.stat(request.workspace);if(!stat.isDirectory())throw fault('WORKSPACE_REQUIRED','Workspace must be an existing directory.');
 for(const key of ['evidence','input','claims'])if(request[key]){request[key]=await checkedPath(request.workspace,request[key]);await fs.access(request[key]);}
 if(request.output){request.output=await checkedPath(request.workspace,request.output);for(const file of [request.output,...(request.action==='report'?[request.output+'.artifact.json']:[])]){try{await fs.lstat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}throw fault('OUTPUT_EXISTS','Choose a new output path; existing files are preserved.');}}
 return request;
}

export async function findPython(env){
 for(const [command,prefix] of [['python3',[]],['python',[]],['py',['-3']]]){try{const result=await run(command,[...prefix,'-c','import sys; print(sys.version_info >= (3, 11))'],{env,quiet:true,timeout:15000});if(result.stdout.trim()==='True')return {command,prefix};}catch{}}
 throw fault('PYTHON_REQUIRED','Python 3.11+ is required; no global installation was attempted.');
}
async function bytesIn(directory){let bytes=0;try{for(const item of await fs.readdir(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isSymbolicLink())throw fault('UNSAFE_OUTPUT','Output symlinks are not supported.');bytes+=item.isDirectory()?await bytesIn(file):(await fs.stat(file)).size;}}catch(error){if(error.code!=='ENOENT')throw error;}return bytes;}

export async function runWorker(request,{python:interpreter,worker=fileURLToPath(new URL('./media-intelligence.py',import.meta.url)),env=process.env,timeout=600000,byteBudget=(request.maxBytes??32*MB)*2+16*MB}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(interpreter.command,[...interpreter.prefix,worker],{cwd:request.workspace,env:{...env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let stdout='',error=null,checking=false,finished=false,killPromise;
  const failed=async failure=>{if(request.output&&request.action!=='report')try{const directory=await checkedPath(request.workspace,request.output);if((await fs.stat(directory)).isDirectory())await fs.writeFile(path.join(directory,'failure.json'),JSON.stringify({status:'failed',verified:false,code:failure.code||'PROCESSING_FAILED'})+'\n',{flag:'wx'});}catch{}reject(failure);};
  const stop=(failure)=>{if(error||finished)return;error=failure;if(!child.pid)return;killPromise=process.platform==='win32'?new Promise(done=>{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',shell:false});killer.on('error',()=>{child.kill();done();});killer.on('close',done);}):Promise.resolve().then(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}});};
  const timer=setTimeout(()=>stop(fault('TIMEOUT','Media processing exceeded the time budget; no result is claimed.')),timeout);
  const monitor=setInterval(async()=>{if(checking||!request.output||request.action==='report')return;checking=true;try{if(await bytesIn(request.output)>byteBudget)stop(fault('DOWNLOAD_LIMIT','Task-owned output exceeded the disk budget.'));}catch(failure){stop(failure);}finally{checking=false;}},100);
  child.stdout.on('data',data=>{stdout+=data;if(Buffer.byteLength(stdout)>8*MB)stop(fault('OUTPUT_LIMIT','Worker response exceeded 8 MiB.'));});
  // Provider stderr can contain signed CDN URLs. Keep it out of chat and receipts.
  child.stderr.on('data',()=>{});
  child.stdin.on('error',()=>{});
  child.on('error',failure=>{finished=true;clearTimeout(timer);clearInterval(monitor);void failed(fault('WORKER_START_FAILED',`Could not start the local media worker (${failure.code||'unknown'}).`));});
  child.on('close',async code=>{finished=true;clearTimeout(timer);clearInterval(monitor);await killPromise;if(error){await failed(error);return;}let result;try{result=JSON.parse(stdout);}catch{await failed(fault('INVALID_WORKER_RESPONSE','Local worker returned no structured result.'));return;}if(code!==0||result.verified!==true){await failed(fault(result.code||'PROCESSING_FAILED',result.message||'No verified result was produced.'));return;}try{if(request.output&&request.action!=='report'&&await bytesIn(request.output)>byteBudget)throw fault('DOWNLOAD_LIMIT','Final task-owned output exceeded the disk budget.');}catch(failure){await failed(failure);return;}resolve(result);});
  child.stdin.end(JSON.stringify(request));
 });
}

export async function main(argv=process.argv.slice(2)){
 const request=await preflight(parseRequest(argv)),runtime=new Runtime(request.workspace),interpreter=await findPython(runtime.env);
 if(['inspect','transcript','download'].includes(request.action)){await runtime.init();request.engine=await runtime.download(ENGINE.url,path.join(runtime.home,'yt-dlp',ENGINE.version,'yt-dlp.pyz'),{sha256:ENGINE.sha256,maxBytes:8*MB});request.node=process.execPath;}
 if(['download','frames'].includes(request.action)){await runtime.ensure(['ffmpeg']);request.ffmpeg=await runtime.executable('ffmpeg');request.ffprobe=await runtime.executable('ffprobe');}
 return runWorker(request,{python:interpreter,env:runtime.env});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stdout.write(JSON.stringify({status:'failed',verified:false,code:error.code||'PROCESSING_FAILED',message:error.code?error.message:'Local processing failed; no verified result is claimed.'})+'\n');process.exitCode=1;});
