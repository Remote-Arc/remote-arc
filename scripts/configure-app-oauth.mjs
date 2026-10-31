// Copy App OAuth client credentials from deploy secrets into the Worker without
// printing them. Only names missing from the Worker are written, so a deploy
// never rotates a configured client; rotate one in Cloudflare directly.
import {fileURLToPath} from "node:url";import path from "node:path";

// Identity platforms in apps/relay/src/apps/app-catalog.ts (credential field).
export const APP_OAUTH_PLATFORMS=["GITHUB","SLACK","GOOGLE","MICROSOFT","META","ATLASSIAN","NOTION","SHOPIFY","LINKEDIN","HUBSPOT","SALESFORCE","VERCEL","LINEAR","SUPABASE","X","DROPBOX","ASANA","AIRTABLE"];
// Non-OAuth settings a provider needs before it reports ready.
const SETTINGS=["APP_VERCEL_INTEGRATION_SLUG"];

export function appOAuthSecrets(env){
 const secrets=[];
 const value=name=>{const text=env[name];if(text===undefined||text==="")return undefined;
  if(typeof text!=="string"||text.length>1024||/\s/.test(text))throw Error(name+" has an invalid format");return text;};
 for(const platform of APP_OAUTH_PLATFORMS){
  const idName="APP_"+platform+"_CLIENT_ID",secretName="APP_"+platform+"_CLIENT_SECRET",id=value(idName),secret=value(secretName);
  if(!id&&!secret)continue;
  if(!id||!secret)throw Error("APP_"+platform+" needs both CLIENT_ID and CLIENT_SECRET");
  secrets.push({name:idName,text:id},{name:secretName,text:secret});
 }
 for(const name of SETTINGS){const text=value(name);if(text)secrets.push({name,text});}
 return secrets;
}

export async function configureAppOAuth({accountId,worker,token,env},fetcher=fetch){
 const secrets=appOAuthSecrets(env);
 if(!secrets.length)return{configured:[],retained:[]};
 if(!accountId||!worker||!token)throw Error("Missing Worker secret provisioning configuration");
 const url="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(accountId)+"/workers/scripts/"+encodeURIComponent(worker)+"/secrets";
 async function request(method,body){
  const response=await fetcher(url,{method,headers:{authorization:"Bearer "+token,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),redirect:"error",signal:AbortSignal.timeout(30000)});
  let result;try{result=await response.json();}catch{throw Error("Worker secret response was invalid");}
  if(!response.ok||result.success!==true)throw Error("Worker secret provisioning failed");
  return result.result;
 }
 const current=await request("GET");if(!Array.isArray(current))throw Error("Worker secret list was invalid");
 const existing=new Set(current.map(secret=>secret.name));
 const configured=[],retained=[];
 for(const {name,text} of secrets){
  if(existing.has(name)){retained.push(name);continue;}
  await request("PUT",{name,type:"secret_text",text});configured.push(name);
 }
 return{configured,retained};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))
 configureAppOAuth({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,worker:"remote-link-relay",token:process.env.CLOUDFLARE_API_TOKEN,env:process.env})
  .then(({configured,retained})=>console.log(configured.length||retained.length
   ?"App OAuth secrets configured: "+(configured.join(", ")||"none")+". Already present, retained: "+(retained.join(", ")||"none")+"."
   :"No App OAuth credentials supplied; existing configuration retained."))
  .catch(error=>{console.error(error.message);process.exitCode=1;});
