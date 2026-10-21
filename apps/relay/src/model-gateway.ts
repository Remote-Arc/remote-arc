import {reserveBilling,settleBilling,type BillingContext,type BillingUnits} from "./billing-ledger.js";
import {MODEL_CONTEXT_BYTES} from './model-context.js';
import {ModelProviderError,openAiAdapter,anthropicAdapter,openRouterAdapter,workersAiAdapter,type WorkersAiBinding,type ModelAdapter,type ModelDefinition,type ModelProvider,type ModelUsage} from "./model-provider-adapters.js";

export const DEFAULT_AUTO_MODEL:ModelDefinition={
  id:"workers-auto",provider:"workers_ai",model:"@cf/qwen/qwen3-30b-a3b-fp8",maxOutputTokens:4096,
  inputMicrosPerMillion:51000,outputMicrosPerMillion:335000,
  inputNeuronsPerMillion:4625,outputNeuronsPerMillion:30475,freeEligible:true,
};
export const WORKERS_FREE_MODELS:readonly ModelDefinition[]=[DEFAULT_AUTO_MODEL];
export type ModelGatewayBinding={
  DB:D1Database;
  models:readonly ModelDefinition[];
  adapters:Partial<Record<ModelProvider,ModelAdapter>>;
  autoModelId:string;
  freePoolId?:string;
  // IDs come from server-side stored grants, never browser model settings.
  paidGrantId?:string;
  enabled:boolean;
  creditWallet?:boolean;
};
export type GatewayRequest={
  images?:{dataUrl:string}[];context:BillingContext;modelId?:"auto"|string;system:string;user:string;schema:Record<string,unknown>;
  maxOutputTokens:number;timeoutMs?:number;
};
const safe=(n:number)=>Number.isSafeInteger(n)&&n>=0;
function validateDefinition(d:ModelDefinition) {
  if(!["workers_ai","openai","anthropic","openrouter"].includes(d.provider)||!d.id||!d.model||!safe(d.maxOutputTokens)||d.maxOutputTokens<1||
    !safe(d.inputMicrosPerMillion)||!safe(d.outputMicrosPerMillion)||
    (d.cacheWriteMicrosPerMillion!==undefined&&!safe(d.cacheWriteMicrosPerMillion))||
    (d.cachedInputMicrosPerMillion!==undefined&&!safe(d.cachedInputMicrosPerMillion))||
    (d.cacheWrite5mMicrosPerMillion!==undefined&&!safe(d.cacheWrite5mMicrosPerMillion)))
    throw new ModelProviderError("MODEL_CONFIGURATION_INVALID");
  if(d.provider==="workers_ai") {
    const approved=WORKERS_FREE_MODELS.find(p=>p.model===d.model);
    if(!approved||!safe(d.inputNeuronsPerMillion!)||!safe(d.outputNeuronsPerMillion!)||!d.freeEligible||
      d.inputNeuronsPerMillion!<approved.inputNeuronsPerMillion!||d.outputNeuronsPerMillion!<approved.outputNeuronsPerMillion!||
      d.maxOutputTokens>approved.maxOutputTokens)throw new ModelProviderError("MODEL_NOT_FREE_ELIGIBLE");
  }
}
function charges(d:ModelDefinition,input:number,output:number,cacheWrite=0,cached=0,cache5m=0,cache1h=0):BillingUnits {
  const rawCost=input*d.inputMicrosPerMillion+output*d.outputMicrosPerMillion+
    cacheWrite*(d.cacheWriteMicrosPerMillion??d.inputMicrosPerMillion*2)+cached*(d.cachedInputMicrosPerMillion??d.inputMicrosPerMillion)+cache5m*(d.cacheWrite5mMicrosPerMillion??d.cacheWriteMicrosPerMillion??d.inputMicrosPerMillion*2)+cache1h*(d.cacheWriteMicrosPerMillion??d.inputMicrosPerMillion*2);
  if(!safe(rawCost))throw new ModelProviderError("MODEL_BUDGET_INVALID");
  const cost=Math.ceil(rawCost/1000000);
  const neurons=d.provider==="workers_ai"?Math.ceil((input*d.inputNeuronsPerMillion!+output*d.outputNeuronsPerMillion!)/1000000):0;
  if(!safe(cost)||!safe(neurons))throw new ModelProviderError("MODEL_BUDGET_INVALID");
  return {credits:1,costMicros:d.provider==="workers_ai"?0:cost,neurons};
}
function observedCharges(d:ModelDefinition,u:ModelUsage):BillingUnits {
  // OpenAI input includes cached tokens; Anthropic reports them separately.
  // Reasoning is already included in output_tokens and is never charged twice.
  const uncached=d.provider==='anthropic'?u.inputTokens:Math.max(0,u.inputTokens-u.cachedInputTokens-u.cacheWriteTokens);
  const split=u.cacheWrite5mTokens!==undefined;
  return charges(d,uncached,u.outputTokens,split?0:u.cacheWriteTokens,u.cachedInputTokens,u.cacheWrite5mTokens??0,u.cacheWrite1hTokens??0);
}
/** One provider attempt only. No automatic paid fallback or invisible retry. */
export async function runModelGateway<T>(binding:ModelGatewayBinding,request:GatewayRequest,validate:(value:unknown)=>T):Promise<{value:T;usage:ModelUsage;provider:ModelProvider;modelId:string;reservationId:string}> {
  if(!binding.enabled)throw new ModelProviderError("MODEL_GATEWAY_DISABLED");
  if(request.context.lane!=="arc_hosted")throw new ModelProviderError("MODEL_LANE_NOT_AUTHORIZED");
  const modelId=request.modelId||"auto",selectedId=modelId==="auto"?binding.autoModelId:modelId;
  const matches=binding.models.filter(d=>d.id===selectedId);
  if(matches.length!==1)throw new ModelProviderError("MODEL_NOT_ALLOWED");
  const definition=matches[0]!;validateDefinition(definition);
  if(modelId==="auto"&&definition.provider!=="workers_ai")throw new ModelProviderError("AUTO_REQUIRES_WORKERS_AI");
  const adapter=binding.adapters[definition.provider];
  if(!adapter)throw new ModelProviderError("MODEL_NOT_CONFIGURED");
  if(!safe(request.maxOutputTokens)||request.maxOutputTokens<1||request.maxOutputTokens>definition.maxOutputTokens||
    !request.system.trim()||!request.user.trim())throw new ModelProviderError("MODEL_REQUEST_INVALID");
  if(request.images!==undefined&&(!Array.isArray(request.images)||request.images.length>3||request.images.some(image=>!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(image.dataUrl)||image.dataUrl.length>3000000)))throw new ModelProviderError('MODEL_IMAGE_INPUT_INVALID');
  if(request.images?.length&&definition.provider==='workers_ai')throw new ModelProviderError('MODEL_IMAGE_INPUT_UNSUPPORTED');
  const encoded=new TextEncoder().encode(JSON.stringify([request.system,request.user,request.schema]));
  if(encoded.byteLength>MODEL_CONTEXT_BYTES)throw new ModelProviderError("MODEL_CONTEXT_TOO_LARGE");
  // Byte-bound input estimate plus template overhead; reserve all permitted output before dispatch.
  const inputBound=encoded.byteLength+8192+(request.images?.length||0)*32768;
  const ceiling={...definition,inputMicrosPerMillion:Math.max(definition.inputMicrosPerMillion,definition.cacheWriteMicrosPerMillion??definition.inputMicrosPerMillion*2,definition.cacheWrite5mMicrosPerMillion??0,definition.cachedInputMicrosPerMillion??0)};
  const maximum=charges(ceiling,inputBound,request.maxOutputTokens);
  const authorizationId=definition.provider==="workers_ai"?binding.freePoolId:binding.paidGrantId;
  if(!authorizationId)throw new ModelProviderError(definition.provider==="workers_ai"?"FREE_POOL_NOT_VERIFIED":"PAID_MODEL_NOT_AUTHORIZED");
  const timeout=request.timeoutMs??90000;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>90000)throw new ModelProviderError("MODEL_TIMEOUT_INVALID");
  const reservation=await reserveBilling(binding.DB,{...request.context,provider:definition.provider,
    modelId:definition.id,authorizationId,maximum,creditWallet:binding.creditWallet});
  if(!reservation.dispatchAllowed)throw new ModelProviderError("MODEL_ALREADY_DISPATCHED");
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  let knownUsage:ModelUsage|undefined,phase:'provider'|'decision'|'settlement'='provider';
  try{
    const result=await Promise.race([
      adapter({definition,system:request.system,user:request.user,...(request.images?.length?{images:request.images}:{}),schema:request.schema,maxOutputTokens:request.maxOutputTokens,signal:controller.signal}),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ModelProviderError("MODEL_TIMEOUT",true));},timeout);}),
    ]);
    knownUsage=result.usage;
    phase='decision';
    const value=validate(result.value);
    phase='settlement';
    await settleBilling(binding.DB,request.context,reservation.id,{status:"completed",actual:observedCharges(definition,result.usage),
      usage:{...result.usage,providerRequestId:result.providerRequestId}});
    return {value,usage:result.usage,provider:definition.provider,modelId:definition.id,reservationId:reservation.id};
  }catch(error){
    knownUsage ||= error instanceof ModelProviderError?error.usage:undefined;
    await settleBilling(binding.DB,request.context,reservation.id,knownUsage?
      {status:"failed",actual:observedCharges(definition,knownUsage),usage:knownUsage}:
      {status:"unknown"}).catch(()=>{ /* Durable reservation stays committed if reconciliation fails. */ });
    if(error instanceof ModelProviderError)throw error;
    throw new ModelProviderError(phase==='decision'?'MODEL_DECISION_INVALID':phase==='settlement'?'MODEL_SETTLEMENT_FAILED':'MODEL_PROVIDER_FAILED',false,knownUsage);
  }finally{clearTimeout(timer);}
}

export type ModelGatewayEnv={
  DB?:D1Database;MODEL_GATEWAY?:ModelGatewayBinding;MODEL_GATEWAY_ENABLED?:string;
  MODEL_GATEWAY_MODELS?:string;MODEL_GATEWAY_MODEL_ID?:string;MODEL_GATEWAY_FREE_POOL_ID?:string;MODEL_GATEWAY_PAID_GRANT_ID?:string;
  OPENAI_API_KEY?:string;ANTHROPIC_API_KEY?:string;OPENROUTER_API_KEY?:string;AI?:WorkersAiBinding;
  MODEL_GATEWAY_LOCAL_TEST_ENDPOINT?:string;
};
/** Server configuration only. A stored user/org grant is still checked atomically on every reservation. */
export function resolveModelGateway(env:ModelGatewayEnv):ModelGatewayBinding|undefined {
  if(env.MODEL_GATEWAY)return env.MODEL_GATEWAY;
  if(env.MODEL_GATEWAY_ENABLED!=="1"||!env.DB)return undefined;
  const models=env.MODEL_GATEWAY_MODELS?JSON.parse(env.MODEL_GATEWAY_MODELS) as ModelDefinition[]:[DEFAULT_AUTO_MODEL];
  if(!Array.isArray(models))throw new ModelProviderError("MODEL_CONFIGURATION_INVALID");
  let fetcher:typeof fetch=fetch;
  if(env.MODEL_GATEWAY_LOCAL_TEST_ENDPOINT) {
    const local=new URL(env.MODEL_GATEWAY_LOCAL_TEST_ENDPOINT);
    if(local.protocol!=="http:"||local.hostname!=="127.0.0.1"||local.username||local.password||local.search||local.hash)
      throw new ModelProviderError("MODEL_TEST_ENDPOINT_INVALID");
    fetcher=(url,init)=>fetch(local.origin+new URL(String(url)).pathname.replace(/^\/v1/,""),init);
  }
  return {DB:env.DB,enabled:true,models,autoModelId:DEFAULT_AUTO_MODEL.id,freePoolId:env.MODEL_GATEWAY_FREE_POOL_ID,
    paidGrantId:env.MODEL_GATEWAY_PAID_GRANT_ID,
    adapters:{...(env.AI?{workers_ai:workersAiAdapter(env.AI)}:{}),
      ...(env.OPENAI_API_KEY?{openai:openAiAdapter(env.OPENAI_API_KEY,fetcher)}:{}),
      ...(env.OPENROUTER_API_KEY?{openrouter:openRouterAdapter(env.OPENROUTER_API_KEY,fetcher)}:{}),
      ...(env.ANTHROPIC_API_KEY?{anthropic:anthropicAdapter(env.ANTHROPIC_API_KEY,fetcher)}:{})}};
}
