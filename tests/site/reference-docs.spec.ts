import {test,expect} from './fixtures';

const article=(page:any)=>page.locator('.referenceDoc .technicalArticle');

test('Reference documents are hosted on the site, with no links to GitHub',async({page})=>{
 for(const path of ['/docs/execution-isolation','/docs/engineering-architecture','/docs/security-policy','/docs/benchmarks','/docs/feature-map']){
  await page.goto(path);
  await expect(article(page).locator('p,li,td').first()).toBeVisible();
  await expect(article(page).locator('a[href*="github.com"]')).toHaveCount(0);
  await expect(article(page).locator('a[href$=".md"]')).toHaveCount(0);
  await expect(page.locator('.referenceDoc h1')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path+' must not scroll sideways').toBe(true);
 }
});

test('Hosted documents link to each other and leave out diagrams the site replaces',async({page})=>{
 await page.goto('/docs/feature-map');
 await article(page).getByRole('link',{name:'Inbox excerpts'}).click();
 await expect(page).toHaveURL(/\/docs\/feature-map-verified-inbox$/);
 await expect(article(page).locator('p,li,td').first()).toBeVisible();
 await page.goto('/docs/engineering-architecture');
 await expect(page.locator('#docs-how-it-runs')).toBeVisible();
 await expect(article(page).locator('p,li,td').first()).toBeVisible();
 await expect(article(page)).not.toContainText('flowchart TB');
});

test('The isolation decision links to its hosted page in both languages',async({page})=>{
 await page.goto('/zh/docs/security');
 const link=page.getByRole('link',{name:/隔离技术决策/});
 await expect(link).toHaveAttribute('href','/zh/docs/execution-isolation');
 await link.click();
 await expect(page.locator('.referenceDoc h1')).toHaveText('执行隔离');
 await expect(article(page)).toContainText('什么是沙箱隔离');
 await page.goto('/docs/execution-isolation');
 await expect(article(page)).toContainText('What a sandbox is');
});
