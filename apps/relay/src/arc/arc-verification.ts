import {z} from 'zod';
import type {ArcVerification,ArcReceipt} from '@remotearc/protocol';
import type {ArcEnv,ArcRun} from './arc-chat.js';
import {APP_OPERATIONS} from '../apps/app-catalog.js';
import {validateAppAccess} from '../apps/apps.js';

const connectionId=z.string().uuid();
export const arcVerificationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('inbox'),connectionId,limit:z.number().int().min(1).max(5),query:z.string().max(500).optional()}).strict(),
 z.object({kind:z.literal('github_issue'),connectionId,repo:z.string().regex(/^[\w.-]+\/[\w.-]+$/).max(200).refine(value=>!value.split('/').some(part=>part==='.'||part==='..')),title:z.string().trim().min(1).max(200).refine(value=>!/[\r\n]/.test(value)),body:z.string().min(1).max(4000).refine(value=>new TextEncoder().encode(value).length<=6000,'Body exceeds 6 KB')}).strict(),
 z.object({kind:z.literal('deployment'),connectionId,deploymentId:z.string().regex(/^[\w.-]{1,160}$/),teamId:z.string().regex(/^[\w.-]{1,160}$/).optional()}).strict(),
]);
export type ArcProof={checks:{code:string;status:'passed'|'failed'}[];resource?:string;url?:string};
export type ArcEvidenceMessage={id:string;run_id:string|null;role:string;created_at:string;tool?:string;arguments?:unknown;result?:unknown;status?:string;verification?:ArcVerification;proof?:ArcProof};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
function decoded(value:unknown):Record<string,unknown>{
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{return {};}}
 const item=object(value);
 // Compacted observations are never stronger evidence than their retained fields.
 return item.shortened===true?object(item.observation):item;
}
const appResult=(value:unknown)=>{const item=decoded(value);return item.status==='succeeded'?object(item.result):null;};
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
export const arcRunVerification=(history:ArcEvidenceMessage[],runId:string)=>history.find(m=>m.run_id===runId&&m.role==='user')?.verification;
export async function validateArcVerification(env:ArcEnv,userId:string,scope:ArcVerification){
 const row=await env.DB.prepare("SELECT provider FROM app_connections WHERE id=?1 AND user_id=?2 AND status='active'").bind(scope.connectionId,userId).first<{provider:string}>();
 if(!row||!(scope.kind==='inbox'?['gmail','outlook']:scope.kind==='github_issue'?['github']:['vercel']).includes(row.provider))throw Error('ARC_VERIFICATION_CONNECTION_REQUIRED');
 for(const operation of scope.kind==='github_issue'?['issues.create','issues.get']:scope.kind==='inbox'?['messages.list','messages.get']:['deployments.get'])await validateAppAccess(env,userId,scope.connectionId,operation);
}
/** This gate runs before dispatch, including decisions restored after a restart.
 * A model, imported skill or provider response cannot broaden the frozen scope. */
export function arcVerificationToolError(scope:ArcVerification|undefined,tool:string,args:unknown,history:ArcEvidenceMessage[]){
 if(!scope)return null;
 const input=object(args),call=object(input.arguments);
 let allowed=['read_skill','list_skills'].includes(tool);
 if(tool==='describe_app')allowed=(scope.kind==='inbox'?['gmail','outlook']:scope.kind==='github_issue'?['github']:['vercel']).includes(String(input.provider));
 if(scope.kind==='inbox'&&tool==='read_inbox')allowed=input.connectionId===scope.connectionId&&(input.limit??5)===scope.limit&&(input.query??'')===(scope.query??'')&&input.pageToken===undefined;
 if(tool==='call_app'&&input.connectionId===scope.connectionId){
  if(scope.kind==='github_issue'){
   if(input.operation==='issues.create')allowed=same(call,{repo:scope.repo,title:scope.title,body:scope.body})||Object.keys(call).length===3&&call.repo===scope.repo&&call.title===scope.title&&call.body===scope.body;
   if(input.operation==='issues.get')allowed=Object.keys(call).length===2&&call.repo===scope.repo&&history.some(m=>m.role==='tool'&&m.status==='completed'&&m.tool==='call_app'&&object(m.arguments).connectionId===scope.connectionId&&object(m.arguments).operation==='issues.create'&&object(object(m.arguments).arguments).repo===scope.repo&&m.proof?.checks.some(c=>c.code==='issue_acknowledged'&&c.status==='passed')&&m.proof.resource===String(call.number));
  }
  if(scope.kind==='deployment'&&input.operation==='deployments.get')allowed=Object.keys(call).every(key=>['deploymentId','teamId'].includes(key))&&call.deploymentId===scope.deploymentId&&(call.teamId??'')===(scope.teamId??'');
 }
 return allowed?null:{code:'ARC_VERIFICATION_SCOPE',dispatched:false,verificationKind:scope.kind,guidance:'Only the user-selected account, resource and actions in verificationScope are allowed. Read the required source and verify it. Ask the user in a final reply if the scope needs to change.'};
}
/** The frozen input remains once in verificationScope. Avoid echoing a large
 * issue body in every completed-action ledger entry and model message. */
export function arcVerificationContextArguments(scope:ArcVerification|undefined,args:unknown){
 if(scope?.kind!=='github_issue')return args;
 const input=object(args),fields=object(input.arguments);
 return fields.body===scope.body?{...input,arguments:{...fields,body:'[Use the exact verificationScope.body; full input is retained in the execution journal.]'}}:args;
}
function issueUrl(value:unknown,scope:Extract<ArcVerification,{kind:'github_issue'}>,number:number){
 if(typeof value!=='string')return undefined;
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&url.pathname.toLowerCase()===`/${scope.repo}/issues/${number}`.toLowerCase()&&!url.search&&!url.hash?url.href:undefined;}catch{return undefined;}
}
function deploymentUrl(value:unknown){
 if(typeof value!=='string'||!value.trim())return undefined;
 try{const url=new URL(value.includes('://')?value:'https://'+value);return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname.includes('.')?url.href:undefined;}catch{return undefined;}
}
/** Called on the original provider result BEFORE prose/context compaction.
 * Only typed fields relevant to an exact user contract become durable proof. */
export function arcObservationProof(scope:ArcVerification|undefined,tool:string,args:unknown,result:unknown):ArcProof|undefined{
 if(!scope)return undefined;
 const input=object(args);if(input.connectionId!==scope.connectionId)return undefined;
 if(scope.kind==='inbox'&&tool==='read_inbox'){
  const inbox=object(result),messages=Array.isArray(inbox.messages)?inbox.messages.map(object):[];
  const valid=inbox.connectionId===scope.connectionId&&['gmail','outlook'].includes(String(inbox.provider))&&inbox.requestedLimit===scope.limit&&inbox.complete===true&&inbox.readCount===messages.length&&messages.length<=scope.limit&&new Set(messages.map(m=>m.id)).size===messages.length&&messages.every(m=>typeof m.id==='string'&&m.id.length>0&&typeof m.text==='string'&&m.bodyAvailable===true);
  return {checks:[{code:'inbox_excerpts_read',status:valid?'passed':'failed'}],resource:String(messages.length)};
 }
 const data=appResult(result);if(tool!=='call_app'||!data)return undefined;
 if(scope.kind==='github_issue'&&['issues.create','issues.get'].includes(String(input.operation))){
  const number=data.number,url=typeof number==='number'&&Number.isSafeInteger(number)&&number>0?issueUrl(data.html_url,scope,number):undefined;
  const call=object(input.arguments),read=input.operation==='issues.get';
  const valid=Boolean(url)&&(!read||number===call.number&&data.title===scope.title&&data.body===scope.body);
  return {checks:[{code:read?'issue_readback_matches':'issue_acknowledged',status:valid?'passed':'failed'}],...(url?{resource:String(number),url}:{})};
 }
 if(scope.kind==='deployment'&&input.operation==='deployments.get'){
  const url=deploymentUrl(data.url),id=data.id??data.uid,state=data.readyState??data.status;
  return {checks:[{code:'deployment_ready',status:id===scope.deploymentId&&state==='READY'&&url?'passed':['ERROR','CANCELED','CANCELLED'].includes(String(state))?'failed':undefined}].filter(c=>c.status!==undefined) as ArcProof['checks'],resource:scope.deploymentId,...(url?{url}:{})};
 }
 return undefined;
}
const requiredChecks=(scope:ArcVerification)=>scope.kind==='inbox'?['inbox_excerpts_read']:scope.kind==='github_issue'?['issue_acknowledged','issue_readback_matches']:['deployment_ready'];
/** Derive a receipt from account-owned durable observations, never assistant prose.
 * No selected contract means the overall goal remains pending verification. */
export function arcReceipt(run:Pick<ArcRun,'id'|'status'|'error_code'>,history:ArcEvidenceMessage[]):ArcReceipt{
 const current=history.filter(m=>m.run_id===run.id),scope=arcRunVerification(current,run.id)||null,tools=current.filter(m=>m.role==='tool');
 const evidence:ArcReceipt['evidence']=tools.map(m=>({id:m.id,tool:m.tool||'',status:decoded(m.result).status==='failed'?'failed':m.status||'unknown',observedAt:m.created_at,...(m.proof?.resource?{resource:m.proof.resource}:{}),...(m.proof?.url?{url:m.proof.url}:{})}));
 const changes:ArcReceipt['changes']=tools.flatMap(m=>{
  const args=object(m.arguments),data=decoded(m.result),operation=String(args.operation||'');
  return m.status==='completed'&&data.status==='succeeded'&&m.tool==='call_app'&&APP_OPERATIONS.some(op=>op.name===operation&&op.permission==='write')?[{evidenceId:m.id,operation,target:String(object(args.arguments).repo||args.connectionId||'')}]:[];
 });
 const checks:ArcReceipt['checks']=scope?requiredChecks(scope).map(code=>{
  const relevant=tools.filter(m=>m.status==='completed'&&m.proof?.checks.some(c=>c.code===code)),latest=relevant.at(-1),status=latest?.proof?.checks.find(c=>c.code===code)?.status||'pending';
  return {code,status,evidenceIds:latest?[latest.id]:[]};
 }):[];
 const uncertain=run.status==='unknown'||tools.some(m=>['unknown','running'].includes(m.status||'')),failed=run.status==='failed'&&run.error_code!=='ARC_VERIFICATION_PENDING'||run.status==='cancelled'||checks.some(c=>c.status==='failed');
 const status:ArcReceipt['status']=uncertain?'pending_verification':scope&&run.status==='succeeded'&&checks.every(c=>c.status==='passed')?'completed':failed?(changes.length||checks.some(c=>c.status==='passed')?'partial':'failed'):scope&&(changes.length||checks.some(c=>c.status==='passed'))?'partial':'pending_verification';
 return {version:1,status,scope,checks,evidence,changes,next:uncertain?'inspect_before_retry':status==='completed'?'none':status==='partial'?'review_remaining':'verify_result',error:run.error_code};
}

/** The proposed read uses only this run's server-generated acknowledged proof. */
export function arcVerificationNextRead(scope:ArcVerification|undefined,history:ArcEvidenceMessage[],runId:string){
 if(scope?.kind!=='github_issue')return undefined;
 const current=history.filter(message=>message.run_id===runId&&message.role==='tool'&&message.status==='completed'&&message.tool==='call_app'&&object(message.arguments).connectionId===scope.connectionId&&object(object(message.arguments).arguments).repo===scope.repo);
 if(current.some(message=>object(message.arguments).operation==='issues.get'&&message.proof?.checks.some(check=>check.code==='issue_readback_matches')))return undefined;
 const acknowledged=[...current].reverse().find(message=>object(message.arguments).operation==='issues.create'&&object(object(message.arguments).arguments).title===scope.title&&object(object(message.arguments).arguments).body===scope.body&&message.proof?.checks.some(check=>check.code==='issue_acknowledged'&&check.status==='passed'));
 const resource=acknowledged?.proof?.resource;if(!resource||! /^[1-9]\d*$/.test(resource))return undefined;
 const number=Number(resource);if(!Number.isSafeInteger(number))return undefined;
 return {tool:'call_app',arguments:{connectionId:scope.connectionId,operation:'issues.get',arguments:{repo:scope.repo,number}}};
}
