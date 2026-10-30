import {test,expect} from './fixtures';

test('Loading screens use the current brand lockup',async({page})=>{
 await page.route('**/api/**',()=>{});
 await page.goto('/oauth/consent?client_id=preview-client&scope=devices:read');
 const brand=page.locator('.centerShell .brand');
 await expect(brand).toBeVisible();
 const lockup=await brand.evaluate(element=>{
  const words=[...element.querySelectorAll('.brandLockup b')].map(word=>getComputedStyle(word).color);
  const image=element.querySelector('.brandSymbol img')!;
  return {sameColor:new Set(words).size===1,position:getComputedStyle(image).position,width:image.getBoundingClientRect().width};
 });
 expect(lockup).toEqual({sameColor:true,position:'absolute',width:32});
});
