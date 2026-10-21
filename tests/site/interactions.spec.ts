import {test,expect} from './fixtures';

test('Changing Admin language preserves the email being edited',async({page})=>{
 await page.goto('/admin-preview?section=followups');
 await page.getByRole('button',{name:/Alex Chen/}).click();
 const subject=page.getByRole('textbox',{name:/^(Subject|主题)$/});
 const message=page.getByRole('textbox',{name:/^(Message|正文)$/});
 await expect(subject).not.toHaveValue('');
 await subject.fill('Custom support follow-up');
 await message.fill('Keep this carefully edited customer message when the interface language changes.');
 await page.locator('.adminPreferenceRow button').click();
 await expect(subject).toHaveValue('Custom support follow-up');
 await expect(message).toHaveValue('Keep this carefully edited customer message when the interface language changes.');
});

test('App details support keyboard tabs, Escape and returning focus',async({page})=>{
 await page.goto('/dashboard/connect/apps');
 const trigger=page.locator('[data-provider="github"] button').filter({hasText:/Manage|管理连接/});
 await trigger.click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await dialog.getByRole('tab').first().focus();
 await page.keyboard.press('ArrowRight');
 await expect(dialog.getByRole('tab').last()).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
});

test('Public forms require consent and preview cannot submit real requests',async({page},testInfo)=>{
 await page.goto(testInfo.project.metadata.language==='zh'?'/zh/feedback':'/feedback');
 const submit=page.locator('.engagementSubmit');
 await expect(submit).toBeDisabled();
 await page.locator('#lead-email').fill('test@example.invalid');
 await page.locator('#lead-message').fill('A synthetic regression test with no customer data.');
 await page.locator('.engagementConsent input').check();
 await submit.click();
 await expect(page.locator('.engagementError')).toBeVisible();
 await expect(page.locator('.engagementSuccess')).toHaveCount(0);
});

test('The Connect guide exposes an app-only path and optional computer setup',async({page},testInfo)=>{
 await page.goto(testInfo.project.metadata.language==='zh'?'/zh/connect-ai':'/connect-ai');
 await expect(page.locator('#connect-apps')).toContainText(/do not require|无需配对电脑/);
 await expect(page.locator('#connect-apps a')).toHaveAttribute('href','https://agent.remotearc.app/dashboard/connect/apps');
 await expect(page.locator('#connect-computer h2')).toHaveText(/Optional|可选/);
 await expect(page.locator('#connect-scopes')).toContainText('apps:read');
 await expect(page.locator('#connect-scopes')).toContainText('apps:write');
});

test('App loading errors keep existing accounts and allow recovery',async({page})=>{
 await page.goto('/dashboard/connect/apps');
 await expect(page.locator('[data-provider="github"]')).toBeVisible();
 await page.evaluate(()=>{
  const native=window.fetch;let failed=false;
  window.fetch=(input,init)=>{
   if(!failed&&new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname==='/api/apps'){
    failed=true;return Promise.resolve(Response.json({error:'app_service_unavailable'},{status:503}));
   }
   return native(input,init);
  };
 });
 await page.locator('.appsManagerRefresh').click();
 await expect(page.locator('.appsManagerError')).toBeVisible();
 await expect(page.locator('[data-provider="github"]')).toBeVisible();
 await page.locator('.appsManagerRefresh').click();
 await expect(page.locator('.appsManagerError')).toHaveCount(0);
});

test('Arc completes a simulated chat and retains a draft across navigation',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 const input=page.locator('#arc-chat-input');
 await input.fill('Please review this synthetic project.');
 await page.locator('.arcChatSend').click();
 await expect(page.locator('.arcChatMessage.user')).toContainText('Please review this synthetic project.');
 await expect(page.locator('.arcChatMessage.assistant').last()).toContainText(/interactive preview/i,{timeout:15000});
 await input.fill('Keep my unsent draft.');
 if(page.viewportSize()!.width<820){
  await page.getByRole('button',{name:/Open workspace navigation|打开工作空间导航/,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:/^(Tasks|任务)$/}).click();
 }else await page.locator('.arcChatNavigation').getByRole('button',{name:/^(Tasks|任务)$/}).click();
 await expect(page).toHaveURL(/\/dashboard\/agent\/tasks$/);
 await page.goBack();
 await expect(input).toBeVisible();
 await expect(input).toHaveValue('Keep my unsent draft.');
});

test('Arc file attachments upload, can be removed and do not submit a message',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 const messages=await page.locator('.arcChatMessage.user').count();
 await page.locator('input[type=file]').first().setInputFiles({name:'site-test.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic site regression attachment.')});
 const tile=page.locator('.arcUploadTile');
 await expect(tile).toHaveAttribute('data-status','ready');
 await expect(tile).toContainText('site-test.txt');
 await tile.getByRole('button',{name:/Remove attachment|移除附件/}).click();
 await expect(tile).toHaveCount(0);
 await expect(page.locator('.arcChatMessage.user')).toHaveCount(messages);
});

test('Docs search, language-aware links and mobile topic navigation work',async({page},testInfo)=>{
 const prefix=testInfo.project.metadata.language==='zh'?'/zh':'';
 await page.goto(prefix+'/docs');
 await page.getByRole('searchbox').fill('zz-no-such-guide');
 await expect(page.getByRole('status').filter({hasText:/No guides|没有匹配/})).toBeVisible();
 await page.getByRole('searchbox').fill('');
 await page.locator('a[href="'+prefix+'/docs/apps"]').first().click();
 await expect(page).toHaveURL(new RegExp(prefix+'/docs/apps$'));
 if(page.viewportSize()!.width<820){
  await page.locator('.docsPortalToggle').click();
  await expect(page.locator('#docsTopicNavigation')).toBeVisible();
 }
 await expect(page.locator('#docsTopicNavigation a[aria-current=page]')).toContainText(/Apps|应用/);
});

test('Documentation installation links preserve language and offer every client',async({page},testInfo)=>{
 const prefix=testInfo.project.metadata.language==='zh'?'/zh':'';
 await page.goto(prefix+'/docs');
 await page.locator('.docsHubReference').getByRole('link',{name:/Installation guides|安装指南/}).click();
 await expect(page).toHaveURL(new RegExp(prefix+'/connect-ai$'));
 await expect(page.locator('.connectClientCards a')).toHaveCount(3);
});

test('Checkout completes only a local simulated payment and survives refresh',async({page})=>{
 await page.goto('/checkout?plan=arc-plus-v1');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await expect(page.locator('.arcCheckoutChoices button')).toHaveCount(2);
 await page.locator('.arcCheckoutChoices button').last().click();
 await expect(page.locator('.arcCheckoutChoices button').last()).toHaveAttribute('aria-pressed','true');
 await page.locator('.arcCheckoutContinue').click();
 await expect(page.locator('.arcPaymentPreview')).toContainText(/No real payment|不会真实付款/);
 await expect(page.locator('.arcPaymentPreview input').first()).toBeDisabled();
 await page.getByRole('button',{name:/Simulate completed payment|模拟完成付款/}).click();
 await expect(page.locator('.arcCheckoutResult')).toContainText(/Payment confirmed|支付已确认/);
 await page.reload();
 await expect(page.locator('.arcCheckoutResult')).toContainText(/Payment confirmed|支付已确认/);
});

for(const failure of ['HTTP failure','network failure'])test('Failed sign-out keeps the workspace and supports keyboard retry: '+failure,async({page})=>{
 await page.goto('/dashboard/connect/settings');
 await page.evaluate(failure=>{
  const native=window.fetch;
  window.fetch=(input,init)=>new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname==='/auth/logout'
   ?failure==='network failure'?Promise.reject(new TypeError('Failed to fetch')):Promise.resolve(Response.json({error:'temporarily_unavailable'},{status:503})):native(input,init);
 },failure);
 const trigger=page.getByRole('button',{name:/^(Sign out|退出登录)$/}).last();
 await trigger.click();
 const dialog=page.getByRole('dialog',{name:/Could not sign out|暂时无法退出登录/});
 await expect(dialog).toBeVisible();
 await expect(page.locator('.appFrame')).toBeVisible();
 await expect(dialog.getByRole('button',{name:/^(Close|关闭)$/})).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(dialog.getByRole('button',{name:/Got it|知道了/})).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(trigger).toBeFocused();
});
