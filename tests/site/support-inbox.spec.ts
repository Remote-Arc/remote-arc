import {test,expect} from './fixtures';

async function open(page:import('@playwright/test').Page){await page.goto('/admin-preview?section=support');await expect(page.locator('.adminSupportThread')).toHaveCount(4);}
const choose=(page:import('@playwright/test').Page,name:string)=>page.locator('.adminSupportThread').filter({hasText:name}).click();

test('Sources separate authenticated applications from customer email and show both account addresses',async({page},testInfo)=>{
 await open(page);await page.getByRole('combobox',{name:/^Source$|^来源$/}).selectOption('google-beta');await expect(page.locator('.adminSupportThread')).toHaveCount(1);
 await choose(page,'maya@example.invalid');
 await expect(page.locator('.adminSupportAddresses')).toContainText('maya@example.invalid');await expect(page.locator('.adminSupportAddresses')).toContainText('maya.google@example.invalid');
 await expect(page.getByRole('list',{name:/Application workflow|申请处理流程/}).locator('li')).toHaveCount(3);
 await expect(page.locator('.adminSupportProviders')).toHaveText('GmailGoogle CalendarGoogle Drive');
 await expect(page.locator('.adminSupportApplicationRecord')).not.toHaveAttribute('open');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('support-beta-workflow.png'),fullPage:true});
 await page.getByRole('combobox',{name:/^Source$|^来源$/}).selectOption('email');await expect(page.locator('.adminSupportThread')).toHaveCount(3);
 await expect(page.locator('.adminSupportThread').filter({hasText:'maya@example.invalid'})).toHaveCount(0);
});

test('Customer and support mail show direction, From and To; drafts stay with their recipient',async({page},testInfo)=>{
 await open(page);await choose(page,'taylor@example.invalid');await expect(page.locator('.adminSupportMail')).toHaveCount(2);
 const incoming=page.locator('.adminSupportMail.inbound'),outgoing=page.locator('.adminSupportMail.outbound');
 await expect(incoming.locator('.adminSupportMailAddresses>div').first()).toHaveText(/taylor@example.invalid/);
 await expect(outgoing.locator('.adminSupportMailAddresses>div').first()).toHaveText(/support@remotearc.app/);
 await expect(outgoing.locator('.adminSupportMailAddresses>div').last()).toHaveText(/taylor@example.invalid/);
 await expect(outgoing.locator('.adminSupportDelivery')).toHaveText(/Submitted|已提交/);
 await page.screenshot({path:testInfo.outputPath('support-conversation.png'),fullPage:true});
 await choose(page,'alex@example.invalid');await page.getByRole('textbox',{name:/Reply to customer|回复客户/}).fill('Draft for Alex only');
 await choose(page,'taylor@example.invalid');await expect(page.getByRole('textbox',{name:/Reply to customer|回复客户/})).toHaveValue('');
 await choose(page,'alex@example.invalid');await expect(page.getByRole('textbox',{name:/Reply to customer|回复客户/})).toHaveValue('Draft for Alex only');
 await expect(page.locator('.adminSupportRecipient')).toContainText('alex@example.invalid');
});

test('Beta approval prepares an English notification separately and sends only after a reviewed action',async({page})=>{
 await open(page);await choose(page,'maya@example.invalid');
 const requests:string[]=[];await page.evaluate(()=>{const native=window.fetch;(window as any).supportPosts=[];window.fetch=async(input,init)=>{if(init?.method==='POST')(window as any).supportPosts.push({path:String(input),body:JSON.parse(String(init.body))});return native(input,init);};});
 const confirmation=page.waitForEvent('dialog');const approval=page.getByRole('button',{name:/Added to Google — open Beta access|确认已加入，开通内测/}).click();
 const prompt=await confirmation;expect(prompt.message()).toContain('maya.google@example.invalid');await prompt.accept();await approval;
 await expect(page.getByRole('status',{name:/Beta status|内测状态/})).toHaveText(/Approved|已开通/);
 expect(await page.evaluate(()=>(window as any).supportPosts)).toEqual(requests);
 await page.getByRole('button',{name:/Prepare English notification|准备英文开通通知/}).click();
 const body=page.getByRole('textbox',{name:/Reply to customer|回复客户/});await expect(body).toHaveValue(/^Hi,/);await expect(body).toContainText('maya.google@example.invalid');
 await expect(page.locator('.adminSupportRecipient')).toContainText('maya@example.invalid');
 expect(await page.evaluate(()=>(window as any).supportPosts)).toEqual([]);
 await page.getByRole('button',{name:/Send reviewed reply|确认发送回复/}).click();
 await expect(page.locator('.adminSupportMail.outbound')).toHaveCount(1);
 const posts=await page.evaluate(()=>(window as any).supportPosts);expect(posts).toHaveLength(1);expect(posts[0].path).toContain('/preview-support-beta/reply');
});

test('An uncertain provider outcome blocks another reply and stays visibly unconfirmed',async({page})=>{
 await open(page);await choose(page,'riley@example.invalid');
 await expect(page.getByRole('textbox',{name:/Reply to customer|回复客户/})).toBeDisabled();
 await expect(page.getByRole('button',{name:/Send reviewed reply|确认发送回复/})).toBeDisabled();
 await expect(page.locator('.adminSupportDelivery')).toHaveText(/Verify delivery|待核验/);
 await expect(page.getByRole('button',{name:/Confirmed not sent|核实未发送/})).toBeVisible();
});

test('Late detail responses cannot change the selected customer or reply recipient',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const native=window.fetch;window.fetch=async(input,init)=>{const response=await native(input,init);if(String(input).endsWith('/support-inbox/preview-support-beta')){(window as any).supportStarted=true;await new Promise<void>(resolve=>(window as any).releaseSupport=resolve);}return response;};});
 await choose(page,'maya@example.invalid');await expect.poll(()=>page.evaluate(()=>(window as any).supportStarted)).toBe(true);
 await choose(page,'alex@example.invalid');await expect(page.locator('.adminSupportRecipient')).toContainText('alex@example.invalid');
 await page.evaluate(()=>(window as any).releaseSupport());
 await expect(page.locator('.adminSupportRecipient')).toContainText('alex@example.invalid');
 await expect(page.locator('.adminSupportConversationHead')).toContainText('My Mac shows online');
});
