import {APP_CATALOG,AppError,type AppEnv,type AppProvider} from './app-catalog.js';
import {currentArcPlan} from './arc-plan.js';
import {ARC_PLATFORM_APP_BUDGETS_MICROS} from '@remotearc/protocol';
/** Costs paid by a platform developer project cannot inherit a user's generous
 * generic tool-call quota. Reserve an operator-verified worst-case cost first.
 * This internal ceiling never deducts model Credits or creates a user charge.
 * Connect-only plans keep the Free ceiling: it is Remote Arc-funded spend. */
export async function reservePlatformAppFunding(env:AppEnv,userId:string,connection:{id:string;generation:number;provider:AppProvider}){
 if(APP_CATALOG[connection.provider].payer!=='platform_project')return;
 let settings:Record<string,{maxCostMicrosPerDispatch:number;dailyPlatformMicros:number}>;
 try{settings=JSON.parse(env.APP_PLATFORM_FUNDED_COSTS||'{}');}catch{throw new AppError('app_platform_budget_not_configured',503);}
 const policy=settings?.[connection.provider];
 if(!policy||![policy.maxCostMicrosPerDispatch,policy.dailyPlatformMicros].every(n=>Number.isSafeInteger(n)&&n>0&&n<=100000000))throw new AppError('app_platform_budget_not_configured',503);
 const plan=await currentArcPlan(env,userId),userMaximum=plan.allHostedModels?ARC_PLATFORM_APP_BUDGETS_MICROS.paid:ARC_PLATFORM_APP_BUDGETS_MICROS.free,at=new Date().toISOString();
 const reserved=await env.DB.prepare(`INSERT INTO app_platform_funding_reservations(id,user_id,provider,month_key,day_key,maximum_cost_micros,created_at)
 SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM app_connections WHERE id=?8 AND user_id=?2 AND generation=?9 AND status='active')
 AND COALESCE((SELECT SUM(maximum_cost_micros) FROM app_platform_funding_reservations WHERE user_id=?2 AND month_key=?4),0)+?6<=?10
 AND COALESCE((SELECT SUM(maximum_cost_micros) FROM app_platform_funding_reservations WHERE provider=?3 AND day_key=?5),0)+?6<=?11 RETURNING id`)
 .bind(crypto.randomUUID(),userId,connection.provider,at.slice(0,7),at.slice(0,10),policy.maxCostMicrosPerDispatch,at,connection.id,connection.generation,userMaximum,policy.dailyPlatformMicros).first();
 if(!reserved)throw new AppError('app_platform_funded_allowance_reached',429);
}
