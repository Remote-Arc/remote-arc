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
