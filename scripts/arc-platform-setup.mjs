import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const events=['invoice.paid','checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','customer.subscription.updated','customer.subscription.deleted','charge.refunded','charge.dispute.created'];
const webhook='https://agent.remotearc.app/api/billing/webhook';
const required=['APP_TOKEN_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'];
if(!process.argv.includes('--configure')){
 console.log('Arc platform setup (dry run; no provider calls or secret writes).\nRequired Cloudflare Worker Secrets: '+required.join(', '));
 console.log('Stripe webhook: '+webhook+'\nAPI version: 2026-09-30.endive\nEvents: '+events.join(', '));
 console.log('Run pnpm arc:setup --configure in your own terminal to validate provider credentials, register the webhook and save Secrets. Secret updates take effect on the deployed Worker; activation is saved last. This never publishes application code or bypasses its production approval.');
 process.exit(0);
}
async function secret(name){
 if(process.env[name])return process.env[name];
 if(!process.stdin.isTTY)throw Error(name+' must be provided through the environment when stdin is not a terminal.');
 let muted=false;const output=new Writable({write(chunk,_encoding,callback){if(!muted)process.stdout.write(chunk);callback();}});
 const rl=createInterface({input:process.stdin,output,terminal:true});process.stdout.write(name+': ');muted=true;
 try{return (await rl.question('')).trim();}finally{muted=false;rl.close();process.stdout.write('\n');}
}
const values={OPENAI_API_KEY:await secret('OPENAI_API_KEY'),ANTHROPIC_API_KEY:await secret('ANTHROPIC_API_KEY'),STRIPE_SECRET_KEY:await secret('STRIPE_SECRET_KEY')};
if(!/^(sk|rk)_live_/.test(values.STRIPE_SECRET_KEY))throw Error('Production setup requires a Stripe live key. Test keys cannot fund production model usage. Use an isolated local/staging environment for Stripe test payments.');
async function request(url,headers,body){
 const r=await fetch(url,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers, ...(body?{body}:{})});
 if(!r.ok)throw Error('Credential or platform setup failed ('+new URL(url).hostname+', HTTP '+r.status+'). No secret or provider response was logged.');return r.json();
}
await request('https://api.openai.com/v1/models/gpt-6-luna',{authorization:'Bearer '+values.OPENAI_API_KEY});
await request('https://api.anthropic.com/v1/models/claude-sonnet-5-5',{'x-api-key':values.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'});
const stripeHeaders={authorization:'Bearer '+values.STRIPE_SECRET_KEY,'stripe-version':'2026-09-30.endive','content-type':'application/x-www-form-urlencoded'};
const account=await request('https://api.stripe.com/v1/account',stripeHeaders);
if(values.STRIPE_SECRET_KEY.startsWith('sk_live_')&&!account.charges_enabled)throw Error('Stripe live account is not enabled for charges. Complete Stripe account activation first.');
const endpoints=await request('https://api.stripe.com/v1/webhook_endpoints?limit=100',stripeHeaders);
const existing=endpoints.data?.find(e=>e.url===webhook&&e.status==='enabled');
if(existing){
 if(existing.api_version!=='2026-09-30.endive'||!events.every(e=>existing.enabled_events?.includes(e)||existing.enabled_events?.includes('*')))throw Error('The existing Stripe webhook has a different API version or event selection. Review it before running setup again.');
 values.STRIPE_WEBHOOK_SECRET=await secret('STRIPE_WEBHOOK_SECRET');
}else{
 if(endpoints.has_more)throw Error('Too many Stripe webhook endpoints to safely identify an existing registration.');
 const body=new URLSearchParams({url:webhook,api_version:'2026-09-30.endive','metadata[remote_arc]':'billing-v1'});for(const event of events)body.append('enabled_events[]',event);
 const created=await request('https://api.stripe.com/v1/webhook_endpoints',stripeHeaders,body);
 if(typeof created.secret!=='string'||!created.secret.startsWith('whsec_'))throw Error('Stripe did not return a webhook signing secret.');values.STRIPE_WEBHOOK_SECRET=created.secret;
}
for(const [name,value]of Object.entries({...values,ARC_PLATFORM_ENABLED:'1'})){
 if(!value||/[\r\n]/.test(value))throw Error('Invalid '+name);
 const result=spawnSync('pnpm',['--filter','@remotearc/relay','exec','wrangler','secret','put',name],{cwd:root,shell:process.platform==='win32',input:value+'\n',encoding:'utf8',stdio:['pipe','pipe','pipe']});
 if(result.status!==0)throw Error('Could not save '+name+' to Cloudflare. No secret or CLI response was logged.');console.log('Saved '+name+'.');
}
console.log('Platform credentials validated and saved. Catalog prices are created idempotently by the server. Publish through the normal master → CI → production approval workflow. APP_TOKEN_KEY and D1/ARC_RUNTIME bindings must already exist; never rotate the existing vault key during setup.');
