#!/usr/bin/env node
/** Task-local Manim and real Blender MCP setup. No client/global configuration edits. */
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Runtime as MediaRuntime,checkedPath,run,fault} from './local-media.mjs';

export const VERSIONS={manim:'0.22.0',blender:'4.5.15','mcp-for-blender':'2.2.4',mcp:'1.26.0'};
const ADDON={revision:'febcd90ece59c3416d7c55fd3723cea46bcaa59d',sha256:'8e193a249e2ed1262f3e794ee2254efd8e3d1f0224385245f2b989154c837083'};
const BLENDER={
 'win32-x64':['windows-x64.zip','52dd02fd74877fa08e74b67d7854cf32468a232c02aaa19b6844c91285574f8d'],
 'win32-arm64':['windows-arm64.zip','a095662a0c0063ccfb3d50760462d4a3cc74e6ee20880e85f639c28bc323db93'],
 'linux-x64':['linux-x64.tar.xz','0d2b8bb2efe97e6c8eb57de6b7322f8800e1984e3125b60decca5f6771e4773e'],
 'darwin-arm64':['macos-arm64.dmg','bfbc0bda099d1ab7aef0992a584f872f58bed9bb491210ad45f9ca071aa2e688'],
 'darwin-x64':['macos-x64.dmg','3801a97619292a012ede0e855ee705ae872a680474845297b777254f7f21ed78'],
};
const here=path.dirname(fileURLToPath(import.meta.url));
const exists=async file=>{try{await fs.access(file);return true;}catch{return false;}};
const log=value=>process.stderr.write(JSON.stringify(value)+'\n');
export function engine(value){if(!['manim','blender'].includes(value))throw fault('INVALID_ENGINE','Choose manim or blender.');return value;}
export function portValue(value){const port=Number(value);if(!Number.isInteger(port)||port<1024||port>65535)throw fault('INVALID_PORT','Use a loopback port from 1024 to 65535.');return port;}
export function validateMcpRequest(value){
 if(!value||typeof value!=='object'||!['get_scene_info','execute_blender_code'].includes(value.tool)||!value.arguments||typeof value.arguments!=='object'||Array.isArray(value.arguments))throw fault('INVALID_MCP_REQUEST','Only local scene inspection and Blender code requests are supported.');
 if(value.tool==='execute_blender_code'&&(typeof value.arguments.code!=='string'||!value.arguments.code.trim()||value.arguments.code.length>120000||typeof value.arguments.user_prompt!=='string'||!value.arguments.user_prompt.trim()||value.arguments.user_prompt.length>6000))throw fault('INVALID_MCP_REQUEST','Include bounded Blender code and the actual user request in user_prompt.');
 return value;
}
export async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port));});});}

export class CreativeRuntime{
 constructor(workspace){this.workspace=path.resolve(workspace);this.home=path.join(this.workspace,'.ra-creative-tools');this.media=new MediaRuntime(workspace);const temporary=path.join(this.home,'tmp');this.env={...this.media.env,TMPDIR:temporary,TMP:temporary,TEMP:temporary,PIP_CACHE_DIR:path.join(this.home,'pip-cache'),PIP_DISABLE_PIP_VERSION_CHECK:'1',PYTHONUTF8:'1',DISABLE_TELEMETRY:'true',BLENDER_MCP_SAFE_MODE:'1',UV_CACHE_DIR:path.join(this.home,'uv-cache'),UV_PYTHON_INSTALL_DIR:path.join(this.home,'python'),UV_PYTHON_PREFERENCE:'only-managed',BLENDER_USER_CONFIG:path.join(this.home,'blender-config'),BLENDER_USER_SCRIPTS:path.join(this.home,'blender-scripts')};}
 async init(){await this.media.init();await checkedPath(this.workspace,this.home);await fs.mkdir(this.home,{recursive:true});await checkedPath(this.workspace,this.env.TMPDIR);await fs.mkdir(this.env.TMPDIR,{recursive:true});}
 async python(){
  for(const [binary,args] of (process.platform==='win32'?[['python',[]],['py',['-3']]]:[['python3',[]],['python',[]]]))try{
   const result=JSON.parse((await run(binary,[...args,'-c','import sys,json; print(json.dumps({"path":sys.executable,"version":list(sys.version_info[:2])}))'],{env:this.env,quiet:true,timeout:15000})).stdout);
   if(result.version[0]===3&&result.version[1]>=11&&result.version[1]<=13)return result.path;
  }catch{}
  const flavor=process.platform==='win32'?`${process.arch==='arm64'?'aarch64':'x86_64'}-pc-windows-msvc.zip`:process.platform==='darwin'?`${process.arch==='arm64'?'aarch64':'x86_64'}-apple-darwin.tar.gz`:`${process.arch==='arm64'?'aarch64':'x86_64'}-unknown-linux-gnu.tar.gz`;
  const directory=path.join(this.home,'uv'),binary=path.join(directory,process.platform==='win32'?'uv.exe':`uv-${flavor.replace('.tar.gz','')}/uv`);
  if(!await exists(binary)){const archive=await this.media.release('astral-sh/uv','0.9.7','uv-'+flavor);await this.media.unpack(archive,directory);}
  await run(binary,['python','install','3.12'],{env:this.env});
  return (await run(binary,['python','find','3.12'],{env:this.env,quiet:true})).stdout.trim();
 }
 async pythonEnv(selected){
  const directory=path.join(this.home,selected+'-env'),python=path.join(directory,process.platform==='win32'?'Scripts/python.exe':'bin/python'),marker=path.join(directory,'ra-ready.json');
  await checkedPath(this.workspace,directory);
  const requirements=selected==='manim'?[`manim==${VERSIONS.manim}`]:[`mcp-for-blender==${VERSIONS['mcp-for-blender']}`,`mcp==${VERSIONS.mcp}`,'requests==2.32.5'];
  const expected=JSON.stringify(requirements);let ready='';try{ready=await fs.readFile(marker,'utf8');}catch{}
  if(ready!==expected||!await exists(python)){
   if(!await exists(python))await run(await this.python(),['-m','venv',directory],{env:this.env});
   log({stage:'install',source:'https://pypi.org/simple',requirements,destination:directory});
   try{await run(python,['-m','pip','install','--prefer-binary','--index-url','https://pypi.org/simple',...requirements],{env:this.env});}
   catch(error){throw fault('PYTHON_DEPENDENCY_FAILED','Local Python dependency setup failed. Manim source builds may require OS Cairo/Pango development libraries. Inspect the package error; do not use sudo or claim readiness.',{stderr:error.stderr});}
   await fs.writeFile(path.join(directory,'requirements.lock.txt'),(await run(python,['-m','pip','freeze'],{env:this.env,quiet:true})).stdout);
   await fs.writeFile(marker,expected);
  }
  const module=selected==='manim'?'manim':'blender_mcp.server';await run(python,['-c',`import ${module}`],{env:this.env,quiet:true});
  const actual=JSON.parse((await run(python,['-c',`import importlib.metadata as m,json; print(json.dumps({k:m.version(k) for k in ${JSON.stringify(selected==='manim'?['manim']:['mcp-for-blender','mcp'])}}))`],{env:this.env,quiet:true})).stdout);
  for(const [name,version] of Object.entries(actual))if(version!==VERSIONS[name])throw fault('VERSION_MISMATCH','The cached Python environment has changed; inspect it before reuse.');
  return {python,directory,versions:actual};
 }
 async blender(){
  for(const candidate of [process.env.RA_BLENDER_EXECUTABLE,'blender',...(process.platform==='darwin'?['/Applications/Blender.app/Contents/MacOS/Blender']:[])].filter(Boolean))try{const result=await run(candidate,['--version'],{env:this.env,quiet:true,timeout:15000});if(/Blender [4-9]\./.test(result.stdout))return {executable:candidate,version:result.stdout.split('\n')[0],reused:true};}catch{}
  const build=BLENDER[process.platform+'-'+process.arch];if(!build)throw fault('UNSUPPORTED_PLATFORM','No pinned portable Blender build for this platform. Use an existing authorized Blender 4+ installation.');
  const name=`blender-${VERSIONS.blender}-${build[0]}`,destination=path.join(this.home,'blender');
  const executable=process.platform==='darwin'?path.join(destination,'Blender.app/Contents/MacOS/Blender'):path.join(destination,name.replace(/\.zip$|\.tar\.xz$/,''),process.platform==='win32'?'blender.exe':'blender');
  await checkedPath(this.workspace,executable);
  if(!await exists(executable)){
   const archive=await this.media.download('https://download.blender.org/release/Blender4.5/'+name,path.join(this.home,'downloads',name),{sha256:build[1],maxBytes:768*1024**2});
   if(process.platform==='darwin'){
    const mount=path.join(this.home,'blender-dmg');await checkedPath(this.workspace,mount);await fs.mkdir(mount,{recursive:true});await fs.mkdir(destination,{recursive:true});
    await run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,archive],{env:this.env});
    try{await run('ditto',[path.join(mount,'Blender.app'),path.join(destination,'Blender.app')],{env:this.env});}finally{await run('hdiutil',['detach',mount],{env:this.env});}
   }else await this.media.unpack(archive,destination);
  }
  const version=(await run(executable,['--version'],{env:this.env,quiet:true})).stdout.split('\n')[0];
  if(!version.includes(VERSIONS.blender))throw fault('VERSION_MISMATCH','Portable Blender did not report its pinned version.');
  return {executable,version,reused:false};
 }
 async ensure(selected){
  engine(selected);await this.init();const python=await this.pythonEnv(selected);await this.media.ffmpeg();let blender;
  if(selected==='blender'){
   blender=await this.blender();const addon=path.join(this.home,'blender-addon.py');
   await this.media.download(`https://raw.githubusercontent.com/ahujasid/mcp-for-blender/${ADDON.revision}/addon.py`,addon,{sha256:ADDON.sha256,maxBytes:2*1024**2});
   blender={...blender,addon,addonRevision:ADDON.revision};
  }else await run(python.python,['-m','manim','--version'],{env:this.env,quiet:true});
  const receipt={status:'ready',verified:false,meaning:'Dependencies launch; no artwork has been created.',engine:selected,workspace:this.workspace,...python,...(blender?{blender}:{}),platform:process.platform,arch:process.arch};
  await fs.writeFile(path.join(this.home,selected+'-ready.json'),JSON.stringify(receipt,null,2));return receipt;
 }
 async renderManim(source,scene,output){
  if(!/^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(scene||''))throw fault('SCENE_REQUIRED','Pass the Manim Scene class with --scene.');
  source=await checkedPath(this.workspace,source);output=await checkedPath(this.workspace,output);
  if(!output.endsWith('.mp4'))throw fault('INVALID_OUTPUT','Choose an MP4 output.');if(await exists(output))throw fault('OUTPUT_EXISTS','Choose a new output path.');await fs.access(source);
  const ready=await this.ensure('manim'),directory=path.join(this.home,'renders',crypto.randomUUID());await fs.mkdir(directory,{recursive:true});
  await run(ready.python,['-m','manim','render','--renderer','cairo','--format','mp4','--resolution','1280,720','--fps','30','--media_dir',directory,'--output_file','film.mp4',source,scene],{cwd:path.dirname(source),env:this.env});
  const rendered=path.join(directory,'videos',path.basename(source,path.extname(source)),'720p30','film.mp4');await fs.access(rendered);await fs.mkdir(path.dirname(output),{recursive:true});await fs.copyFile(rendered,output,1);
  const media=await this.media.probe(output);if(!media.streams?.some(s=>s.codec_type==='video'))throw fault('INVALID_MEDIA','No rendered video stream.');
  await run(await this.media.executable('ffmpeg'),['-v','error','-i',output,'-f','null','-'],{env:this.env,quiet:true});return this.media.artifact(output,{kind:'video',engine:'manim',media,review:'Decode checked; inspect the mathematics, labels and transitions before delivery.'});
 }
 async serve(port){
  const ready=await this.ensure('blender');port=port===undefined?await freePort():portValue(port);
  const session=path.join(this.home,'sessions',crypto.randomUUID());await checkedPath(this.workspace,session);await fs.mkdir(session,{recursive:true});
  const sites=JSON.parse((await run(ready.python,['-c','import site,json; print(json.dumps(site.getsitepackages()))'],{env:this.env,quiet:true})).stdout);
  const config={port,addon:ready.blender.addon,sites,session,workspace:this.workspace};const configPath=path.join(session,'config.json');await fs.writeFile(configPath,JSON.stringify(config));
  // A GUI event loop is required by the upstream addon. Launch a fresh owned instance;
  // never attach to or change a user's already-open project, preferences or clients.
  const child=spawn(ready.blender.executable,['--factory-startup','--disable-autoexec','--python',path.join(here,'blender-host.py'),'--',configPath],{env:this.env,cwd:this.workspace,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>process.stderr.write(data));child.stderr.on('data',data=>process.stderr.write(data));
  const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  exit.catch(()=>{}); // Keep a launch error handled while waiting for the ready file.
  const abort=()=>child.kill();process.once('SIGTERM',abort);process.once('SIGINT',abort);
  let observed;
  try{
   for(let attempt=0;attempt<120;attempt++){
    try{observed=JSON.parse(await fs.readFile(path.join(session,'status.json'),'utf8'));}catch{}
    if(observed?.status==='ready')break;
    if(child.exitCode!==null||child.signalCode!==null)throw fault('BLENDER_START_FAILED','Blender exited before the addon was ready. A desktop GUI/display is required.');
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(observed?.status!=='ready')throw fault('BLENDER_START_FAILED','The addon did not become ready. Inspect the desktop/display and port error.');
   process.stdout.write(JSON.stringify({...observed,session,workspace:this.workspace,meaning:'Owned Blender addon is listening; perform an MCP handshake and scene read before claiming a connection.'})+'\n');
   const code=await exit;if(code!==0)throw fault('BLENDER_EXIT_FAILED','The owned Blender instance exited '+code);return {status:'stopped',session};
  }catch(error){child.kill();await exit.catch(()=>{});throw error;}finally{process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort);}
 }
 async mcp(port,request){
  port=portValue(port);let file;
  if(request){file=await checkedPath(this.workspace,request);const stat=await fs.stat(file);if(stat.size>256000)throw fault('INVALID_MCP_REQUEST','Use a request file up to 256 KB.');validateMcpRequest(JSON.parse(await fs.readFile(file,'utf8')));}
  const ready=await this.ensure('blender');const result=await run(ready.python,[path.join(here,'blender-session.py'),'--port',String(port),...(file?['--request',file]:[])],{env:{...this.env,BLENDER_HOST:'127.0.0.1',BLENDER_PORT:String(port)},cwd:this.workspace,timeout:240000,quiet:true});return JSON.parse(result.stdout);
 }
 async stop(session){session=await checkedPath(this.workspace,session);const config=JSON.parse(await fs.readFile(path.join(session,'config.json'),'utf8'));if(config.workspace!==this.workspace||config.session!==session)throw fault('INVALID_SESSION','This session does not belong to the selected workspace.');const stop=await checkedPath(this.workspace,path.join(session,'stop.request'));if(!await exists(stop))await fs.writeFile(stop,'stop',{flag:'wx'});return {status:'stop_requested',session,meaning:'Wait for the managed host process to exit. Save the project first.'};}
}
export async function main(argv=process.argv.slice(2)){
 const [action,...rest]=argv,options={};for(let i=0;i<rest.length;i+=2){if(!/^--[a-z-]+$/.test(rest[i])||rest[i+1]===undefined)throw fault('INVALID_ARGUMENT','Use --name value pairs.');options[rest[i].slice(2)]=rest[i+1];}
 if(!['ensure','render-manim','serve-blender','blender-mcp','stop-blender'].includes(action))throw fault('USAGE','Use ensure --engine manim|blender, render-manim --source FILE --scene CLASS --output FILE.mp4, serve-blender, blender-mcp --port PORT [--request FILE.json], stop-blender --session DIR. Always pass --workspace ROOT.');
 if(!options.workspace||!path.isAbsolute(options.workspace))throw fault('WORKSPACE_REQUIRED','Use an absolute authorized workspace.');
 const runtime=new CreativeRuntime(options.workspace);
 if(action==='ensure')return runtime.ensure(engine(options.engine));
 if(action==='render-manim')return runtime.renderManim(options.source,options.scene,options.output);
 if(action==='serve-blender')return runtime.serve(options.port);
 if(action==='blender-mcp')return runtime.mcp(options.port,options.request);
 return runtime.stop(options.session);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(error=>{process.stderr.write(JSON.stringify({status:'failed',verified:false,code:error.code||'ERROR',message:error.message,...(error.stderr?{detail:error.stderr}:{})})+'\n');process.exitCode=1;});
