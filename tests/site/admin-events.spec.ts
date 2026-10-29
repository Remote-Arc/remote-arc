import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
const stamp='2026-10-27T12:00:00.000Z';
function flow(id:string,keys:string[],counts:number[]) {
 const total=counts[0]!,completed=counts.at(-1)!;
 return {id,total,completed,rate:total?completed/total:null,pending:1,failed:2,unfinished:total-completed-1,incompleteEvidence:0,steps:keys.map((key,index)=>({key,count:counts[index]!,rate:total?counts[index]!/total:null,previousRate:index&&counts[index-1]?counts[index]!/counts[index-1]!:null,dropoff:index?counts[index-1]!-counts[index]!:0}))};
}
const scenes=[flow('login',['started','verification','verified','completed'],[40,35,30,28]),flow('devices',['started','approved','online'],[20,15,12]),{...flow('payment',['entered','ordered','paid','fulfilled'],[36,18,12,9]),orders:{total:20,ready:18,paid:13,fulfilled:10,pending:2,refunded:0,unattributed:2}},{...flow('tasks',['started','succeeded'],[10,6]),cancelled:1,unknown:1}];
const summary={newUsers:17,activeUsers:72,payingUsers:9,paidCents:35100,newPaired:8,newUsed:6,newPaid:3};
const cohorts=Array.from({length:12},(_,index)=>({day:new Date(Date.parse(stamp)-(index+3)*86400000).toISOString().slice(0,10),users:12,cells:[{day:1,status:'ready',eligible:12,returned:6,rate:.5},{day:7,status:index<4?'observing':'ready',eligible:index<4?0:12,returned:index<4?0:3,rate:index<4?null:.25},{day:30,status:'not_collected',eligible:0,returned:0,rate:null}]}));
const data={checkedAt:stamp,days:7,from:'2026-10-21T00:00:00.000Z',to:stamp,timezone:'UTC',previousFrom:'2026-10-14T00:00:00.000Z',previousTo:'2026-10-20T12:00:00.000Z',summary,scenes,loginMethods:[flow('email_login',['started','delivered','verification','verified','completed'],[30,29,26,24,22]),flow('google_login',['started','callback','verified','completed'],[10,8,6,6])],previous:{summary:{...summary,newUsers:10,payingUsers:6},scenes:scenes.map(scene=>({...scene,rate:.5})),loginMethods:[]},trend:Array.from({length:7},(_,index)=>({day:'2026-10-'+(index+21),newUsers:[1,3,2,0,5,4,2][index],activeUsers:[18,24,22,19,34,31,28][index],payingUsers:index%3})),retention:[{day:1,status:'ready',eligible:20,returned:8,rate:.4},{day:7,status:'ready',eligible:10,returned:3,rate:.3},{day:30,status:'not_collected',eligible:0,returned:0,rate:null}],cohorts,coverage:{flowSince:'2026-10-20T12:00:00.000Z',activityCompleteFrom:'2026-10-21T00:00:00.000Z',oldestEvent:'2026-10-20T12:00:00.000Z',recordedEvents:309,includesInternalAccounts:true}};
async function mount(page:Page,{fail=false,payload=data}:{fail?:boolean;payload?:typeof data}={}){
 await page.route(/\/api\/admin\/analytics(?:\?|$)/,route=>route.fulfill(fail?{status:503,json:{error:'business_analytics_unavailable'}}:{json:payload}));
 await page.addInitScript(()=>{(window as Window&{eventsTestFetch?:typeof fetch}).eventsTestFetch=window.fetch.bind(window);});
 await page.goto('/admin-preview');await expect(page.locator('.adminShell')).toBeVisible();
 await page.addScriptTag({type:'module',url:'/scripts/admin-events-browser-fixture.tsx'});
 return page.locator('#events-browser-fixture');
}

test('Business overview shows response-backed acquisition, conversion and retention rather than event logs',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.locator('.businessKpis article')).toHaveCount(6);
 await expect(panel.locator('.businessKpis article').nth(0)).toContainText('17');
 await expect(panel.locator('.businessKpis article').nth(1)).toContainText('72');
 await expect(panel.locator('.businessKpis article').nth(3)).toContainText('25%');
 await expect(panel.locator('.businessKpis article').nth(5)).toContainText('30%');
 await expect(panel.getByRole('tab')).toHaveCount(4);
 await expect(panel.getByRole('tabpanel')).toContainText('70%');
 await expect(panel.getByRole('tabpanel')).toContainText('28 / 40');
 await expect(panel.locator('.businessFunnelSteps article')).toHaveCount(4);
 await expect(panel.getByRole('tabpanel')).toContainText(zh?'主要流失环节':'Largest drop-off');
 await expect(panel.locator('.eventActivityTable,.eventFollowupList,.eventTechnical')).toHaveCount(0);
 await expect(panel).not.toContainText('REQUEST_FAILED');await expect(panel).not.toContainText('技术同事');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('business-overview.png'),fullPage:true});
});

test('Scene selection shows the matching denominators, payment order rate and sign-in channel',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await panel.getByRole('tab',{name:zh?/连接设备/:/Connect a device/}).click();
 await expect(panel.locator('.businessFunnelSteps article')).toHaveCount(3);await expect(panel.getByRole('tabpanel')).toContainText('12 / 20');
 await panel.getByRole('tab',{name:zh?/支付购买/:/Purchase/}).click();
 await expect(panel.getByRole('tabpanel')).toContainText('9 / 36');
 await expect(panel.locator('.businessOrderMetrics')).toContainText('50%');await expect(panel.locator('.businessOrderMetrics')).toContainText('10 / 20');
 await panel.getByRole('tab',{name:zh?/登录/:/Sign-in/}).click();
 await panel.getByLabel(zh?'登录方式':'Sign-in method').selectOption('email_login');
 await expect(panel.locator('.businessFunnelSteps article')).toHaveCount(5);await expect(panel.getByRole('tabpanel')).toContainText('22 / 30');
 await panel.getByRole('tab',{name:zh?/任务执行/:/Run a task/}).click();await expect(panel.getByRole('tabpanel')).toContainText('6 / 10');
 await expect(panel.getByRole('tabpanel')).toContainText(zh?'结果待确认':'unknown');
});

test('Range and refresh fetch current business data; growth values remain inspectable',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 const changed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/analytics'&&new URL(response.url()).searchParams.get('days')==='30');
 await panel.getByRole('button',{name:zh?'近 30 天':'Last 30 days',exact:true}).click();await changed;
 await panel.locator('.businessGrowth summary').click();await expect(panel.locator('.businessGrowth tbody tr')).toHaveCount(7);
 await panel.getByLabel(zh?'趋势指标':'Trend metric').selectOption('payingUsers');
 await expect(panel.locator('.businessLegend')).toContainText(zh?'已确认付费用户':'Verified paying users');
 const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/admin/analytics');
 await panel.getByRole('button',{name:zh?'刷新':'Refresh',exact:true}).click();await refreshed;
});

test('Retention shows observation and collection gaps, exact denominators and bounded cohorts',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.locator('.businessRetentionSummary')).toContainText('40%');
 await expect(panel.locator('.businessRetentionSummary')).toContainText(zh?'尚未采集':'Not collected');
 await expect(panel.locator('.businessCohorts tbody tr')).toHaveCount(7);
 await expect(panel.locator('.businessCohorts')).toContainText(zh?'观察中':'Still observing');
 await panel.getByRole('button',{name:zh?'较早批次':'Older',exact:true}).click();await expect(panel.locator('.businessCohorts tbody tr')).toHaveCount(5);
 await panel.getByRole('button',{name:zh?'较新批次':'Newer',exact:true}).click();await expect(panel.locator('.businessCohorts tbody tr')).toHaveCount(7);
});

test('A business-data outage never turns into zero users or an invented success rate',async({page},testInfo)=>{
 const panel=await mount(page,{fail:true}),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.getByRole('alert')).toContainText(zh?'不代表用户数或成功率为零':'not zero users');
 for(const card of await panel.locator('.businessKpis article').all())await expect(card.locator('strong')).toHaveText('—');
 await expect(panel.locator('.businessSceneTabs strong')).toHaveText(['—','—','—','—']);
 await expect(panel.locator('.businessGrowth table')).toHaveCount(0);
});

test('Production-style preview does not generate example business figures',async({page},testInfo)=>{
 const zh=testInfo.project.metadata.language==='zh';await page.goto('/admin-preview?section=events');
 await expect(page.locator('.businessDataStatus')).toContainText(zh?'不填充示例经营数据':'no invented figures');
 await expect(page.locator('.businessKpis strong')).toHaveText(['—','—','—','—','—','—']);
});
