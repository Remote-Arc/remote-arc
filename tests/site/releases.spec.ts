import { test, expect } from './fixtures';

test('Native download cards use the stable channel and show platform-specific help', async ({ page }, info) => {
  const prefix = info.project.metadata.language === 'zh' ? '/zh' : '';
  await page.goto(prefix + '/downloads');
  await expect(page.locator('.nativeInstallHeader .eyebrow')).toContainText(info.project.metadata.language === 'zh' ? '最新稳定版' : 'LATEST STABLE');
  await expect(page.locator('.nativeDownloadCard')).toHaveCount(3);
  await expect(page.locator('.nativeInstallQuick')).toBeVisible();
  await expect(page.locator('.nativeInstallQuick code')).toHaveText('npx remotelink@latest');
  const commandsBottom = await page.locator('.nativeInstallQuick').evaluate(node => node.getBoundingClientRect().bottom);
  const downloadsTop = await page.locator('.nativeDownloads').evaluate(node => node.getBoundingClientRect().top);
  expect(commandsBottom).toBeLessThan(downloadsTop);
  await expect(page.locator('.nativeDownloadAction')).toHaveAttribute('href', '#native-downloads');
  for (const icon of await page.locator('.nativePlatformIcon img').all()) {
    await expect.poll(() => icon.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  }
  const links = page.locator('.nativeInstall a[href^="/api/downloads/agent/"]');
  await expect(links).toHaveCount(6);
  const hrefs = await links.evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).href));
  expect(new Set(hrefs).size).toBe(6);
  for (const platform of ['darwin', 'windows', 'linux']) for (const arch of ['amd64', 'arm64']) {
    expect(hrefs).toContain(`${new URL(page.url()).origin}/api/downloads/agent/${platform}/${arch}`);
  }
  await expect(page.locator('.nativeInstall a').filter({ hasText: 'SHA256SUMS' })).toHaveAttribute('href', 'https://github.com/Remote-Arc/remote-arc/releases/latest/download/SHA256SUMS');
  await expect(page.locator('.nativeInstall')).not.toContainText(/\d+\.\d+\.\d+-(rc|alpha|beta|canary)\./);
  await page.locator('.nativeStartGuides summary').first().click();
  await expect(page.locator('.nativeStartGuides details').first()).toContainText('curl');
  await expect(page.locator('.nativeStartGuides details').first()).not.toContainText('chmod +x');
  await page.locator('.nativeShellChoice').click();
  await expect(page.locator('#shell-install')).toBeVisible();
  await expect(page.locator('#shell-install code')).toHaveText('curl -fsSL https://remotearc.app/install.sh | sh');
  await expect(page.locator('#shell-install .installCommandsCopy')).toBeVisible();
  await page.goto(prefix + '/downloads#homebrew');
  await expect(page.locator('#homebrew')).toHaveAttribute('open');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
});

test('Download page command links select the requested method and keep platform downloads accessible', async ({ page, context }, info) => {
  const zh = info.project.metadata.language === 'zh';
  const prefix = zh ? '/zh' : '';
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(prefix + '/downloads#shell-install');
  const commands = page.locator('.nativeInstallQuick .installCommands');
  await expect(commands.getByRole('tab', { name:'curl', exact:true })).toHaveAttribute('aria-selected', 'true');
  await expect(commands.locator('code')).toHaveText('curl -fsSL https://remotearc.app/install.sh | sh');
  await commands.locator('.installCommandsCopy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('curl -fsSL https://remotearc.app/install.sh | sh');
  await commands.getByRole('tab', { name:'npx', exact:true }).click();
  await expect(commands.locator('code')).toHaveText('npx remotelink@latest');
  await page.locator('.nativeShellChoice').click();
  await expect(commands.locator('code')).toHaveText('curl -fsSL https://remotearc.app/install.sh | sh');
  await page.evaluate(() => { location.hash = '#npx-install'; });
  await expect(commands.locator('code')).toHaveText('npx remotelink@latest');
  await commands.getByRole('link', { name:zh ? '直接下载' : 'Download', exact:true }).click();
  await expect(page).toHaveURL(new RegExp(prefix + '/downloads#native-downloads$'));
  await expect(page.locator('.nativeDownloadCard')).toHaveCount(3);
  await page.locator('.nativeInstallHeader').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({path:`work/downloads-quick-install-${info.project.name}.png`,fullPage:true});
});
