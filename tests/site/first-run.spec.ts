import {test,expect} from './fixtures';

test('A new account sees an inline pairing guide on Overview until it hides it',async({page})=>{
 await page.goto('/dashboard/connect/overview?demo=first-run');
 const card=page.getByRole('region',{name:/Pair your computer so your AI can work on it|配对电脑，让 AI 在上面工作/});
 await expect(card).toBeVisible();
 await expect(card).toContainText('npx remotelink@latest');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await card.getByRole('button',{name:/Open the pairing guide|打开配对向导/}).click();
 const dialog=page.getByRole('dialog',{name:/Connect a computer|连接一台电脑/});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('tab',{name:'Windows'}).click();
 await expect(dialog.getByRole('link',{name:/Download for Windows x64|下载 Windows x64 版/})).toHaveAttribute('href',/\/api\/downloads\/agent\/windows\/amd64$/);
 await dialog.getByRole('tab',{name:'Linux'}).click();
 await expect(dialog).toContainText('curl -fsSL https://remotearc.app/install.sh | sh');
 await expect(dialog.locator('code').filter({hasText:/^remotelink$/})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await card.getByRole('button',{name:/^(Hide|隐藏)$/}).click();
 await expect(card).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('region',{name:/Pair your computer so your AI can work on it|配对电脑，让 AI 在上面工作/})).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Overview does not show the pairing guide once a computer is paired',async({page})=>{
 await page.goto('/dashboard/connect/overview');
 await expect(page.locator('.overviewStatusGrid')).toBeVisible();
 await expect(page.locator('.firstRunCard')).toHaveCount(0);
});
