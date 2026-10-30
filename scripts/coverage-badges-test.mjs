import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageThresholds} from './coverage-policy.mjs';
import {c8Summaries,goSummaries,buildReport,badge,reportFiles,validatePublish} from './coverage-badges.mjs';

const summary=(covered,total,other=covered)=>'=============================== Coverage summary ===============================\n'+
 ['Statements','Branches','Functions','Lines'].map(name=>name+' : '+((name==='Statements'||name==='Lines'?covered:other)/total*100).toFixed(2)+'% ( '+(name==='Statements'||name==='Lines'?covered:other)+'/'+total+' )').join('\n')+'\n================================================================================';
const repository='Remote-Arc/remote-arc';
const run={id:123,head_sha:'a'.repeat(40),head_branch:'master',event:'push',status:'completed',repository:{full_name:repository},head_repository:{full_name:repository},html_url:'https://github.com/'+repository+'/actions/runs/123',updated_at:'2026-10-30T00:00:00Z'};
const jobs=['verify','relay-coverage','go-coverage'].map(name=>({name,run_id:123,status:'completed',conclusion:'success'}));
const logs={verify:summary(99,100,95)+'\n'+summary(50,100,80),'relay-coverage':summary(60,100,80),'go-coverage':'Go Agent statements: 70/100 = 70% (target 90%)\nExecution Core statements: 90/100 = 90% (target 90%)'};

test('combines disjoint covered/total statements without double counting Apps or Relay',()=>{
 const report=buildReport(run,jobs,logs,repository);
 assert.deepEqual(report.overall,{covered:210,total:300,pct:70});
 assert.equal(report.scopes.apps.statements.pct,99);
 assert.equal(report.scopes.relay.statements.pct,60);
 assert.equal(report.target,90);
 assert.equal(report.source.sha,run.head_sha);
});
test('parses actual prefixed CI log summaries and all four metrics',()=>{
 const raw=logs.verify.split('\n').map(line=>'verify UNKNOWN STEP 2026-10-30T00:00:00Z '+line).join('\n');
 const result=c8Summaries(raw);assert.equal(result.length,2);
 assert.equal(result[1].lines.pct,50);assert.equal(result[0].branches.pct,95);
 assert.equal(goSummaries(logs['go-coverage']).core.statements.pct,90);
});
test('rejects incomplete, contradictory and duplicate measurements',()=>{
 assert.throws(()=>c8Summaries(summary(90,100).replace('Functions','Missing')),/Incomplete/);
 assert.throws(()=>c8Summaries(summary(90,100).replace('90.00%','99.00%')),/does not match/);
 assert.throws(()=>c8Summaries(summary(90,100).replace('90/100','190/100')),/Invalid/);
 assert.throws(()=>goSummaries(logs['go-coverage']+'\nGo Agent statements: 70/100 = 70%'),/ambiguous/);
 assert.throws(()=>buildReport(run,jobs,{...logs,verify:summary(90,100)},repository),/summary count/);
});
test('rejects forks, PR runs, incomplete jobs and mismatched run identities',()=>{
 assert.throws(()=>buildReport({...run,head_repository:{full_name:'fork/repo'}},jobs,logs,repository),/default-branch/);
 assert.throws(()=>buildReport({...run,event:'pull_request'},jobs,logs,repository),/default-branch/);
 assert.throws(()=>buildReport(run,jobs.map(job=>({...job,conclusion:'failure'})),logs,repository),/successfully/);
 assert.throws(()=>buildReport(run,jobs.map(job=>({...job,run_id:124})),logs,repository),/successfully/);
 assert.throws(()=>buildReport(run,[...jobs,jobs[0]],logs,repository),/successfully/);
});
test('refuses a stale result before publishing and renders actual values with truthful colors',()=>{
 const report=buildReport(run,jobs,logs,repository);
 assert.throws(()=>validatePublish(report,'b'.repeat(40)),/older/);
 assert.doesNotThrow(()=>validatePublish(report,run.head_sha));
 assert.match(badge('coverage',54.42),/54.42%/);
 assert.match(badge('coverage',54.42),/#e05d44/);
 assert.match(badge('coverage',90),/#4c1/);
 assert.match(badge('x<&',90),/x&lt;&amp;/);
 assert.throws(()=>badge('coverage',101),/Invalid/);
 const files=reportFiles(report);
 assert.equal(JSON.parse(files['report.json']).source.runId,123);
 assert.match(files['README.md'],/210\/300/);
 assert.match(files['README.md'],/not added again/);
 assert.match(files['coverage.svg'],/70.00%/);
 assert.equal(Object.keys(files).filter(name=>name.endsWith('.svg')).length,6);
});

test('phase floors never lower existing 90% gates and strict mode remains 90%',()=>{
 assert.equal(coverageThresholds('core').statements,90);
 assert.equal(coverageThresholds('apps').branches,90);
 assert.equal(coverageThresholds('typescript').lines,50);
 assert.equal(coverageThresholds('relay').lines,88);
 assert.equal(coverageThresholds('agent').statements,78);
 for(const scope of ['typescript','relay','agent','core','apps'])
  for(const value of Object.values(coverageThresholds(scope,true)))assert.equal(value,90);
 assert.throws(()=>coverageThresholds('unknown'),/Unknown/);
});
