import {ARC_OUTCOME_SKILLS} from '../../relay/src/arc-outcome-skills.js';
import {ARC_VERIFICATION_SKILLS} from '../../relay/src/arc-verification-skills.js';
const PREVIEW_SKILLS=[...ARC_VERIFICATION_SKILLS,...ARC_OUTCOME_SKILLS];
import {ARC_MEMORY_LIMITS} from '@remotearc/protocol';
import type {ChatMessage, ChatRun, ChatSession} from "./use-arc-chat.js";

type PreviewSession = {session:ChatSession; messages:ChatMessage[]; runs:ChatRun[]; reads:number; requests:Map<string,{text:string;modelId:string;run:ChatRun}>};
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{"cache-control":"no-store"}});
const makeRun = ():ChatRun => ({id:crypto.randomUUID(),status:"queued",step:0,tokensUsed:0,maxTokens:24000,maxSteps:8,deadline:new Date(Date.now()+180000).toISOString(),error:null});

/** Per-tab UI simulation. Never calls a model, Apps, devices, storage or production API. */
export function createArcPreview(references:{apps?:NonNullable<ChatMessage['apps']>;employees?:NonNullable<ChatMessage['teammates']>}={}) {
  let memoryEnabled=true;
  const memories=new Map<string,{id:string;kind:'fact'|'work';category:string;content:string;source_session_id:string|null;updated_at:string}>([['example-preference',{id:'example-preference',kind:'fact',category:'preference',content:'Keep release summaries concise and link the relevant pull requests.',source_session_id:'sample-conversation',updated_at:new Date().toISOString()}]]);
  const skills=new Map<string,{id:string;name:string;description:string;sourceUrl:string|null;origin:string;content:string}>(PREVIEW_SKILLS.map(skill=>[skill.id,{id:skill.id,name:skill.name,description:skill.description,sourceUrl:skill.sourceUrl,origin:'builtin',content:skill.content}]));
  const sessions = new Map<string,PreviewSession>();
  const example:PreviewSession = {
    session:{id:"sample-conversation",title:"Review the release and share a summary",modelId:"auto",updatedAt:new Date().toISOString()},
    messages:[
      {id:"sample-user",role:"user",text:"Review recent GitHub changes and summarize what is ready for release."},
      {id:"sample-tool",role:"tool",text:"Example tool result.",tool:"call_app",arguments:{operation:"pulls.list",connectionId:"example-github"},result:"Simulated result: three pull requests. No real account was accessed.",status:"completed"},
      {id:"sample-assistant",role:"assistant",text:"### Example release summary\n\n- Apps connection improvements\n- Clearer device status\n- Arc conversation history\n\n**Interactive preview.** This is sample content. No model or tools were called."},
    ],runs:[{...makeRun(),status:"succeeded",step:3}],reads:0,requests:new Map(),
  };
  sessions.set(example.session.id, example);
  function snapshot(record:PreviewSession) {
    const run=record.runs[0];
    if(run&&["queued","thinking","working"].includes(run.status)) {
      record.reads++;
      run.status=record.reads<2?"thinking":record.reads<3?"working":"succeeded";
      run.step=Math.min(record.reads,3);
      if(run.status==="succeeded"&&!record.messages.some(m=>m.id===run.id+":assistant")) {
        const text=record.messages.filter(m=>m.role==="user").at(-1)?.text||"";
        const zh=/[\u3400-\u9fff]/.test(text);
        record.messages.push({id:run.id+":tool",role:"tool",text:zh?"示例工具记录":"Example tool record",tool:"preview_example",arguments:{example:true},result:zh?"模拟结果。没有访问应用、电脑或真实账号。":"Simulated result. No apps, computers or real accounts were accessed.",status:"completed"});
        if(/(?:四|four|4).*(?:队友|teammate)|(?:开发|developer).*(?:设计|designer).*(?:商务|business)/i.test(text))record.messages.push({id:run.id+":assistant",role:"assistant",text:zh?"**协作流程预览：以下分工与结果均为模拟。**\n\n本次演示由开发、设计、商务和领域研究四个角色围绕产品方向分别分析，再在这个对话汇总。\n\n- **开发**：先打通目标、执行和结果回执，保留失败恢复能力。\n- **设计**：Arc Chat 作为唯一入口，默认展示进度和产出，资料放入设置。\n- **商务**：先验证一个高频场景的完成率与付费意愿。\n- **领域研究**：用真实用户任务核对需求，区分事实与假设。\n\n**建议下一步**：选择一个真实目标，完成一次从需求到交付的验证。你可以在这里补充要求，无需切换群聊或逐个配置角色。\n\n本次没有调用大模型、执行工具或产生费用。":"**Collaboration preview: these assignments and results are simulated.**\n\nDevelopment, design, business and domain research work around one goal and return their findings here.\n\n- **Development**: complete recoverable goal-to-delivery execution.\n- **Design**: make Arc Chat the single entry; show progress and deliverables.\n- **Business**: validate a frequent use case and willingness to pay.\n- **Research**: distinguish observed needs from assumptions.\n\nContinue the goal in this chat without configuring a group messenger.\n\nNo model was called, no tools were run and no charges were made."});
        else record.messages.push({id:run.id+":assistant",role:"assistant",text:zh?"**这是交互预览，回复和工具结果均为模拟。**\n\n真实 Arc 会根据你的目标选择应用与电脑，保存任务状态，并返回可以核对的执行结果。你可以继续查看任务和活动页面。\n\n本次没有调用大模型、执行工具或产生费用。":"**This is an interactive preview. Responses and tool results are simulated.**\n\nIn live Arc, your goal guides app and computer selection, saved work and verifiable results. You can explore Tasks and Activity from the sidebar.\n\nNo model was called, no tools were run and no charges were made."});
      }
    }
    return {session:record.session,messages:record.messages,runs:record.runs};
  }
  return {handle(path:string,method:string,rawBody:unknown):Response|null {
    if(path==='/api/arc/memory'||path.startsWith('/api/arc/memory/')){
      if(path==='/api/arc/memory'&&method==='GET')return json({enabled:memoryEnabled,limits:ARC_MEMORY_LIMITS,bytes:[...memories.values()].reduce((n,m)=>n+new TextEncoder().encode(m.content).length,0),memories:[...memories.values()].reverse()});
      const id=decodeURIComponent(path.slice('/api/arc/memory/'.length));
      if(method==='DELETE')return json({deleted:memories.delete(id)});
      let input;try{input=JSON.parse(String(rawBody));}catch{return json({error:'ARC_INVALID_MEMORY'},400);}
      if(method!=='POST')return json({error:'method_not_allowed'},405);
      if(id==='settings'){
        if(typeof input.enabled!=='boolean')return json({error:'ARC_INVALID_MEMORY'},400);
        memoryEnabled=input.enabled;if(input.clear===true)memories.clear();return json({enabled:memoryEnabled,cleared:input.clear===true});
      }
      if(!memoryEnabled)return json({error:'ARC_MEMORY_DISABLED'},409);
      if(typeof input.content!=='string'||input.content.trim().length<2||input.content.length>600||new TextEncoder().encode(input.content).length>ARC_MEMORY_LIMITS.factBytes||!['preference','project','context'].includes(input.category))return json({error:'ARC_INVALID_MEMORY'},400);
      if([...memories.values()].some(m=>m.id!==id&&m.category===input.category&&m.content===input.content))return json({error:'ARC_MEMORY_DUPLICATE'},409);
      if(path!=='/api/arc/memory'&&!memories.has(id))return json({error:'ARC_MEMORY_NOT_FOUND'},404);
      if(path==='/api/arc/memory'&&[...memories.values()].filter(m=>m.kind==='fact').length>=ARC_MEMORY_LIMITS.facts)return json({error:'ARC_MEMORY_LIMIT_OR_CHANGED'},409);
      const memoryId=path==='/api/arc/memory'?crypto.randomUUID():id;memories.set(memoryId,{id:memoryId,kind:'fact',category:input.category,content:input.content.trim(),source_session_id:null,updated_at:new Date().toISOString()});return json({id:memoryId,saved:true},path==='/api/arc/memory'?201:200);
    }
    if(path==='/api/arc/skills'||path.startsWith('/api/arc/skills/')){
      const id=decodeURIComponent(path.slice('/api/arc/skills/'.length));
      if(path==='/api/arc/skills'&&method==='GET')return json({skills:[...skills.values()].map(({content,...skill})=>skill)});
      if(method==='POST'&&path==='/api/arc/skills'){
        let input;try{input=JSON.parse(String(rawBody));}catch{return json({error:'INVALID_REQUEST'},400);}
        if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100||typeof input.content!=='string'||input.content.trim().length<20||input.content.length>12000||new TextEncoder().encode(input.content).length>16000)return json({error:'ARC_INVALID_SKILL'},400);
        const duplicate=[...skills.values()].find(s=>s.origin==='imported'&&s.content===input.content);if(duplicate)return json(duplicate,201);
        if([...skills.values()].filter(s=>s.origin==='imported').length>=50)return json({error:'ARC_SKILL_LIMIT'},429);
        const skill={id:crypto.randomUUID(),name:input.name,description:String(input.description||''),content:input.content,sourceUrl:input.sourceUrl||null,origin:'imported'};skills.set(skill.id,skill);return json(skill,201);
      }
      const skill=skills.get(id);if(!skill)return json({error:'ARC_SKILL_NOT_FOUND'},404);
      if(method==='DELETE'){if(skill.origin==='imported')skills.delete(id);return json({deleted:skill.origin==='imported'});}
      if(method==='GET')return json(skill);return json({error:'method_not_allowed'},405);
    }
    const match=path.match(/^\/api\/arc\/sessions(?:\/([\w-]+)(?:\/(messages|cancel))?)?$/);
    if(!match)return null;
    let input:Record<string,unknown>={};
    if(method==="POST") {try {if(typeof rawBody!=="string"||rawBody.length>20000)throw 0;input=JSON.parse(rawBody);if(!input||typeof input!=="object"||Array.isArray(input))throw 0;}catch{return json({error:"INVALID_REQUEST"},400);}}
    const id=match[1],action=match[2];
    if(!id) {
      if(method==="GET")return json({sessions:[...sessions.values()].map(value=>value.session)});
      if(method!=="POST")return json({error:"method_not_allowed"},405);
      if(sessions.size>=20)return json({error:"CHAT_LIMIT_REACHED"},429);
      const session:ChatSession={id:crypto.randomUUID(),title:"New preview chat",modelId:typeof input.modelId==="string"?input.modelId:"auto",updatedAt:new Date().toISOString()};
      sessions.set(session.id,{session,messages:[],runs:[],reads:0,requests:new Map()});return json({id:session.id},201);
    }
    const record=sessions.get(id);if(!record)return json({error:"CHAT_NOT_FOUND"},404);
    if(!action&&method==="GET")return json(snapshot(record));
    if(!action&&method==="DELETE"){sessions.delete(id);return json({deleted:true});}
    if(method!=="POST")return json({error:"method_not_allowed"},405);
    if(action==="cancel") {const run=record.runs.find(run=>run.id===input.runId);if(run&&["queued","thinking","working"].includes(run.status))run.status="cancelled";return json(snapshot(record));}
    const text=typeof input.text==="string"?input.text.trim():"",requestId=typeof input.requestId==="string"?input.requestId:"",modelId=typeof input.modelId==="string"?input.modelId:"auto";
    if(!text||text.length>6000||!requestId||requestId.length>160)return json({error:"INVALID_MESSAGE"},400);
    const previous=record.requests.get(requestId);if(previous)return previous.text===text&&previous.modelId===modelId?json({run:previous.run},202):json({error:"REQUEST_ID_CONFLICT"},409);
    if(record.runs.some(run=>["queued","thinking","working"].includes(run.status)))return json({error:"CHAT_BUSY_OR_LIMIT_REACHED"},409);
    if(record.messages.length>=50)return json({error:"CHAT_LIMIT_REACHED"},429);
    const run=makeRun();record.reads=0;record.runs.unshift(run);record.requests.set(requestId,{text,modelId,run});record.messages.push({id:run.id+":user",role:"user",text,...(Array.isArray(input.skillIds)?{skills:input.skillIds.flatMap(id=>{const skill=skills.get(String(id));return skill?[{id:skill.id,name:skill.name}]:[];})}:{}),...(Array.isArray(input.appIds)?{apps:input.appIds.flatMap(id=>references.apps?.filter(app=>app.id===id)||[])}:{}),...(Array.isArray(input.employeeIds)?{teammates:input.employeeIds.flatMap(id=>references.employees?.filter(employee=>employee.id===id)||[])}:{})});
    record.session={...record.session,title:text.slice(0,64),modelId,updatedAt:new Date().toISOString()};return json({run},202);
  }};
}
