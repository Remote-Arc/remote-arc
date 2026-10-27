import {test,expect} from './fixtures';

test('browser handoff has a simple live view and safe completion on desktop and mobile',async({page},testInfo)=>{
 const zh=testInfo.project.metadata.language==='zh';
 await page.goto('/dashboard/browser/preview-mac/sample-application?demo=runner');
 await expect(page.getByRole('heading',{level:1})).toHaveText(zh?'有一步需要你来完成':'A quick step needs you');
 await expect(page.getByRole('region',{name:zh?'任务浏览器实时画面':'Task browser live view'})).toBeVisible();
 await expect(page.getByText('careers.example.com',{exact:true})).toBeVisible();
 await expect(page.getByText(zh?'仅查看':'View only',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`work/runner-view-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:zh?'我已处理完':"I'm done",exact:true}).click();
 await expect(page.getByText(zh?'已检查，任务可以继续。':'Checked. Your task can continue.')).toBeVisible();
 await expect(page.getByRole('button',{name:zh?'我已处理完':"I'm done",exact:true})).toHaveCount(0);
});

for (const missing of [false, true]) {
 test(`ended browser ${missing?'checkpoint is missing':'is closed'} instead of showing a broken live view`,async({page},testInfo)=>{
  const zh=testInfo.project.metadata.language==='zh';
  await page.clock.install();
  await page.goto('/dashboard/browser/preview-mac/sample-application?demo=runner');
  await expect(page.getByRole('heading',{level:1})).toHaveText(zh?'有一步需要你来完成':'A quick step needs you');
  await page.evaluate(missing=>{
   const original=window.fetch;
   window.fetch=(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
    if(url.pathname.includes('/api/runner/session/')) return Promise.resolve(Response.json(missing?{error:'session_not_found'}:{state:'closed',browser_running:false},{status:missing?404:200}));
    return original(input,init);
   };
  },missing);
  await page.clock.runFor(10000);
  await expect(page.getByRole('heading',{level:1})).toHaveText(zh?'此任务浏览器已关闭':'This task browser is closed');
  await expect(page.getByText(zh?'没有可查看的运行中浏览器任务。':'No running browser task to view.',{exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:zh?'任务浏览器实时画面':'Task browser live view'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:zh?'我已处理完':"I'm done",exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('unavailable handoff is retained without a broken view or completion action',async({page},testInfo)=>{
 const zh=testInfo.project.metadata.language==='zh';
 await page.clock.install();
 await page.goto('/dashboard/browser/preview-mac/sample-application?demo=runner');
 await expect(page.getByRole('button',{name:zh?'我已处理完':"I'm done",exact:true})).toBeEnabled();
 await page.evaluate(()=>{
  const original=window.fetch;
  window.fetch=(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
   if(url.pathname==='/api/runner/attention') return Promise.resolve(Response.json({attention:[{id:'offline',device_id:'preview-mac',device_name:'Studio Mac',session_id:'sample-application',origin:'https://careers.example.com',kind:'captcha',availability:'unavailable'}]}));
   return original(input,init);
  };
 });
 await page.clock.runFor(5000);
 await expect(page.getByText('careers.example.com',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:zh?'我已处理完':"I'm done",exact:true})).toBeDisabled();
 await expect(page.getByText(zh?'暂时无法获取任务状态，请检查电脑连接和浏览器任务权限。':'Task status unavailable. Check the computer connection and browser task permission.',{exact:true})).toBeVisible();
});

test('browser session entry exists only inside device management activity and stops loading when leaving',async({page},testInfo)=>{
 const zh=testInfo.project.metadata.language==='zh';
 await page.goto('/devices');await expect(page.locator('.deviceCard').first()).toBeVisible();
 await page.evaluate(()=>{
  const previous=window.fetch.bind(window),tools=['browser_runner_start','browser_runner_snapshot','browser_runner_act','browser_runner_status','browser_runner_confirm','browser_runner_close'];
  (window as Window&{sessionDiscoveryCalls?:number}).sessionDiscoveryCalls=0;
  window.fetch=async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
   if(url.pathname.startsWith('/api/runner/sessions/')){const state=window as Window&{sessionDiscoveryCalls?:number};state.sessionDiscoveryCalls=(state.sessionDiscoveryCalls||0)+1;return Response.json({sessions:[{session_id:'sample-application',hostname:'careers.example.com',state:'running'}]});}
   const response=await previous(input,init);
   if(url.pathname==='/api/status'){
    const status=await response.json();
    status.devices=status.devices.map((device:Record<string,unknown>)=>device.id==='preview-mac'?{...device,tools,available_tools:tools,allowed_tools:tools}:device);
    return Response.json(status);
   }
   return response;
  };
  window.dispatchEvent(new Event('focus'));
 });
 const card=page.locator('.deviceCard').filter({hasText:'Personal Mac'});
 await expect(card.locator('.deviceBrowserSessions')).toHaveCount(0);
 await card.getByRole('button',{name:zh?'管理 Personal Mac':'Manage Personal Mac',exact:true}).click();
 await expect(card.locator('.deviceBrowserSessions')).toHaveCount(0);
 await card.getByRole('tab',{name:zh?'活动与详情':'Activity & details',exact:true}).click();
 await expect(card.locator('.deviceBrowserSessions')).toBeVisible();
 expect(await page.evaluate(()=>(window as Window&{sessionDiscoveryCalls?:number}).sessionDiscoveryCalls)).toBe(0);
 await card.locator('.deviceBrowserSessions summary').click();
 await expect(card.locator('.deviceBrowserSessions a')).toHaveAttribute('href',/sample-application/);
 expect(await page.evaluate(()=>(window as Window&{sessionDiscoveryCalls?:number}).sessionDiscoveryCalls)).toBe(1);
 await card.getByRole('tab',{name:zh?'权限与文件':'Access & files',exact:true}).click();
 await expect(card.locator('.deviceBrowserSessions')).toHaveCount(0);
 await page.clock.install();await page.clock.runFor(11000);
 expect(await page.evaluate(()=>(window as Window&{sessionDiscoveryCalls?:number}).sessionDiscoveryCalls)).toBe(1);
 await card.getByRole('tab',{name:zh?'活动与详情':'Activity & details',exact:true}).click();
 await expect(card.locator('.deviceBrowserSessions')).not.toHaveAttribute('open','');
 expect(await page.evaluate(()=>(window as Window&{sessionDiscoveryCalls?:number}).sessionDiscoveryCalls)).toBe(1);
});
