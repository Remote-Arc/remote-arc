import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

const stamp='2026-10-27T02:30:00.000Z',trace='a148e16f-bd4a-4896-8027-3fd6578fb05a';
const activity={id:'bc68cc7a-ed58-4454-9271-e94960229290',occurred_at:stamp,domain:'billing',name:'billing.webhook.failed',source:'stripe',outcome:'failed',user_id:'user_fixture',journey_id:null,trace_id:trace,entity_id:'evt_fixture',error_code:'BILLING_FULFILLMENT_UNAVAILABLE',http_status:503,duration_ms:220};
const events=Array.from({length:100},(_,index)=>({...activity,id:'record-'+index,occurred_at:new Date(Date.parse(stamp)-index*60000).toISOString(),...(index%3===1?{domain:'tasks',name:'task.request',source:'server',outcome:'accepted',error_code:null}:index%3===2?{domain:'devices',name:'device.token.requested',source:'server',outcome:'waiting',error_code:'authorization_pending'}:{})}));
const data={checkedAt:stamp,summary:{total:309,users:12,affectedUsers:3,failures:223,browser:47},accounts:[{id:'user_fixture',email:'mia@example.invalid'}],byDomain:[{domain:'billing',total:7,failures:1}],errors:[{name:activity.name,error_code:activity.error_code,total:1,users:1,last_seen:stamp},{name:'device.token.requested',error_code:'REQUEST_FAILED',total:219,users:0,last_seen:stamp},{name:'auth.email.verify_requested',error_code:'unauthorized',total:3,users:2,last_seen:stamp}],events,funnel:[{name:'billing.checkout.viewed',journeys:24},{name:'billing.checkout.continued',journeys:18},{name:'billing.checkout.created',journeys:16},{name:'billing.payment.mounted',journeys:15},{name:'billing.payment.completed_client',journeys:12},{name:'billing.purchase.completed',journeys:11}],nextCursor:stamp+'|'+activity.id};
const readiness={checkedAt:stamp,conclusion:'needs_attention',checks:[{key:'live_keys',state:'pass',detail:'Live secret key required for real purchases'},{key:'charges_enabled',state:'pass',detail:'Stripe account can accept charges'},{key:'webhook_endpoint',state:'pass',detail:'Callback is connected'}],accounts:data.accounts,verifiedMemberships:{total:14,lastPaidAt:stamp},paidWithoutEntitlements:[],unfinishedCheckouts:[],webhookFailures:[{id:'evt_fixture',status:'failed',error_code:'BILLING_FULFILLMENT_UNAVAILABLE'}],providerPaidUnprocessed:[{checkoutId:'checkout_fixture',userId:'user_fixture',sessionId:'cs_live_fixture'}],reconciliationChecked:3,reconciliationUnavailable:0};
async function mount(page:Page,{eventsFail=false,paymentFail=false}={}){
 await page.route(/\/api\/admin\/events(?:\/readiness)?(?:\?|$)/,route=>{
  const payment=new URL(route.request().url()).pathname.endsWith('/readiness');
  return route.fulfill((payment?paymentFail:eventsFail)?{status:503,json:{error:'observability_unavailable'}}:{json:payment?readiness:data});
 });
 await page.addInitScript(()=>{(window as Window&{eventsTestFetch?:typeof fetch}).eventsTestFetch=window.fetch.bind(window);});
 await page.goto('/admin-preview');await expect(page.locator('.adminShell')).toBeVisible();
 await page.addScriptTag({type:'module',url:'/scripts/admin-events-browser-fixture.tsx'});
 return page.locator('#events-browser-fixture');
}

test('Operations shows grouped follow-ups and bounded plain-language activity; payment evidence opens on demand',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.locator('.eventActivityTable tbody tr')).toHaveCount(8);
 await expect(panel.locator('.eventFollowupList article')).toHaveCount(4);
 await expect(panel).toContainText('mia@example.invalid');
 await expect(panel.locator('.eventFollowups')).toContainText('219');
 await expect(panel.getByText('BILLING_FULFILLMENT_UNAVAILABLE',{exact:true})).toHaveCount(0);
 await expect(panel.getByText(trace,{exact:true})).toHaveCount(0);
 await expect(panel.locator('.eventActivityTable')).toContainText(zh?'请求已接收':'Request received');
 await expect(panel.locator('.eventActivityTable')).toContainText(zh?'等待确认':'Waiting for confirmation');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('operator-overview.png'),fullPage:true});
 await panel.locator('.eventFollowupList').getByRole('button',{name:zh?'查看原因与下一步':'See what happened'}).first().click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('heading',{level:2})).toHaveText(zh?'已收款，订单尚未完成处理':'Payment received; order processing incomplete');
 await expect(dialog.getByText('cs_live_fixture',{exact:true})).not.toBeVisible();
 await dialog.locator('.eventTechnical summary').click();await expect(dialog.getByText('cs_live_fixture',{exact:true})).toBeVisible();
 const userResponse=page.waitForResponse(response=>new URL(response.url()).searchParams.get('userId')==='user_fixture');
 await dialog.getByRole('button',{name:zh?'查看这个用户的操作':'View this user’s activity'}).click();await userResponse;await expect(dialog).toHaveCount(0);
 await expect(panel.locator('.eventActivityTable tbody tr')).toHaveCount(8);
 const trigger=panel.locator('.eventActivityTable tbody tr').first().getByRole('button');await trigger.click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(trigger).toBeFocused();
});

test('Activity details retain technical trace filters without showing codes in the default table',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.locator('.eventActivityTable tbody tr')).toHaveCount(8);
 await panel.locator('.eventActivityTable tbody tr').first().getByRole('button').click();
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText(zh?'建议下一步':'What to do next');
 await expect(dialog.getByText('BILLING_FULFILLMENT_UNAVAILABLE',{exact:true})).not.toBeVisible();
 await dialog.locator('.eventTechnical summary').click();await expect(dialog.getByText('BILLING_FULFILLMENT_UNAVAILABLE',{exact:true})).toBeVisible();
 const response=page.waitForResponse(value=>new URL(value.url()).searchParams.get('trace')===trace);
 await dialog.getByRole('button',{name:zh?'查看同次操作':'See related steps'}).click();await response;
 await expect(dialog).toHaveCount(0);
});

test('Operations paginates locally and accepts an email search',async({page},testInfo)=>{
 const panel=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.locator('.eventActivityTable tbody tr')).toHaveCount(8);
 await panel.locator('.eventActivityPager').getByRole('button',{name:zh?'下一页':'Next',exact:true}).click();
 await expect(panel.locator('.eventActivityTable tbody tr').first().locator('time')).toHaveAttribute('datetime',events[8]!.occurred_at);
 await expect(panel.locator('.eventActivityTable tbody tr')).toHaveCount(8);
 await panel.getByRole('textbox',{name:zh?'用户邮箱或账号编号':'User email or account ID'}).fill('mia@example.invalid');
 const response=page.waitForResponse(value=>new URL(value.url()).searchParams.get('email')==='mia@example.invalid');
 await panel.getByRole('button',{name:zh?'查找':'Search',exact:true}).click();await response;
 await expect(panel.locator('.eventActivityTable tbody tr').first().locator('time')).toHaveAttribute('datetime',events[0]!.occurred_at);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('A failed activity load never reports zero accounts or a clean overall result',async({page})=>{
 const panel=await mount(page,{eventsFail:true,paymentFail:true});
 await expect(panel.getByRole('alert').first()).toBeVisible();
 await expect(panel.locator('.eventActivityTable')).toHaveCount(0);
 await expect(panel.locator('.eventOverviewMetrics article').first().locator('strong')).toHaveText('—');
 await expect(panel.locator('.eventQuietState strong')).toContainText(/Some records are unavailable|部分数据暂不可用/);
});

test('An unavailable payment check leaves activity usable and its conclusion unknown',async({page})=>{
 const panel=await mount(page,{paymentFail:true});
 await expect(panel.locator('.eventPaymentPanel').getByRole('alert')).toBeVisible();
 await expect(panel.locator('.eventActivityTable tbody tr')).toHaveCount(8);
 await expect(panel.locator('.eventOverviewMetrics article').last().locator('strong')).toHaveText(/Unavailable|暂无法判断/);
 await expect(panel.locator('.eventPaymentVerdict')).toHaveCount(0);
});
