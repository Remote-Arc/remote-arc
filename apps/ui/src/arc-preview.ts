import {BUILTIN_SKILLS} from '../../../packages/skills/src/catalog.generated.js';
import type {ChatMessage, ChatRun, ChatSession} from "./use-arc-chat.js";

type PreviewSession = {session:ChatSession; messages:ChatMessage[]; runs:ChatRun[]; reads:number; requests:Map<string,{text:string;modelId:string;run:ChatRun}>};
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{"cache-control":"no-store"}});
const makeRun = ():ChatRun => ({id:crypto.randomUUID(),status:"queued",step:0,tokensUsed:0,maxTokens:24000,maxSteps:8,deadline:new Date(Date.now()+180000).toISOString(),error:null});

/** Per-tab UI simulation. Never calls a model, Apps, devices, storage or production API. */
export function createArcPreview() {
  const skills=new Map<string,{id:string;name:string;description:string;sourceUrl:string|null;origin:string;content:string}>(BUILTIN_SKILLS.map(skill=>[skill.id,{id:skill.id,name:skill.name,description:skill.description,sourceUrl:skill.upstream,origin:'builtin',content:skill.content}]));
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
        record.messages.push({id:run.id+":assistant",role:"assistant",text:zh?"**这是交互预览，回复和工具结果均为模拟。**\n\n真实 Arc 会根据你的目标选择应用与电脑，保存任务状态，并返回可以核对的执行结果。你可以继续查看任务和活动页面。\n\n本次没有调用大模型、执行工具或产生费用。":"**This is an interactive preview. Responses and tool results are simulated.**\n\nIn live Arc, your goal guides app and computer selection, saved work and verifiable results. You can explore Tasks and Activity from the sidebar.\n\nNo model was called, no tools were run and no charges were made."});
      }
    }
    return {session:record.session,messages:record.messages,runs:record.runs};
  }
  return {handle(path:string,method:string,rawBody:unknown):Response|null {
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
    const run=makeRun();record.reads=0;record.runs.unshift(run);record.requests.set(requestId,{text,modelId,run});record.messages.push({id:run.id+":user",role:"user",text});
    record.session={...record.session,title:text.slice(0,64),modelId,updatedAt:new Date().toISOString()};return json({run},202);
  }};
}
