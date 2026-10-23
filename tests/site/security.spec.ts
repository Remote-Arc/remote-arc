import { test, expect } from './fixtures';
import { renderLoginPage } from '../../apps/relay/src/login-page';
import { authPage } from '../../apps/relay/src/auth-page';

async function openApprovals(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/connect/overview');
  await expect(page.locator('.appFrame')).toBeVisible();
  await page.evaluate(() => {
    const fetch = window.fetch;
    const base = { device_id:'preview-mac', client_id:'test-client', client_name:'Claude', grant_id:'test-grant', request_id:'test-request', requested_at:new Date().toISOString(), expires_at:new Date(Date.now()+900000).toISOString() };
    const requests = [
      { ...base, id:'file', tool_name:'write_file', target_path:'C:\\Users\\Owner\\Projects\\'+('very-long-directory-'.repeat(8))+'\\report.md' },
      { ...base, id:'browser', tool_name:'browser_runner_start', target_path:'browser_runner task research → https://example.test, https://another.example.test' },
    ];
    window.fetch = (input, init) => {
      const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
      if(path==='/api/approvals') return Promise.resolve(Response.json(requests));
      if(path==='/api/approvals/permissions') return Promise.resolve(Response.json([{...requests[0],id:'saved',status:'approved',decision_scope:'allow_always',approved_until:null,decided_at:new Date().toISOString()}]));
      return fetch(input, init);
    };
  });
  await page.locator('[data-dashboard-tab="security"]:visible').first().click();
  await expect(page.locator('.approvalRequest')).toHaveCount(2);
}

test('Security navigation is reachable and stays selected, including after reload',async({page},testInfo)=>{
  await page.goto('/dashboard/connect/overview');
  const nav=page.locator('[data-dashboard-tab="security"]:visible').first();
  await expect(nav).toBeVisible();await nav.click();
  await expect(page).toHaveURL(/\/dashboard\/connect\/security$/);
  await expect(page.locator('[data-dashboard-tab="security"]:visible').first()).toHaveAttribute('aria-current','page');
  await page.reload();await expect(page.getByRole('heading',{name:/Security center|安全中心/})).toBeVisible();
  await expect(page.locator('#dashboard-sidebar-navigation [data-dashboard-tab="security"]')).toHaveCount(1);
  await expect(page.locator('.sidebarGlobalNavigation [data-dashboard-tab="security"]')).toHaveCount(0);
  await expect(page.locator('.securityStatusGrid,.securityModelPanel,.securityPrivacyPanel,.securityActionsPanel')).toHaveCount(0);
});

test('Approval cards show explicit durations, saved permissions and readable long targets',async({page})=>{
  await openApprovals(page);
  const file=page.locator('.approvalRequest').filter({hasText:'write_file'}),browser=page.locator('.approvalRequest').filter({hasText:'browser_runner_start'});
  await expect(file.getByRole('combobox').locator('option')).toHaveCount(3);
  await file.getByRole('combobox').selectOption('allow_always');
  await expect(file.locator('.approvalScopeNote')).toContainText(/Until revoked|持续有效直到撤销/);
  await expect(file.getByRole('button',{name:/^Always allow$|^始终允许$/})).toBeDisabled();
  await file.getByRole('combobox').selectOption('allow_10m');await expect(file.locator('.approvalScopeNote')).toContainText(/10/);
  await expect(browser.getByRole('combobox').locator('option')).toHaveCount(2);
  await browser.getByRole('combobox').selectOption('allow_always');
  await expect(browser.locator('.approvalScopeNote')).toContainText(/exact browser request|这次浏览器请求/);
  await expect(page.locator('.persistentPermission')).toHaveCount(1);
  await expect(page.locator('.persistentPermission').getByRole('button',{name:/Revoke|撤销/})).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  for(const card of await page.locator('.approvalRequest').all()) {
    const buttons=await card.getByRole('button').all();
    for(const button of buttons) {
      const box=await button.boundingBox(),parent=await card.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x+box!.width).toBeLessThanOrEqual(parent!.x+parent!.width);
    }
  }
});

test('Expanded security panels use neutral workspace colors in both themes',async({page})=>{
  await openApprovals(page);
  await page.locator('.aiAuthClientSummary').first().click();await page.locator('.aiAuthGrantSummary').first().click();
  for(const label of [/First authorized|首次授权/,/Last access token issued|最近签发访问 Token/,/Access token expires|访问 Token 到期/,/Refresh authorization expires|刷新授权到期/,/OAuth client ID|OAuth 客户端 ID/]) {
    await expect(page.locator('.aiAuthGrantBody:visible').first().getByText(label,{exact:true})).toBeVisible();
  }
  await expect(page.locator('.aiAuthGrantBody:visible').first().getByRole('button',{name:/Disconnect this authorization|断开这份授权/})).toBeDisabled();
  const legacyColors=await page.locator('.appFrame').evaluate(frame=>{
    const selectors='.securityPanel,.securityStatusCard,.securityFlow>div,.aiAuthStats>span,.aiAuthClient,.aiAuthClientBody,.aiAuthGrant,.aiAuthGrantBody,.approvalRequest,.approvalTarget,.grantState,.persistentPermission';
    return [...frame.querySelectorAll(selectors)].flatMap(node=>{
      const style=getComputedStyle(node);return ['backgroundColor','borderTopColor'].flatMap(key=>{
        const value=style[key as 'backgroundColor'],rgb=value.match(/[\d.]+/g)?.map(Number);
        return rgb&&rgb.length>=3&&(!rgb[3]||rgb[3]>0)&&Math.max(...rgb.slice(0,3))-Math.min(...rgb.slice(0,3))>24?[{className:node.className,key,value}]:[];
      });
    });
  });
  expect(legacyColors).toEqual([]);
});

test('Login and code screens start in neutral dark mode without a theme flash',async({page})=>{
  const response=renderLoginPage({returnTo:'/dashboard/connect/security',googleHref:'/auth/google?return_to=%2Fdashboard%2Fconnect%2Fsecurity',reviewerEnabled:false,emailEnabled:true,emailCsrf:'test-only'});
  const html=await response.text();
  await page.route('**/auth/login*',route=>route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:html}));
  await page.goto('/auth/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(17, 17, 20)');
  await expect(page.locator('.card')).toHaveCSS('background-color','rgb(25, 25, 29)');
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.locator('.google')).toHaveAttribute('href',/return_to=.*security/);
  await page.getByLabel('Email address').focus();await expect(page.getByLabel('Email address')).toHaveCSS('outline-color','rgb(238, 238, 241)');
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  const code=authPage('Verify your email','<h1>Check your inbox</h1><label for="code">Verification code</label><input class="field code" id="code"><button class="primary">Verify &amp; continue</button><p class="error" role="alert">Invalid code. Try again.</p>');
  const codeHtml=await code.text();
  await page.route('**/auth/email/verify',route=>route.fulfill({status:200,headers:Object.fromEntries(code.headers),body:codeHtml}));
  await page.goto('/auth/email/verify');await expect(page.getByRole('alert')).toBeVisible();await expect(page.locator('.card')).toHaveCSS('background-color','rgb(25, 25, 29)');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});
