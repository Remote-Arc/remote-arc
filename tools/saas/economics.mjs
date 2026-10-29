import {ARC_PLANS,ARC_TOPUPS,ARC_CREDIT_RATE,ARC_HOSTED_MODELS,ARC_TRIAL_CREDITS,ARC_PLATFORM_APP_BUDGETS_MICROS} from '../../packages/protocol/src/index.ts';
export const assumptions={targetMargin:.70,paymentPercent:.04,paymentFixed:.30,refundReservePercent:.01,hostingPerAccount:1,hostingPerToolCall:.00002,expectedConnectCalls:20000,hostingPerDevice:.05,unlimitedDevicesPerAccount:25,platformAppsPerAccount:ARC_PLATFORM_APP_BUDGETS_MICROS.paid/1e6,connectOnlyPlatformApps:ARC_PLATFORM_APP_BUDGETS_MICROS.free/1e6,supportPerAccount:.50,freeAccountsPerPaid:5,freeAccountCost:.20,trialConversion:.20};
const nonnegative=(n,name)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new Error('Invalid '+name);return n;};
export function economics(overrides={}){
 const a={...assumptions,...overrides};for(const [k,v]of Object.entries(a))nonnegative(v,k);
 if(a.targetMargin>=1||a.paymentPercent>=1||a.refundReservePercent>=1||a.trialConversion<=0||a.trialConversion>1)throw new Error('Invalid rate');
 const costPerCredit=ARC_CREDIT_RATE.unitsPerCredit*ARC_CREDIT_RATE.costMicrosPerUnit/1e6;
 const trialAcquisition=ARC_TRIAL_CREDITS*costPerCredit/a.trialConversion;
 const plans=ARC_PLANS.filter(p=>p.monthlyPriceCents>0).map(p=>{
  const revenue=p.monthlyPriceCents/100,model=p.monthlyCredits*costPerCredit;
  // Each registered computer holds a Durable Object WebSocket (mostly hibernated)
  // plus heartbeats and D1 rows. Unlimited plans are stressed at a heavy fleet.
  // The one-time Arc trial is open to every account, Free included, so it is not
  // an incremental cost of Connect-only; it is acquisition for the Arc plans.
  const devices=p.deviceLimit??a.unlimitedDevicesPerAccount,acquisition=p.allHostedModels?trialAcquisition:0;
  const costs={model,payments:revenue*a.paymentPercent+a.paymentFixed,refundReserve:revenue*a.refundReservePercent,hosting:a.hostingPerAccount+(p.connectToolCalls??a.expectedConnectCalls)*a.hostingPerToolCall,devices:devices*a.hostingPerDevice,platformApps:p.allHostedModels?a.platformAppsPerAccount:a.connectOnlyPlatformApps,support:a.supportPerAccount,freeCohort:a.freeAccountsPerPaid*a.freeAccountCost};
  const total=Object.values(costs).reduce((x,y)=>x+y,0),margin=(revenue-total)/revenue,headroom=revenue*(1-a.targetMargin)-total;
  const firstMonthContributionMargin=(revenue-total-acquisition)/revenue;
  return {...p,revenue,costs,total,margin,headroom,trialAcquisition:acquisition,firstMonthContributionMargin,firstMonthHeadroom:headroom-acquisition,meetsTarget:headroom-acquisition>=-1e-9,maxAffordableCredits:p.allHostedModels?Math.max(0,Math.floor((revenue*(1-a.targetMargin)-(total-model)-acquisition)/costPerCredit)):0,customersForMillionARR:Math.ceil(1e6/(12*revenue))};
 });
 return {assumptions:a,costPerCredit,plans,topups:ARC_TOPUPS.map(p=>{const revenue=p.priceCents/100,total=p.credits*costPerCredit+revenue*(a.paymentPercent+a.refundReservePercent)+a.paymentFixed;return {...p,total,margin:(revenue-total)/revenue};}),models:ARC_HOSTED_MODELS.map(m=>({...m,creditsPer1000Input:m.inputMicrosPerMillion/1e9/costPerCredit,creditsPer1000Output:m.outputMicrosPerMillion/1e9/costPerCredit,exampleCredits:(8000*m.inputMicrosPerMillion+1000*m.outputMicrosPerMillion)/1e12/costPerCredit})),trial:{credits:ARC_TRIAL_CREDITS,modelCeiling:ARC_TRIAL_CREDITS*costPerCredit,modelAcquisitionCostPerConverted:ARC_TRIAL_CREDITS*costPerCredit/a.trialConversion}};
}
