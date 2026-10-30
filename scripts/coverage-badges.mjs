#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {COVERAGE_TARGET} from './coverage-policy.mjs';

const BRANCH='coverage-badges';
const metrics=['statements','branches','functions','lines'];
const names={typescript:'TypeScript / TSX',relay:'Relay',apps:'Apps core',agent:'Go Agent',core:'Go Execution Core'};
function counts(covered,total){
 if(!Number.isSafeInteger(covered)||!Number.isSafeInteger(total)||covered<0||total<=0||covered>total)throw Error('Invalid coverage counts');
 return {covered,total,pct:Number((covered/total*100).toFixed(2))};
}
export function c8Summaries(log){
 const summaries=[];
 for(const block of log.split(/=+ Coverage summary =+/).slice(1)){
  const value={};
  for(const metric of metrics){
   const match=new RegExp(metric+'\\s*:\\s*([\\d.]+)%\\s*\\(\\s*(\\d+)\\s*/\\s*(\\d+)\\s*\\)','i').exec(block);
   if(!match)throw Error('Incomplete c8 summary: '+metric);
   value[metric]=counts(Number(match[2]),Number(match[3]));
   if(Math.abs(value[metric].pct-Number(match[1]))>0.02)throw Error('Coverage percentage does not match counts');
  }
  summaries.push(value);
 }
 return summaries;
}
export function goSummaries(log){
 const result={};
 for(const [key,label] of [['agent','Go Agent'],['core','Execution Core']]){
  const matches=[...log.matchAll(new RegExp(label+' statements: (\\d+)/(\\d+) = ([\\d.]+)%','g'))];
  if(matches.length!==1)throw Error('Missing or ambiguous Go module summary: '+label);
  const match=matches[0];result[key]={statements:counts(Number(match[1]),Number(match[2]))};
  if(Math.abs(result[key].statements.pct-Number(match[3]))>0.06)throw Error('Go percentage does not match counts');
 }
 return result;
}
export function buildReport(run,jobs,logs,repository){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!/^\d+$/.test(String(run.id))||!/^[a-f0-9]{40}$/.test(run.head_sha))throw Error('Invalid source identity');
 if(run.repository?.full_name!==repository||run.head_repository?.full_name!==repository||run.head_branch!=='master'||run.event!=='push'||run.status!=='completed')throw Error('Coverage must come from a completed default-branch push in this repository');
 for(const name of ['verify','relay-coverage','go-coverage']){
  const matches=jobs.filter(job=>job.name===name);
  if(matches.length!==1||matches[0].run_id!==run.id||matches[0].status!=='completed'||matches[0].conclusion!=='success')throw Error('Coverage-producing job is not successfully completed: '+name);
 }
 const verify=c8Summaries(logs.verify),relay=c8Summaries(logs['relay-coverage']);
 if(verify.length!==2||relay.length!==1)throw Error('Unexpected coverage summary count');
 const scopes={apps:verify[0],typescript:verify[1],relay:relay[0],...goSummaries(logs['go-coverage'])};
 // Apps and Relay are subsets of TypeScript. Never count them twice.
 const disjoint=['typescript','agent','core'].map(key=>scopes[key].statements);
 return {version:1,repository,source:{runId:run.id,sha:run.head_sha,url:run.html_url,measuredAt:run.updated_at},
  scope:'Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.',
  target:COVERAGE_TARGET,overall:counts(disjoint.reduce((n,x)=>n+x.covered,0),disjoint.reduce((n,x)=>n+x.total,0)),scopes};
}
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
export function badge(label,pct){
 if(!Number.isFinite(pct)||pct<0||pct>100)throw Error('Invalid badge percentage');
 const value=pct.toFixed(2)+'%',left=Math.max(72,label.length*7+16),right=68,width=left+right,color=pct>=90?'#4c1':pct>=75?'#dfb317':'#e05d44';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="20" role="img" aria-label="'+escape(label+': '+value)+'"><title>'+escape(label+': '+value)+'</title><clipPath id="r"><rect width="'+width+'" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="'+left+'" height="20" fill="#555"/><rect x="'+left+'" width="'+right+'" height="20" fill="'+color+'"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Arial,sans-serif" font-size="11"><text x="'+left/2+'" y="14">'+escape(label)+'</text><text x="'+(left+right/2)+'" y="14">'+value+'</text></g></svg>\n';
}
export function reportFiles(report){
 const files={'coverage.svg':badge('coverage (TS + Go)',report.overall.pct),'report.json':JSON.stringify(report,null,2)+'\n'};
 const rows=Object.entries(names).map(([key,name])=>{
  const s=report.scopes[key];
  files[key+'.svg']=badge(name,s.statements.pct);
  return '| '+name+' | '+metrics.map(metric=>s[metric]?s[metric].pct.toFixed(2)+'%':'—').join(' | ')+' |';
 });
 files['README.md']=[
  '# Latest measured coverage','',
  'Source: ['+report.source.sha.slice(0,7)+'](https://github.com/'+report.repository+'/commit/'+report.source.sha+') · [CI run]('+report.source.url+') · '+report.source.measuredAt,'',
  '**Combined statement coverage: '+report.overall.pct.toFixed(2)+'% ('+report.overall.covered+'/'+report.overall.total+'). Target: ≥90%.**','',
  report.scope,'',
  '| Scope | Statements | Branches | Functions | Lines |','| --- | ---: | ---: | ---: | ---: |',...rows,'',
  'The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.','',
  'The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.','',
  'Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.',''
 ].join('\n');
 return files;
}
function gh(args,input){
 return JSON.parse(execFileSync('gh',args,{encoding:'utf8',input:input===undefined?undefined:JSON.stringify(input),maxBuffer:32*1024*1024}));
}
function api(repository,path,input){
 return gh(['api','repos/'+repository+'/'+path,...(input===undefined?[]:['--method','POST','--input','-'])],input);
}
export function validatePublish(report,latestSha){
 if(report.source.sha!==latestSha){const error=Error('Refusing to publish coverage from an older default-branch commit');error.code='STALE_COVERAGE';throw error;}
}
function publish(repository,report,files){
 validatePublish(report,api(repository,'git/ref/heads/master').object.sha);
 let parent;
 try{parent=api(repository,'git/ref/heads/'+BRANCH).object.sha;}
 catch(error){if(!/404/.test(String(error.stderr||error.message)))throw error;}
 let base;
 if(parent)base=api(repository,'git/commits/'+parent).tree.sha;
 const tree=api(repository,'git/trees',{...(base?{base_tree:base}:{}),tree:Object.entries(files).map(([path,content])=>({path,mode:'100644',type:'blob',content}))});
 const commit=api(repository,'git/commits',{message:'docs: update coverage for '+report.source.sha.slice(0,7)+' [skip ci]',tree:tree.sha,parents:parent?[parent]:[]});
 // Recheck after preparing immutable objects; never rewrite master or force-push.
 validatePublish(report,api(repository,'git/ref/heads/master').object.sha);
 if(parent)gh(['api','repos/'+repository+'/git/refs/heads/'+BRANCH,'--method','PATCH','--input','-'],{sha:commit.sha,force:false});
 else api(repository,'git/refs',{ref:'refs/heads/'+BRANCH,sha:commit.sha});
}
export function collect(repository,runId){
 const run=api(repository,'actions/runs/'+runId);
 const result=api(repository,'actions/runs/'+runId+'/jobs?per_page=100');
 if(result.total_count!==result.jobs.length)throw Error('Incomplete CI job list');
 const logs={};
 for(const name of ['verify','relay-coverage','go-coverage']){
  const job=result.jobs.find(item=>item.name===name);
  if(!job)throw Error('Missing CI job: '+name);
  logs[name]=execFileSync('gh',['run','view',String(runId),'--repo',repository,'--job',String(job.id),'--log'],{encoding:'utf8',maxBuffer:32*1024*1024});
 }
 return buildReport(run,result.jobs,logs,repository);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
  if(!args.includes('--repo')||!args.includes('--run')||!/^\d+$/.test(value('--run')))throw Error('Use --repo owner/repo --run CI_RUN_ID [--out directory] [--publish]');
  const repository=value('--repo'),report=collect(repository,value('--run')),files=reportFiles(report);
  const out=resolve(args.includes('--out')?value('--out'):'work/coverage-badges');
  mkdirSync(out,{recursive:true});for(const [name,content] of Object.entries(files))writeFileSync(resolve(out,name),content);
  console.log('Measured coverage: '+report.overall.pct.toFixed(2)+'% · source '+report.source.sha+' · '+out);
  if(args.includes('--publish')){publish(repository,report,files);console.log('Published measured badges to '+BRANCH);}
 }catch(error){if(error.code==='STALE_COVERAGE')console.log('Skipped obsolete measurement; no branch refs changed.');else{console.error(error.message);process.exitCode=1;}}
}
