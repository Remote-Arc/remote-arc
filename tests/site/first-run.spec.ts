import {test,expect} from './fixtures';

test('A new account sees an inline pairing guide on Overview until it hides it',async({page})=>{
 await page.goto('/dashboard/connect/overview?demo=first-run');
 const card=page.getByRole('region',{name:/Pair your computer so your AI can work on it|配对电脑，让你的 AI 在上面工作/});
 await expect(card).toBeVisible();
 await expect(card).toContainText('npx remotelink@latest');
 await expect(page.locator('.modal')).toHaveCount(0);
 await card.getByRole('button',{name:/Open the pairing guide|打开配对向导/}).click();
 await expect(page.locator('.modal')).toContainText(/ADD A DEVICE|添加设备/);
 await page.locator('.modalClose').click();
 await card.getByRole('button',{name:/^(Hide|暂时隐藏)$/}).click();
 await expect(card).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('region',{name:/Pair your computer so your AI can work on it|配对电脑，让你的 AI 在上面工作/})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Overview does not show the pairing guide once a computer is paired',async({page})=>{
 await page.goto('/dashboard/connect/overview');
 await expect(page.locator('.overviewStatusGrid')).toBeVisible();
 await expect(page.locator('.firstRunCard')).toHaveCount(0);
});
