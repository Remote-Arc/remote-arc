import {test,expect} from './fixtures';

test('Onboarding preview completes pairing, permissions and recovery with simulated data',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',tr=(en:string,cn:string)=>zh?cn:en;
 const forwarded:string[]=[];
 page.on('request',request=>{if(/\/api\/(pairing|devices\/preview-onboarding)/.test(request.url()))forwarded.push(request.url());});
 await page.goto('/device');
 await expect(page.getByText('DEMO-CODE',{exact:true})).toBeVisible();
 await expect(page.locator('.pairingPreview')).toContainText(tr('simulated computer','模拟电脑'));
 await page.getByRole('button',{name:tr('Authorize this device','授权此设备')}).click();
 await expect(page.getByRole('button',{name:tr('Finish setup','完成设置')})).toBeEnabled();
 await page.getByRole('button',{name:tr('Enable file editing','开启文件编辑')}).click();
 await page.getByLabel(tr('Folder path','目录路径'),{exact:true}).fill('C:\\Projects');
 await page.getByRole('button',{name:tr('Use folder & continue','使用此目录并继续')}).click();
 await expect(page.locator('.pairPermissionCard').filter({has:page.getByText(tr('File editing','文件编辑'),{exact:true})}).locator('.pairPermissionState')).toBeVisible();
 await page.getByRole('button',{name:tr('Enable terminal access','开启终端权限')}).click();
 await page.getByRole('button',{name:tr('Cancel','取消'),exact:true}).click();
 await expect(page.getByRole('button',{name:tr('Enable terminal access','开启终端权限')})).toBeVisible();
 await page.getByRole('button',{name:tr('Finish setup','完成设置')}).click();
 await expect(page.getByRole('heading',{name:tr('Computer ready','电脑已就绪'),exact:true})).toBeVisible();
 await expect(page.locator('.pairSetupSummary')).toContainText(tr('Enabled','已开启'));
 expect(forwarded,'onboarding API actions stay in browser memory').toEqual([]);
});

test('Onboarding preview stages have direct links and mobile-friendly layouts',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',tr=(en:string,cn:string)=>zh?cn:en;
 for(const [phase,title]of [['permissions',tr('Choose what AI can do','选择 AI 可以做什么')],['ready',tr('Computer ready','电脑已就绪')]]){
  await page.goto('/device?demo='+phase);
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 }
});

test('Home Slack shortcut opens the Bot setup panel',async({page},info)=>{
 const zh=info.project.metadata.language==='zh';
 await page.goto(zh?'/zh':'/');
 await page.locator('.arcProductTeaser').getByRole('link',{name:zh?'在 Slack 中使用':'Use in Slack'}).click();
 await expect(page).toHaveURL(/\/dashboard\/connect\/apps\?provider=slack/);
 await expect(page.getByRole('heading',{name:zh?'在 Slack 中与 Remote Arc 对话':'Chat with Remote Arc in Slack'})).toBeVisible();
 await expect(page.getByRole('button',{name:zh?'把 Remote Arc Bot 添加到 Slack':'Add Remote Arc Bot to Slack'})).toBeVisible();
});
