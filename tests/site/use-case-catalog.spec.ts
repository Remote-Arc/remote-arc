import {test,expect} from '@playwright/test';
import {PUBLISHED_MEDIA_DEMOS} from '../../packages/docs/src/media-gallery';
import {ARC_USE_CASES,useCaseSlugs} from '../../packages/docs/src/arc-use-cases';
import {SKILL_USE_CASES} from '../../packages/docs/src/skill-use-cases';

const catalogSize=useCaseSlugs.length;
const arcCatalogSize=useCaseSlugs.filter(slug=>!ARC_USE_CASES[slug].connectOnly).length;
test('catalog stays flat and illustrated, with searchable audio and a dedicated video use case',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',prefix=zh?'/zh':'';
 await page.goto(prefix+'/use-cases');
 const cards=page.locator('.visualUseCaseGrid .useCaseCard');
 await expect(cards).toHaveCount(catalogSize);await expect(page.locator('#video-gallery')).toHaveCount(0);await expect(page.locator('video')).toHaveCount(0);
 await expect(cards.locator('img[data-use-case-art]')).toHaveCount(catalogSize);
 const search=page.getByRole('searchbox',{name:zh?'搜索使用场景':'Search use cases'});
 await search.fill(zh?'录音':'recordings');await expect(cards).toHaveCount(1);
 await cards.first().click();await expect(page).toHaveURL(/\/use-cases\/audio-transcription/);
 await expect(page.getByRole('heading',{level:1,name:zh?'录音转文字与字幕':'Turn recordings into text and subtitles'})).toBeVisible();
 await expect(page.locator('#video-gallery')).toHaveCount(0);
 await page.goto(prefix+'/use-cases');await search.fill('no-such-workflow-987654');await expect(cards).toHaveCount(0);
 await page.getByRole('button',{name:zh?'查看全部场景':'Show all use cases'}).click();await expect(cards).toHaveCount(catalogSize);
 for(const image of await cards.locator('img').all()){await image.scrollIntoViewIfNeeded();await image.evaluate(element=>(element as HTMLImageElement).decode());}
 await page.locator('.flatUseCaseCatalog').screenshot({path:'work/gallery/'+info.project.name+'-flat-catalog.png'});
 await page.getByRole('button',{name:zh?'使用 Arc':'With Arc',exact:true}).click();await expect(cards).toHaveCount(arcCatalogSize);
 await page.getByRole('button',{name:zh?'使用 Connect':'With Connect',exact:true}).click();
 await page.getByRole('link',{name:new RegExp(zh?'制作视频与动态图形':'Create a finished video')}).click();
 await expect(page).toHaveURL(/\/use-cases\/video-creation/);await expect(page.locator('#video-gallery .mediaDemoCard')).toHaveCount(PUBLISHED_MEDIA_DEMOS.filter(item=>item.language===(zh?'zh':'en')).length);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('Media Intelligence, Manim and Blender open localized detail pages in Arc and Connect',async({page},info)=>{
 const language=info.project.metadata.language==='zh'?'zh':'en',prefix=language==='zh'?'/zh':'';
 for(const mode of ['arc','connect'])for(const slug of ['video-analysis','mathematical-animation','blender-3d']){
  const workflow=SKILL_USE_CASES.find(item=>item.slug===slug)!;
  await page.goto(prefix+'/use-cases?mode='+mode);
  await page.locator(`.useCaseCard[href="${prefix}/use-cases/${slug}?mode=${mode}"]`).click();
  await expect(page).toHaveURL(new RegExp('/use-cases/'+slug+'\\?mode='+mode+'$'));
  await expect(page.getByRole('heading',{level:1})).toHaveText(workflow.title[language]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('legacy gallery bookmark resolves to the video creation detail',async({page},info)=>{
 const zh=info.project.metadata.language==='zh',prefix=zh?'/zh':'';
 await page.goto(prefix+'/use-cases#video-gallery');await expect(page).toHaveURL(/\/use-cases\/video-creation#video-gallery$/);
 await expect(page.locator('#video-gallery .mediaDemoCard')).toHaveCount(PUBLISHED_MEDIA_DEMOS.filter(item=>item.language===(zh?'zh':'en')).length);
});
