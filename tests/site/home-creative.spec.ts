import {test,expect} from './fixtures';

test('local creative demos show real locale-specific outputs and load video only on request',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',prefix=zh?'/zh':'';
 let videoRequests=0;
 page.on('request',request=>{if(request.url().includes('/media/demo-gallery/')&&request.url().endsWith('.mp4'))videoRequests++;});
 await page.goto(prefix+'/');
 const demo=page.locator('.homeDemo');
 await demo.getByRole('button',{name:zh?'制作视频':'Make a video',exact:true}).click();
 const result=demo.locator('.localCreativeResult[data-kind="video"]');
 await expect(result).toBeVisible();
 await expect(result.locator('img')).toHaveAttribute('src',new RegExp('basketball-return-'+(zh?'zh':'en')+'-'));
 await expect(result.locator('video')).toHaveCount(0);
 expect(videoRequests).toBe(0);
 await expect(demo.locator('.homeDemoUnder')).toContainText(zh?'工具调用过程为引导式模拟':'Guided tool-call simulation');
 await result.getByRole('button',{name:zh?/^播放：回弹/:/^Play The Return/}).click();
 await expect(result.locator('video')).toHaveAttribute('src',new RegExp('basketball-return-'+(zh?'zh':'en')+'-.*\\.mp4$'));
 await expect.poll(()=>videoRequests).toBe(1);
 await demo.getByRole('button',{name:zh?'生成图片':'Create images',exact:true}).click();
 await expect(demo.locator('video')).toHaveCount(0);
 const images=demo.locator('.localCreativeImages');
 await expect(images.locator('img')).toHaveCount(2);
 for(const img of await images.locator('img').all())await expect(img).toHaveJSProperty('naturalWidth',960);
 await expect(images.locator('a').first()).toHaveAttribute('href',prefix+'/use-cases/image-studio#image-gallery');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('body')).not.toContainText(/Runway/);
});

test('Creative AI points to local film and image galleries, including directory search',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',prefix=zh?'/zh':'';
 await page.goto(prefix+'/');
 const card=page.locator('.appsDirectoryCard[data-category="creative"]');
 await expect(page.locator('.appsDirectoryCard')).toHaveCount(6);
 await expect(page.locator('.appsDirectoryCard[data-category="research"] .appsDirectorySkills')).toContainText(zh?'女娲 Nuwa':'Nuwa');
 await expect(card).toContainText(zh?'在你的电脑上制作视频':'Make videos, posters and illustrations on your computer');
 await expect(card.locator('.creativeDirectoryPreviews a')).toHaveCount(2);
 await expect(card.locator('.creativeDirectoryPreviews a').first()).toHaveAttribute('href',prefix+'/use-cases/video-creation#video-gallery');
 await expect(card.locator('.creativeDirectoryPreviews a').last()).toHaveAttribute('href',prefix+'/use-cases/image-studio#image-gallery');
 await expect(card.locator('a[href*="provider=runway"]')).toHaveCount(0);
 await page.locator('.appsDirectory input[type="search"]').fill(zh?'女娲':'Nuwa');
 await expect(page.locator('.appsDirectoryCard')).toHaveCount(1);
 await expect(page.locator('.appsDirectoryCard')).toHaveAttribute('data-category','research');
 await page.locator('.appsDirectory input[type="search"]').fill(zh?'生图':'video');
 await expect(page.locator('.appsDirectoryCard')).toHaveCount(1);
 await expect(card).toBeVisible();
 await card.locator('.creativeDirectoryPreviews a').last().click();
 await expect(page).toHaveURL(new RegExp(prefix+'/use-cases/image-studio#image-gallery$'));
 await expect(page.locator('#image-gallery')).toBeVisible();
});
