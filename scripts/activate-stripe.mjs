import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {waitRuntimeReady} from './wait-runtime-ready.mjs';
export const stripeBillingEvents=['invoice.paid','invoice.payment_failed','checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired','customer.subscription.updated','customer.subscription.deleted','charge.refunded','charge.dispute.created'];
export async function activateStripe(env,fetcher=fetch,wait){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/master'||env.GITHUB_ACTOR!=='yaohuangguan')throw Error('Protected master promotion required');
 if(!/^(sk|rk)_live_\w+$/.test(env.STRIPE_SECRET_KEY||'')||!/^whsec_\w+$/.test(env.STRIPE_WEBHOOK_SECRET||'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Live Stripe credentials required');
 const {STRIPE_API_VERSION}=await import('../apps/relay/src/stripe-client.ts');
 async function stripe(suffix){const response=await fetcher('https://api.stripe.com/v1/'+suffix,{headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,'stripe-version':STRIPE_API_VERSION},redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Stripe account validation failed');return response.json();}
 const account=await stripe('account');
 // Stripe exposes payment processing and bank payouts independently. The owner
 // may launch checkout while bank verification is pending; never override a
 // Stripe-disabled charges capability or manufacture a successful payment.
 if(account.country!=='NZ'||account.charges_enabled!==true||account.details_submitted!==true)throw Error('NZ Stripe payment activation incomplete');
 const endpoints=await stripe('webhook_endpoints?limit=100'),matching=endpoints.data?.filter(endpoint=>endpoint.url==='https://agent.remotearc.app/api/billing/webhook'&&endpoint.status==='enabled');
 if(endpoints.has_more||matching?.length!==1||matching[0].api_version!==STRIPE_API_VERSION||!stripeBillingEvents.every(event=>matching[0].enabled_events?.includes(event)||matching[0].enabled_events?.includes('*')))throw Error('Production webhook configuration requires review');
 await waitRuntimeReady(fetcher,state=>state.arcAvailable===true,wait);
 // The local owner setup registered the webhook and captured its signing secret.
 // This step provisions only Worker Secrets; no charges or customer mutations.
 for(const name of ['STRIPE_WEBHOOK_SECRET','STRIPE_SECRET_KEY']){
  const response=await fetcher('https://api.cloudflare.com/client/v4/accounts/6b1d0dd4e6f7f30df92753cd1e2ee12d/workers/scripts/remote-link-relay/secrets',{method:'PUT',headers:{authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({name,type:'secret_text',text:env[name]}),redirect:'error',signal:AbortSignal.timeout(30000)});
  const value=await response.json();if(!response.ok||value.success!==true)throw Error('Stripe secret provisioning failed');
 }
 await waitRuntimeReady(fetcher,state=>state.arcAvailable===true&&state.billingAvailable===true,wait);
 console.log('NZ live Stripe payment capability and webhook checked; billing credentials provisioned. Bank payouts: '+(account.payouts_enabled===true?'enabled':'not enabled; complete verification in Stripe')+'. No payment, refund or customer message was created. A live customer transaction has not been claimed.');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))activateStripe(process.env).catch(()=>{console.error('Stripe activation failed. Review account activation, endpoint configuration and production credential provisioning. No secret or API response was logged.');process.exitCode=1;});
