import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ARC_PLANS} from '@remotearc/protocol';
import {commercialCatalog} from '../src/arc-commercial-config.js';
import {currentArcPlan} from '../src/arc-plan.js';
import {getMonthlyUsage,consumeToolCall} from '../src/usage.js';

const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON');
const stamp=new Date().toISOString(),month=stamp.slice(0,7);
const addUser=(id:string,role='user')=>sql.prepare('INSERT INTO users(id,google_sub,email,role,created_at) VALUES(?,?,?,?,?)').run(id,id,id+'@example.invalid',role,stamp);
for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort()){
 if(name==='0039_stripe_billing.sql')addUser('before-billing');
 if(name==='0056_free_connect_10000.sql'){
  addUser('after-billing');addUser('historical-higher');addUser('historical-lower');addUser('operator','admin');
  sql.prepare('INSERT INTO arc_connect_legacy_allowances VALUES(?,?)').run('historical-higher',15000);
  sql.prepare('INSERT INTO arc_connect_legacy_allowances VALUES(?,?)').run('historical-lower',500);
  sql.prepare('INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,?,?)').run('after-billing',month,285,stamp);
 }
 sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
}
const db={prepare(query:string){const stmt=sql.prepare(query),bind=(args:any[])=>({async first(){return stmt.get(...args)||null;},async all(){return{results:stmt.all(...args)};},async run(){return{success:true,meta:{changes:Number(stmt.run(...args).changes)}};}});return{...bind([]),bind(...args:any[]){return bind(args);}};}} as unknown as D1Database;
const env={DB:db,ARC_PLATFORM_ENABLED:'1'};
const oldVersion=sql.prepare("SELECT config_json FROM arc_commercial_versions WHERE id='seed:live:free'").get()!;
assert.equal(JSON.parse(oldVersion.config_json as string).connectToolCalls,500,'historical versions remain immutable');
for(const mode of ['live','test']){
 const catalog=await commercialCatalog({...env,...(mode==='test'?{STRIPE_SECRET_KEY:'sk_test_fixture'}:{})});
 assert.equal(catalog.plans.find(plan=>plan.id==='free')!.connectToolCalls,10000,mode+' public catalog');
 assert.equal(catalog.plans.find(plan=>plan.id==='free')!.revision,2);
 assert.equal(catalog.plans.find(plan=>plan.id==='arc-plus-v1')!.connectToolCalls,null);
 assert.equal(catalog.plans.find(plan=>plan.id==='arc-pro-v1')!.connectToolCalls,null);
}
assert.equal(ARC_PLANS[0].connectToolCalls,10000,'preview/bootstrap defaults match production');
const capacity=await currentArcPlan(env,'after-billing');
assert.deepEqual([capacity.maxSteps,capacity.maxTokens,capacity.maxSeconds],[32,128000,900],'quota correction preserves existing effective execution capacity');
assert.equal((await getMonthlyUsage(env,'before-billing')).limit,10000);
assert.deepEqual(await getMonthlyUsage(env,'after-billing'),{month,used:285,limit:10000,remaining:9715,unlimited:false},'existing usage is preserved while remaining quota increases');
assert.equal((await getMonthlyUsage(env,'historical-lower')).limit,10000,'old snapshots cannot lower the current Free allowance');
assert.equal((await getMonthlyUsage(env,'historical-higher')).limit,15000,'higher historical grants remain available');
assert.equal((await getMonthlyUsage(env,'operator')).unlimited,true);
addUser('new-after-hotfix');
assert.equal((await getMonthlyUsage(env,'new-after-hotfix')).limit,10000,'new registrations receive the same allowance');
sql.prepare('UPDATE user_monthly_usage SET tool_calls=500 WHERE user_id=?').run('after-billing');
assert.equal((await consumeToolCall(env,'after-billing')).used,501,'calls continue past the incorrect 500 limit');
sql.prepare('UPDATE user_monthly_usage SET tool_calls=9999 WHERE user_id=?').run('after-billing');
assert.equal((await consumeToolCall(env,'after-billing')).used,10000);
await assert.rejects(()=>consumeToolCall(env,'after-billing'),/Monthly Remote Arc tool-call limit reached/);
assert.equal((await getMonthlyUsage(env,'after-billing')).used,10000,'blocked call does not increment usage');
sql.prepare('UPDATE user_monthly_usage SET month_key=? WHERE user_id=?').run('2000-01','after-billing');
assert.equal((await getMonthlyUsage(env,'after-billing')).remaining,10000,'a new month starts with a fresh allowance');
assert.equal((await consumeToolCall(env,'after-billing')).used,1);
assert.equal(sql.prepare("SELECT COUNT(*) n FROM arc_commercial_audit WHERE id LIKE 'migration:0056:%'").get()!.n,2,'both modes have an auditable correction');
sql.close();
console.log('PASS: all Free accounts receive 10000 monthly calls, preserved usage/capacity/history, call 501, 10000 boundary and monthly reset');
