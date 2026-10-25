import {test,expect} from '@playwright/test';
import {MEDIA_DEMOS} from '../../packages/docs/src/media-gallery';
test('video gallery filters, opens a single player and restores keyboard focus',async({page},info)=>{
 const zh=info.project.metadata.language==='zh';
 let mediaRequests=0;
 await page.route('**/media/demo-gallery/**',async route=>{
  if(route.request().url().endsWith('.mp4')){mediaRequests++;await route.abort();return;}
  await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#17231d"/></svg>'});
 });
 await page.goto((zh?'/zh':'')+'/use-cases/video-creation#video-gallery');
 const gallery=page.locator('#video-gallery');
 await expect(gallery).toBeVisible();await expect(gallery.locator('article')).toHaveCount(MEDIA_DEMOS.length);
 const languages=gallery.getByRole('group',{name:zh?'视频语言':'Video language'});
 await languages.getByRole('button',{name:zh?'英文':'English',exact:true}).click();await expect(gallery.locator('article')).toHaveCount(3);
 await expect(gallery.locator('.mediaDemoLanguage')).toHaveText(['ENGLISH','ENGLISH','ENGLISH']);
 await languages.getByRole('button',{name:zh?'全部语言':'All languages',exact:true}).click();
 expect(mediaRequests).toBe(0);await expect(gallery.locator('video')).toHaveCount(0);
 await gallery.getByRole('button',{name:zh?'地图':'Maps',exact:true}).click();await expect(gallery.locator('article')).toHaveCount(2);
 await expect(gallery.getByRole('heading',{name:zh?'一段旅程，一张动态地图':'Three cities. One moving map.'})).toBeVisible();
 const play=gallery.getByRole('button',{name:zh?'播放：一段旅程，一张动态地图':'Play Three cities. One moving map.',exact:true});
 await play.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.locator('video')).toHaveCount(1);
 await expect(dialog.getByRole('link',{name:zh?'制作类似视频':'Make something like this'})).toHaveAttribute('href',/source=video-demo%3Aworld-connections/);
 await expect(dialog.getByRole('alert')).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(gallery.locator('video')).toHaveCount(0);await expect(play).toBeFocused();
 await gallery.getByRole('button',{name:zh?'全部作品':'All work',exact:true}).click();await expect(gallery.locator('article')).toHaveCount(MEDIA_DEMOS.length);
 await gallery.getByRole('button',{name:zh?'科普':'Explainers',exact:true}).click();await expect(gallery.locator('article')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await gallery.screenshot({path:'work/gallery/'+info.project.name+'-gallery.png'});
});
