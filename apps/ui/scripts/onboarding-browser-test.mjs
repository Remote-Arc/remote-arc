// Run after `pnpm --filter @remotearc/ui build`. All APIs use local fixtures.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { renderMarketingHtml } from '../../relay/src/seo.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const output = process.env.REMOTEARC_QA_OUTPUT;
if (output) await mkdir(output, { recursive: true });
const safeTools = ['list_directory', 'read_file', 'read_binary_file', 'get_file_info', 'list_processes'];
const device = {
  id: 'local-onboarding', name: 'My computer', platform: 'win32', arch: 'x64', hostname: 'MY-PC',
  status: 'online', tools: [...safeTools, 'write_file', 'edit_block', 'undo_last_change', 'start_process'],
  available_tools: [...safeTools, 'write_file', 'edit_block', 'undo_last_change', 'start_process'],
  allowed_tools: [...safeTools], workspace_roots: [], background_agent_available: false,
  background_enabled: false, created_at: new Date().toISOString(),
};
let signedIn = true;
let codeValid = true;
const mutations = [];
const json = (res, value, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    for await (const chunk of req) body += chunk;
    if (req.method === 'POST') mutations.push({ path: url.pathname, body: JSON.parse(body || '{}') });
    if (url.pathname === '/api/me') return json(res, signedIn ? { user: { id: 'local-user', email: 'local@example.com', name: 'Local preview', role: 'user', plan: 'free', isAdmin: false } } : {}, signedIn ? 200 : 401);
    if (url.pathname === '/api/runtime-config') return json(res, { version: 1, environment: 'development', arcAvailable: false, billingAvailable: false, execution: 'disabled' });
    if (url.pathname === '/api/status') return json(res, { devices: [device] });
    if (url.pathname === '/api/pairing') return json(res, codeValid ? { user_code: 'ABCD-EFGH', device_name: device.name, platform: device.platform, arch: device.arch, hostname: device.hostname, status: 'pending', expires_at: new Date(Date.now() + 300000).toISOString() } : { error: 'Pairing code expired' }, codeValid ? 200 : 404);
    if (url.pathname === '/api/pairing/approve') return json(res, { device });
    if (url.pathname === '/api/devices') return json(res, [device]);
    if (url.pathname.endsWith('/directories')) return json(res, { browser: { path: 'C:\\Projects', parent: 'C:\\', directories: [], protected_entries_omitted: 0 } });
    if (url.pathname.endsWith('/policy')) { device.workspace_roots = JSON.parse(body).workspace_roots; return json(res, {}); }
    if (url.pathname.endsWith('/tools')) { device.allowed_tools = JSON.parse(body).allowed_tools; return json(res, {}); }
    return json(res, {}, 404);
  }
  const ext = path.extname(url.pathname);
  const file = path.resolve(dist, ext ? '.' + url.pathname : 'index.html');
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try {
    let data = await readFile(file);
    if (!ext && url.pathname !== '/device') data = renderMarketingHtml(data.toString(), url.pathname);
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
    res.writeHead(200, { 'content-type': mime[ext] || (ext ? 'application/octet-stream' : 'text/html'), 'cache-control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { executablePath: process.env.REMOTEARC_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' } : {}) });
const screenshot = async (page, name) => { if (output) await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled' }); };
const noOverflow = async page => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'page must fit the viewport');
try {
  for (const [preferred, expected] of [['en-NZ', 'en'], ['zh-CN', 'zh-CN'], ['zh-TW', 'zh-CN'], ['fr-FR', 'en']]) {
    const localeContext = await browser.newContext({ locale: preferred });
    await localeContext.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    // A secondary language must not override the user's primary preference.
    await localeContext.addInitScript(primary => Object.defineProperty(navigator, 'languages', { value: [primary, 'zh-CN'] }), preferred);
    const localePage = await localeContext.newPage();
    await localePage.goto(origin + '/');
    await localePage.locator('.publicPage').waitFor();
    assert.equal(await localePage.evaluate(() => localStorage.getItem('remotearc-locale-v2')), null, 'a marketing URL must not save an automatic language choice');
    await localePage.goto(origin + '/device?code=ABCD-EFGH');
    await localePage.locator('.pairingShell').waitFor();
    assert.equal(await localePage.locator('html').getAttribute('lang'), expected, 'onboarding follows primary browser language: ' + preferred);
    assert.doesNotMatch(await localePage.locator('.pairingHeader').innerText(), /EN|English|中文|简体中文/, 'the header must not display language names');
    assert.equal(await localePage.getByRole('menuitemradio').count(), 0, 'language options appear only after opening the menu');
    await localePage.goto(origin + '/device?code=ABCD-EFGH&lang=en');
    await localePage.getByRole('button', { name: 'Authorize this device' }).waitFor();
    assert.equal(await localePage.locator('html').getAttribute('lang'), 'en', 'an explicit language URL overrides automatic detection');
    await localeContext.close();
  }
  console.log('PASS: primary browser language, Chinese regions, English fallback, explicit URL and quiet header');

  const context = await browser.newContext({ locale: 'en-NZ', viewport: { width: 1280, height: 1000 }, colorScheme: 'light' });
  // No fixture page may contact production APIs or external services.
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/device?code=ABCD-EFGH');
  await page.getByRole('button', { name: 'Authorize this device' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'a new user starts dark even with a light OS');
  await screenshot(page, 'onboarding-pair');
  await page.getByRole('button', { name: 'Authorize this device' }).click();
  await page.getByRole('button', { name: 'Continue to AI connection' }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent === 'Continue to AI connection')?.disabled);
  assert.deepEqual(device.allowed_tools, safeTools, 'pairing must remain read-only by default');
  await screenshot(page, 'onboarding-permissions');
  await page.getByRole('button', { name: 'Continue to AI connection' }).click();
  await page.getByRole('heading', { name: 'Connect your AI', exact: true }).waitFor();
  for (const client of ['chatgpt', 'claude', 'cursor']) {
    const link = page.locator('.pairAgentGuide[href="https://remotearc.app/install/' + client + '"]');
    assert.equal(await link.count(), 1, client + ' must have an official guide');
    assert.equal(await link.getAttribute('target'), '_blank', 'guide must preserve the completed setup');
  }
  assert.equal(await page.locator('.pairAgentLaunch[href="https://chatgpt.com/plugins?q=Remote%20Arc"]').count(), 1, 'direct ChatGPT launch stays available');
  await noOverflow(page);
  await screenshot(page, 'onboarding-ready-dark');
  const navigationCount = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '简体中文' }).click();
  await page.getByRole('heading', { name: '连接你的 AI', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => performance.timeOrigin), navigationCount, 'switching language must preserve the live onboarding state');
  assert.equal(new URL(page.url()).searchParams.get('lang'), 'zh', 'manual language selection updates the onboarding URL without reloading');
  assert.equal(await page.locator('.pairAgentGuide[href="https://remotearc.app/zh/install/chatgpt"]').count(), 1, 'Chinese setup must open the Chinese guide');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await screenshot(page, 'onboarding-ready-mobile-zh');
  await page.getByRole('button', { name: '切换到浅色模式' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.pairAgentOption')).backgroundColor === 'rgb(255, 255, 255)');
  await screenshot(page, 'onboarding-ready-light-zh');
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'saved light preference survives reload');
  await page.goto(origin + '/device?code=ABCD-EFGH');
  await page.getByRole('button', { name: '语言', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN', 'manual language preference survives reload and overrides the browser default');
  assert.deepEqual(mutations.map(item => item.path), ['/api/pairing/approve'], 'opening guides and finishing with recovery off must not grant capabilities');
  console.log('PASS: local onboarding, safe defaults, optional guides, Chinese, mobile, saved light mode');

  await page.goto(origin + '/device?code=ABCD-EFGH&lang=en');
  await page.getByRole('button', { name: 'Authorize this device' }).click();
  await page.getByRole('button', { name: 'Enable file editing' }).click();
  await page.getByRole('heading', { name: 'Choose where AI may work' }).waitFor();
  await noOverflow(page);
  await screenshot(page, 'onboarding-workspace-mobile');
  await page.getByLabel('Folder path', { exact: true }).fill('C:\\Projects');
  await page.getByRole('button', { name: 'Use folder & continue' }).click();
  await page.locator('.pairPermissionCard').filter({ has: page.getByText('File editing', { exact: true }) }).locator('.pairPermissionState').waitFor();
  assert.deepEqual(device.workspace_roots, ['C:\\Projects']);
  assert.equal(device.allowed_tools.includes('start_process'), false);
  await page.getByRole('button', { name: 'Enable terminal access' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(device.allowed_tools.includes('start_process'), false, 'cancel must not enable terminal');
  await page.getByRole('button', { name: 'Enable terminal access' }).click();
  await page.getByRole('button', { name: 'Confirm terminal access' }).click();
  await page.locator('.pairPermissionCard.terminal .pairPermissionState').waitFor();
  assert.equal(device.allowed_tools.includes('start_process'), true);
  signedIn = false;
  await page.goto(origin + '/device?code=ABCD-EFGH&lang=en');
  await page.getByRole('heading', { name: 'Sign in to pair this computer' }).waitFor();
  await noOverflow(page);
  signedIn = true;
  codeValid = false;
  await page.reload();
  await page.getByText('Pairing code expired', { exact: true }).waitFor();
  await noOverflow(page);
  console.log('PASS: workspace selection, explicit file/terminal permissions, cancellation, sign-in and expired code');

  // Delay the entry module on every document navigation to inspect the actual
  // server HTML before React, including real page and language switch clicks.
  const publicContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const publicPage = await publicContext.newPage();
  publicPage.on('pageerror', error => errors.push(error.message));
  let releaseModule;
  let gate;
  const holdModule = () => { gate = new Promise(resolve => { releaseModule = resolve; }); };
  await publicContext.route('**/*', async route => {
    if (!route.request().url().startsWith(origin + '/')) return route.abort();
    if (/\/assets\/index-[^/]+\.js$/.test(route.request().url())) await gate;
    return route.continue();
  });
  const inspectBeforeReact = async (navigation, theme = 'dark') => {
    holdModule();
    await navigation();
    await publicPage.locator('.marketingShell').waitFor();
    assert.equal(await publicPage.locator('.seo-blog-shell').count(), 0, 'legacy SEO shell must never paint with JavaScript enabled');
    assert.equal(await publicPage.locator('.marketingContent h1').count(), 1, 'readable page content must exist while JavaScript is delayed');
    assert.equal(await publicPage.locator('.marketingShellBrand').innerText(), 'Remote Arc');
    await noOverflow(publicPage);
    const seoTitle = await publicPage.title();
    const seoDescription = await publicPage.locator('meta[name="description"]').getAttribute('content');
    assert.equal(await publicPage.evaluate(() => document.documentElement.dataset.theme), theme);
    assert.equal(await publicPage.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), theme === 'dark' ? 'rgb(17, 17, 20)' : 'rgb(253, 253, 253)', 'critical canvas must match the final theme');
    releaseModule();
    await publicPage.locator('.publicPage').waitFor();
    assert.equal(await publicPage.locator('.marketingShell').count(), 0, 'React must replace the initial document without duplicate content');
    assert.equal(await publicPage.title(), seoTitle, 'JavaScript must preserve the full SEO title');
    assert.equal(await publicPage.locator('meta[name="description"]').getAttribute('content'), seoDescription, 'JavaScript must preserve the server description');
    await publicPage.evaluate(() => document.fonts.ready);
    await noOverflow(publicPage);
  };
  await inspectBeforeReact(() => publicPage.goto(origin + '/', { waitUntil: 'commit' }));
  await inspectBeforeReact(async () => {
    await Promise.all([publicPage.waitForURL('**/use-cases', { waitUntil: 'commit' }), publicPage.locator('.publicNavLinks > a[href="/use-cases"]').click()]);
  });
  await publicPage.getByRole('button', { name: 'Select website language' }).click();
  await inspectBeforeReact(async () => {
    await Promise.all([publicPage.waitForURL('**/zh/use-cases', { waitUntil: 'commit' }), publicPage.getByRole('menuitemradio', { name: '简体中文' }).click()]);
  });
  await screenshot(publicPage, 'website-language-switch');
  for (const route of ['/install/chatgpt', '/zh/install/claude', '/blogs', '/zh/blogs/why-i-built-remote-arc', '/docs', '/unknown-page']) {
    await inspectBeforeReact(() => publicPage.goto(origin + route, { waitUntil: 'commit' }));
  }
  await publicPage.evaluate(() => localStorage.setItem('remote-arc-theme', 'light'));
  await inspectBeforeReact(() => publicPage.goto(origin + '/zh/install/chatgpt', { waitUntil: 'commit' }), 'light');
  await screenshot(publicPage, 'website-install-light-zh');
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const staticPage = await noJs.newPage();
  for (const route of ['/', '/zh/docs', '/blogs/why-i-built-remote-arc', '/unknown-page']) {
    await staticPage.goto(origin + route);
    assert.equal(await staticPage.locator('.marketingContent h1').count(), 1, 'non-JS visitors retain semantic content on ' + route);
    await noOverflow(staticPage);
  }
  assert.deepEqual(errors, [], 'browser must not report runtime errors');
  console.log('PASS: readable HTML on 11 delayed navigations, stable SEO metadata, language switch, dark/light first paint, non-JS content');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
