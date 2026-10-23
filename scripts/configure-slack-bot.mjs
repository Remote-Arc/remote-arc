// Provision the dedicated request-verification secret without exposing its value.
const secret=process.env.APP_SLACK_SIGNING_SECRET;
if(!secret){console.log('No Slack signing secret supplied; existing configuration retained.');}
else{
 if(!/^[a-f0-9]{32,128}$/i.test(secret))throw Error('Invalid Slack signing secret format');
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 if(!account||!token)throw Error('Missing Cloudflare secret provisioning configuration');
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/remote-link-relay/secrets`,{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({name:'APP_SLACK_SIGNING_SECRET',type:'secret_text',text:secret}),redirect:'error',signal:AbortSignal.timeout(30000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok||result?.success!==true)throw Error('Slack signing secret provisioning failed');
 console.log('Slack request verification configured.');
}
