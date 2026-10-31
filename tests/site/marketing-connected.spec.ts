import { test, expect } from './fixtures';

test.beforeEach(async ({ page }, info) => {
  await page.goto(info.project.metadata.language === 'zh' ? '/zh' : '/');
});

test('The constellation switches with a shared slider and every brand opens a valid local destination', async ({ page }) => {
  const scene = page.locator('.homeConnectionScene');
  // Four AI clients plus ten Apps / devices.
  await expect(scene.locator('a.hcsFloatingNode')).toHaveCount(14);
  const aiClients = [
    { slug: 'chatgpt', icon: '/ai-openai.svg' },
    { slug: 'claude', icon: '/ai-claude.svg' },
    { slug: 'gemini', icon: '/ai-gemini-four-color-2025.svg' },
    { slug: 'cursor', icon: '/ai-cursor.svg' },
  ];
  await expect(scene.locator('a.hcsAiNode')).toHaveCount(aiClients.length);
  for (const { slug, icon } of aiClients) {
    const link = scene.locator(`a.hcsAiNode[href$="/install/${slug}"]`);
    await expect(link).toHaveCount(1);
    await expect(link.locator('img')).toHaveAttribute('src', icon);
    const asset = await page.request.get(icon);
    expect(asset.ok(), icon).toBe(true);
  }
  const trustRail = page.locator('.trustRail');
  for (const { slug, icon } of aiClients) {
    const link = trustRail.locator(`a[href$="/install/${slug}"]`);
    await expect(link).toHaveCount(1);
    await expect(link.locator('img')).toHaveAttribute('src', icon);
  }
  for (const link of await scene.locator('a.hcsFloatingNode').all()) {
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/(zh\/)?(install\/|integrations\?provider=|downloads$|chrome-extension$|use-cases\/video-creation#video-gallery$)/);
    const result = await page.request.get(href!);
    expect(result.ok(), href!).toBe(true);
  }
  const core = scene.locator('a.hcsCoreMark');
  await expect(core).toHaveAttribute('href', /connect-ai$/);
  const tabs = scene.getByRole('tab');
  await tabs.last().click();
  await expect(scene).toHaveAttribute('data-mode', 'arc');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await expect(core).toHaveAttribute('href', /arc$/);
  expect(await scene.locator('.hcsModeSlider').evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await page.keyboard.press('ArrowLeft');
  await expect(scene).toHaveAttribute('data-mode', 'connect');
  await expect(tabs.first()).toBeFocused();
  await core.click();
  await expect(page).toHaveURL(/\/connect-ai$/);
});

test('Slack-style conversation answers device questions and handles unsupported demo prompts honestly', async ({ page }) => {
  const preview = page.locator('.slackAgentPreview');
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator('.connectedDevice')).toHaveCount(3);
  const prompts = preview.locator('.slackQuickPrompts button');
  await prompts.nth(1).click();
  await expect(preview.locator('.connectedMetrics')).toContainText('68');
  await prompts.nth(2).click();
  await expect(preview.locator('.connectedWorkspace')).toHaveCount(2);
  const input = preview.locator('.slackComposer input');
  await input.fill('Check CPU performance');
  await input.press('Enter');
  await expect(preview.locator('.slackMessage').first()).toContainText('Check CPU performance');
  await expect(preview.locator('.connectedPerformance')).toBeVisible();
  await input.fill('Write a poem about the ocean');
  await input.press('Enter');
  await expect(preview.locator('.slackAgentMessage')).toContainText(/This preview supports|此预览支持/);
  await expect(preview.locator('.slackResultCard')).toHaveCount(0);
  const href = await preview.locator('.slackPreviewFootnote a').getAttribute('href');
  expect(new URL(href!).searchParams.get('prompt')).toBe('Write a poem about the ocean');
});

test('Connected capabilities show fleet, performance, workspaces and a local video edit plan', async ({ page }) => {
  const section = page.locator('#agent-use-cases');
  await section.scrollIntoViewIfNeeded();
  const tabs = section.getByRole('tab');
  await expect(section.locator('.connectedDevice')).toHaveCount(4);
  await tabs.nth(1).click();
  await expect(section.locator('.connectedChart')).toBeVisible();
  await tabs.nth(2).click();
  await expect(section.locator('.connectedWorkspaceFlow')).toBeVisible();
  await section.getByRole('button', { name: 'Build PC', exact: true }).click();
  await expect(section.locator('.connectedWorkspaceJob code')).toContainText('D:\\Projects\\remote-arc');
  await section.locator('.connectedProjectChoices button').last().click();
  await expect(section.locator('.connectedWorkspaceJob code')).toContainText('sales-report');
  await section.locator('.connectedWorkspaceRun').click();
  await expect(section.locator('.connectedWorkspaceJob footer')).toContainText('monthly-sales.xlsx');
  const draft = new URL((await section.locator('.agentConnectedAction').getAttribute('href'))!);
  expect(draft.origin).toBe('https://agent.remotearc.app');
  expect(draft.searchParams.has('prompt')).toBe(true);
  await tabs.nth(2).focus();
  await page.keyboard.press('End');
  await expect(tabs.last()).toBeFocused();
  await expect(section.locator('.agentConnectedPanel')).toHaveAttribute('data-workflow', 'video');
  await expect(section.locator('.connectedEditClips > span')).toHaveCount(3);
  await section.getByRole('button', { name: '9:16', exact: true }).click();
  await expect(section.locator('.connectedEditStage')).toHaveAttribute('data-format','portrait');
  await section.locator('.connectedEditReview').click();
  await expect(section.locator('.connectedEditResult')).toContainText('1080 × 1920');
  await expect(section.locator('.connectedEditResult')).toContainText(/Export plan|导出方案/);
  const videoDraft = new URL((await section.locator('.agentConnectedAction').getAttribute('href'))!);
  expect(videoDraft.origin).toBe('https://agent.remotearc.app');
  expect(videoDraft.searchParams.get('prompt')).toMatch(/MP4/);
});

test('New previews have no horizontal overflow or missing images', async ({ page }) => {
  for (const selector of ['.slackAgentPreview', '#agent-use-cases', '.appsDirectory']) {
    const region = page.locator(selector);
    await region.scrollIntoViewIfNeeded();
    expect(await region.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const failed = await region.locator('img').evaluateAll(async images => {
      const results = await Promise.all(images.map(async element => {
        const image = element as HTMLImageElement;
        image.loading = 'eager';
        try { await image.decode(); return null; } catch { return image.getAttribute('src'); }
      }));
      return results.filter(Boolean);
    });
    expect(failed).toEqual([]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
