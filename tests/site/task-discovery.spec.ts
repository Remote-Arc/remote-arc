import {test,expect} from './fixtures';

test('Saved tasks are explicit in Chat and open a persistent result conversation',async({page})=>{
 await page.goto('/dashboard/agent/chat?session=sample-conversation');
 const cards=page.locator('.arcChatTaskCards');
 await expect(cards.getByRole('heading',{name:/TASKS IN THIS CONVERSATION|此对话中的任务/})).toBeVisible();
 const routine=cards.locator('[data-task-id=sample-routine]');
 await expect(routine).toContainText('Pacific/Auckland');
 await expect(routine).toContainText(/Incomplete|未完成/);
 await routine.getByRole('button',{name:/Open task conversation|打开任务对话/}).click();
 await expect(page).toHaveURL(/session=sample-routine/);
 await expect(page.locator('.arcChatTaskCards')).toContainText(/Task conversation|任务对话/);
 await expect(page.locator('.arcChatMessage.assistant')).toContainText('Simulated partial result');
 const bar=page.locator('.arcChatTaskBar');
 await expect(bar).toContainText('Morning inbox & calendar brief');
 await expect(bar).toBeVisible();
 await bar.getByRole('button',{name:/View tasks|查看任务/}).click();
 await expect(page.locator('.arcChatTaskCards')).toBeInViewport();
 await page.reload();
 await expect(page.locator('.arcChatMessage.assistant')).toContainText('Simulated partial result');
 await page.getByRole('button',{name:/Original request|查看原始需求/}).click();
 await expect(page).toHaveURL(/session=sample-conversation/);
});

test('A task is reachable before its first run and has a history badge',async({page})=>{
 await page.goto('/dashboard/agent/tasks');
 const task=page.locator('.arcWorkGrid [data-task-id=sample-task]');
 await expect(task).toContainText(/No runs yet|尚未执行/);
 await task.getByRole('button',{name:/Open task conversation|打开任务对话/}).click();
 await expect(page).toHaveURL(/session=sample-task/);
 await expect(page.locator('.arcChatTaskCards')).toContainText('Prepare the next release summary');
 await expect(page.locator('.arcChatTaskCards')).toContainText(/Task conversation|任务对话/);
 if(page.viewportSize()!.width<820)await page.getByRole('button',{name:/Open workspace navigation|打开工作空间导航/,exact:true}).click();
 const history=page.locator('.arcSessionRow').filter({hasText:'Prepare the next release summary'}).filter({visible:true});
 await expect(history.locator('.arcSessionTaskBadge')).toContainText(/Task|任务/);
 await expect(history.locator('.arcSessionDelete')).toHaveCount(0);
});

test('Teammates navigation opens a workspace with roles, search and explicit chat selection',async({page})=>{
 await page.goto('/dashboard/agent/chat');
 if(page.viewportSize()!.width<820)await page.getByRole('button',{name:/Open workspace navigation|打开工作空间导航/,exact:true}).click();
 await page.locator('.arcSidebarAction').filter({hasText:/^(Teammates|队友)$/}).filter({visible:true}).click();
 await expect(page).toHaveURL(/\/dashboard\/agent\/teams$/);
 await expect(page.getByRole('heading',{level:1,name:/Teammates|队友/})).toBeVisible();
 await expect(page.locator('.arcSkillMentionMenu')).toHaveCount(0);
 await expect(page.locator('.arcTeamCard')).toHaveCount(4);
 await expect(page.locator('.arcTeammateAccess').first()).toContainText(/No app access|未授权应用/);
 await page.getByRole('searchbox').fill('NoMatchingRole');
 await expect(page.getByRole('status').filter({hasText:/No matching teammates|没有匹配的队友/})).toBeVisible();
 await page.getByRole('searchbox').fill('设计');
 await expect(page.locator('.arcTeamCard')).toHaveCount(1);
 await page.getByRole('button',{name:/Work with this teammate|与这位队友协作/}).click();
 await expect(page).toHaveURL(/\/dashboard\/agent\/chat$/);
 await expect(page.locator('.arcChatComposer .arcContextChip')).toContainText('设计队友');
 await expect(page.locator('#arc-chat-input')).toHaveValue('');
 await expect(page.locator('.arcChatMessage.user')).toHaveCount(0);
});

test('Teammate profiles and saved teams can be managed from the workspace',async({page})=>{
 await page.goto('/dashboard/agent/teams');
 const add=page.getByRole('button',{name:/^(Add teammate|添加队友)$/});
 await add.click();
 const dialog=page.getByRole('dialog',{name:/Add an employee|添加员工/});
 await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(add).toBeFocused();
 await page.getByRole('tab',{name:/Saved teams|常驻队伍/}).click();
 await expect(page.locator('.arcTeamCard')).toContainText('产品方向队伍');
 await page.getByRole('button',{name:/Work with this team|与这支队伍协作/}).click();
 await expect(page.locator('#arc-chat-input')).toHaveValue(/preview-product-team/);
 await expect(page.locator('.arcChatMessage.user')).toHaveCount(0);
});
