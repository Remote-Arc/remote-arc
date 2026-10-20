// Check that protected acceptance fixtures themselves satisfy production
// contracts. Inference here is scripted; live acceptance remains a separate gate.
import assert from 'node:assert/strict';
const previousFetch=globalThis.fetch,previousKey=process.env.OPENAI_API_KEY;
let modelCalls=0;
process.env.OPENAI_API_KEY='synthetic-eval-fixture-not-a-secret';
globalThis.fetch=(async(url,init)=>{
 assert.equal(String(url),'https://api.openai.com/v1/responses');modelCalls++;
 const request=JSON.parse(String(init?.body)),context=JSON.parse(request.input[1].content),connectionId=context.connectionIndex[0].id;
 assert.match(connectionId,/^[\da-f]{8}-[\da-f-]{27}$/i);
 const observations=context.taskState.completedActions as {tool:string;arguments:any}[];
 const reply=(message:string)=>({decision:'reply',tool:'none',arguments_json:'{}',message});
 const tool=(name:string,args:unknown)=>({decision:'tool',tool:name,arguments_json:JSON.stringify(args),message:'Working'});
 let value;
 if(context.objective.includes('邮件'))value=observations.some(o=>o.tool==='read_inbox')?reply('已查看两封邮件：周五 10:00 项目评审，提前准备演示；发票 INV-42 周二到期，请在账单门户核对。'):tool('read_inbox',{connectionId,limit:2});
 else if(context.objective.includes('issue'))value=observations.some(o=>o.tool==='call_app')?reply('Created https://github.com/example/project/issues/42'):tool('call_app',{connectionId,operation:'issues.create',arguments:{repo:'example/project',title:'Release checklist',body:'Verify smoke tests'}});
 else if(!observations.some(o=>o.tool==='call_app'))value=tool('call_app',{connectionId,operation:'projects.list',arguments:{limit:5}});
 else if(!observations.some(o=>o.arguments.operation==='deployments.list'))value=tool('call_app',{connectionId,operation:'deployments.list',arguments:{projectId:'prj_web',limit:1}});
 else value=reply('Latest deployment is READY: https://web-example.vercel.app');
 return Response.json({id:'synthetic-response',status:'completed',output_text:JSON.stringify(value),usage:{input_tokens:2000,output_tokens:200}});
}) as typeof fetch;
try{await import('./arc-task-live-eval.js');assert(modelCalls>=6);console.log('PASS: all protected acceptance fixtures execute through production schemas and dispatcher');}
finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
