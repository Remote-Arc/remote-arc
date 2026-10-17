import {fileURLToPath} from "node:url";import path from "node:path";
export async function ensureAppsVault({accountId,worker,token,key},fetcher=fetch){
 if(!accountId||!worker||!token)throw Error("Missing Worker secret provisioning configuration");
 const url="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(accountId)+"/workers/scripts/"+encodeURIComponent(worker)+"/secrets";
 async function request(method,body){
  const response=await fetcher(url,{method,headers:{authorization:"Bearer "+token,"content-type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),redirect:"error",signal:AbortSignal.timeout(30000)});
  let result;try{result=await response.json();}catch{throw Error("Worker secret response was invalid");}
  if(!response.ok||result.success!==true)throw Error("Worker secret provisioning failed");
  return result.result;
 }
 const current=await request("GET");if(!Array.isArray(current))throw Error("Worker secret list was invalid");
 const existing=current.find(secret=>secret.name==="APP_TOKEN_KEY");
 if(existing){if(existing.type!=="secret_text")throw Error("Existing Apps vault secret has an unexpected type");return{created:false};}
 if(typeof key!=="string"||Buffer.from(key,"base64").length!==32||Buffer.from(key,"base64").toString("base64")!==key)throw Error("Missing valid APP_TOKEN_KEY; existing vault keys are never rotated automatically");
 await request("PUT",{name:"APP_TOKEN_KEY",type:"secret_text",text:key});return{created:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))ensureAppsVault({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,worker:"remote-link-relay",token:process.env.CLOUDFLARE_API_TOKEN,key:process.env.APP_TOKEN_KEY}).then(result=>console.log(result.created?"Apps vault secret provisioned.":"Existing Apps vault secret retained.")).catch(error=>{console.error(error.message);process.exitCode=1;});
