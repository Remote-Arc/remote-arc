export type ModelProvider = "workers_ai" | "openai" | "anthropic" | "openrouter";
export type ModelUsage = {inputTokens:number;outputTokens:number;cachedInputTokens:number;cacheWriteTokens:number;reasoningTokens:number;cacheWrite5mTokens?:number;cacheWrite1hTokens?:number;webSearchCalls?:number;webSearchActions?:{type:string;status:string}[]};
export type WebSearchLocation={city?:string;region?:string;country?:string;timezone?:string};
export type WebSearchResult={text:string;sources:{title:string;url:string}[]};
export type ModelDefinition = {
  id:string;label?:string;provider:ModelProvider;model:string;maxOutputTokens:number;
  inputMicrosPerMillion:number;outputMicrosPerMillion:number;cacheWriteMicrosPerMillion?:number;cacheWrite5mMicrosPerMillion?:number;cachedInputMicrosPerMillion?:number;structuredOutput?:boolean;
  inputNeuronsPerMillion?:number;outputNeuronsPerMillion?:number;freeEligible?:boolean;
};
export type ModelRequest = {webSearch?:{location?:WebSearchLocation;maxCalls:number};decisionTool?:boolean;images?:{dataUrl:string}[];definition:ModelDefinition;system:string;user:string;schema:Record<string,unknown>;maxOutputTokens:number;signal:AbortSignal};
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
    cachedInputTokens:token(object(u.input_tokens_details).cached_tokens??object(u.prompt_tokens_details).cached_tokens??u.cache_read_input_tokens??0),
    cacheWriteTokens:writes,...breakdown,
    reasoningTokens:token(object(u.output_tokens_details).reasoning_tokens??object(u.completion_tokens_details).reasoning_tokens??0)};
}
function parseJson(v:unknown,u:ModelUsage):unknown {
  if(typeof v==="string"){try{return JSON.parse(v);}catch{throw new ModelProviderError("MODEL_INVALID_JSON",false,u);}}
  if(v&&typeof v==="object"&&!Array.isArray(v))return v;
  throw new ModelProviderError("MODEL_EMPTY_DECISION",false,u);
}
function arcDecisionTools(schema:Record<string,unknown>){
  const properties=object(schema.properties),decisions=object(properties.decision).enum,tools=object(properties.tool).enum;
  const action=Array.isArray(decisions)&&decisions.includes('tool')?[{type:'function',name:'arc_call_tool',description:'Continue the current task by calling one authorized tool. message is only a short public progress label.',strict:true,parameters:{...schema,properties:{...properties,decision:{type:'string',enum:['tool']},tool:{type:'string',enum:Array.isArray(tools)?tools.filter(tool=>tool!=='none'):[]},message:{type:'string',description:'A short public progress label for this tool call.'}}}}]:[];
  return [...action,{type:'function',name:'arc_deliver_answer',description:'Deliver the complete finished answer directly to the user. There is no later writer. Include actual findings, requested analysis and observed result/source links. Never return a plan or instructions to another writer.',strict:true,parameters:{type:'object',additionalProperties:false,properties:{answer:{type:'string',description:'The entire final answer shown verbatim to the user, in their language and normal Markdown. Write the actual analysis or actual execution result, including requested evidence, URLs and process output. Do not write a short label, a future plan, instructions to summarize, or a JSON decision envelope.'}},required:['answer']}}];
}
function textResponse(p:Record<string,unknown>,u:ModelUsage,decisionTools?:string[]) {
  if(p.status!==undefined&&p.status!=="completed")throw new ModelProviderError("MODEL_INCOMPLETE_RESPONSE",false,u);
  const messages=Array.isArray(p.output)?p.output as Array<Record<string,unknown>>:[];
  const content=messages.filter(x=>x.type==="message").flatMap(x=>Array.isArray(x.content)?x.content as Array<Record<string,unknown>>:[]);
  if(content.some(x=>x.type==="refusal"))throw new ModelProviderError("MODEL_REFUSED",false,u);
  if(decisionTools){
    const calls=messages.filter(item=>item.type==='function_call');
    if(calls.length!==1||!decisionTools.includes(String(calls[0]!.name)))throw new ModelProviderError('MODEL_INVALID_TOOL_RESPONSE',false,u);
    const value=object(parseJson(calls[0]!.arguments,u));
    if(calls[0]!.name==='arc_deliver_answer'){
      if(typeof value.answer!=='string'||Object.keys(value).some(key=>key!=='answer'))throw new ModelProviderError('MODEL_INVALID_TOOL_RESPONSE',false,u);
      return {decision:'reply',tool:'none',arguments_json:'{}',message:value.answer};
    }
    if(value.decision!=='tool'||value.tool==='none')throw new ModelProviderError('MODEL_INVALID_TOOL_RESPONSE',false,u);
    return value;
  }
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
    if(r.webSearch)return openAiWebSearch(apiKey,fetcher,r);
    const decisionTools=r.decisionTool?arcDecisionTools(r.schema):undefined;
    const p=await post(fetcher,"https://api.openai.com/v1/responses",{authorization:"Bearer "+apiKey},{
      model:r.definition.model,store:false,max_output_tokens:r.maxOutputTokens,
      input:[{role:"system",content:r.system+(decisionTools?'\nUse exactly one native function: arc_call_tool continues execution; arc_deliver_answer sends your COMPLETE final answer verbatim to the user. These functions replace manual JSON-envelope output. For arc_deliver_answer, write the actual finished findings/analysis and requested observed links or outputs in answer. Never send a plan, a progress label, instructions for another writer or a JSON envelope. No later model writes the answer. Tool authorization and durable dispatch remain enforced by the backend.':'')},{role:"user",content:r.images?.length?[{type:'input_text',text:r.user},...r.images.map(image=>({type:'input_image',image_url:image.dataUrl,detail:'auto'}))]:r.user}],
      ...(decisionTools?{tools:decisionTools,tool_choice:'required',parallel_tool_calls:false}:{text:{format:{type:"json_schema",name:"remote_arc_agent_decision",strict:true,schema:r.schema}}}),
    },r.signal);
    const u=usage(p);if(u.cachedInputTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens)throw new ModelProviderError('MODEL_USAGE_UNAVAILABLE');return {value:textResponse(p,u,decisionTools?.map(tool=>tool.name)),usage:u,providerRequestId:typeof p.id==="string"?p.id:null};
  };
}
/** A bounded hosted web search: at most maxCalls searches, sourced text out. */
async function openAiWebSearch(apiKey:string,fetcher:typeof fetch,r:ModelRequest):Promise<ModelResult>{
  const location=r.webSearch!.location,approximate=location&&Object.fromEntries(Object.entries(location).filter(([,v])=>typeof v==='string'&&v.trim()).map(([k,v])=>[k,String(v).slice(0,80)]));
  const p=await post(fetcher,"https://api.openai.com/v1/responses",{authorization:"Bearer "+apiKey},{
    model:r.definition.model,store:false,max_output_tokens:r.maxOutputTokens,max_tool_calls:r.webSearch!.maxCalls,
    parallel_tool_calls:false,tools:[{type:'web_search',search_context_size:'low',...(approximate&&Object.keys(approximate).length?{user_location:{type:'approximate',...approximate}}:{})}],tool_choice:'auto',
    input:[{role:"system",content:r.system},{role:"user",content:r.user}],
  },r.signal);
  const u=usage(p),output=Array.isArray(p.output)?p.output as Array<Record<string,unknown>>:[];
  const actions=output.filter(item=>item.type==='web_search_call').map(item=>({
    type:String(object(item.action).type||'unspecified').slice(0,40),status:String(item.status||'unspecified').slice(0,40),
  }));
  // Only search actions carry a tool-call fee. Opening a result and finding text
  // in it still appear as web_search_call items, but their tokens are already in
  // provider usage. Failed/incomplete tool attempts are not completed searches.
  // Keep legacy items without action metadata conservative.
  // https://developers.openai.com/api/docs/guides/tools-web-search#output-and-citations
  const calls=actions.filter(action=>!['open_page','find_in_page'].includes(action.type)&&!['failed','incomplete'].includes(action.status)).length;
  const blocks=output.filter(item=>item.type==='message').flatMap(item=>Array.isArray(item.content)?item.content as Array<Record<string,unknown>>:[]).filter(block=>block.type==='output_text');
  const text=blocks.map(block=>String(block.text||'')).join('\n').trim();
  const seen=new Set<string>(),sources:{title:string;url:string}[]=[];
  for(const annotation of blocks.flatMap(block=>Array.isArray(block.annotations)?block.annotations as Array<Record<string,unknown>>:[])){
    const url=typeof annotation.url==='string'?annotation.url:'';
    if(annotation.type!=='url_citation'||!/^https?:\/\//.test(url)||seen.has(url))continue;
    seen.add(url);sources.push({title:String(annotation.title||url).slice(0,200),url:url.slice(0,2000)});
  }
  const used={...u,webSearchCalls:calls,webSearchActions:actions.slice(0,10)};
  if(p.status!==undefined&&p.status!=='completed')throw new ModelProviderError('MODEL_INCOMPLETE_RESPONSE',false,used);
  if(!text)throw new ModelProviderError('MODEL_INCOMPLETE_RESPONSE',false,used);
  return {value:{text,sources:sources.slice(0,10)} satisfies WebSearchResult,usage:used,providerRequestId:typeof p.id==="string"?p.id:null};
}
export function anthropicAdapter(apiKey:string,fetcher:typeof fetch=fetch):ModelAdapter {
  return async r=>{
    if(!apiKey.trim())throw new ModelProviderError("MODEL_NOT_CONFIGURED");
    const p=await post(fetcher,"https://api.anthropic.com/v1/messages",{"x-api-key":apiKey,"anthropic-version":"2023-06-01"},{
      model:r.definition.model,max_tokens:r.maxOutputTokens,system:r.system,
      messages:[{role:"user",content:r.images?.length?[{type:'text',text:r.user},...r.images.map(image=>({type:'image',source:{type:'base64',media_type:image.dataUrl.slice(5,image.dataUrl.indexOf(';')),data:image.dataUrl.slice(image.dataUrl.indexOf(',')+1)}}))]:r.user}],
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
/** One rated request. Router retries, training routes and parameter downgrades are disabled. */
export function openRouterAdapter(apiKey:string,fetcher:typeof fetch=fetch):ModelAdapter {
  return async r=>{
    if(!apiKey.trim())throw new ModelProviderError('MODEL_NOT_CONFIGURED');
    const p=await post(fetcher,'https://openrouter.ai/api/v1/chat/completions',{
      authorization:'Bearer '+apiKey,'HTTP-Referer':'https://remotearc.app','X-OpenRouter-Title':'Remote Arc',
    },{
      model:r.definition.model,stream:false,max_tokens:r.maxOutputTokens,
      messages:[{role:'system',content:r.system},{role:'user',content:r.images?.length?[{type:'text',text:r.user},...r.images.map(image=>({type:'image_url',image_url:{url:image.dataUrl,detail:'auto'}}))]:r.user}],
      response_format:{type:'json_schema',json_schema:{name:'remote_arc_agent_decision',strict:true,schema:r.schema}},
      provider:{require_parameters:true,allow_fallbacks:false,data_collection:'deny',max_price:{prompt:r.definition.inputMicrosPerMillion/1000000,completion:r.definition.outputMicrosPerMillion/1000000}},
    },r.signal);
    const u=usage(p);
    if(u.cachedInputTokens+u.cacheWriteTokens>u.inputTokens||u.reasoningTokens>u.outputTokens)throw new ModelProviderError('MODEL_USAGE_UNAVAILABLE');
    const choices=Array.isArray(p.choices)?p.choices as Array<Record<string,unknown>>:[];
    if(choices.length!==1||choices[0]?.finish_reason!=='stop')throw new ModelProviderError('MODEL_INCOMPLETE_RESPONSE',false,u);
    const message=object(choices[0].message);if(message.refusal)throw new ModelProviderError('MODEL_REFUSED',false,u);
    return{value:parseJson(message.content,u),usage:u,providerRequestId:typeof p.id==='string'?p.id:null};
  };
}
export type WorkersAiBinding = {run(model:string,input:Record<string,unknown>):Promise<unknown>};
export function workersAiAdapter(binding:WorkersAiBinding):ModelAdapter {
  return async r=>{
    if(r.images?.length)throw new ModelProviderError("MODEL_IMAGE_INPUT_UNSUPPORTED");
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
