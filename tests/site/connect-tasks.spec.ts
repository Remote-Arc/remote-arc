import {test,expect} from './fixtures';

test('MCP task links open Connect with Arc disabled and preserve the task reference',async({page})=>{
 await page.route('**/api/runtime-config',async route=>{
  const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),arcAvailable:false}});
 });
 await page.goto('/automations?task=preview-ci');
 await expect(page.locator('.appFrame')).toHaveAttribute('data-workspace','connect');
 await expect(page.locator('.connectTasks')).toBeVisible();
 await expect(page).toHaveURL(/task=preview-ci/);
 const task=page.locator('.connectTaskCard');
 await expect(task).toHaveCount(1);await expect(task).toContainText('Merge after CI passes');
 await expect(task.locator('.automationDetails')).toHaveAttribute('open','');
 await expect(task).toContainText(/No run has started|尚未开始任何执行/);
 await page.getByRole('button',{name:/Show all tasks|显示全部任务/}).click();
 await expect(page.locator('.connectTaskCard')).toHaveCount(3);
 await page.getByRole('searchbox',{name:/Search Connect tasks|搜索 Connect 任务/}).fill('Nightly');
 await expect(page.locator('.connectTaskCard')).toHaveCount(1);
 await page.getByRole('searchbox').fill('');
 await page.getByRole('button',{name:/^(Attention|待关注)$/}).click();
 await expect(page.locator('.connectTaskCard')).toHaveCount(1);
 await expect(page.locator('.connectTaskCard')).toContainText('Nightly build');
 await expect(page.locator('.arcWorkPage')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Connect task controls update state, confirm cancellation and keep keyboard focus',async({page})=>{
 await page.goto('/dashboard/connect/tasks');
 const task=page.locator('[data-task-id=preview-goal]');
 await expect(task).toBeVisible();
 await task.getByRole('button',{name:/^(Pause|暂停)$/}).click();
 await expect(task.locator('.connectTaskStatus')).toContainText(/Paused|已暂停/);
 await expect(task).toContainText(/command already started may continue|已经启动的命令可能继续运行/);
 await task.getByRole('button',{name:/^(Resume|恢复)$/}).click();
 await expect(task.locator('.connectTaskStatus')).toContainText(/Queued|已排队/);
 const cancel=task.getByRole('button',{name:/^(Cancel task|取消任务)$/});
 await cancel.click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(cancel).toBeFocused();
 await cancel.click();
 await page.getByRole('button',{name:/Confirm cancellation|确认取消/}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(task.locator('.connectTaskStatus')).toContainText(/Cancelled|已取消/);
 await expect(task.getByRole('button',{name:/^(Pause|Resume|暂停|恢复)$/})).toHaveCount(0);
});

test('source goals remain visible, Arc work stays separate, and saved output is readable',async({page})=>{
 await page.goto('/dashboard/connect/tasks');
 await expect(page.locator('[data-task-id=preview-goal]')).toBeVisible();
 await page.evaluate(async()=>{
  const original=window.fetch.bind(window);
  const data=await(await original('/api/automations')).json();
  const template=data.automations[0];
  const finished={...template,id:'saved-command',name:'Saved command result',kind:'long_task',status:'completed',goal_json:null,state_json:'{}',next_run_at:null,run_count:1};
  data.automations.push(finished,
   {...template,id:'external-source',name:'External source goal',status:'waiting_for_event',goal_json:JSON.stringify({type:'agent_goal',controller:'source',objective:'Read a file'}),state_json:JSON.stringify({phase:'awaiting_agent'})},
   {...template,id:'native-arc',name:'Native Arc work',goal_json:JSON.stringify({type:'agent_goal',native_arc:{version:1}})});
  window.fetch=(async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
   if(url.pathname==='/api/automations')return Response.json(data);
   if(url.pathname==='/api/automations/saved-command')return Response.json({automation:finished,runs:[{id:'run-saved',attempt:1,status:'completed',exit_code:0,output_summary:'Command step 1 exited with code 0.\nstdout:\nSAVED_OUTPUT_AFTER_AGENT_RESTART',error:null,started_at:finished.created_at}]});
   return original(input,init);
  }) as typeof fetch;
 });
 await page.getByRole('button',{name:/Refresh tasks|刷新任务/}).click();
 await expect(page.locator('[data-task-id=external-source]')).toContainText(/Waiting for an AI decision|等待聊天中的 AI/);
 await expect(page.locator('[data-task-id=native-arc]')).toHaveCount(0);
 const task=page.locator('[data-task-id=saved-command]');
 await task.getByRole('button',{name:/View results|查看结果/}).click();
 await task.locator('.taskRun>summary').click();
 await expect(task).toContainText('SAVED_OUTPUT_AFTER_AGENT_RESTART');
 await expect(task).toContainText(/Exit 0|退出码 0/);
});

test('a task older than the collection limit is loaded directly from its link',async({page})=>{
 await page.goto('/dashboard/connect/tasks');
 await expect(page.locator('[data-task-id=preview-ci]')).toBeVisible();
 await page.evaluate(async()=>{
  const original=window.fetch.bind(window),data=await(await original('/api/automations')).json();
  const older={...data.automations[1],id:'older-task',name:'Older saved command'};
  window.fetch=(async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
   if(url.pathname==='/api/automations/older-task')return Response.json({automation:older,runs:[]});
   return original(input,init);
  }) as typeof fetch;
  const url=new URL(location.href);url.searchParams.set('task','older-task');history.pushState({},'',url);dispatchEvent(new PopStateEvent('popstate'));
 });
 await expect(page.locator('.connectTaskCard')).toHaveCount(1);
 await expect(page.locator('[data-task-id=older-task]')).toContainText('Older saved command');
});

test('failed updates keep factual state and failed refreshes retain the loaded list',async({page})=>{
 await page.goto('/dashboard/connect/tasks');
 const task=page.locator('[data-task-id=preview-goal]');
 await expect(task).toBeVisible();
 await page.evaluate(()=>{
  const original=window.fetch.bind(window);(window as any).connectFailure={list:false,posts:0};
  window.fetch=(async(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href),state=(window as any).connectFailure;
   if(url.pathname.endsWith('/preview-goal/pause')){state.posts++;return Response.json({error:'Simulated update failure'},{status:503});}
   if(url.pathname==='/api/automations'&&state.list)throw new Error('offline');
   return original(input,init);
  }) as typeof fetch;
 });
 await task.getByRole('button',{name:/^(Pause|暂停)$/}).click();
 await expect(page.getByRole('alert')).toContainText('Simulated update failure');
 await expect(task.locator('.connectTaskStatus')).toContainText(/Running|运行中/);
 expect(await page.evaluate(()=>(window as any).connectFailure.posts)).toBe(1);
 await page.evaluate(()=>(window as any).connectFailure.list=true);
 await page.getByRole('button',{name:/Refresh tasks|刷新任务/}).click();
 await expect(page.getByRole('alert').filter({hasText:/last loaded|上次加载/})).toBeVisible();
 await expect(task).toBeVisible();
});

test('an unknown task shows a missing-record state without opening Arc',async({page})=>{
 await page.goto('/automations?task=missing-task');
 await expect(page.locator('.connectTasksEmpty')).toContainText(/not found|未找到/);
 await expect(page.locator('.arcWorkPage')).toHaveCount(0);
 await page.getByRole('button',{name:/Show all tasks|显示全部任务/}).click();
 await expect(page.locator('.connectTaskCard')).toHaveCount(3);
});
