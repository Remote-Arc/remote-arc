#!/usr/bin/env node
// Remote Arc's task-local media runtime. No cloud inference or global installs.
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';

export const VERSIONS={openfilm:'0.2.5',hyperframes:'0.8.193',whisper:'v1.9.2',ffmpeg:'b6.1.1',cmake:'4.1.2'};
const PACKAGES={openfilm:{openfilm:VERSIONS.openfilm},hyperframes:{hyperframes:VERSIONS.hyperframes,'playwright-core':'1.61.1',gsap:'3.14.2'},maps:{d3:'7.9.0','d3-geo':'3.1.1','d3-geo-projection':'4.0.0','topojson-client':'3.1.0'}};
const ALLOWED=new Set(['openfilm','hyperframes','maps','whisper','ffmpeg']);
const LARGE=new Set(['qwen','qwen-tts','qwen3-tts','ace-step','acestep']);
const MODEL={url:'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin',sha256:'60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',bytes:147951465};
const log=(value)=>process.stderr.write(JSON.stringify(value)+'\n');
export function fault(code,message,details={}){return Object.assign(new Error(message),{code,...details});}
export function components(value){
 const selected=[...new Set(String(value).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))];
 // Validate the WHOLE request before creating directories, fetching or installing.
 if(selected.some(x=>LARGE.has(x)))throw fault('APPROVAL_REQUIRED','Ask the user before installing Qwen TTS (multi-GB) or ACE-Step (10 GB+). Disclose size, disk use, destination and hardware. Reuse existing approval only for that scope.');
 if(!selected.length||selected.some(x=>!ALLOWED.has(x)))throw fault('INVALID_COMPONENT','Use openfilm, hyperframes, maps, whisper or ffmpeg.');
 return selected;
}
export function inside(root,target){
 const resolved=path.resolve(root,target),relative=path.relative(path.resolve(root),resolved);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw fault('OUTSIDE_WORKSPACE','Output and installation paths must stay inside the selected workspace.');
 return resolved;
}
export async function checkedPath(root,target){
 const absolute=inside(root,target),base=await fs.realpath(root);
 let parent=absolute;
 for(;;){try{const real=await fs.realpath(parent);inside(base,real);break;}catch(error){if(error.code!=='ENOENT')throw error;parent=path.dirname(parent);}}
 return absolute;
}
async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
export async function hash(file){const h=createHash('sha256');for await(const chunk of (await import('node:fs')).createReadStream(file))h.update(chunk);return h.digest('hex');}
export async function run(exe,args,{cwd,env=process.env,timeout=1800000,quiet=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{cwd,env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeout);
  child.stdout.on('data',data=>{stdout=(stdout+data).slice(-250000);if(!quiet)process.stderr.write(data);});
  child.stderr.on('data',data=>{stderr=(stderr+data).slice(-250000);if(!quiet)process.stderr.write(data);});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(code!==0||timedOut)reject(fault(timedOut?'TIMEOUT':'COMMAND_FAILED',`${path.basename(exe)} exited ${code}`,{stderr:stderr.slice(-3000)}));else resolve({stdout,stderr});});
 });
}
async function usable(exe,args=['--version']){try{await run(exe,args,{quiet:true,timeout:30000});return true;}catch{return false;}}
async function json(url){const response=await fetch(url,{headers:{'user-agent':'RemoteArc-local-media'},signal:AbortSignal.timeout(60000)});if(!response.ok)throw fault('DOWNLOAD_FAILED',`${response.status} ${url}`);return response.json();}

export class Runtime{
 constructor(workspace){this.workspace=path.resolve(workspace);this.home=inside(this.workspace,'.ra-media-tools');this.bin=path.join(this.home,'bin');this.env={...process.env,PATH:this.bin+path.delimiter+path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''),OPENFILM_NO_BROWSER:'1',OPENFILM_NO_UPDATE_CHECK:'1',PLAYWRIGHT_BROWSERS_PATH:path.join(this.home,'browsers'),PUPPETEER_CACHE_DIR:path.join(this.home,'browsers'),XDG_CACHE_HOME:path.join(this.home,'cache'),npm_config_cache:path.join(this.home,'npm-cache'),npm_config_registry:'https://registry.npmjs.org',npm_config_update_notifier:'false'};this.downloaded=0;}
 async init(){await fs.access(this.workspace);await checkedPath(this.workspace,this.home);await fs.mkdir(this.bin,{recursive:true});const info=await fs.statfs(this.home);if(Number(info.bavail)*Number(info.bsize)<2*1024**3)throw fault('DISK_SPACE','At least 2 GB of free workspace storage is required for local tools.');}
 async download(url,dest,{sha256,maxBytes=512*1024**2}={}){
  await checkedPath(this.workspace,dest);
  if(await exists(dest)){if(sha256&&await hash(dest)===sha256)return dest;await fs.unlink(dest);}
  if(!url.startsWith('https://'))throw fault('HTTPS_REQUIRED','Downloads must use HTTPS.');
  log({stage:'download',source:url,destination:dest,maxBytes});
  const response=await fetch(url,{headers:{'user-agent':'RemoteArc-local-media'},signal:AbortSignal.timeout(600000)});
  if(!response.ok)throw fault('DOWNLOAD_FAILED',`${response.status} ${url}`);
  if(Number(response.headers.get('content-length'))>maxBytes)throw fault('DOWNLOAD_LIMIT','Download exceeds the bounded local dependency budget.');
  await fs.mkdir(path.dirname(dest),{recursive:true});const temporary=dest+'.part';
  await checkedPath(this.workspace,temporary);
  // Exclusive creation prevents following an existing .part symlink.
  const file=await fs.open(temporary,'wx');let bytes=0;const digest=createHash('sha256');
  try{
   for await(const chunk of response.body){bytes+=chunk.length;this.downloaded+=chunk.length;if(bytes>maxBytes||this.downloaded>1536*1024**2)throw fault('DOWNLOAD_LIMIT','Download exceeds the bounded local dependency budget.');digest.update(chunk);await file.writeFile(chunk);}
   const actual=digest.digest('hex');if(sha256&&actual!==sha256)throw fault('CHECKSUM_MISMATCH','Downloaded bytes failed SHA-256 verification.');
   await file.close();await fs.rename(temporary,dest);return dest;
  }catch(error){await file.close().catch(()=>{});await fs.unlink(temporary).catch(()=>{});throw error;}
 }
 async release(repo,tag,name){
  const metadata=await json(`https://api.github.com/repos/${repo}/releases/tags/${tag}`),asset=metadata.assets.find(x=>x.name===name);
  if(!asset||!/^sha256:[a-f0-9]{64}$/.test(asset.digest||''))throw fault('UNVERIFIED_RELEASE','Pinned official release asset or SHA-256 digest is unavailable.');
  return this.download(asset.browser_download_url,path.join(this.home,'downloads',name),{sha256:asset.digest.slice(7)});
 }
 async npm(group){
  const directory=path.join(this.home,group),wanted=PACKAGES[group];await checkedPath(this.workspace,directory);
  await fs.mkdir(directory,{recursive:true});const manifest=path.join(directory,'package.json');
  const expected=JSON.stringify({private:true,type:'module',dependencies:wanted},null,2)+'\n';
  let current='';try{current=await fs.readFile(manifest,'utf8');}catch{}
  const modules=path.join(directory,'node_modules');
  if(current!==expected||!await exists(path.join(directory,'.ready'))||!await exists(modules)){
   log({stage:'install',packages:wanted,destination:directory,source:'https://registry.npmjs.org'});
   await fs.writeFile(manifest,expected);
   const npmCli=[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
   let cli;for(const candidate of npmCli)if(await exists(candidate)){cli=candidate;break;}
   if(!cli)throw fault('NPM_MISSING','Use a portable official Node.js distribution including npm.');
   // Lock resolved transitive packages. Engines have no install scripts; esbuild
   // and browser installation are invoked explicitly only where needed.
   await run(process.execPath,[cli,...(current===expected&&await exists(path.join(directory,'package-lock.json'))?['ci']:['install']),'--ignore-scripts','--no-audit','--no-fund','--save-exact'],{cwd:directory,env:this.env});
   await fs.writeFile(path.join(directory,'.ready'),JSON.stringify(wanted));
  }
  return directory;
 }
 async ffmpeg(){
  for(const name of ['ffmpeg','ffprobe']){
   const executable=path.join(this.bin,name+(process.platform==='win32'?'.exe':''));
   if(await usable(executable,['-version'])||await usable(name,['-version']))continue;
   const archive=await this.release('eugeneware/ffmpeg-static',VERSIONS.ffmpeg,`${name}-${process.platform}-${process.arch}.gz`);
   const {createGunzip}=await import('node:zlib'),{pipeline}=await import('node:stream/promises'),streams=await import('node:fs');
   const pending=executable+'.new';await checkedPath(this.workspace,pending);await pipeline(streams.createReadStream(archive),createGunzip(),streams.createWriteStream(pending,{flags:'wx',mode:0o755}));await fs.rename(pending,executable);
   if(!await usable(executable,['-version']))throw fault('ENGINE_UNUSABLE',`${name} was downloaded but cannot run on this device.`);
  }
 }
 async executable(name){const local=path.join(this.bin,name+(process.platform==='win32'?'.exe':''));return await exists(local)?local:name;}
 async maps(){
  const directory=await this.npm('maps'),data=path.join(this.home,'data','countries.geojson');
  // Pin the dataset revision and content hash in the receipt on first use.
  const pin=path.join(this.home,'data','natural-earth.json');let source;
  if(await exists(pin))source=JSON.parse(await fs.readFile(pin,'utf8'));
  else{const commit=await json('https://api.github.com/repos/nvkelso/natural-earth-vector/commits/master');source={revision:commit.sha,url:`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit.sha}/geojson/ne_110m_admin_0_countries.geojson`};}
  if(!await exists(data)||source.sha256&&await hash(data)!==source.sha256){await this.download(source.url,data,{sha256:source.sha256,maxBytes:16*1024**2});}
  const geo=JSON.parse(await fs.readFile(data,'utf8'));if(geo.type!=='FeatureCollection'||!geo.features?.length)throw fault('INVALID_MAP','Natural Earth did not contain country features.');
  source.sha256=await hash(data);await fs.writeFile(pin,JSON.stringify(source,null,2));
  return {directory,data,source};
 }
 async unpack(archive,destination){
  await checkedPath(this.workspace,destination);await fs.mkdir(destination,{recursive:true});
  const listing=await run('tar',[archive.endsWith('.zip')?'-tf':'-tzf',archive],{quiet:true,env:this.env});
  for(const name of listing.stdout.split(/\r?\n/).filter(Boolean))if(name.startsWith('/')||/^[a-z]:/i.test(name)||name.replaceAll('\\','/').split('/').includes('..'))throw fault('UNSAFE_ARCHIVE','Archive contains an unsafe path.');
  await run('tar',['-xf',archive,'-C',destination],{env:this.env});
 }
 async cmake(){
  if(await usable('cmake'))return 'cmake';
  const flavor=process.platform==='darwin'?'macos-universal':process.platform==='linux'?`linux-${process.arch==='arm64'?'aarch64':'x86_64'}`:null;
  if(!flavor)throw fault('UNSUPPORTED_PLATFORM','No local CMake package for this device.');
  const directory=path.join(this.home,'cmake'),relative=`cmake-${VERSIONS.cmake}-${flavor}`;
  const exe=path.join(directory,relative,process.platform==='darwin'?'CMake.app/Contents/bin/cmake':'bin/cmake');
  if(!await usable(exe)){const archive=await this.release('Kitware/CMake','v'+VERSIONS.cmake,relative+'.tar.gz');await this.unpack(archive,directory);}
  if(!await usable(exe))throw fault('ENGINE_UNUSABLE','Portable CMake cannot run.');return exe;
 }
 async whisper(){
  const directory=path.join(this.home,'whisper'),model=path.join(directory,'ggml-base.bin');let executable;
  if(await usable('whisper-cli',['--help']))executable='whisper-cli';
  else if(process.platform==='win32'&&process.arch==='x64'){
   const bin=path.join(directory,'binary');executable=await exists(bin)?await findFile(bin,'whisper-cli.exe'):null;
   if(!executable){
    const archive=await this.release('ggml-org/whisper.cpp',VERSIONS.whisper,'whisper-bin-x64.zip');await this.unpack(archive,bin);
    executable=await findFile(bin,'whisper-cli.exe');
   }
  }else if(['darwin','linux'].includes(process.platform)){
   const source=path.join(directory,'source');executable=path.join(source,'build','bin','whisper-cli');
   if(!await usable(executable,['--help'])){
    const compiler=process.platform==='darwin'?'clang++':'c++';
    if(!await usable(compiler))throw fault('COMPILER_REQUIRED','A local C++ compiler is required. Install the OS developer tools with the user; do not request sudo or bypass OS installation consent.');
    const cmake=await this.cmake();
    if(!await exists(path.join(source,'CMakeLists.txt'))){
     // Shallow clone a pinned release. No upstream install scripts are executed.
     await run('git',['clone','--depth','1','--branch',VERSIONS.whisper,'https://github.com/ggml-org/whisper.cpp.git',source],{env:this.env});
    }
    await run(cmake,['-S',source,'-B',path.join(source,'build'),'-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_SERVER=OFF','-DGGML_METAL=OFF','-DGGML_NATIVE=OFF'],{env:this.env});
    await run(cmake,['--build',path.join(source,'build'),'--config','Release','--target','whisper-cli','-j',String(Math.max(1,Math.min(os.availableParallelism(),4)))],{env:this.env});
   }
  }else throw fault('UNSUPPORTED_PLATFORM','No verified whisper.cpp build for this platform/architecture.');
  if(!executable||!await usable(executable,['--help']))throw fault('ENGINE_UNUSABLE','whisper-cli did not launch.');
  await this.download(MODEL.url,model,{sha256:MODEL.sha256,maxBytes:MODEL.bytes});
  return {executable,model,version:VERSIONS.whisper};
 }
 async engine(engine){
  const directory=await this.npm(engine),cli=path.join(directory,'node_modules',engine,'bin',engine+'.mjs');
  if(engine==='openfilm'){
   const require=createRequire(path.join(directory,'package.json'));
   await run(process.execPath,[path.join(path.dirname(require.resolve('playwright-core')),'cli.js'),'install','chromium'],{env:this.env});
  }
  // HyperFrames fetches its pinned browser on the first local render. No cloud
  // render, account login, preview window or provider setup is invoked here.
  await run(process.execPath,[cli,'--help'],{cwd:directory,env:this.env,quiet:true});return cli;
 }
 async ensure(selected){
  components(selected.join(','));await this.init();const engines={};
  if(selected.some(x=>['ffmpeg','openfilm','hyperframes','whisper'].includes(x)))await this.ffmpeg();
  for(const item of selected){if(item==='maps')engines.maps=await this.maps();else if(item==='whisper')engines.whisper=await this.whisper();else if(item!=='ffmpeg')engines[item]={cli:await this.engine(item),version:VERSIONS[item]};}
  const receipt={status:'ready',verified:false,meaning:'Dependencies launch; no deliverable has been created yet.',workspace:this.workspace,tools:this.home,platform:process.platform,arch:process.arch,engines,preparedAt:new Date().toISOString()};
  await fs.writeFile(path.join(this.home,'readiness.json'),JSON.stringify(receipt,null,2));return receipt;
 }
 async artifact(file,details){
  const stat=await fs.stat(file);if(!stat.size)throw fault('EMPTY_OUTPUT','Output file is empty.');
  const receipt={status:'completed',verified:true,path:file,bytes:stat.size,sha256:await hash(file),device:os.hostname(),...details};
  await fs.writeFile(file+'.artifact.json',JSON.stringify(receipt,null,2));return receipt;
 }
 async probe(file){const result=await run(await this.executable('ffprobe'),['-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,nb_frames','-of','json',file],{env:this.env,quiet:true});const info=JSON.parse(result.stdout);if(!(Number(info.format?.duration)>0))throw fault('INVALID_MEDIA','Output has no positive duration.');return info;}
 async render(engine,project,output){
  components(engine);if(!['openfilm','hyperframes'].includes(engine))throw fault('INVALID_ENGINE','Choose openfilm or hyperframes.');
  project=await checkedPath(this.workspace,project);output=await checkedPath(this.workspace,output);
  if(await exists(output))throw fault('OUTPUT_EXISTS','Choose a new output path; existing user files are preserved.');
  await fs.access(path.join(project,engine==='openfilm'?'film.html':'index.html'));
  const ready=await this.ensure([engine]),cli=ready.engines[engine].cli;await fs.mkdir(path.dirname(output),{recursive:true});
  if(engine==='openfilm')await run(process.execPath,[cli,'look'],{cwd:project,env:this.env});
  else await run(process.execPath,[cli,'lint'],{cwd:project,env:this.env});
  await run(process.execPath,[cli,'render',engine==='openfilm'?'--out':'--output',output],{cwd:project,env:this.env});
  const media=await this.probe(output);if(!media.streams?.some(s=>s.codec_type==='video'))throw fault('INVALID_MEDIA','Rendered output has no video stream.');
  await run(await this.executable('ffmpeg'),['-v','error','-i',output,'-f','null','-'],{env:this.env,quiet:true});
  return this.artifact(output,{kind:'video',engine,media,review:'Decoder and metadata checked. Inspect contact sheets/keyframes and audio against the brief before final delivery.'});
 }
 async transcribe(input,output,language='auto'){
  input=await checkedPath(this.workspace,input);output=await checkedPath(this.workspace,output);
  for(const extension of ['.srt','.vtt'])if(await exists(output+extension))throw fault('OUTPUT_EXISTS','Choose a new subtitle output prefix.');
  await fs.access(input);const ready=await this.ensure(['whisper']),{executable,model}=ready.engines.whisper;
  const media=await this.probe(input);await fs.mkdir(path.dirname(output),{recursive:true});
  const wav=path.join(this.home,'tmp','transcribe-'+randomUUID()+'.wav');await fs.mkdir(path.dirname(wav),{recursive:true});
  await run(await this.executable('ffmpeg'),['-nostdin','-n','-i',input,'-ar','16000','-ac','1','-c:a','pcm_s16le',wav],{env:this.env});
  await run(executable,['-m',model,'-f',wav,'-l',language,'-osrt','-ovtt','-of',output],{env:this.env});
  const srt=await fs.readFile(output+'.srt','utf8'),vtt=await fs.readFile(output+'.vtt','utf8');
  const timing=validateSubtitles(srt,Number(media.format.duration));
  if(!vtt.startsWith('WEBVTT'))throw fault('INVALID_SUBTITLES','Missing WebVTT header.');
  return this.artifact(output+'.srt',{kind:'subtitles',vtt:output+'.vtt',model:'ggml-base.bin',duration:Number(media.format.duration),...timing,review:'Timing and file structure checked; review a sample against the original speech for recognition accuracy.'});
 }
 async map(output,highlight=''){
  output=await checkedPath(this.workspace,output);if(path.extname(output)!=='.svg')throw fault('INVALID_OUTPUT','Use an .svg map output.');
  if(await exists(output))throw fault('OUTPUT_EXISTS','Choose a new map output path.');
  const ready=await this.ensure(['maps']),maps=ready.engines.maps,require=createRequire(path.join(maps.directory,'package.json'));
  const d3=await import(pathToFileURL(require.resolve('d3-geo')).href),geo=JSON.parse(await fs.readFile(maps.data,'utf8'));
  const projection=d3.geoNaturalEarth1().fitExtent([[20,20],[1900,1060]],geo),draw=d3.geoPath(projection),selected=new Set(highlight.split(',').map(x=>x.trim().toUpperCase()).filter(Boolean));
  const paths=geo.features.map(feature=>{const p=feature.properties||{},active=[p.ADM0_A3,p.ISO_A3,p.SOV_A3].some(x=>selected.has(x));return `<path d="${draw(feature)||''}" fill="${active?'#e7ba68':'#344356'}" stroke="#0c1420" stroke-width="0.7"/>`;}).join('');
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#0c1420"/>${paths}</svg>`);
  return this.artifact(output,{kind:'map',source:maps.source,attribution:'Natural Earth public domain; boundaries are illustrative, not navigation or legal boundary data.'});
 }
}
async function findFile(directory,name){for(const entry of await fs.readdir(directory,{withFileTypes:true})){const target=path.join(directory,entry.name);if(entry.isFile()&&entry.name===name)return target;if(entry.isDirectory()){const found=await findFile(target,name);if(found)return found;}}return null;}
export function validateSubtitles(srt,duration){
 const timestamp=s=>{const [h,m,tail]=s.split(':');return +h*3600 + +m*60 + +tail.replace(',','.');};
 const cues=[...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([^\r\n]+)/g)];
 if(!cues.length)throw fault('NO_SPEECH','No timed speech was detected; do not claim a transcript was produced.');
 let previous=-1;for(const cue of cues){const start=timestamp(cue[1]),end=timestamp(cue[2]);if(start<previous||end<=start||end>duration+2)throw fault('INVALID_SUBTITLES','Subtitle times are unordered or outside the source duration.');previous=start;}
 return {cues:cues.length,lastCueEnd:timestamp(cues.at(-1)[2])};
}
export async function main(argv=process.argv.slice(2)){
 const [action,...rest]=argv,options={};for(let i=0;i<rest.length;i+=2){if(!/^--[a-z-]+$/.test(rest[i])||rest[i+1]===undefined)throw fault('INVALID_ARGUMENT','Use --name value arguments.');options[rest[i].slice(2)]=rest[i+1];}
 if(!['ensure','render','transcribe','map'].includes(action))throw fault('USAGE','ensure --components openfilm|hyperframes|maps|whisper; render --engine openfilm --project DIR --output FILE; transcribe --input FILE --output PREFIX [--language auto]; map --output FILE.svg [--highlight NZL,CHN]. Always pass --workspace ROOT.');
 if(!options.workspace||!path.isAbsolute(options.workspace))throw fault('WORKSPACE_REQUIRED','Pass an absolute Trusted Write Location as --workspace.');
 const selected=action==='ensure'?components(options.components):action==='render'?components(options.engine):action==='map'?['maps']:['whisper'];
 if(+process.versions.node.split('.')[0]<22)throw fault('NODE_REQUIRED','Use Node.js 22.2+ (portable official Node.js is sufficient).');
 const runtime=new Runtime(options.workspace);
 if(action==='ensure')return runtime.ensure(selected);
 if(action==='render')return runtime.render(options.engine,options.project,options.output);
 if(action==='transcribe')return runtime.transcribe(options.input,options.output,options.language||'auto');
 return runtime.map(options.output,options.highlight||'');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 main().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({status:error.code==='APPROVAL_REQUIRED'?'approval_required':'failed',verified:false,code:error.code||'ERROR',message:error.message,...(error.stderr?{detail:error.stderr}:{})})+'\n');process.exitCode=1;});
}
