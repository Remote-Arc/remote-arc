import assert from 'node:assert/strict';
import {eligibleRun,makeNotice,main} from './release-ready-notify.mjs';
const sha='a'.repeat(40),repo='Remote-Arc/remote-arc';
const run={conclusion:'success',event:'push',head_branch:'master',head_repository:{full_name:repo},head_sha:sha};
assert.equal(eligibleRun(run,repo,sha,[]),true);
assert.equal(eligibleRun(run,repo,sha,[{head_sha:sha,conclusion:'success'}]),false);
assert.equal(eligibleRun({...run,head_sha:'b'.repeat(40)},repo,sha,[]),false);
assert.equal(eligibleRun({...run,event:'pull_request'},repo,sha,[]),false);
assert.equal(eligibleRun({...run,conclusion:'failure'},repo,sha,[]),false);
assert.equal(eligibleRun({...run,head_repository:{full_name:'untrusted/fork'}},repo,sha,[]),false);
assert.equal(eligibleRun({...run,head_branch:'testing'},repo,sha,[]),false);
const notice=makeNotice(sha,repo);
assert.ok(notice.includes('@yaohuangguan'));
assert.ok(notice.includes('BACKUP_VERIFIED'));
assert.ok(notice.includes('Review deployments'));
assert.ok(notice.includes('https://github.com/Remote-Arc/remote-arc/actions/workflows/deploy-cloudflare.yml'));
assert.ok(notice.includes('Release candidate SHA: `'+sha+'`'));
assert.ok(notice.includes('\n- Leave'));
console.log('Release ready notification tests passed (only notify, never dispatch)');


// Mock GitHub API calls: an organization owner must never be sent as assignee.
const previousFetch=globalThis.fetch;
const keys=['GITHUB_TOKEN','GITHUB_REPOSITORY','CI_RUN_JSON','RELEASE_NOTIFY_LOGIN','GITHUB_API_URL'];
const previousEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
function mockGithub(issues=[]){
  const calls=[];
  globalThis.fetch=async (url,options={})=>{
    const route=String(url).replace('https://api.github.com','');
    const method=options.method||'GET';
    const body=options.body?JSON.parse(options.body):undefined;
    calls.push({route,method,body});
    let result;
    if(route.endsWith('/git/ref/heads/master'))result={object:{sha}};
    else if(route.includes('/actions/workflows/deploy-cloudflare.yml/runs?'))result={workflow_runs:[]};
    else if(route.includes('/issues?')&&method==='GET')result=issues;
    else if(route.endsWith('/issues')&&method==='POST')result={number:42};
    else if(route.endsWith('/issues/17')&&method==='PATCH')result={number:17};
    else if(route.endsWith('/issues/17/comments')&&method==='POST')result={id:1};
    else throw new Error('Unexpected GitHub API request: '+method+' '+route);
    return new Response(JSON.stringify(result),{status:200});
  };
  return calls;
}
try{
  process.env.GITHUB_TOKEN='fake-test-token';
  process.env.GITHUB_REPOSITORY=repo;
  process.env.CI_RUN_JSON=JSON.stringify(run);
  delete process.env.GITHUB_API_URL;
  delete process.env.RELEASE_NOTIFY_LOGIN;

  let calls=mockGithub();
  await main();
  const created=calls.find(call=>call.method==='POST'&&call.route.endsWith('/issues'));
  assert.ok(created,'issue should be created');
  assert.equal(Object.hasOwn(created.body,'assignees'),false,'organization must not be assigned');
  assert.ok(created.body.body.includes('@yaohuangguan'),'notify the human maintainer');
  assert.ok(created.body.body.includes('https://github.com/'+repo+'/actions/workflows/deploy-cloudflare.yml'));
  assert.equal(calls.some(call=>call.route.includes('/dispatches')),false);

  process.env.RELEASE_NOTIFY_LOGIN='another-maintainer';
  calls=mockGithub();
  await main();
  assert.ok(calls.find(call=>call.method==='POST'&&call.route.endsWith('/issues')).body.body.includes('@another-maintainer'));

  calls=mockGithub([{number:17,title:'[Release Ready] Remote Arc production promotion',body:'old SHA'}]);
  await main();
  assert.ok(calls.some(call=>call.method==='PATCH'&&call.route.endsWith('/issues/17')));
  assert.ok(calls.some(call=>call.method==='POST'&&call.route.endsWith('/issues/17/comments')));
  assert.equal(calls.some(call=>call.method==='POST'&&call.route.endsWith('/issues')),false);

  calls=mockGithub([{number:17,title:'[Release Ready] Remote Arc production promotion',body:makeNotice(sha,repo)}]);
  await main();
  assert.equal(calls.some(call=>call.method==='POST'||call.method==='PATCH'),false,'duplicate release should not notify');
}finally{
  globalThis.fetch=previousFetch;
  for(const key of keys){
    if(previousEnv[key]===undefined)delete process.env[key];
    else process.env[key]=previousEnv[key];
  }
}
console.log('Release ready notification GitHub API integration tests passed');
