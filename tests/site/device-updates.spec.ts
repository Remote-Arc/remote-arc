import {test,expect} from './fixtures';
import companionManifest from '../../apps/browser-extension/manifest.json' with {type:'json'};

test('Browser and Go updates share the device management update area',async({page},info)=>{
  const zh=info.project.metadata.language==='zh';
  await page.goto('/dashboard/connect/devices?demo=extension-update');
  const browser=page.locator('.deviceCard').filter({hasText:'Chrome Browser'});
  await expect(browser.getByRole('heading',{name:'Chrome Browser',exact:true})).toBeVisible();
  await expect(browser.getByRole('button',{name:zh?'有可用更新':'Update available',exact:true})).toHaveCount(0);
  await expect(browser.locator('.badge.updateAvailable')).toHaveCount(0);
  await browser.getByRole('button',{name:zh?'管理 Chrome Browser':'Manage Chrome Browser',exact:true}).click();
  await browser.getByRole('tab',{name:zh?'后台与任务':'Background & tasks',exact:true}).click();
  const panel=browser.getByRole('tabpanel',{name:zh?'后台与任务':'Background & tasks',exact:true});
  const update=panel.locator('.deviceUpdateRow');
  await expect(update.getByText(zh?'Remote Arc Browser 有可用更新':'Remote Arc Browser update available',{exact:true})).toBeVisible();
  await expect(update).toContainText('v0.3.0');
  await expect(update).toContainText('v'+companionManifest.version);
  const download=update.getByRole('link',{name:zh?'下载新版 ZIP':'Download the new ZIP',exact:true});
  await expect(download).toHaveAttribute('href','/chrome-extension');
  await expect(download).toBeVisible();
  await download.click({trial:true});
  await expect(update).toContainText(zh?'同一个文件夹':'same folder');
  await expect(update).toContainText('chrome://extensions');
  await expect(update).toContainText(zh?'重新共享标签页':'Share your tabs again');
  await expect(update.getByRole('button',{name:zh?'复制升级命令':'Copy upgrade command',exact:true})).toHaveCount(0);
  await update.evaluate(element=>element.scrollIntoView({block:'center'}));
  await update.screenshot({path:info.outputPath('browser-update-panel.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width||0)+1);
  await browser.getByRole('tab',{name:zh?'权限与文件':'Access & files',exact:true}).click();
  await expect(update).not.toBeVisible();

  const mac=page.locator('.deviceCard').filter({hasText:'Personal Mac'});
  await mac.getByRole('button',{name:zh?'管理 Personal Mac':'Manage Personal Mac',exact:true}).click();
  await mac.getByRole('tab',{name:zh?'后台与任务':'Background & tasks',exact:true}).click();
  const agentUpdate=mac.getByRole('tabpanel',{name:zh?'后台与任务':'Background & tasks',exact:true}).locator('.deviceUpdateRow');
  await expect(agentUpdate.getByText(zh?'Remote Arc 有可用更新':'Remote Arc update available',{exact:true})).toBeVisible();
  await expect(agentUpdate.getByRole('button',{name:zh?'复制升级命令':'Copy upgrade command',exact:true})).toBeVisible();
  await expect(agentUpdate.getByRole('link',{name:zh?'下载新版 ZIP':'Download the new ZIP',exact:true})).toHaveCount(0);
});
