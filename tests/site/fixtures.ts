import {test as base,expect} from '@playwright/test';

export const test=base.extend<{siteErrors:string[]}>({
 siteErrors:[async({page,context},use,testInfo)=>{
  const errors:string[]=[];
  const config=await page.request.get('/api/runtime-config');
  expect(config.ok(),'Browser tests require the local simulation server').toBe(true);
  expect(await config.json()).toMatchObject({version:1,execution:'simulation',arcAvailable:true});
  const {language,theme}=testInfo.project.metadata;
  await context.addInitScript(({language,theme})=>{
   if(window!==window.top)return;
   localStorage.setItem('remotearc-locale-v2',String(language));
   localStorage.setItem('remote-arc-theme',String(theme));
   localStorage.setItem('remote-arc-dashboard-theme-v3',String(theme));
  },{language,theme});
  // Only the isolated local preview is reachable during this suite. External
  // OAuth, mail, payment, model and customer systems cannot be called.
  const previewOrigin = new URL(String(testInfo.project.use.baseURL || 'http://127.0.0.1:4331')).origin;
  await context.route('**/*',route=>new URL(route.request().url()).origin===previewOrigin?route.continue():route.abort());
  // Gallery files stay in R2. Browser regressions use a bounded image fixture.
  await context.route('**/media/demo-gallery/**',route=>route.request().url().endsWith('.mp4')?route.abort():route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#17231d"/></svg>'}));
  page.on('pageerror',error=>errors.push(error.message));
  await use(errors);
  expect(errors,'Uncaught browser errors').toEqual([]);
 },{auto:true}],
});
export {expect};
