import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
import {monitoringPreview} from '../../apps/ui/src/features/admin/service-health-preview';
async function mount(page:Page,fail=false){
 const requests:string[]=[];
 await page.route(/\/api\/admin\/monitoring(?:\?|$)/,async route=>{requests.push(route.request().url());const url=new URL(route.request().url());if(fail)return route.fulfill({status:503,json:{error:'observability_unavailable'}});if(url.searchParams.has('catalog'))return route.fulfill({json:{catalog:monitoringPreview().groups.map(g=>g.definition)}});const data=monitoringPreview(Boolean(url.searchParams.get('code')),url.searchParams);if(url.searchParams.get('category')){data.groups=data.groups.filter(g=>g.category===url.searchParams.get('category'));data.facets=data.facets.filter(g=>g.category===url.searchParams.get('category'));}await route.fulfill({json:data});});
 await page.addInitScript(()=>{(window as Window&{healthTestFetch?:typeof fetch}).healthTestFetch=window.fetch.bind(window);});
 await page.goto('/admin-preview');await expect(page.locator('.adminShell')).toBeVisible();await page.addScriptTag({type:'module',url:'/scripts/service-health-browser-fixture.tsx'});
 const panel=page.locator('#health-browser-fixture');await expect(panel.locator('.healthMetrics strong').first()).toHaveText(fail?'—':'27');return{panel,requests};
}
test('Health groups failures and exposes meaning, users, requests and stage only on demand',async({page},testInfo)=>{
 const {panel,requests}=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await expect(panel.locator('.healthIssue')).toHaveCount(4);await expect(panel.locator('.healthEvent')).toHaveCount(0);
 await expect(panel.locator('.healthStatusStrip')).toContainText(zh?'可访问':'Reachable');
 const card=panel.locator('.healthIssue').filter({hasText:'BILLING_INVALID_PLAN_CHANGE'});await card.locator('.healthIssueSummary').click();
 await expect(card.locator('.healthEvent')).toContainText('Alex Morgan');await expect(card.locator('.healthEvent')).toContainText('alex@example.invalid');await expect(card.locator('.healthEvent')).toContainText('11111111-1111-4111-8111-111111111111');await expect(card.locator('.healthEvent')).toContainText('HTTP 409');await expect(card.locator('.healthIssueDetail')).toContainText(zh?'首次购买':'First-time purchases');
 expect(requests.some(url=>new URL(url).searchParams.get('code')==='BILLING_INVALID_PLAN_CHANGE')).toBe(true);
 await expect(panel.locator('.healthIncidentGroup')).toHaveCount(1);await expect(panel.locator('.healthIncidentGroup article')).not.toBeVisible();
 await panel.locator('.healthSection').filter({hasText:zh?'基础设施与告警':'Infrastructure & alert delivery'}).locator('> summary').click();
 await panel.locator('.healthIncidentGroup>summary').click();await expect(panel.locator('.healthIncidentGroup article')).toContainText('503');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('monitoring-details.png'),fullPage:true});
});
test('Filters, manual refresh and searchable reference work without background polling',async({page},testInfo)=>{
 const {panel,requests}=await mount(page),zh=testInfo.project.metadata.language==='zh';
 await panel.getByLabel(zh?'时间范围':'Period',{exact:true}).selectOption('168');await expect.poll(()=>requests.some(url=>new URL(url).searchParams.get('hours')==='168')).toBe(true);
 await panel.locator('.healthCategories button').filter({hasText:zh?'额度与容量':'Usage & capacity'}).click();await expect(panel.locator('.healthIssue')).toHaveCount(1);await expect(panel.locator('.healthIssue')).toContainText('MONTHLY_LIMIT_REACHED');
 const advanced=panel.locator('.healthAdvanced');await advanced.locator('summary').click();await advanced.getByLabel(zh?'用户邮箱':'Account email').fill('alex@example.invalid');await advanced.getByRole('button',{name:zh?'应用':'Apply',exact:true}).click();await expect.poll(()=>requests.some(url=>new URL(url).searchParams.get('email')==='alex@example.invalid')).toBe(true);
 await expect(panel.getByRole('button',{name:zh?'刷新监控':'Refresh monitoring',exact:true})).toBeEnabled();const before=requests.length;await page.clock.install();await page.clock.fastForward(65000);expect(requests.length).toBe(before);
 await panel.getByRole('button',{name:zh?'刷新监控':'Refresh monitoring',exact:true}).click();await expect.poll(()=>requests.length).toBeGreaterThan(before);
 const reference=panel.locator('.healthSection').filter({hasText:zh?'错误码说明':'Error reference'});await reference.locator('>summary').click();await reference.getByRole('textbox').fill('DEVICE_TIMEOUT');await expect(reference.locator('.healthCatalog>details')).toHaveCount(1);await reference.locator('.healthCatalog summary').click();await expect(reference).toContainText(zh?'结果未知':'result is unknown');
});
test('Monitor failures show unavailable, never a fake zero or stale event details',async({page},testInfo)=>{
 const {panel}=await mount(page,true),zh=testInfo.project.metadata.language==='zh';await expect(panel.getByRole('alert')).toContainText(zh?'暂不可用':'unavailable');await expect(panel.locator('.healthIssue')).toHaveCount(0);await expect(panel.locator('.healthMetrics strong')).toHaveText(['—','—','—','—']);
});

test('The actual Admin preview filters fictional errors without reading production data',async({page},testInfo)=>{
 const zh=testInfo.project.metadata.language==='zh',requests:string[]=[];page.on('request',request=>{if(request.url().includes('/api/admin/monitoring'))requests.push(request.url());});
 await page.goto('/admin-preview?section=health');const panel=page.getByRole('region',{name:zh?'服务监控':'Service monitoring',exact:true});await expect(panel.locator('.healthIssue')).toHaveCount(4);
 await page.screenshot({path:testInfo.outputPath('monitoring-overview.png'),fullPage:true});
 await panel.locator('.healthCategories button').filter({hasText:zh?'额度与容量':'Usage & capacity'}).click();await expect(panel.locator('.healthIssue')).toHaveCount(1);await panel.locator('.healthIssueSummary').click();await expect(panel.locator('.healthEvent')).toContainText('mcp.tool.failed');await expect(panel.locator('.healthEvent')).toContainText('HTTP 429');expect(requests).toEqual([]);
});
