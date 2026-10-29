import { test, expect } from './fixtures';

const pluginUrl = 'https://chatgpt.com/plugins/plugin_asdk_app_6abc25fd2a348191a4197f6246994090';

test('Published ChatGPT setup links installation, local pairing and a read-only check', async ({ page }, info) => {
  const zh = info.project.metadata.language === 'zh';
  await page.goto(zh ? '/zh/install/chatgpt' : '/install/chatgpt');
  const setup = page.locator('.chatgptPluginSetup');
  await expect(setup.locator('.pluginSetupStep')).toHaveCount(3);
  await expect(setup.getByRole('link', { name: zh ? '在 ChatGPT 打开 Remote Arc ↗' : 'Open Remote Arc in ChatGPT ↗' })).toHaveAttribute('href', pluginUrl);
  await expect(setup).toContainText(zh ? '不会在电脑上自动安装程序' : 'does not install anything on your computer');
  await expect(setup).toContainText(zh ? '相同的 Remote Arc 账号' : 'same Remote Arc account');
  await expect(setup.locator('.installCommands code')).toHaveText('npx remotelink');
  await expect(setup.getByRole('link', { name: /No Node.js|没有 Node.js/ })).toHaveAttribute('href', zh ? '/zh/downloads' : '/downloads');
  await expect(setup.locator('blockquote')).toContainText(zh ? '不要修改任何文件' : 'Do not change any files');
  const image = setup.locator('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
  await expect(setup.locator('#custom-mcp')).not.toHaveAttribute('open');
  await expect(page.locator('.installEndpointPanel')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `work/chatgpt-setup-${info.project.name}.png`, fullPage: true });
});

test('Custom MCP stays available as an explicit alternative and troubleshooting separates failures', async ({ page }, info) => {
  const zh = info.project.metadata.language === 'zh';
  await page.goto(zh ? '/zh/install/chatgpt' : '/install/chatgpt');
  const advanced = page.locator('#custom-mcp');
  await advanced.locator('summary').click();
  await expect(advanced.locator('code')).toHaveText('https://mcp.remotearc.app/mcp');
  const help = page.locator('.pluginSetupTroubleshooting');
  await help.getByText(zh ? '没有找到电脑' : 'No computers found', { exact: true }).click();
  await expect(help).toContainText(zh ? '不要先反复重装' : 'reinstalling the Agent is not the first step');
  await help.getByText(zh ? '电脑已列出，但显示离线' : 'My computer is listed but offline', { exact: true }).click();
  await expect(help).toContainText(zh ? '重新启动已安装的 Agent' : 'start the installed Agent again');
});

test('Post-pairing ChatGPT launcher opens the published plugin without copying an endpoint', async ({ page }, info) => {
  const zh = info.project.metadata.language === 'zh';
  await page.goto('/device?demo=ready');
  const chatgpt = page.locator('.pairAgentOption').filter({ hasText: 'ChatGPT' });
  await expect(chatgpt.locator('.pairAgentLaunch')).toHaveAttribute('href', pluginUrl);
  await expect(chatgpt).toContainText(zh ? '当前这个 Remote Arc 账号' : 'same Remote Arc account');
  await expect(page.locator('.pairCustomMcp')).not.toHaveAttribute('open');
  await page.locator('.pairCustomMcp summary').click();
  await expect(page.locator('.pairAgentEndpoint code')).toHaveText('https://mcp.remotearc.app/mcp');
});
