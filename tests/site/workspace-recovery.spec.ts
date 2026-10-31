import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

async function mockVoice(page:Page){
 await page.addInitScript(()=>{
  (window as any).SpeechRecognition=class {
   onresult:Function|null=null;onend:Function|null=null;
   start(){(window as any).__voice=this;}
   stop(){this.onend?.();}
   abort(){this.onend?.();}
  };
 });
}
async function dictate(page:Page,text:string){
 await page.evaluate(text=>{const result:any=[{transcript:text}];result.isFinal=true;(window as any).__voice.onresult({resultIndex:0,results:[result]});},text);
}

for(const nextProfile of [0,1])test('A delayed agent save cannot close a reopened editor: '+nextProfile,async({page})=>{
 await page.goto('/dashboard/agent/settings?section=teammates');
 const editors=page.getByRole('button',{name:/Edit details & access|编辑资料与访问设置/});
 await expect(editors).toHaveCount(4);
 await page.evaluate(()=>{
  const native=window.fetch,state={started:false,release:()=>{}};
  (window as any).__profileSave=state;
  const gate=new Promise<void>(resolve=>{state.release=resolve;});
  window.fetch=async(input,init)=>{
   if(init?.method==='PATCH'&&String(input).includes('/api/arc/employees/')){state.started=true;await gate;return Response.json({ok:true});}
   return native(input,init);
  };
 });
 await editors.nth(0).click();
 const dialog=page.locator('dialog[open]');
 await dialog.getByRole('textbox',{name:/^(Name|名字)$/}).fill('Saved first agent');
 await dialog.getByRole('button',{name:/^(Save agent|保存智能体)$/}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__profileSave.started)).toBe(true);
 await dialog.getByRole('button',{name:/^(Close|关闭)$/}).click();
 await editors.nth(nextProfile).click();
 await dialog.getByRole('textbox',{name:/^(Name|名字)$/}).fill('Keep this second draft');
 await page.evaluate(async()=>{(window as any).__profileSave.release();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('textbox',{name:/^(Name|名字)$/})).toHaveValue('Keep this second draft');
 await expect(dialog).toHaveAccessibleName(/Edit agent|编辑智能体/);
});

test('Transient work refresh failures preserve cards and recover with retry',async({page})=>{
 await page.goto('/dashboard/agent/tasks');
 await expect(page.locator('.arcWorkCard')).toHaveCount(2);
 await page.evaluate(()=>{
  const native=window.fetch;
  (window as any).__workFailed=false;(window as any).__workRecover=false;
  window.fetch=(input,init)=>{
   if(!(window as any).__workRecover&&String(input)==='/api/arc/work'){
    (window as any).__workFailed=true;
    return Promise.resolve(Response.json({error:'WORK_TEMPORARILY_UNAVAILABLE'},{status:503}));
   }
   return native(input,init);
  };
 });
 await expect.poll(()=>page.evaluate(()=>(window as any).__workFailed)).toBe(true);
 await expect(page.locator('.arcWorkPage')).toContainText(/Work is unavailable|Could not refresh|暂时无法加载工作|暂时无法刷新/);
 await expect(page.locator('.arcWorkCard')).toHaveCount(2);
 const alert=page.locator('.arcWorkPage').getByRole('alert');
 await expect(alert).toContainText(/Could not refresh|暂时无法刷新/);
 await page.evaluate(()=>{(window as any).__workRecover=true;});
 await alert.getByRole('button',{name:/Try again|重试/}).click();
 await expect(alert).toHaveCount(0);
 await expect(page.locator('.arcWorkCard')).toHaveCount(2);
});

test('Voice input respects the message length limit and explains omitted speech',async({page})=>{
 await mockVoice(page);
 await page.goto('/dashboard/agent/chat');
 const input=page.locator('#arc-chat-input');
 const original='A'.repeat(5995);
 await input.fill(original);
 await page.getByRole('button',{name:/^(Voice input|语音输入)$/,exact:true}).click();
 await dictate(page,'hello extra speech');
 await expect.poll(async()=>(await input.inputValue()).length).toBe(6000);
 expect((await input.inputValue()).slice(-5)).toBe(' hell');
 await expect(page.locator('.arcInputError')).toContainText('6,000');
 await expect(page.locator('.arcVoiceStatus')).toHaveCount(0);
 await expect(page.locator('.arcChatMessage.user')).toHaveCount(0);
});

test('Dictation appends to the latest manual edits instead of the starting draft',async({page})=>{
 await mockVoice(page);
 await page.goto('/dashboard/agent/chat');
 const input=page.locator('#arc-chat-input');
 await input.fill('Starting draft');
 await page.getByRole('button',{name:/^(Voice input|语音输入)$/,exact:true}).click();
 await dictate(page,'first phrase');
 await expect(input).toHaveValue('Starting draft first phrase');
 await input.fill('Edited manually');
 await dictate(page,'second phrase');
 await expect(input).toHaveValue('Edited manually second phrase');
 await page.getByRole('button',{name:/^(Stop voice input|停止语音输入)$/,exact:true}).click();
 await expect(page.locator('.arcVoiceStatus')).toHaveCount(0);
 await expect(page.locator('.arcChatSend')).toBeEnabled();
});

test('Voice length limits keep emoji characters intact',async({page})=>{
 await mockVoice(page);
 await page.goto('/dashboard/agent/chat');
 const input=page.locator('#arc-chat-input');
 await input.fill('A'.repeat(5998));
 await page.getByRole('button',{name:/^(Voice input|语音输入)$/,exact:true}).click();
 await dictate(page,'😀');
 await expect.poll(async()=>(await input.inputValue()).length).toBe(5999);
 expect((await input.inputValue()).slice(-1)).toBe(' ');
 await expect(page.locator('.arcInputError')).toContainText('6,000');
});
