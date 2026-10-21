import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

async function holdMessage(page:Page){
 await page.evaluate(()=>{
  const native=window.fetch;
  const state={started:false,release:()=>{}};
  (window as any).__heldMessage=state;
  const gate=new Promise<void>(resolve=>{state.release=resolve;});
  window.fetch=async(input,init)=>{
   const path=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin).pathname;
   const response=await native(input,init);
   if(!state.started&&path.endsWith('/messages')&&init?.method==='POST'){state.started=true;await gate;}
   return response;
  };
 });
}
async function attach(page:Page,name:string){
 await page.locator('input[type=file]').first().setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from('Synthetic regression attachment.')});
 await expect(page.locator('.arcUploadTile').filter({hasText:name})).toHaveAttribute('data-status','ready');
}
async function addPlace(page:Page){
 await page.getByRole('button',{name:/^(Add to message|添加到消息)$/}).click();
 await page.getByRole('menuitem',{name:/Add a place|添加地点/}).click();
}

test('A late send cannot erase a new chat’s draft or attachments',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 await holdMessage(page);
 const input=page.locator('#arc-chat-input');
 await input.fill('Keep this identical draft.');
 await page.locator('.arcChatSend').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__heldMessage.started)).toBe(true);
 if(page.viewportSize()!.width<820)await page.getByRole('button',{name:/Open workspace navigation|打开工作空间导航/,exact:true}).click();
 await page.locator('.arcSidebarPrimary').filter({visible:true}).click();
 await input.fill('Keep this identical draft.');
 await attach(page,'new-chat.txt');
 await page.evaluate(async()=>{(window as any).__heldMessage.release();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 await expect(page.locator('.arcChatSend')).toBeEnabled();
 await expect(input).toHaveValue('Keep this identical draft.');
 await expect(page.locator('.arcUploadTile')).toContainText('new-chat.txt');
 await expect(page.locator('.arcChatMessage.user')).toHaveCount(0);
});

test('Successful sending consumes only the attachments actually submitted',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 await holdMessage(page);
 await attach(page,'submitted.txt');
 const input=page.locator('#arc-chat-input');
 await input.fill('Send the first attachment.');
 await page.locator('.arcChatSend').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__heldMessage.started)).toBe(true);
 await input.fill('Keep this next message.');
 await attach(page,'next-message.txt');
 await page.evaluate(()=>(window as any).__heldMessage.release());
 await expect(page.locator('.arcChatMessage.user')).toContainText('Send the first attachment.');
 await expect(input).toHaveValue('Keep this next message.');
 await expect(page.locator('.arcUploadTile')).toHaveCount(1);
 await expect(page.locator('.arcUploadTile')).toContainText('next-message.txt');
});

test('Sending preserves newly selected references and a draft edited back to the same text',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 await holdMessage(page);
 const input=page.locator('#arc-chat-input');
 await input.fill('@GitHub');
 await page.getByRole('option').filter({hasText:'GitHub'}).click();
 await input.fill('Review the project.');
 await page.locator('.arcChatSend').click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__heldMessage.started)).toBe(true);
 await input.fill('@Slack');
 await page.getByRole('option').filter({hasText:'Slack'}).first().click();
 await input.fill('Review the project.');
 await page.evaluate(()=>(window as any).__heldMessage.release());
 await expect(page.locator('.arcChatMessage.user')).toContainText('Review the project.');
 await expect(input).toHaveValue('Review the project.');
 await expect(page.locator('.arcChatComposer .arcContextChip')).toHaveCount(1);
 await expect(page.locator('.arcChatComposer .arcContextChip')).toContainText('Slack');
});

for(const outcome of ['success','failure'])test('Manual places override a pending geolocation '+outcome,async({page})=>{
 await page.goto('/dashboard/agent/chat');
 await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:Function,failure:Function)=>{(window as any).__geo={success,failure};}}}));
 await page.locator('#arc-chat-input').fill('Find places nearby.');
 await addPlace(page);
 await page.getByRole('button',{name:/^(Use current location|使用当前位置)$/}).click();
 await expect(page.locator('.arcInputStatus')).toBeVisible();
 await expect(page.locator('.arcChatSend')).toBeDisabled();
 await addPlace(page);
 await page.getByRole('textbox',{name:/Place or address|地点或地址/}).fill('Wellington');
 await page.getByRole('button',{name:/^(Attach place|附上地点)$/}).click();
 await expect(page.locator('.arcInputStatus')).toHaveCount(0);
 await page.evaluate(outcome=>{const geo=(window as any).__geo;if(outcome==='success')geo.success({coords:{latitude:1,longitude:2,accuracy:10},timestamp:Date.now()});else geo.failure({code:1});},outcome);
 await expect(page.locator('.arcLocationTile')).toHaveText('Wellington');
 await expect(page.locator('.arcInputError')).toHaveCount(0);
 await expect(page.locator('.arcChatSend')).toBeEnabled();
});

test('Location requests can be cancelled without a late callback attaching coordinates',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 await page.evaluate(()=>Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:Function)=>{(window as any).__geoSuccess=success;}}}));
 await page.locator('#arc-chat-input').fill('Keep this request.');
 await addPlace(page);
 await page.getByRole('button',{name:/^(Use current location|使用当前位置)$/}).click();
 await page.locator('.arcInputStatus').getByRole('button',{name:/^(Cancel|取消)$/}).click();
 await page.evaluate(()=>(window as any).__geoSuccess({coords:{latitude:1,longitude:2,accuracy:10},timestamp:Date.now()}));
 await expect(page.locator('.arcInputStatus')).toHaveCount(0);
 await expect(page.locator('.arcLocationTile')).toHaveCount(0);
 await expect(page.locator('.arcChatSend')).toBeEnabled();
});

test('Email preview loads its logo inside the sandbox',async({page})=>{
 await page.goto('/admin-preview?section=followups');
 await page.getByRole('button',{name:/Alex Chen/}).click();
 const frame=page.locator('iframe.adminFollowupEmailPreview');
 await expect(frame).toHaveAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');
 await expect.poll(()=>frame.contentFrame().locator('img').first().evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
});
