import {test,expect} from './fixtures';

const subject=(page:import('@playwright/test').Page)=>page.getByRole('textbox',{name:/^(Subject|主题)$/});
const save=(page:import('@playwright/test').Page)=>page.getByRole('button',{name:/^(Save draft|保存草稿)$/});
const send=(page:import('@playwright/test').Page)=>page.getByRole('button',{name:/^(Send email|发送邮件)$/});
async function open(page:import('@playwright/test').Page){await page.goto('/admin-preview?section=followups');await page.getByRole('button',{name:/Alex Chen/}).click();await expect(subject(page)).not.toHaveValue('');}

test('Paired computers get a bilingual MCP installation template and direct official links',async({page},testInfo)=>{
 await open(page);
 await expect(page.getByRole('combobox',{name:/^(Template|模板)$/})).toHaveValue('finish-mcp');
 await page.getByRole('combobox',{name:/User segment|用户分组/}).selectOption('device-only');
 await expect(page.getByRole('button',{name:/Taylor/})).toHaveCount(0);
 await page.getByRole('button',{name:/^(Preview email|预览邮件)$/}).click();
 const preview=page.locator('iframe.adminFollowupEmailPreview').contentFrame();
 const prefix=testInfo.project.metadata.language==='zh'?'/zh':'';
 for(const client of ['chatgpt','claude','cursor'])await expect(preview.locator('a[href="https://remotearc.app'+prefix+'/install/'+client+'"]').first()).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Saved drafts reopen, stay editable and update the same message',async({page})=>{
 await open(page);await subject(page).fill('Saved and editable');await save(page).click();
 await expect(page.getByRole('status').filter({hasText:/Draft saved|草稿已保存/}).first()).toBeVisible();
 await expect(subject(page)).toBeEditable();await subject(page).fill('Edited after saving');await save(page).click();
 await page.reload();await page.getByRole('button',{name:/Alex Chen/}).click();
 await expect(subject(page)).toHaveValue('Edited after saving');await expect(subject(page)).toBeEditable();
 await page.getByRole('button',{name:/^(Drafts & history|草稿与历史)/}).click();
 await expect(page.getByRole('button',{name:/Continue editing|继续编辑/})).toHaveCount(1);
 await page.getByRole('button',{name:/Continue editing|继续编辑/}).click();await expect(subject(page)).toHaveValue('Edited after saving');
});

test('Send permits an empty contact basis and submits the latest saved content once',async({page})=>{
 await open(page);await save(page).click();await expect(send(page)).toBeEnabled();
 await subject(page).fill('Latest reviewed installation help');await send(page).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByText('Remote Arc <support@remotearc.app>',{exact:true})).toBeVisible();
 await expect(dialog.getByText('support@remotearc.app',{exact:true})).toBeVisible();
 await expect(dialog.locator('dt').filter({hasText:/^(Reply to|回复地址)$/})).toBeVisible();
 await expect(dialog).not.toContainText('login@remotearc.app');
 await expect(dialog.getByRole('radio').first().locator('..')).toHaveCSS('flex-direction','row');
 await expect(dialog.getByRole('radio',{name:/Do not add a contact basis|暂不记录联系依据/})).toBeChecked();
 await dialog.getByRole('button',{name:/^(Confirm send|确认发送)$/}).click();
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(async()=>{const value=await(await fetch('/api/admin/followups/preview-followup-user')).json();return value.contact.consent_at;})).toBeNull();
 await expect(page.locator('.followupHistoryItem')).toHaveCount(1);
 await expect(page.locator('.followupHistoryItem')).toContainText('Latest reviewed installation help');
 await expect(page.locator('.followupHistoryItem')).toContainText(/Submitted|已提交发送/);
 await page.getByRole('button',{name:/^(Write email|撰写邮件)$/}).click();
 await expect(page.locator('.adminFollowupSendHint')).toContainText(/send again at|下次可发送时间/);
 await send(page).click();await expect(page.getByRole('dialog')).toContainText(/send again at|下次可发送时间/);
 await expect(page.getByRole('button',{name:/^(Confirm send|确认发送)$/})).toHaveCount(0);
});

test('An explicitly selected support basis is saved alongside delivery',async({page})=>{
 await open(page);await send(page).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('radio',{name:/requested installation|请求安装/}).check();
 await dialog.getByRole('button',{name:/Record basis & send|记录依据并发送/}).click();await expect(dialog).toHaveCount(0);
 const contact=await page.evaluate(async()=>{const value=await(await fetch('/api/admin/followups/preview-followup-user')).json();return value.contact;});
 expect(contact.consent_at).toBeTruthy();expect(contact.consent_note).toMatch(/requested|请求/i);
 await expect(page.locator('.followupHistoryItem')).toContainText(/Submitted|已提交发送/);
});

test('Switching users retains edits and replacing a template offers save or discard',async({page})=>{
 await open(page);await subject(page).fill('Keep these edits');
 await page.getByRole('button',{name:/Taylor/}).click();await page.getByRole('button',{name:/Alex Chen/}).click();
 await expect(subject(page)).toHaveValue('Keep these edits');
 await page.getByRole('combobox',{name:/^(Template|模板)$/}).selectOption('experience');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await expect(subject(page)).toHaveValue('Keep these edits');
 await page.getByRole('combobox',{name:/^(Template|模板)$/}).selectOption('experience');
 await dialog.getByRole('button',{name:/Save & continue|保存并继续/}).click();
 await expect(dialog).toHaveCount(0);await expect(page.getByRole('combobox',{name:/^(Template|模板)$/})).toHaveValue('experience');
 await page.getByRole('button',{name:/^(Drafts & history|草稿与历史)/}).click();await expect(page.locator('.followupHistoryItem')).toContainText('Keep these edits');
});

test('Stale draft errors keep edits and explain how to recover',async({page})=>{
 await open(page);await save(page).click();await expect(page.getByRole('status').filter({hasText:/Draft saved|草稿已保存/}).first()).toBeVisible();
 await page.evaluate(()=>{const native=window.fetch;window.fetch=(async(input,init)=>String(input).endsWith('/followups/drafts')?Response.json({error:'draft_conflict'},{status:409}):native(input,init)) as typeof fetch;});
 await subject(page).fill('Unsaved text that must survive');await save(page).click();
 await expect(page.getByRole('alert')).toContainText(/another tab|其他页面/);await expect(subject(page)).toHaveValue('Unsaved text that must survive');
 await expect(subject(page)).toBeEditable();
});

for(const reason of ['email_not_configured','recipient_suppressed','delivery_unconfirmed'] as const)test('Send explains '+reason+' and preserves the draft',async({page})=>{
 await open(page);
 await page.evaluate(reason=>{const native=window.fetch;window.fetch=(async(input,init)=>{const response=await native(input,init);if(String(input).endsWith('/followups/preview-followup-user')&&(!init?.method||init.method==='GET')){const value=await response.json();if(reason==='email_not_configured')value.emailConfigured=false;if(reason==='recipient_suppressed')value.contact.suppressed_at=new Date().toISOString();if(reason==='delivery_unconfirmed')value.messages.push({id:'unknown',status:'unknown',sent_at:null});return Response.json(value);}return response;}) as typeof fetch;},reason);
 await page.getByRole('button',{name:/^(Drafts & history|草稿与历史)/}).click();await page.getByRole('button',{name:/^(Refresh history|刷新记录)$/}).click();
 await page.getByRole('button',{name:/^(Write email|撰写邮件)$/}).click();await expect(send(page)).toBeEnabled();await send(page).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('.adminFollowupSendHint')).toBeVisible();
 await expect(dialog.getByRole('button',{name:/Record basis & send|记录依据并发送|Confirm send|确认发送/})).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(subject(page)).toBeEditable();
});

test('Contact suppression keeps a compact checkbox and readable label, and saves independently',async({page})=>{
 await open(page);await page.getByRole('button',{name:/^(Contact notes|跟进记录)$/}).click();
 const checkbox=page.getByRole('checkbox',{name:/Stop follow-ups to this user|停止向此用户发送回访/});
 const label=checkbox.locator('..'),text=label.locator('span');await expect(checkbox).toBeVisible();
 const box=await checkbox.boundingBox(),copy=await text.boundingBox();
 expect(box).not.toBeNull();expect(copy).not.toBeNull();
 expect(box!.width).toBeGreaterThanOrEqual(16);expect(box!.width).toBeLessThanOrEqual(20);
 expect(box!.height).toBeLessThanOrEqual(20);expect(copy!.width).toBeGreaterThan(150);expect(copy!.height).toBeLessThan(30);
 expect(copy!.x).toBeGreaterThan(box!.x+box!.width);
 await text.click();await expect(checkbox).toBeChecked();
 await checkbox.focus();await page.keyboard.press('Space');await expect(checkbox).not.toBeChecked();
 await checkbox.check();await page.getByRole('button',{name:/^(Save notes|保存记录)$/}).click();
 await expect(page.getByRole('status').filter({hasText:/Contact notes saved|跟进记录已保存/})).toBeVisible();
 await expect(checkbox).toBeDisabled();await page.reload();await page.getByRole('button',{name:/Alex Chen/}).click();
 await page.getByRole('button',{name:/^(Contact notes|跟进记录)$/}).click();
 await expect(checkbox).toBeChecked();await expect(checkbox).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
