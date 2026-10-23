import { test, expect } from './fixtures';

test('Default Agent downloads advertise one stable release across all native targets', async ({ page }, info) => {
  const prefix = info.project.metadata.language === 'zh' ? '/zh' : '';
  await page.goto(prefix + '/downloads');
  const badge = page.locator('.nativeInstall > .eyebrow');
  await expect(badge).toHaveText(/^REMOTE ARC \d+\.\d+\.\d+$/);
  const version = (await badge.innerText()).replace('REMOTE ARC ', '').trim();
  const links = page.locator('.nativeDownloads a');
  await expect(links).toHaveCount(6);
  const hrefs = await links.evaluateAll(elements => elements.map(element => (element as HTMLAnchorElement).href));
  expect(new Set(hrefs).size).toBe(6);
  for (const platform of ['darwin', 'windows', 'linux']) for (const arch of ['amd64', 'arm64']) {
    const suffix = platform === 'windows' ? '.exe' : '';
    expect(hrefs).toContain(`https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${version}/remotelink-v${version}-${platform}-${arch}${suffix}`);
  }
  await expect(page.locator('.nativeInstall a').filter({ hasText: 'SHA256SUMS' })).toHaveAttribute('href', `https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${version}/SHA256SUMS`);
  await expect(page.locator('.nativeInstall')).not.toContainText(/\d+\.\d+\.\d+-(rc|alpha|beta|canary)\./);
  await page.goto(prefix + '/releases');
  await expect(page.locator('.releasesPage')).toContainText(version);
});
