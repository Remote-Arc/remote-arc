import {test,expect} from '@playwright/test';
import {PUBLISHED_MEDIA_DEMOS} from '../../packages/docs/src/media-gallery';
test('gallery follows website language without filters, opens one player and restores focus',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',locale=zh?'zh':'en',items=PUBLISHED_MEDIA_DEMOS.filter(item=>item.language===locale);let mediaRequests=0;
 await page.route('**/media/demo-gallery/**',async route=>{if(route.request().url().endsWith('.mp4')){mediaRequests++;await route.abort();return;}await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#17231d"/></svg>'});});
 await page.goto((zh?'/zh':'')+'/use-cases/video-creation#video-gallery');
 const gallery=page.locator('#video-gallery');await expect(gallery).toBeVisible();await expect(gallery.locator('article')).toHaveCount(items.length);await expect(gallery.locator('.mediaGalleryFilters,.mediaGalleryLanguages')).toHaveCount(0);expect(mediaRequests).toBe(0);
 const item=items[0],play=gallery.getByRole('button',{name:(zh?'播放：':'Play ')+item.title[locale],exact:true});await play.click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('video')).toHaveCount(1);await expect(dialog.locator('video')).toHaveAttribute('src',new RegExp(item.video.replaceAll('.','\\.')));
 await expect(dialog.getByRole('link',{name:zh?'制作类似视频':'Make something like this'})).toHaveAttribute('href',new RegExp('source=video-demo%3A'+item.id));await expect(dialog.getByRole('alert')).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(gallery.locator('video')).toHaveCount(0);await expect(play).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.goto((zh?'':'/zh')+'/use-cases/video-creation#video-gallery');const other=items[0].id.replace('-'+locale,'-'+(zh?'en':'zh'));await expect(page.locator('#video-gallery').getByRole('button',{name:(zh?'Play ':'播放：')+PUBLISHED_MEDIA_DEMOS.find(x=>x.id===other)!.title[zh?'en':'zh'],exact:true})).toBeVisible();
});
