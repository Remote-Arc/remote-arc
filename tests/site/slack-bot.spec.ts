import {test,expect} from './fixtures';

test('Slack installation return opens Bot controls and a valid app conversation link',async({page})=>{
 await page.goto('/dashboard/connect/apps?slack_bot=installed');
 const panel=page.locator('.slackBotPanel');
 await expect(panel).toBeVisible();
 await page.evaluate(()=>{
  const native=window.fetch;
  window.fetch=(input,init)=>new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname==='/api/slack/status'?Promise.resolve(Response.json({configured:true,links:[],installations:[{team_id:'TWORKSPACE',team_name:'Installed workspace',app_id:'AAPP123',status:'active'}],canSelectModel:true,modelId:'gpt-6.1-sol',models:[{id:'auto',label:'Auto'},{id:'gpt-6.1-sol',label:'GPT-6.1 Sol'}]})):native(input,init);
 });
 await panel.getByRole('button',{name:/Refresh|刷新/,exact:true}).click();
 // The preview adapter supplies the same safe state; install and unlink writes
 // remain disabled while the modal and provider-error flows are exercised.
 await expect(panel.getByRole('link',{name:/Open chat|打开对话/})).toHaveAttribute('href','https://slack.com/app_redirect?team=TWORKSPACE&app=AAPP123');
 await expect(panel.getByRole('combobox')).toHaveValue('gpt-6.1-sol');
 await expect(panel.getByRole('combobox').locator('option')).toHaveCount(2);
 await expect(panel.getByRole('button',{name:/Add Remote Arc Bot|把 Remote Arc Bot/})).toBeDisabled();
 await expect(page.getByRole('dialog').getByRole('status')).toContainText(/Bot.*installed|Bot 已安装/);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 await expect(page.getByRole('dialog').getByRole('tab',{name:/Tools|工具/})).toBeVisible();
});

test('Slack provider distribution failures return a useful recoverable error',async({page})=>{
 await page.goto('/dashboard/connect/apps?app_error=slack_distribution_required');
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('support@remotearc.app');
 await expect(page.locator('.slackBotPanel')).toBeVisible();
 await expect(page.locator('.slackBotPanel').getByRole('combobox')).toHaveValue('auto');
 await expect(page.locator('.slackBotPanel').getByRole('combobox')).toBeDisabled();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('[data-provider="slack"]')).toBeVisible();
});
