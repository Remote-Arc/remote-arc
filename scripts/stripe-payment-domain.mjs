const domainName='agent.remotearc.app';
// Called only by protected live activation, after account/webhook validation.
// Register this checkout origin; leave account-wide payment preferences alone.
export async function ensureStripePaymentDomain(env,apiVersion,fetcher=fetch){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REF!=='refs/heads/master'||env.GITHUB_ACTOR!=='yaohuangguan'||!/^(sk|rk)_live_\w+$/.test(env.STRIPE_SECRET_KEY||''))throw Error('Protected live Stripe promotion required');
 async function request(suffix,body){
  const headers={authorization:'Bearer '+env.STRIPE_SECRET_KEY,'stripe-version':apiVersion};
  if(body){headers['content-type']='application/x-www-form-urlencoded';headers['idempotency-key']='remote-arc:wallet-domain:'+suffix+':'+(env.GITHUB_RUN_ID||'activation');}
  const response=await fetcher('https://api.stripe.com/v1/payment_method_domains'+suffix,{method:body?'POST':'GET',headers,...(body?{body:new URLSearchParams(body).toString()}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Stripe payment domain configuration failed');return response.json();
 }
 const list=await request('?domain_name='+encodeURIComponent(domainName)+'&limit=100');
 if(list.has_more!==false||!Array.isArray(list.data)||list.data.length>1)throw Error('Stripe payment domain list is ambiguous');
 function verify(domain){if(!/^pmd_[A-Za-z0-9]+$/.test(domain?.id||'')||domain.domain_name!==domainName||domain.livemode!==true)throw Error('Stripe payment domain identity mismatch');return domain;}
 let domain=list.data.length?verify(list.data[0]):verify(await request('',{domain_name:domainName,enabled:'true'}));
 if(domain.enabled!==true)domain=verify(await request('/'+domain.id,{enabled:'true'}));
 if(domain.enabled!==true)throw Error('Stripe payment domain is disabled');
 if(domain.apple_pay?.status!=='active'||domain.link?.status!=='active')domain=verify(await request('/'+domain.id+'/validate',{}));
 if(domain.enabled!==true)throw Error('Stripe payment domain is disabled');
 const status=method=>domain[method]?.status==='active'?'active':'not active';
 const result={domain:domainName,applePay:status('apple_pay'),link:status('link'),googlePay:status('google_pay')};
 console.log(`Payment domain ${domainName}: Apple Pay ${result.applePay}; Link ${result.link}; Google Pay ${result.googlePay}. Eligible methods depend on account preferences and the customer's device.`);
 return result;
}
