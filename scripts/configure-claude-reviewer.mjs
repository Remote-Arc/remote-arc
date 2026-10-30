import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const names=['ANTHROPIC_REVIEWER_EMAIL','ANTHROPIC_REVIEWER_PASSWORD_SHA256','ANTHROPIC_REVIEWER_DEMO_DEVICE_ID'];
export async function configureClaudeReviewer({accountId,token,email,password,deviceId},fetcher=fetch){
 if(!accountId||!token)throw Error('Missing Cloudflare reviewer provisioning configuration');
 if(!/^[^\s@]+@remotearc\.app$/i.test(email||'')||typeof password!=='string'||password.length<24||!/^[-a-zA-Z0-9]{8,100}$/.test(deviceId||''))throw Error('Supply a dedicated Remote Arc reviewer email, a strong password and a separate fixture ID');
 const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/remote-link-relay/secrets`;
 async function request(method,body){
  const response=await fetcher(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.success!==true)throw Error('Claude reviewer provisioning failed: HTTP '+response.status);
  return data.result;
 }
 const existing=await request('GET');
 if(!Array.isArray(existing))throw Error('Invalid Worker secret list');
 const present=names.filter(name=>existing.some(secret=>secret.name===name));
 if(present.length===names.length)return{created:false};
 if(present.length)throw Error('Partial Anthropic reviewer configuration exists; inspect it before changing credentials');
 const values=[email.trim().toLowerCase(),createHash('sha256').update(password).digest('hex'),deviceId];
 for(let i=0;i<names.length;i++)await request('PUT',{name:names[i],type:'secret_text',text:values[i]});
 return{created:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 configureClaudeReviewer({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN,email:process.env.ANTHROPIC_REVIEWER_EMAIL,password:process.env.ANTHROPIC_REVIEWER_PASSWORD,deviceId:process.env.ANTHROPIC_REVIEWER_DEMO_DEVICE_ID})
  .then(result=>console.log(result.created?'Independent Claude reviewer configured; existing OpenAI settings preserved.':'Existing Claude reviewer settings retained.'))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
}
