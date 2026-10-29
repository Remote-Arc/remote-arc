// Reproducible real-engine smoke test, isolated from third-party service availability.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Runtime,checkedPath,run} from '../skills/media-runtime/local-media.mjs';
import {ENGINE,findPython} from '../skills/media-runtime/media-intelligence.mjs';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--workspace'||!path.isAbsolute(args[1]))throw Error('Pass --workspace <absolute scratch folder>; dependencies and artifacts remain there.');
const workspace=path.resolve(args[1]);
await fs.mkdir(workspace,{recursive:true});
const runtime=new Runtime(workspace),python=await findPython(runtime.env);
await runtime.init();
const engine=await runtime.download(ENGINE.url,path.join(runtime.home,'yt-dlp',ENGINE.version,'yt-dlp.pyz'),{sha256:ENGINE.sha256,maxBytes:8*1024**2});
await runtime.ensure(['ffmpeg']);
const output=await checkedPath(workspace,path.join(workspace,'run-'+Date.now()));
const result=await run(python.command,[...python.prefix,'-B','-X','utf8',fileURLToPath(new URL('./media-intelligence-integration.py',import.meta.url)),'--engine',engine,'--workspace',output],{cwd:workspace,env:runtime.env,quiet:true,timeout:120000});
process.stdout.write(result.stdout);
