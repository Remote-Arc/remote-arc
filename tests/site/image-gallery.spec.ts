import {test,expect} from '@playwright/test';
import {IMAGE_DEMOS} from '../../packages/docs/src/image-gallery';
test('image references stay in their use case and open with a reusable brief',async({page},info)=>{
 const zh=info.project.metadata.language==='zh';
 let fullRequests=0;const fullNames=new Set(IMAGE_DEMOS.map(item=>item.image));
 await page.route('**/media/demo-gallery/**',async route=>{
  if(fullNames.has(new URL(route.request().url()).pathname.split('/').pop()!))fullRequests++;
  await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500"><rect width="1200" height="1500" fill="#d46b45"/></svg>'});
 });
 await page.goto((zh?'/zh':'')+'/use-cases/image-studio#image-gallery');
 const gallery=page.locator('#image-gallery');await expect(gallery.locator('article')).toHaveCount(IMAGE_DEMOS.length);await expect(page.locator('#video-gallery')).toHaveCount(0);expect(fullRequests).toBe(0);
 const open=gallery.getByRole('button',{name:zh?'查看图片：球场能量 · 运动海报':'View image: Court energy',exact:true});await open.click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:zh?'球场能量 · 运动海报':'Court energy'})).toBeVisible();
 await dialog.locator('img').evaluate(image=>(image as HTMLImageElement).decode());expect(fullRequests).toBe(1);
 await expect(dialog.getByRole('link',{name:zh?'制作类似图片':'Make something like this'})).toHaveAttribute('href',/source=image-demo%3Acourt-energy/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(open).toBeFocused();
 await gallery.screenshot({path:'work/gallery/'+info.project.name+'-image-gallery.png'});
});
