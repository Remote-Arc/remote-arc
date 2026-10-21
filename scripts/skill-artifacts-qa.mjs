import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';

// Run through the existing CI verification entry point. Dependencies remain in
// a task-local environment, including on systems with externally managed Python.
const root=resolve(import.meta.dirname,'..'),directory=join(root,'work','skill-artifacts-env');
const python=join(directory,process.platform==='win32'?'Scripts/python.exe':'bin/python');
const requirements=join(root,'scripts','skill-artifacts-requirements.txt');
const digest=createHash('sha256').update(readFileSync(requirements)).digest('hex'),marker=join(directory,'.requirements-sha256');
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}});if(result.error)throw result.error;if(result.status!==0)throw Error('Skill artifact QA command failed with exit '+result.status);}
mkdirSync(join(root,'work'),{recursive:true});
if(!existsSync(python))run(process.env.PYTHON||(process.platform==='win32'?'python':'python3'),['-m','venv',directory]);
if(!existsSync(marker)||readFileSync(marker,'utf8')!==digest){run(python,['-m','pip','install','--disable-pip-version-check','-r',requirements]);writeFileSync(marker,digest);}
run(python,[join(root,'scripts','skill-artifacts-test.py')]);
