/**
 * One GitHub issue for pending releases. CI green != authorization to deploy.
 * Runs only on the default branch after the CI workflow has completed.
 * Does not start or approve workflows, access secrets or touch Cloudflare.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const title='[Release Ready] Remote Arc production promotion';

export function eligibleRun(run,repository,latestSha,deployments=[]){
  if(!run||run.conclusion!=='success'||run.event!=='push'||run.head_branch!=='master'||run.head_repository?.full_name!==repository||run.head_sha!==latestSha)return false;
  if(deployments.some(x=>x.head_sha===latestSha&&x.conclusion==='success'))return false;
  return true;
}
export function makeNotice(sha,repository,actor='yaohuangguan'){
  const short=sha.slice(0,9);
  const workflowUrl=`https://github.com/${repository}/actions/workflows/deploy-cloudflare.yml`;
  return [
    `@${actor} — **Remote Arc master ${short}** has passed CI and is **ready for a controlled production release**.`,
    '',
    `- [Start manual Deploy Cloudflare workflow](${workflowUrl}) (select \`master\`).`,
    '- Leave backup confirmation blank for a no-migration release. If D1 migrations are pending, verify a recoverable backup before entering `BACKUP_VERIFIED`.',
    '- After dispatch, open that GitHub Actions run and select **Review deployments → production → Approve and deploy**.',
    '- No production deployment is started by this notification. Existing users remain on the currently deployed release.',
    '',
    `Release candidate SHA: \`${sha}\``,
    `Repository: [${repository}](https://github.com/${repository}).`,
  ].join('\n');
}

export async function main(){
  const token=process.env.GITHUB_TOKEN;
  const repo=process.env.GITHUB_REPOSITORY;
  const [owner,name]=repo?.split('/')||[];
  if(!token||!owner||!name)throw Error('Required GitHub context missing');
  const run=JSON.parse(process.env.CI_RUN_JSON||'null');
  if(!run||run.conclusion!=='success'||run.event!=='push'||run.head_branch!=='master'||run.head_repository?.full_name!==repo){
    console.log('Skip: not a successful master push CI run');return;
  }
  const base=process.env.GITHUB_API_URL||'https://api.github.com';
  async function api(path,method='GET',body){
    const response=await fetch(base+path,{method,headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if(!response.ok)throw Error('GitHub API '+method+' '+path+' failed: '+response.status+' '+(await response.text()).slice(0,260));
    return response.json();
  }
  const ref=await api(`/repos/${repo}/git/ref/heads/master`);
  const sha=ref.object?.sha;
  if(sha!==run.head_sha){console.log('Skip: newer master SHA already exists');return;}
  const deployments=await api(`/repos/${repo}/actions/workflows/deploy-cloudflare.yml/runs?branch=master&per_page=30`);
  if(!eligibleRun(run,repo,sha,deployments.workflow_runs||[])){console.log('Skip: already released or ineligible');return;}
  const issues=await api(`/repos/${repo}/issues?state=open&per_page=100`);
  const existing=issues.find(issue=>issue.title===title&&!issue.pull_request);
  if(existing?.body?.includes('Release candidate SHA: `'+sha+'`')){console.log('Skip: same release already announced');return;}
  // The repository owner can be an organization, which cannot be assigned an issue.
  // Mention the responsible user instead so GitHub sends a notification.
  const notice=makeNotice(sha,repo,process.env.RELEASE_NOTIFY_LOGIN||'yaohuangguan');
  if(existing){
    await api(`/repos/${repo}/issues/${existing.number}`,'PATCH',{body:notice});
    await api(`/repos/${repo}/issues/${existing.number}/comments`,'POST',{body:notice});
    console.log('Updated release notification issue #'+existing.number+' for '+sha.slice(0,9));
  }else{
    const created=await api(`/repos/${repo}/issues`,'POST',{title,body:notice});
    console.log('Created release notification issue #'+created.number+' for '+sha.slice(0,9));
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main().catch(error=>{console.error(error);process.exitCode=1});
