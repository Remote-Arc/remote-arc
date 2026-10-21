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
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4331'?route.continue():route.abort());
  page.on('pageerror',error=>errors.push(error.message));
  await use(errors);
  expect(errors,'Uncaught browser errors').toEqual([]);
 },{auto:true}],
});
export {expect};
