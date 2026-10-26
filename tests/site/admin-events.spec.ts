import {test,expect} from './fixtures';

const stamp='2026-10-26T08:00:00.000Z',trace='a148e16f-bd4a-4896-8027-3fd6578fb05a';
const event={id:'bc68cc7a-ed58-4454-9271-e94960229290',occurred_at:stamp,domain:'billing',name:'billing.webhook.failed',source:'stripe',outcome:'failed',user_id:'user_fixture',journey_id:null,trace_id:trace,entity_id:'evt_fixture',error_code:'BILLING_FULFILLMENT_UNAVAILABLE',http_status:503,duration_ms:220};
const data={checkedAt:stamp,summary:{total:7,users:1,failures:1,browser:3},byDomain:[{domain:'billing',total:7,failures:1}],errors:[{name:event.name,error_code:event.error_code,total:1,last_seen:stamp}],events:[event],funnel:[{name:'billing.checkout.viewed',journeys:1}],nextCursor:null};
const readiness={checkedAt:stamp,conclusion:'needs_attention',checks:[{key:'live_keys',state:'pass',detail:'Live secret key required for real purchases'}],verifiedMemberships:{total:1,lastPaidAt:stamp},paidWithoutEntitlements:[],unfinishedCheckouts:[],webhookFailures:[{id:'evt_fixture',status:'failed',error_code:'BILLING_FULFILLMENT_UNAVAILABLE'}],providerPaidUnprocessed:[{checkoutId:'checkout_fixture',userId:'user_fixture',sessionId:'cs_live_fixture'}],reconciliationChecked:1,reconciliationUnavailable:0};

test('Admin events diagnose failures, filter a user and trace, and expose paid-but-unprocessed evidence',async({page},testInfo)=>{
 await page.route(/\/api\/admin\/events(?:\/readiness)?(?:\?|$)/,route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/readiness')?readiness:data}));
 await page.addInitScript(()=>{(window as Window&{eventsTestFetch?:typeof fetch}).eventsTestFetch=window.fetch.bind(window);});
 await page.goto('/admin-preview');await expect(page.locator('.adminShell')).toBeVisible();
 await page.addScriptTag({type:'module',url:'/scripts/admin-events-browser-fixture.tsx'});
 const panel=page.locator('#events-browser-fixture');
 await expect(panel.locator('.eventTableScroll tbody tr')).toHaveCount(1);
 await expect(panel.locator('.eventTableScroll')).toContainText('stripe · failed');
 await expect(panel.locator('.eventTableScroll')).toContainText('BILLING_FULFILLMENT_UNAVAILABLE');
 const userResponse=page.waitForResponse(r=>new URL(r.url()).searchParams.get('userId')==='user_fixture');
 await panel.locator('td').getByRole('button',{name:'user_fixture',exact:true}).click();await userResponse;
 const traceResponse=page.waitForResponse(r=>new URL(r.url()).searchParams.get('trace')===trace);
 await panel.getByRole('button',{name:trace,exact:true}).click();await traceResponse;
 await panel.getByRole('button',{name:/Check production payments|检查线上支付/}).click();
 await expect(panel).toContainText(/Stripe paid, local processing incomplete|Stripe 已收款，本地处理未完成/);
 await expect(panel).toContainText('cs_live_fixture');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('admin-events.png'),fullPage:true});
});

test('Admin events show a failed load without reporting empty success metrics',async({page})=>{
 await page.route(/\/api\/admin\/events(?:\/readiness)?(?:\?|$)/,route=>route.fulfill({status:503,json:{error:'observability_unavailable'}}));
 await page.addInitScript(()=>{(window as Window&{eventsTestFetch?:typeof fetch}).eventsTestFetch=window.fetch.bind(window);});
 await page.goto('/admin-preview');await expect(page.locator('.adminShell')).toBeVisible();
 await page.addScriptTag({type:'module',url:'/scripts/admin-events-browser-fixture.tsx'});
 const panel=page.locator('#events-browser-fixture');
 await expect(panel.getByRole('alert')).toContainText(/Events could not load|无法读取事件/);
 await expect(panel.locator('.eventTableScroll')).toHaveCount(0);
});
