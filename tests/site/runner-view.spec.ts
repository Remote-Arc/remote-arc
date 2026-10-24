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
