import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

/** Protocol/fixture smoke test, not a claim that all public tools or the Claude UI were tested. */
export async function verifyClaudeReviewer({origin='https://mcp.remotearc.app',email,password,deviceId},fetcher=fetch){
 assert(email&&password&&deviceId,'Missing dedicated reviewer test credentials');
 const request=(route,init={})=>fetcher(origin+route,{...init,redirect:'manual',signal:AbortSignal.timeout(30000)});
 const jsonPost=(route,body,headers={})=>request(route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const formPost=(route,body)=>request(route,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)});
 const login=await formPost('/auth/reviewer',{email,password,return_to:'/overview'});
 assert.equal(login.status,302,'Dedicated reviewer password login failed');
 const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie,'Reviewer session cookie missing');
 const redirectUri='https://claude.ai/api/mcp/auth_callback';
 const registration=await jsonPost('/oauth/register',{client_name:'Remote Arc Claude reviewer protocol smoke',redirect_uris:[redirectUri],token_endpoint_auth_method:'none'});
 assert.equal(registration.status,201,'OAuth client registration failed');
 const {client_id:clientId}=await registration.json();assert(clientId);
 const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex');
 const auth={response_type:'code',client_id:clientId,redirect_uri:redirectUri,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',resource:origin+'/mcp',scope:'devices:read computer:read computer:write browser:read apps:read apps:write offline_access',state};
 const authorize=await request('/oauth/authorize?'+new URLSearchParams(auth),{headers:{cookie}});
 assert.equal(authorize.status,302);assert.equal(new URL(authorize.headers.get('location')).pathname,'/oauth/consent');
 const decision=await jsonPost('/oauth/decision',{...auth,decision:'allow'},{origin,cookie});
 assert.equal(decision.status,200,'OAuth consent failed');
 const redirect=new URL((await decision.json()).redirect_to);assert.equal(redirect.searchParams.get('state'),state);
 const exchange=await formPost('/oauth/token',{grant_type:'authorization_code',client_id:clientId,redirect_uri:redirectUri,code:redirect.searchParams.get('code'),code_verifier:verifier,resource:origin+'/mcp'});
 assert.equal(exchange.status,200,'PKCE token exchange failed');
 let tokens=await exchange.json();assert(tokens.access_token&&tokens.refresh_token);
 const refresh=await formPost('/oauth/token',{grant_type:'refresh_token',client_id:clientId,refresh_token:tokens.refresh_token,resource:origin+'/mcp'});
 assert.equal(refresh.status,200,'Refresh-token exchange failed');tokens=await refresh.json();
 const rpc=async(method,params)=>{
  const response=await jsonPost('/mcp',{jsonrpc:'2.0',id:1,method,params},{authorization:'Bearer '+tokens.access_token,accept:'application/json, text/event-stream'});
  assert.equal(response.status,200,'MCP HTTP request failed');
  const text=await response.text();const data=JSON.parse(text.trim().startsWith('{')?text:text.split('\n').find(line=>line.startsWith('data: ')).slice(6));
  assert(!data.error,'MCP protocol error');return data.result;
 };
 const call=(name,args)=>rpc('tools/call',{name,arguments:args});
 const text=result=>(result.content||[]).filter(item=>item.type==='text').map(item=>item.text).join('\n');
 const successful=async(name,args)=>{const result=await call(name,args);assert(!result.isError,name+' failed');return result;};
 const {tools}=await rpc('tools/list',{});assert(Array.isArray(tools));
 for(const name of ['run_app_read_action','run_app_write_action']){
  const tool=tools.find(item=>item.name===name);assert(tool,name+' missing');assert(!JSON.stringify(tool.inputSchema).includes('runway.'),'Claude action schema includes Runway');
 }
 const listed=await successful('list_devices',{});
 const devices=JSON.parse(listed.content[0].text);assert.equal(devices.length,1);assert.equal(devices[0].id,deviceId);assert.equal(devices[0].status,'online');
 const args={device_id:deviceId};const tested=['list_devices'];
 for(const [name,extra] of [['list_directory',{path:'/review-demo'}],['read_file',{path:'/review-demo/README.md'}],['get_file_info',{path:'/review-demo/README.md'}],['list_processes',{}],['start_process',{command:'pwd',cwd:'/review-demo'}]]){
  await successful(name,{...args,...extra});tested.push(name);
 }
 const file='/review-demo/claude-reviewer-smoke.txt';
 await successful('write_file',{...args,path:file,content:'reviewer-smoke-before'});tested.push('write_file');
 await successful('edit_block',{...args,file_path:file,old_string:'reviewer-smoke-before',new_string:'reviewer-smoke-after',expected_replacements:1});tested.push('edit_block');
 assert(text(await successful('read_file',{...args,path:file})).includes('reviewer-smoke-after'));
 await successful('undo_last_change',args);tested.push('undo_last_change');
 assert(text(await successful('read_file',{...args,path:file})).includes('reviewer-smoke-before'));
 const blocked=await call('read_file',{...args,path:'/etc/passwd'});assert(blocked.isError,'Fixture allowed reading outside its workspace');
 const media=await call('read_skill',{id:'image-studio'});assert(media.isError,'Claude can read a restricted AI-generation Skill');
 return{oauth:'DCR, password login, consent, PKCE and refresh passed',fixtureToolsTested:tested,advertisedToolCount:tools.length,untestedTools:tools.map(tool=>tool.name).filter(name=>!tested.includes(name)),limitations:'Protocol smoke only. This does not confirm every advertised tool works or replace testing in a Claude conversation.'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 verifyClaudeReviewer({email:process.env.ANTHROPIC_REVIEWER_EMAIL,password:process.env.ANTHROPIC_REVIEWER_PASSWORD,deviceId:process.env.ANTHROPIC_REVIEWER_DEMO_DEVICE_ID})
  .then(report=>console.log(JSON.stringify(report,null,2)))
  .catch(()=>{console.error('Claude reviewer protocol/fixture smoke failed. Check reviewer configuration and the deployed code; credentials are omitted.');process.exitCode=1;});
}
