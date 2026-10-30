import { createServer, type Server } from 'node:http';
import { test, expect } from '@playwright/test';
import { slackLinkConfirmationPage } from '../../apps/relay/src/slack/slack-bot-link-page.js';
import { isTrustedDashboardMutation } from '../../apps/relay/src/auth/dashboard-origin.js';

let server:Server, attacker:Server, origin:string, attackerOrigin:string, receivedOrigin:string|undefined;
async function listen(instance:Server) {
 await new Promise<void>(resolve=>instance.listen(0,'127.0.0.1',resolve));
 const address=instance.address();
 if(!address||typeof address==='string')throw new Error('Expected local HTTP address');
 return 'http://127.0.0.1:'+address.port;
}
test.beforeAll(async()=>{
 server=createServer(async(request,response)=>{
  if(request.method==='POST'){
   receivedOrigin=request.headers.origin;
   const headers=new Headers();
   for(const [key,value] of Object.entries(request.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
   const trusted=isTrustedDashboardMutation(new Request(origin+request.url,{method:'POST',headers}),{PUBLIC_ORIGIN:'https://mcp.remotearc.app',DASHBOARD_ORIGIN:origin});
   response.writeHead(trusted?200:403,{'content-type':'text/html'});
   response.end(trusted?'<h1>Slack connected</h1>':'<p>same_origin_required</p>');
   return;
  }
  const page=slackLinkConfirmationPage('/slack/link?code='+'a'.repeat(64),'owner@example.invalid','UTEST','TTEST');
  if(request.url?.startsWith('/legacy'))page.headers.set('referrer-policy','no-referrer');
  response.writeHead(page.status,Object.fromEntries(page.headers));
  response.end(await page.text());
 });
 origin=await listen(server);
 attacker=createServer((_request,response)=>{
  response.writeHead(200,{'content-type':'text/html'});
  response.end('<form method="post" action="'+origin+'/slack/link?code='+'a'.repeat(64)+'"><button>Forge account link</button></form>');
 });
 attackerOrigin=await listen(attacker);
});
test.afterAll(async()=>{await Promise.all([server,attacker].filter(Boolean).map(instance=>new Promise<void>(resolve=>instance.close(()=>resolve()))));});

test('The native Slack account form sends its real same-origin Origin',async({page})=>{
 const response=await page.goto(origin+'/slack/link?code='+'a'.repeat(64));
 expect(response?.headers()['referrer-policy']).toBe('same-origin');
 await expect(page.getByText('owner@example.invalid',{exact:true})).toBeVisible();
 const submitted=page.waitForResponse(response=>response.request().method()==='POST');
 await page.getByRole('button',{name:'Connect & continue my request',exact:true}).click();
 expect((await submitted).status()).toBe(200);
 await expect(page.getByRole('heading',{name:'Slack connected'})).toBeVisible();
 expect(receivedOrigin).toBe(origin);
});

test('A form on another origin still cannot link the Slack identity',async({page})=>{
 await page.goto(attackerOrigin);
 const submitted=page.waitForResponse(response=>response.request().method()==='POST');
 await page.getByRole('button',{name:'Forge account link'}).click();
 expect((await submitted).status()).toBe(403);
 await expect(page.locator('body')).toContainText('same_origin_required');
 expect(receivedOrigin).toBe(attackerOrigin);
});

test('The previous no-referrer policy reproduces the real Origin null failure',async({page})=>{
 await page.goto(origin+'/legacy');
 const submitted=page.waitForResponse(response=>response.request().method()==='POST');
 await page.getByRole('button',{name:'Connect & continue my request',exact:true}).click();
 expect((await submitted).status()).toBe(403);
 expect(receivedOrigin).toBe('null');
});
