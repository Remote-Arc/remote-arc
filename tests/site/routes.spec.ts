import {test,expect} from './fixtures';
import {chinesePages} from '../../apps/ui/src/marketing-paths';
import {DASHBOARD_PATHS,LEGACY_DASHBOARD_PATHS} from '../../apps/ui/src/dashboard-workspaces';

const publicRoutes=[...new Set([...chinesePages,'/chrome-extension','/chatgpt-computer-access','/claude-computer-access','/mcp-computer-access'])];
const supportedRoutes=new Set([...publicRoutes,...Object.values(DASHBOARD_PATHS),...Object.keys(LEGACY_DASHBOARD_PATHS),'/install','/resources','/device','/oauth/consent','/checkout','/admin-preview','/demo']);
for(const route of publicRoutes){
 test('Public page '+route,async({page},testInfo)=>{
  const localized=testInfo.project.metadata.language==='zh'&&chinesePages.has(route);
  const target=localized?(route==='/'?'/zh':'/zh'+route):route;
  const response=await page.goto(target);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang',localized?'zh-CN':'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme',String(testInfo.project.metadata.theme));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'No page-level horizontal overflow').toBeLessThanOrEqual(2);
  await expect(page.locator('main').first()).toBeVisible();
  const destinations=await page.locator('a[href]').evaluateAll(links=>links.map(link=>new URL((link as HTMLAnchorElement).href,location.href)).filter(url=>url.origin===location.origin&&!/\.[a-z0-9]+$/i.test(url.pathname)&&!/^\/(auth|api)\//.test(url.pathname)).map(url=>url.pathname.replace(/^\/zh(?=\/|$)/,'').replace(/\/+$/,'')||'/'));
  expect([...new Set(destinations)].filter(path=>!supportedRoutes.has(path)),'Internal links must point to supported routes').toEqual([]);
 });
}
for(const route of [...new Set(Object.values(DASHBOARD_PATHS))]){
 test('Workspace page '+route,async({page})=>{
  await page.goto(route);
  await expect(page.locator('.appFrame')).toBeVisible();
  await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'Workspace fits viewport').toBeLessThanOrEqual(2);
 });
}
for(const section of ['overview','leads','followups','payments','operations','health']){
 test('Admin page '+section,async({page})=>{
  await page.goto('/admin-preview?section='+section);
  await expect(page.locator('.adminShell')).toBeVisible();
  await expect(page.locator('h1')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),'Admin fits viewport').toBeLessThanOrEqual(2);
 });
}
test('Unknown pages show a useful not-found page',async({page})=>{
 await page.goto('/this-page-does-not-exist');
 await expect(page.getByRole('heading',{name:/not found|找不到|不存在/i})).toBeVisible();
});

test('Trailing slashes preserve public, documentation and workspace pages',async({page},testInfo)=>{
 for(const route of ['/pricing','/docs/apps','/dashboard/connect/apps']){
  const target=!route.startsWith('/dashboard')&&testInfo.project.metadata.language==='zh'?'/zh'+route:route;
  await page.goto(target);
  const heading=page.getByRole('heading',{level:1}).first();
  await expect(heading).toBeVisible();
  const title=await heading.innerText();
  await page.goto(target+'/');
  await expect(page.getByRole('heading',{level:1}).first()).toHaveText(title);
 }
});
