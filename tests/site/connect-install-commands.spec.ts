import { test, expect } from './fixtures';

test('Connect homepage offers local installation commands in the hero', async ({ page }, info) => {
  const zh = info.project.metadata.language === 'zh';
  await page.goto(zh ? '/zh' : '/');
  const hero = page.locator('.heroCopy[data-product="connect"]');
  const commands = hero.locator('.installCommands');
  await expect(commands).toBeVisible();
  await expect(commands.locator('code')).toHaveText('npx remotelink@latest');
  const npx = commands.getByRole('tab', { name: /npx/ });
  await npx.focus();
  await page.keyboard.press('ArrowRight');
  await expect(commands.getByRole('tab', { name: /curl/ })).toBeFocused();
  await expect(commands.locator('code')).toHaveText('curl -fsSL https://remotearc.app/install.sh | sh');
  await expect(commands).toContainText(zh ? '终端提示的启动命令' : 'startup command shown in Terminal');
  await expect(commands).toContainText(zh ? '无需 Node.js' : 'No Node.js');
  await commands.locator('code').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `work/home-install-commands-${info.project.name}.png`, fullPage: false });
  const download = commands.getByRole('link', { name: zh ? '直接下载' : 'Download', exact: true });
  await expect(download).toHaveAttribute('href', zh ? '/zh/downloads' : '/downloads');
  await download.click();
  await expect(page.locator('.nativeDownloadCard')).toHaveCount(3);
  await expect(page.locator('.nativeDownloads a')).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `work/native-downloads-${info.project.name}.png`, fullPage: true });
});
