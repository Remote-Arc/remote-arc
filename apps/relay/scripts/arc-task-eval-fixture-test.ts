// Check that protected acceptance fixtures themselves satisfy production
// contracts. Inference here is scripted; live acceptance remains a separate gate.
import assert from 'node:assert/strict';
const previousFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY;
let modelCalls=0;
const expandedPaths=process.argv.includes('--expanded-paths');
const injectInvalidDecision=process.argv.includes('--invalid-decision');let invalidSent=false,awaitingRepair=false;
process.env.OPENAI_API_KEY='synthetic-eval-fixture-not-a-secret';
globalThis.fetch=(async(url,init)=>{
 assert.equal(String(url),'https://api.openai.com/v1/responses');modelCalls++;
 const request=JSON.parse(String(init?.body)),context=JSON.parse(request.input[1].content),connectionId=context.connectionIndex[0].id;
 assert.match(connectionId,/^[\da-f]{8}-[\da-f-]{27}$/i);
 const observations=context.taskState.completedActions as {tool:string;arguments:any}[];
 if(injectInvalidDecision&&!invalidSent&&context.objective==="Check the latest deployment of my 'web' project and report actual readiness and URL."){
  invalidSent=true;awaitingRepair=true;return Response.json({id:'synthetic-invalid-response',status:'completed',output_text:'{',usage:{input_tokens:1000,output_tokens:100}});
 }
 if(awaitingRepair){assert.equal(context.modelRepair?.code,'MODEL_INVALID_JSON');awaitingRepair=false;}
 const reply=(message:string)=>({decision:'reply',tool:'none',arguments_json:'{}',message});
 const tool=(name:string,args:unknown)=>({decision:'tool',tool:name,arguments_json:JSON.stringify(args),message:'Working'});
 let value;
 if(context.objective.includes('邮件')){
  if(expandedPaths&&!observations.some(o=>o.tool==='list_apps'))value=tool('list_apps',{provider:'gmail'});
  else if(expandedPaths&&!observations.some(o=>o.tool==='describe_app'))value=tool('describe_app',{provider:'gmail',operation:'messages.list'});
  else if(expandedPaths&&!observations.some(o=>o.tool==='call_app'))value=tool('call_app',{connectionId,operation:'messages.list',arguments:{limit:5}});
  else value=observations.some(o=>o.tool==='read_inbox')?reply('已查看两封邮件：周五 10:00 项目评审，提前准备演示；发票 INV-42 周二到期，请在账单门户核对。'):tool('read_inbox',{connectionId,limit:2});
 }
 else if(context.objective.includes('node verify.js')){
  const checks=observations.filter(o=>o.tool==='device_tool'&&o.arguments.tool==='process_status').length;
  // Closing context can discard the optional device index after the final
  // process observations. A reply uses that evidence, not fresh discovery.
  const deviceId=context.deviceIndex[0]?.id;
  if(!observations.some(o=>o.tool==='select_device'))value=tool('select_device',{requiredTools:['start_process','process_status','process_output'],workspace:'/fixture/project',platform:'linux'});
  else if(!observations.some(o=>o.tool==='device_tool'&&o.arguments.tool==='start_process'))value=tool('device_tool',{deviceId,tool:'start_process',arguments:{command:'node verify.js',cwd:'/fixture/project',background:true}});
  else if(expandedPaths&&checks===0)value=tool('device_tool',{deviceId,tool:'process_status',arguments:{process_id:'eval-managed-process'}});
  else if(!observations.some(o=>o.tool==='device_tool'&&o.arguments.tool==='process_output'))value=tool('device_tool',{deviceId,tool:'process_output',arguments:{process_id:'eval-managed-process'}});
  else if(checks<2)value=tool('device_tool',{deviceId,tool:'process_status',arguments:{process_id:'eval-managed-process'}});
  else {assert.match(JSON.stringify(context),/verified-build-ok/,'Final process summary must retain its observed output');value=reply('Process eval-managed-process exited 0 with verified-build-ok.');}
 }
 else if(context.objective.startsWith('Save a one-off task'))value=observations.some(o=>o.tool==='create_task')?reply('Task saved.'):tool('create_task',{name:'Verify web deployment',instructions:"Check the latest deployment of my 'web' project and report actual readiness and URL.",schedule:{type:'once'}});
 else if(context.skillReferences?.length){
  if(!observations.some(o=>o.tool==='read_skill'))value=tool('read_skill',{id:context.skillReferences[0].id});
  else value=observations.some(o=>o.tool==='call_app')?reply('Created https://github.com/example/project/issues/43'):tool('call_app',{connectionId,operation:'issues.create',arguments:{repo:'example/project',title:'Skill release verification',body:'Include verified-smoke-7A in the release evidence.'}});
 }
 else if(context.objective.includes('issue'))value=observations.some(o=>o.tool==='call_app')?reply('Created https://github.com/example/project/issues/42'):tool('call_app',{connectionId,operation:'issues.create',arguments:{repo:'example/project',title:'Release checklist',body:'Verify smoke tests'}});
 else if(!observations.some(o=>o.tool==='call_app'))value=tool('call_app',{connectionId,operation:'projects.list',arguments:{limit:5}});
 else if(!observations.some(o=>o.arguments.operation==='deployments.list'))value=tool('call_app',{connectionId,operation:'deployments.list',arguments:{projectId:context.objective.includes('broken')?'prj_broken':'prj_web',limit:1}});
 else value=reply(context.objective.includes('broken')?'Latest deployment is ERROR: https://broken-example.vercel.app':'Latest deployment is READY: https://web-example.vercel.app');
 if(value.decision==='tool'){
  if(!request.text.format.schema.properties.decision.enum.includes('tool'))console.error('PREMATURE_CLOSING',JSON.stringify({objective:context.objective,remainingSteps:context.remainingSteps,systemBytes:Buffer.byteLength(request.input[0].content),userBytes:Buffer.byteLength(request.input[1].content),actions:observations,deviceIndex:context.deviceIndex}));
  assert(request.text.format.schema.properties.decision.enum.includes('tool'),'Incomplete work must still have a continuation decision');
 }
 return Response.json({id:'synthetic-response',status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:expandedPaths?2700:2000,output_tokens:200}});
}) as typeof fetch;
try{await import('./arc-task-live-eval.js');assert(modelCalls>=18);if(injectInvalidDecision){assert(invalidSent);assert.equal(awaitingRepair,false);}console.log('PASS: Apps, scheduled Tasks, referenced Skills, managed processes and failed deployments execute through production schemas and dispatcher');}
finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
