export type ModelProvider = "workers_ai" | "openai" | "anthropic";
export type ModelUsage = {inputTokens:number;outputTokens:number;cachedInputTokens:number;cacheWriteTokens:number;reasoningTokens:number;cacheWrite5mTokens?:number;cacheWrite1hTokens?:number};
export type ModelDefinition = {
  id:string;provider:ModelProvider;model:string;maxOutputTokens:number;
  inputMicrosPerMillion:number;outputMicrosPerMillion:number;cacheWriteMicrosPerMillion?:number;cacheWrite5mMicrosPerMillion?:number;cachedInputMicrosPerMillion?:number;structuredOutput?:boolean;
  inputNeuronsPerMillion?:number;outputNeuronsPerMillion?:number;freeEligible?:boolean;
};
export type ModelRequest = {definition:ModelDefinition;system:string;user:string;schema:Record<string,unknown>;maxOutputTokens:number;signal:AbortSignal};
export type ModelResult = {value:unknown;usage:ModelUsage;providerRequestId:string|null};
export class ModelProviderError extends Error {
  constructor(readonly code:string,readonly retryable=false,readonly usage?:ModelUsage) {super(code);this.name="ModelProviderError";}
}
export type ModelAdapter = (request:ModelRequest)=>Promise<ModelResult>;
const object=(v:unknown):Record<string,unknown> => v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const token=(v:unknown) => {
  if(!Number.isSafeInteger(v)||Number(v)<0)throw new ModelProviderError("MODEL_USAGE_UNAVAILABLE");
  return Number(v);
};
function usage(payload:Record<string,unknown>):ModelUsage {
  const u=object(payload.usage),input=token(u.input_tokens ?? u.prompt_tokens),output=token(u.output_tokens ?? u.completion_tokens);
  const writes=token(u.cache_creation_input_tokens??object(u.input_tokens_details).cache_write_tokens??0),breakdown=u.cache_creation?{cacheWrite5mTokens:token(object(u.cache_creation).ephemeral_5m_input_tokens??0),cacheWrite1hTokens:token(object(u.cache_creation).ephemeral_1h_input_tokens??0)}:{};
  if(breakdown.cacheWrite5mTokens!==undefined&&breakdown.cacheWrite5mTokens+(breakdown.cacheWrite1hTokens??0)!==writes)throw new ModelProviderError('MODEL_USAGE_UNAVAILABLE');
  return {inputTokens:input,outputTokens:output,
    cachedInputTokens:token(object(u.input_tokens_details).cached_tokens??u.cache_read_input_tokens??0),
    cacheWriteTokens:writes,...breakdown,
    reasoningTokens:token(object(u.output_tokens_details).reasoning_tokens??0)};
}
function parseJson(v:unknown,u:ModelUsage):unknown {
  if(typeof v==="string"){try{return JSON.parse(v);}catch{throw new ModelProviderError("MODEL_INVALID_JSON",false,u);}}
  if(v&&typeof v==="object"&&!Array.isArray(v))return v;
  throw new ModelProviderError("MODEL_EMPTY_DECISION",false,u);
}
function textResponse(p:Record<string,unknown>,u:ModelUsage) {
  if(p.status!==undefined&&p.status!=="completed")throw new ModelProviderError("MODEL_INCOMPLETE_RESPONSE",false,u);
  const messages=Array.isArray(p.output)?p.output as Array<Record<string,unknown>>:[];
  const content=messages.filter(x=>x.type==="message").flatMap(x=>Array.isArray(x.content)?x.content as Array<Record<string,unknown>>:[]);
  if(content.some(x=>x.type==="refusal"))throw new ModelProviderError("MODEL_REFUSED",false,u);
  const text=typeof p.output_text==="string"?p.output_text:content.filter(x=>x.type==="output_text").map(x=>x.text).join("");
  return parseJson(text,u);
}
async function post(fetcher:typeof fetch,url:string,headers:Record<string,string>,body:unknown,signal:AbortSignal) {
  let response:Response;
  try{response=await fetcher(url,{method:"POST",redirect:"manual",signal,headers:{...headers,"content-type":"application/json"},body:JSON.stringify(body)});}
  catch{throw new ModelProviderError(signal.aborted?"MODEL_TIMEOUT":"MODEL_TRANSPORT_FAILED",true);}
  if(!response.ok) {
    // Do not echo provider errors: they can include credentials, prompts or account data.
    throw new ModelProviderError(response.status===429?"MODEL_QUOTA_OR_RATE_LIMIT":
      response.status===401||response.status===403?"MODEL_AUTH_FAILED":"MODEL_PROVIDER_FAILED",response.status===429||response.status>=500);
  }
  try{return object(await response.json());}catch{throw new ModelProviderError("MODEL_INVALID_RESPONSE");}
}
export function openAiAdapter(apiKey:string,fetcher:typeof fetch=fetch):ModelAdapter {
  return async r=>{
    if(!apiKey.trim())throw new ModelProviderError("MODEL_NOT_CONFIGURED");
    const p=await post(fetcher,"https://api.openai.com/v1/responses",{authorization:"Bearer "+apiKey},{
      model:r.definition.model,store:false,max_output_tokens:r.maxOutputTokens,
      input:[{role:"system",content:r.system},{role:"user",content:r.user}],
      text:{format:{type:"json_schema",name:"remote_arc_agent_decision",strict:true,schema:r.schema}},
    },r.signal);
    const u=usage(p);if(u.cachedInputTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens)throw new ModelProviderError('MODEL_USAGE_UNAVAILABLE');return {value:textResponse(p,u),usage:u,providerRequestId:typeof p.id==="string"?p.id:null};
  };
}
export function anthropicAdapter(apiKey:string,fetcher:typeof fetch=fetch):ModelAdapter {
  return async r=>{
    if(!apiKey.trim())throw new ModelProviderError("MODEL_NOT_CONFIGURED");
    const p=await post(fetcher,"https://api.anthropic.com/v1/messages",{"x-api-key":apiKey,"anthropic-version":"2023-06-01"},{
      model:r.definition.model,max_tokens:r.maxOutputTokens,system:r.system,
      messages:[{role:"user",content:r.user}],
      ...(r.definition.structuredOutput?{output_config:{format:{type:'json_schema',schema:r.schema}}}:{
        tools:[{name:"submit_agent_decision",description:"Submit one bounded next decision. This returns data and never executes a tool.",input_schema:r.schema}],
        tool_choice:{type:"tool",name:"submit_agent_decision",disable_parallel_tool_use:true},
      }),
    },r.signal);
    const u=usage(p);
    if(r.definition.structuredOutput){
      if(p.stop_reason!=="end_turn")throw new ModelProviderError("MODEL_INCOMPLETE_RESPONSE",false,u);
      const content=Array.isArray(p.content)?p.content as Array<Record<string,unknown>>:[];
      if(content.some(x=>x.type==='refusal'))throw new ModelProviderError('MODEL_REFUSED',false,u);
      return {value:parseJson(content.filter(x=>x.type==='text').map(x=>x.text).join(''),u),usage:u,providerRequestId:typeof p.id==='string'?p.id:null};
    }
    if(p.stop_reason!=="tool_use")throw new ModelProviderError("MODEL_INCOMPLETE_RESPONSE",false,u);
    const content=Array.isArray(p.content)?p.content as Array<Record<string,unknown>>:[];
    const selected=content.filter(x=>x.type==="tool_use"&&x.name==="submit_agent_decision");
    if(selected.length!==1||content.some(x=>x.type==="tool_use"&&x.name!=="submit_agent_decision"))
      throw new ModelProviderError("MODEL_INVALID_TOOL_RESPONSE",false,u);
    return {value:parseJson(selected[0]!.input,u),usage:u,providerRequestId:typeof p.id==="string"?p.id:null};
  };
}
export type WorkersAiBinding = {run(model:string,input:Record<string,unknown>):Promise<unknown>};
export function workersAiAdapter(binding:WorkersAiBinding):ModelAdapter {
  return async r=>{
    if(r.signal.aborted)throw new ModelProviderError("MODEL_TIMEOUT",true);
    let p:Record<string,unknown>;
    try{p=object(await binding.run(r.definition.model,{
      messages:[{role:"system",content:r.system},{role:"user",content:r.user}],
      max_tokens:r.maxOutputTokens,temperature:0.2,
      response_format:{type:"json_schema",json_schema:r.schema},
    }));}catch{throw new ModelProviderError("MODEL_TRANSPORT_FAILED",true);}
    if(Array.isArray(p.errors)&&p.errors.length)throw new ModelProviderError("MODEL_PROVIDER_FAILED");
    const u=usage(p);
    let value:unknown;
    if(p.response!==undefined)value=parseJson(p.response,u);
    else if(Array.isArray(p.choices)) {
      const choices=p.choices as Array<Record<string,unknown>>;
      if(choices.length!==1||choices[0]?.finish_reason!=="stop")throw new ModelProviderError("MODEL_INCOMPLETE_RESPONSE",false,u);
      value=parseJson(object(choices[0].message).content,u);
    }else value=textResponse(p,u);
    return {value,usage:u,providerRequestId:typeof p.id==="string"?p.id:null};
  };
}
