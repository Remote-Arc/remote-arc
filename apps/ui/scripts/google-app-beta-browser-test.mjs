// Run after UI build. Browser -> real Worker/Admin handlers -> real SQLite.
// Google HTTP is scripted; no request reaches production or an email provider.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';
import {createWorkerFixture,AGENT,ADMIN,MCP,SITE} from '../../relay/scripts/worker-fixture.ts';
import {handleAdminServiceRequest} from '../../relay/src/admin/admin-service.ts';

const f=createWorkerFixture();f.addUser('beta-browser');f.addUser('beta-admin','admin');f.addUser('beta-mobile');
Object.assign(f.env,{APP_TOKEN_KEY:Buffer.alloc(32,8).toString('base64'),APP_GOOGLE_CLIENT_ID:'fixture-client',APP_GOOGLE_CLIENT_SECRET:'fixture-server-secret'});
const dist=fileURLToPath(new URL('../dist/',import.meta.url)),output=process.env.REMOTEARC_QA_OUTPUT;
if(output)await mkdir(output,{recursive:true});
// Playwright does not route later requests in an HTTP redirect chain. A deny
// proxy is a second fence, and fixture redirects below become fresh navigations.
const blocked=[];
const denyProxy=createServer((request,response)=>{blocked.push(request.url);response.writeHead(502);response.end();});
denyProxy.on('connect',(request,socket)=>{blocked.push(request.url);socket.end('HTTP/1.1 502 Blocked by offline test\r\n\r\n');});
await new Promise(resolve=>denyProxy.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,proxy:{server:'http://127.0.0.1:'+denyProxy.address().port},...(process.platform==='win32'?{executablePath:process.env.REMOTEARC_BROWSER||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'}:{})});
let googleNetwork=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input)=>{
  googleNetwork++;const url=String(input);
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/gmail.modify'});
  if(url==='https://gmail.googleapis.com/gmail/v1/users/me/profile')return Response.json({emailAddress:'tester@example.test'});
  throw Error('Unexpected network request: '+url);
};
const mutations=[],networkRecords=[];
async function context(user){
  const ctx=await browser.newContext({locale:'en-NZ',serviceWorkers:'block',viewport:{width:1440,height:1000}});
  const cookie=await f.sessionCookie(user);
  await ctx.addCookies([{name:'rl_session',value:decodeURIComponent(cookie.slice('rl_session='.length)),domain:'.remotearc.app',path:'/',secure:true,httpOnly:true}]);
  await ctx.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin==='https://accounts.google.com')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Scripted Google consent</title><h1>Scripted Google consent</h1>'});
    if(![AGENT,ADMIN,MCP,SITE].includes(url.origin))return route.abort();
    if(url.pathname.startsWith('/api/')){
      const headers=await request.allHeaders(),body=request.postData();
      if(!['GET','HEAD'].includes(request.method()))mutations.push({path:url.pathname,body:body?JSON.parse(body):null});
      const init={method:request.method(),headers,...(body?{body}:{})};
      const response=url.origin===ADMIN?await handleAdminServiceRequest(new Request(url,init),f.env):await f.call(url.href,init);
      networkRecords.push({user,path:url.pathname,status:response.status,cookieSent:Boolean(headers.cookie),setCookie:response.headers.has('set-cookie')});
      if(response.status>=300&&response.status<400){
        assert(request.isNavigationRequest(),'Unexpected redirect from a fixture API fetch');
        const next=new URL(response.headers.get('location'),url);
        assert([AGENT,ADMIN,MCP,SITE].includes(next.origin),'Redirect must stay in the fixture origins');
        return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><script>location.replace('+JSON.stringify(next.href).replace(/</g,'\\u003c')+')</script>'});
      }
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
    }
    const extension=path.extname(url.pathname),file=path.resolve(dist,extension?'.'+decodeURIComponent(url.pathname):'index.html');
    if(!file.startsWith(dist))return route.abort();
    try{const body=await readFile(file);return route.fulfill({status:200,contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'})[extension]||'text/html',body});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  return ctx;
}
const picture=async(page,name)=>{if(output)await page.screenshot({path:path.join(output,name+'.png'),fullPage:false,animations:'disabled'});};
const overflow=async page=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'UI must fit the viewport');
try{
  const user=await context('beta-browser'),page=await user.newPage();
  await page.goto(AGENT+'/apps');
  await page.getByRole('button',{name:'Apply to join',exact:true}).click();
  const application=page.getByRole('dialog',{name:'Apply for Google Apps Beta'});
  await application.getByRole('textbox',{name:'Google account email'}).fill('tester@example.test');
  assert.equal(await application.getByRole('button',{name:'Submit application',exact:true}).isEnabled(),false);
  await application.getByRole('checkbox',{name:/I understand the testing limits/}).check();
  await overflow(page);await picture(page,'apps-beta-application');
  await application.getByRole('button',{name:'Submit application',exact:true}).click();
  await application.getByRole('status').filter({hasText:'Your application is waiting for review.'}).waitFor();
  assert.equal(googleNetwork,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM google_app_beta_requests').get().n,1);
  await application.getByRole('button',{name:'Close',exact:true}).click();

  const operator=await context('beta-admin'),admin=await operator.newPage();
  await admin.goto(ADMIN+'/?section=support');
  await admin.getByRole('button').filter({hasText:'Google Apps Beta application'}).click();
  await admin.getByText('tester@example.test',{exact:false}).first().waitFor();
  await picture(admin,'apps-beta-support-review');
  admin.once('dialog',dialog=>dialog.accept());
  await admin.getByRole('button',{name:'Added to Google — open Beta access',exact:true}).click();
  await admin.getByText('Google Apps Beta · approved',{exact:true}).waitFor();
  assert.equal(googleNetwork,0,'local approval sends no email or Google write');

  await page.reload();
  const gmail=page.locator('.appsManagerCard[data-provider="gmail"]');
  await gmail.getByRole('button',{name:'Connect',exact:true}).click();
  const consent=page.getByRole('dialog',{name:'Use Gmail with your AI'});
  assert.equal(await consent.getByRole('link',{name:'Data use and deletion details'}).getAttribute('href'),SITE+'/privacy#google');
  assert.equal(await consent.getByRole('button',{name:'Agree and continue',exact:true}).isEnabled(),false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM app_oauth_states').get().n,0);
  await consent.getByRole('checkbox',{name:/I agree to this use and sharing/}).check();
  await picture(page,'apps-google-data-consent');
  await consent.getByRole('button',{name:'Agree and continue',exact:true}).click();
  await page.waitForURL('https://accounts.google.com/**');
  const authorization=new URL(page.url());
  assert.equal(authorization.searchParams.get('scope'),'https://www.googleapis.com/auth/gmail.modify');
  assert.equal(mutations.find(item=>item.path==='/api/apps/authorize').body.dataConsent,'2026-11-02');
  await page.goto(MCP+'/api/apps/oauth/gmail/callback?code=fixture&state='+encodeURIComponent(authorization.searchParams.get('state')));
  const connection=f.sql.prepare("SELECT * FROM app_connections WHERE user_id='beta-browser' AND provider='gmail'").get();
  assert(connection,'Scripted callback failed: '+(await page.textContent('body')).slice(0,250));
  try{await page.getByRole('heading',{name:'Apps',exact:true}).waitFor({timeout:5000});}
  catch(error){console.error(JSON.stringify({step:'after-scripted-callback',url:page.url().split('?')[0],text:(await page.textContent('body')).slice(0,700),network:networkRecords.slice(-20),cookies:(await user.cookies()).map(cookie=>({name:cookie.name,domain:cookie.domain,sameSite:cookie.sameSite}))}));throw error;}
  assert.equal(JSON.parse(connection.connection_metadata_json).googleDataConsent.version,'2026-11-02');
  const callId=crypto.randomUUID();
  f.sql.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,result_ciphertext,status,expires_at,created_at,updated_at) VALUES(?,'beta-browser',?,1,'messages.get','read',?,'hash','encrypted-input','encrypted-output','succeeded',?,?,?)").run(callId,connection.id,callId,f.now,f.now,f.now);
  await page.locator('.appsManagerCard[data-provider="gmail"]').getByRole('button',{name:'Manage',exact:true}).click();
  await page.getByRole('button',{name:'Delete saved call data',exact:true}).click();
  await page.getByRole('group',{name:'Confirm deletion of saved call data'}).getByRole('button',{name:'Delete call contents',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Saved call contents deleted.'}).first().waitFor();
  assert.equal(f.sql.prepare('SELECT result_ciphertext FROM app_calls WHERE id=?').get(callId).result_ciphertext,null);
  assert.equal(f.sql.prepare('SELECT status FROM app_connections WHERE id=?').get(connection.id).status,'active');

  const mobile=await context('beta-mobile');await mobile.addInitScript(()=>localStorage.setItem('remotearc-locale-v2','zh'));
  const small=await mobile.newPage();await small.setViewportSize({width:390,height:844});
  await small.goto(AGENT+'/apps');await small.getByRole('button',{name:'申请加入',exact:true}).click();
  const mobileApplication=small.getByRole('dialog',{name:'申请 Google Apps 内测'});
  await mobileApplication.getByRole('textbox',{name:'要测试的 Google 账号邮箱'}).fill('mobile@example.test');
  await mobileApplication.getByRole('checkbox',{name:/我了解测试限制/}).check();
  await overflow(small);await picture(small,'apps-beta-mobile');
  await mobileApplication.getByRole('button',{name:'提交申请',exact:true}).click();await mobileApplication.getByRole('status').filter({hasText:'申请正在等待审核。'}).waitFor();
  await mobileApplication.getByRole('button',{name:'关闭',exact:true}).click();
  await small.goto(SITE+'/privacy');await small.getByRole('heading',{name:'Google data and Limited Use',exact:true}).waitFor();await small.locator('#google').waitFor();await overflow(small);
  // Chromium may preconnect even for intercepted pages. Verify the actual
  // fallback fence with a fresh, unrouted context instead of counting probes.
  const probe=await browser.newContext();const probePage=await probe.newPage();
  await assert.rejects(()=>probePage.goto('https://offline-egress-check.invalid/'),/ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED/);
  assert(blocked.includes('offline-egress-check.invalid:443'),'unrouted traffic must reach the local rejecting proxy');await probe.close();
  console.log('PASS: offline browser -> actual Worker/SQLite application, Admin admission, unchecked-consent denial, minimal OAuth, callback, deletion, privacy and mobile flow. No production or live Google acceptance claimed.');
}finally{globalThis.fetch=originalFetch;await browser.close();await new Promise(resolve=>denyProxy.close(resolve));f.sql.close();}
