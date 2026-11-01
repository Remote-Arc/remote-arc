import {test,expect} from './fixtures';

const contacts=(page:import('@playwright/test').Page)=>page.locator('.followupCrmFull .followupCrmTable tbody tr');
async function open(page:import('@playwright/test').Page){await page.goto('/admin-preview?section=followups');await expect(contacts(page)).toHaveCount(6);}
async function compose(page:import('@playwright/test').Page,names=['Alex Chen','Taylor']){
 for(const name of names)await page.getByRole('checkbox',{name:new RegExp('^(Select |选择 )'+name+'$')}).check();
 await page.getByRole('button',{name:/^(Bulk email|群发邮件)/}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('combobox',{name:/Bulk contact basis|群发联系依据/})).toHaveValue('');
 await dialog.getByRole('textbox',{name:/Bulk subject|群发主题/}).fill('A next step for {{name}}');
 await dialog.getByRole('textbox',{name:/Bulk message|群发正文/}).fill('Hello {{name}},\n\nHere is your setup guide: {{setupUrl}}\nSend us your update: {{feedbackUrl}}');
 return dialog;
}

test('SendPulse limits show hourly and monthly capacity before queuing',async({page})=>{
 await open(page);
 await page.evaluate(()=>{
  const fetch=window.fetch;
  window.fetch=async(...args)=>{
   const response=await fetch(...args),input=args[0];
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
   if(!url.pathname.startsWith('/api/admin/followups'))return response;
   const value=await response.clone().json();
   if(!value.emailBudget)return response;
   value.emailBudget={provider:'sendpulse',limit:400,used:399,remaining:0,hourly:{limit:50,used:50,remaining:0},monthly:{limit:12000,used:11999,remaining:1,windowDays:31},otpUsage:{daily:80,hourly:20,monthly:1400}};
   return Response.json(value,{status:response.status});
  };
 });
 await page.getByRole('button',{name:/Refresh users|刷新用户/}).click();
 await expect(page.locator('.followupBudget')).toContainText('SendPulse · 24h 399/400 · 1h 50/50 · 31d 11999/12000');
 await expect(page.locator('.followupBudget')).toContainText(/Available now 0|当前可发 0/);
 await expect(page.locator('.followupBudget')).toContainText('OTP 24h 80');
 const dialog=await compose(page);await dialog.getByRole('button',{name:/Review recipients & emails|检查用户与邮件/}).click();
 await expect(dialog.locator('.followupBudgetNote')).toContainText(/0 of these can go out now|当前还能发 0 封/);
 await expect(dialog.getByRole('button',{name:/Confirm & send 2 emails|确认群发 2 封邮件/})).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('CRM tabs expose real counts and bulk status changes move users between views',async({page})=>{
 await open(page);await expect(page.getByRole('tab')).toHaveCount(6);
 await page.getByRole('tab',{name:/^(Waiting for reply|等待回复)/}).click();await expect(contacts(page)).toHaveCount(2);await expect(page.getByRole('button',{name:/Alex Chen/})).toHaveCount(0);
 await page.getByRole('tab',{name:/^(All users|全部用户)/}).click();await page.getByRole('checkbox',{name:/^(Select |选择 )Alex Chen$/}).check();
 await page.getByRole('combobox',{name:/Set follow-up status|设置跟进状态/}).selectOption('resolved');await page.getByRole('button',{name:/^(Apply|更新状态)$/}).click();
 await expect(page.getByRole('status').filter({hasText:/Contact status updated|跟进状态已更新/})).toBeVisible();
 await page.getByRole('tab',{name:/^(Resolved|已完成)/}).click();await expect(contacts(page)).toHaveCount(2);await expect(page.getByRole('button',{name:/Alex Chen/})).toBeVisible();
 await page.getByRole('tab',{name:/^(To follow up|待跟进)/}).click();await expect(contacts(page)).toHaveCount(1);await expect(page.getByRole('button',{name:/Jordan Park/})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Bulk review personalizes each recipient and background results survive page reload',async({page})=>{
 await open(page);const dialog=await compose(page);
 await dialog.getByRole('button',{name:/Review recipients & emails|检查用户与邮件/}).click();
 await expect(dialog.getByRole('combobox',{name:/Preview recipient|预览收件人/})).toBeVisible();
 await expect(dialog.getByText('Remote Arc <support@remotearc.app>',{exact:true})).toBeVisible();
 const preview=dialog.locator('iframe').contentFrame();await expect(preview.getByText('Hello Alex Chen,',{exact:false})).toBeVisible();
 await dialog.getByRole('combobox',{name:/Preview recipient|预览收件人/}).selectOption('preview-followup-active');await expect(preview.getByText('Hello Taylor,',{exact:false})).toBeVisible();
 await expect(dialog.getByRole('button',{name:/^(Confirm & send 2 emails|确认群发 2 封邮件)$/})).toBeEnabled();
 await dialog.getByRole('button',{name:/^(Confirm & send 2 emails|确认群发 2 封邮件)$/}).click();await expect(dialog).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:/^(Bulk history|群发记录)$/}).click();await page.locator('.followupBatchCard').first().click();
 await expect(page.locator('.followupBatchDetailHeader .followupStatus')).toContainText(/Completed|已完成/,{timeout:12000});
 await expect(page.locator('.followupBatchHistory tbody tr')).toHaveCount(2);
 await expect(page.locator('.followupBatchHistory tbody')).toContainText('A next step for Alex Chen');await expect(page.locator('.followupBatchHistory tbody')).toContainText('A next step for Taylor');
 for(const id of ['preview-followup-user','preview-followup-active'])expect(await page.evaluate(async id=>{const value=await(await fetch('/api/admin/followups/'+id)).json();return value.contact.consent_at;},id)).toBeNull();
});

test('Bulk preview explains excluded users and preserves content when returning to editing',async({page})=>{
 await open(page);const dialog=await compose(page,['Alex Chen','Sam']);await dialog.getByRole('button',{name:/Review recipients & emails|检查用户与邮件/}).click();
 await dialog.locator('.followupExcluded summary').click();await expect(dialog.locator('.followupExcluded')).toContainText(/Sam/);await expect(dialog.locator('.followupExcluded')).toContainText(/Follow-ups stopped|已停止接收/);
 await expect(dialog.getByRole('combobox',{name:/Preview recipient|预览收件人/}).locator('option')).toHaveCount(1);
 await expect(dialog.getByRole('button',{name:/^(Confirm & send 1 emails?|确认群发 1 封邮件)$/})).toBeEnabled();
 await dialog.getByRole('button',{name:/Back to editing|返回编辑/}).click();await expect(dialog.getByRole('textbox',{name:/Bulk subject|群发主题/})).toHaveValue('A next step for {{name}}');
 await expect(dialog.getByRole('textbox',{name:/Bulk message|群发正文/})).toHaveValue('Hello {{name}},\n\nHere is your setup guide: {{setupUrl}}\nSend us your update: {{feedbackUrl}}');
});

test('Cancelling a queued bulk follow-up stops the remaining messages',async({page})=>{
 await open(page);await page.clock.install();const dialog=await compose(page,['Alex Chen']);await dialog.getByRole('button',{name:/Review recipients & emails|检查用户与邮件/}).click();
 await dialog.getByRole('button',{name:/^(Confirm & send 1 emails?|确认群发 1 封邮件)$/}).click();
 await page.getByRole('button',{name:/Cancel remaining|取消尚未发送的邮件/}).click();await expect(page.locator('.followupBatchDetailHeader .followupStatus')).toContainText(/Cancelled|已取消/);
 await page.clock.runFor(10000);await expect(page.locator('.followupBatchHistory tbody')).toContainText(/Cancelled|已取消/);
 await expect(page.locator('.followupBatchReviewStats>div').first()).toContainText('0');
});

test('Prepared bulk drafts reopen from history with individual previews and updated CRM status',async({page})=>{
 await open(page);const dialog=await compose(page);await dialog.getByRole('button',{name:/Review recipients & emails|检查用户与邮件/}).click();await expect(dialog.getByRole('combobox',{name:/Preview recipient|预览收件人/})).toBeVisible();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/^(Bulk history|群发记录)$/}).click();await page.locator('.followupBatchCard').first().click();
 await page.locator('.followupBatchSavedPreview summary').click();await page.locator('.followupBatchSavedPreview select').selectOption('preview-followup-active');
 await expect(page.locator('.followupBatchSavedPreview iframe').contentFrame().getByText('Hello Taylor,',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:/^(Confirm & send 2 emails|确认群发 2 封邮件)$/}).click();await expect(page.locator('.followupBatchDetailHeader .followupStatus')).toContainText(/Completed|已完成/,{timeout:12000});
 await page.getByRole('button',{name:/^(User list|用户列表)$/}).click();const row=contacts(page).filter({hasText:'alex@example.invalid'});await expect(row).toContainText(/Contacted|已跟进/);await expect(row).not.toContainText(/Bulk email queued|群发邮件已排队/);
});

test('Changing a bulk template preserves edited text until an explicit replacement',async({page})=>{
 await open(page);const dialog=await compose(page,['Alex Chen']);const subject=dialog.getByRole('textbox',{name:/Bulk subject|群发主题/});const template=dialog.getByRole('combobox',{name:/Bulk template|群发模板/});
 await template.selectOption('finish-mcp');await expect(dialog.locator('.followupTemplateChange')).toBeVisible();await expect(subject).toHaveValue('A next step for {{name}}');
 await dialog.getByRole('button',{name:/Keep current text|保留当前内容/}).click();await expect(template).toHaveValue('experience');
 await template.selectOption('finish-mcp');await dialog.getByRole('button',{name:/Use new template|使用新模板/}).click();await expect(template).toHaveValue('finish-mcp');await expect(subject).not.toHaveValue('A next step for {{name}}');
});

test('Funnel shows where users stop and filters to them with the matching template',async({page})=>{
 await open(page);
 const funnel=page.getByRole('list',{name:/Activation funnel|激活漏斗/});
 await expect(funnel.locator('li')).toHaveCount(4);
 await expect(funnel.locator('li').nth(0).locator('strong')).toHaveText('6');
 await expect(funnel.locator('li').nth(1).locator('strong')).toHaveText('5');
 await expect(page.locator('.followupBudget')).toContainText(/\/60/);
 await funnel.getByRole('button',{name:/Stuck before this|卡在这一步/}).nth(1).click();
 await expect(contacts(page)).toHaveCount(1);
 await expect(contacts(page).first()).toContainText(/Alex Chen/);
 await expect(contacts(page).first()).toContainText(/Next: Connect an AI client|下一步：连接 AI 客户端/);
 await page.getByRole('checkbox',{name:/^(Select |选择 )Alex Chen$/}).check();
 await page.getByRole('button',{name:/^(Bulk email|群发邮件)/}).click();
 await expect(page.getByRole('dialog').getByRole('combobox',{name:/Bulk template|群发模板/})).toHaveValue('finish-mcp');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
