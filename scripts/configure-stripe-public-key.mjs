import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function configureStripePublicKey(env,fetcher=fetch){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/master')throw Error('Protected master deployment required');
 if(!/^pk_live_[A-Za-z0-9]+$/.test(env.STRIPE_PUBLISHABLE_KEY||'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Stripe publishable key configuration is missing');
 const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/6b1d0dd4e6f7f30df92753cd1e2ee12d/workers/scripts/remote-link-relay/secrets',{method:'PUT',redirect:'error',headers:{authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({name:'STRIPE_PUBLISHABLE_KEY',type:'secret_text',text:env.STRIPE_PUBLISHABLE_KEY}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok||result.success!==true)throw Error('Stripe publishable key provisioning failed');
 console.log('Stripe publishable key configured for embedded payments. No customer or payment was changed.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))configureStripePublicKey(process.env).catch(()=>{console.error('Could not configure embedded payment public key. No credential was logged.');process.exitCode=1;});
