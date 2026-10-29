import {test,expect} from './fixtures';
test('A verified Mac release offers direct DMGs and normal App installation',async({page},info)=>{
  const zh=info.project.metadata.language==='zh';
  await page.goto('/scripts/native-install-browser-fixture.html?ready=1');
  const mac=page.locator('.nativeDownloadCard').first();
  await expect(mac.locator('a')).toHaveCount(2);
  await expect(mac.locator('a').first()).toHaveAttribute('href','/api/downloads/macos/arm64');
  await expect(mac.locator('a').last()).toHaveAttribute('href','/api/downloads/macos/amd64');
  await expect(mac).toContainText('.dmg');
  await page.locator('.nativeStartGuides summary').first().click();
  const guide=page.locator('.nativeStartGuides details').first();
  await expect(guide).toContainText('Applications');
  await expect(guide).toContainText(zh?'菜单栏':'menu bar');
  await expect(guide).not.toContainText('chmod');
  await expect(guide).not.toContainText('curl');
  await expect(page.locator('a[href$="/MACOS-SHA256SUMS"]')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});
test('Before a signed release the Mac card retains automatic curl installation',async({page})=>{
  await page.goto('/scripts/native-install-browser-fixture.html');
  await expect(page.locator('.nativeShellChoice')).toBeVisible();
  await expect(page.locator('.nativeDownloadCard').first().locator('a')).toHaveAttribute('href','#shell-install');
});
