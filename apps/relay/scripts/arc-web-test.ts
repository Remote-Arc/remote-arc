import assert from 'node:assert/strict';
import {openAiAdapter,ModelProviderError} from '../src/model-provider-adapters.js';
import {arcWeather} from '../src/arc-web.js';
import {prepareCommunitySkill} from '../src/arc-community-skills.js';
import {COMMUNITY_SKILLS} from '../../../packages/skills/src/community.generated.js';

const definition={id:'arc-auto',provider:'openai',model:'fixture-model',maxOutputTokens:4096,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000} as any;
const usage={input_tokens:12000,output_tokens:300,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:0}};

// Hosted search: bounded calls, approximate location, sourced text, call count for billing.
let sent:any;
const search=openAiAdapter('key',(async(_url:string,init:any)=>{sent=JSON.parse(init.body);return Response.json({id:'resp',usage,output:[
 {type:'web_search_call',status:'completed',action:{type:'search'}},
 {type:'web_search_call',status:'completed',action:{type:'open_page'}},
 {type:'web_search_call',status:'completed',action:{type:'find_in_page'}},
 {type:'message',content:[{type:'output_text',text:'Auckland: showers clearing, 17°C.',annotations:[{type:'url_citation',url:'https://www.metservice.com/towns-cities/locations/auckland',title:'MetService Auckland'},{type:'url_citation',url:'https://www.metservice.com/towns-cities/locations/auckland',title:'dup'},{type:'url_citation',url:'javascript:alert(1)',title:'bad'}]}]},
]});}) as any);
const result=await search({definition,system:'s',user:'Auckland weather today',schema:{},maxOutputTokens:1200,webSearch:{maxCalls:2,location:{city:'Auckland',country:'NZ',timezone:'Pacific/Auckland'}},signal:new AbortController().signal});
assert.equal(sent.parallel_tool_calls,false,'Serialize hosted tool calls so the response cap remains effective');assert.equal(sent.max_tool_calls,2);assert.deepEqual(sent.tools,[{type:'web_search',search_context_size:'low',user_location:{type:'approximate',city:'Auckland',country:'NZ',timezone:'Pacific/Auckland'}}]);
assert.equal(sent.text,undefined,'Search returns prose with citations, not the decision schema');
assert.equal(result.usage.webSearchCalls,1,'Opening and finding in a page do not add search-call fees');
assert.deepEqual(result.usage.webSearchActions,[{type:'search',status:'completed'},{type:'open_page',status:'completed'},{type:'find_in_page',status:'completed'}]);
assert.deepEqual((result.value as any).sources,[{title:'MetService Auckland',url:'https://www.metservice.com/towns-cities/locations/auckland'}],'Sources are deduplicated and limited to http(s)');
const empty=openAiAdapter('key',(async()=>Response.json({id:'r',usage,output:[{type:'web_search_call'}]})) as any);
await assert.rejects(()=>empty({definition,system:'s',user:'q',schema:{},maxOutputTokens:100,webSearch:{maxCalls:1},signal:new AbortController().signal}),(error:any)=>error instanceof ModelProviderError&&error.code==='MODEL_INCOMPLETE_RESPONSE'&&error.usage?.webSearchCalls===1,'A search with no answer is still billed for the calls it made');

// Weather: keyless, place disambiguation by country, structured forecast with source.
const urls:string[]=[];
const weather=await arcWeather({location:'Auckland, New Zealand',days:2},(async(url:string)=>{urls.push(url);
 if(url.includes('geocoding'))return Response.json({results:[{name:'Auckland',country:'Australia',latitude:-1,longitude:1},{name:'Auckland',admin1:'Auckland',country:'New Zealand',country_code:'NZ',latitude:-36.85,longitude:174.76}]});
 return Response.json({timezone:'Pacific/Auckland',current:{time:'2026-10-24T11:45',temperature_2m:17.2,apparent_temperature:16,relative_humidity_2m:70,precipitation:0.2,weather_code:80,wind_speed_10m:22},
  daily:{time:['2026-10-24','2026-10-25'],weather_code:[80,2],temperature_2m_max:[18,19],temperature_2m_min:[12,11],precipitation_probability_max:[60,10],precipitation_sum:[3.1,0],wind_speed_10m_max:[30,18],uv_index_max:[6,7]}});
}) as any) as any;
assert.equal(weather.place,'Auckland, Auckland, New Zealand');assert(urls[1]!.includes('latitude=-36.85'),'The country hint picks the right Auckland');
assert.equal(weather.current.condition,'light showers');assert.equal(weather.daily.length,2);assert.equal(weather.source.url,'https://open-meteo.com/');
assert.equal((await arcWeather({location:'Nowhere'},(async()=>Response.json({})) as any) as any).found,false);
await assert.rejects(()=>arcWeather({location:'Auckland'},(async()=>new Response('',{status:503})) as any),/ARC_WEATHER_UNAVAILABLE/);

// A refused device write while preparing a skill is a recoverable observation.
const skill=COMMUNITY_SKILLS.find((item:any)=>item.resources.some((file:any)=>file.path.startsWith('scripts/')))!;
const run={id:'run',user_id:'user',step:0} as any,env={DB:{prepare:()=>({bind:()=>({first:async()=>({id:'run'})})})}} as any;
const prepared:any=await prepareCommunitySkill(env,run,{id:skill.id,deviceId:'device',workspace:'C:/Users/sam/work'},async()=>{throw new Error('PATH_OUTSIDE_WORKSPACE');});
assert.equal(prepared.prepared,false);assert.equal(prepared.error,'PATH_OUTSIDE_WORKSPACE');assert.match(prepared.guidance,/workspace_roots/);assert.deepEqual(prepared.written,[]);
console.log('PASS: bounded sourced web search with billable call counts, keyless weather with place disambiguation, recoverable skill preparation failures.');

// Gateway: search is OpenAI-only, the reservation covers retrieved content and
// the maximum number of calls, and settlement charges each call actually made.
import {runModelGateway,WEB_SEARCH_CALL_MICROS} from '../src/model-gateway.js';
{
 const statements:{query:string;args:any[]}[]=[];let reserved:any;
 const db={prepare(query:string){const stmt={query,args:[] as any[],bind(...args:any[]){stmt.args=args;statements.push(stmt);return stmt;},
  async first(){if(query.includes('FROM billing_reservations WHERE operation_key'))return{id:reserved,request_json:statements.find(s=>s.query.includes('INSERT OR IGNORE INTO billing_reservations'))!.args[12],status:'reserved'};
   if(query.includes('FROM billing_reservations WHERE id=?1'))return{id:reserved,request_json:statements.find(s=>s.query.includes('INSERT OR IGNORE INTO billing_reservations'))!.args[12],entries_json:'[]',status:'reserved'};return null;},
  async run(){return{meta:{changes:1}};}};return stmt;},
  async batch(list:any[]){const insert=list.find(s=>s.query?.includes('INSERT OR IGNORE INTO billing_reservations'));if(insert)reserved=insert.args[0];return list.map(()=>({meta:{changes:1}}));}} as any;
 const binding={DB:db,enabled:true,models:[definition],autoModelId:'arc-auto',paidGrantId:'grant',adapters:{openai:openAiAdapter('fixture',(async()=>Response.json({id:'r',usage:{input_tokens:30000,output_tokens:400},output:[{type:'web_search_call',status:'completed',action:{type:'search'}},{type:'web_search_call',status:'completed',action:{type:'open_page'}},{type:'web_search_call',status:'completed',action:{type:'search'}},{type:'web_search_call',status:'completed',action:{type:'find_in_page'}},{type:'message',content:[{type:'output_text',text:'Sourced result',annotations:[]}]}]})) as any)}} as any;
 const context={userId:'u',organizationId:'o',taskId:'t',runId:'r',operationId:'chat:0:web',lane:'arc_hosted'} as any;
 await runModelGateway(binding,{webSearch:{maxCalls:2},context,modelId:'arc-auto',system:'s',user:'q',schema:{type:'object'},maxOutputTokens:1200},v=>v);
 const maximum=JSON.parse(statements.find(s=>s.query.includes('INSERT OR IGNORE INTO billing_reservations'))!.args[12]).maximum.costMicros;
 const settled=statements.filter(s=>s.query.includes("SET status='settling'")).map(s=>JSON.parse(s.args[0]).actual.costMicros)[0];
 assert(maximum>=2*WEB_SEARCH_CALL_MICROS+Math.ceil(64000*definition.inputMicrosPerMillion/1e6),'Reservation covers both calls and retrieved content');
 assert.equal(settled,Math.ceil((30000*100000+400*500000)/1e6)+2*WEB_SEARCH_CALL_MICROS,'Each actual search call is charged');assert(settled<=maximum);
 await assert.rejects(()=>runModelGateway({...binding,models:[{...definition,provider:'anthropic'}],adapters:{anthropic:async()=>({})}},{webSearch:{maxCalls:2},context,modelId:'arc-auto',system:'s',user:'q',schema:{},maxOutputTokens:100},v=>v),/MODEL_WEB_SEARCH_UNSUPPORTED/);
 await assert.rejects(()=>runModelGateway(binding,{webSearch:{maxCalls:9},context,modelId:'arc-auto',system:'s',user:'q',schema:{},maxOutputTokens:100},v=>v),/MODEL_WEB_SEARCH_UNSUPPORTED/,'Search calls per request stay bounded');
}
console.log('PASS: web search reservations cover worst-case calls and content; actual calls are settled.');
