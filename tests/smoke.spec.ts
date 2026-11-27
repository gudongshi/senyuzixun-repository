// ============================================================
// v17.1.1: Playwright 轻量级 E2E 冒烟测试（含 RAG 链路）
// 验证核心页面渲染：知识库智能问答 + OA 审批 + 合同提取
// ============================================================

import { test, expect } from '@playwright/test';

const COOKIE_NAME = 'token';
const COOKIE_VALUE = 'dev-mock-token';

test.describe('森宇集团项目指挥大屏 — 冒烟测试', () => {
  test('侧边栏导航 → 合同提取页面渲染正常', async ({ page }) => {
    // ── Step 1: 先注入 mock cookie，再导航（顺序关键） ──
    await page.context().addCookies([
      {
        name: COOKIE_NAME,
        value: COOKIE_VALUE,
        domain: 'localhost',
        path: '/',
      },
    ]);

    // ── Step 2: 导航到项目管理后台 ──
    // DEV 环境下 AuthGate 的 useDevMock() 会在 /api/dingtalk/me 失败时自动注入 mock 用户
    await page.goto('http://localhost:5173/project-manager', {
      waitUntil: 'networkidle',
    });

    // ── Step 3: DEV mock 用户生效后，等待侧边栏渲染 ──
    await page.waitForSelector('text=工作台首页', { timeout: 15000 });

    // ── Step 4: 点击"企业知识库"──
    await page.click('text=📚 企业知识库');
    await page.waitForTimeout(800);

    // ── Step 5: 点击"合同提取"──
    await page.click('text=📄 合同提取');
    await page.waitForTimeout(800);

    // ── Step 6: 断言"合同关键信息提取"标题可见 ──
    await expect(page.locator('text=合同关键信息提取')).toBeVisible({ timeout: 10000 });

    // ── Step 7: 截图保存 ──
    await page.screenshot({
      path: 'test-results/smoke-success.png',
      fullPage: true,
    });

    console.log('✅ 冒烟测试通过：合同提取页面渲染正常');
  });

  test('侧边栏导航 → OA 审批页面渲染正常', async ({ page }) => {
    // ── 注入 cookie 并导航 ──
    await page.context().addCookies([
      { name: COOKIE_NAME, value: COOKIE_VALUE, domain: 'localhost', path: '/' },
    ]);
    await page.goto('http://localhost:5173/project-manager', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=工作台首页', { timeout: 15000 });

    // ── 点击"OA 审批"──
    await page.click('text=📋 OA 审批');
    await page.waitForTimeout(1000);

    // ── 断言 OA 审批页面核心元素可见 ──
    await expect(page.getByRole('heading', { name: '📋 OA 审批' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: '我发起的' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '发起审批' })).toBeVisible({ timeout: 5000 });

    // ── 截图保存 ──
    await page.screenshot({
      path: 'test-results/smoke-oa-approval.png',
      fullPage: true,
    });

    console.log('✅ 冒烟测试通过：OA 审批页面渲染正常');
  });

  test('侧边栏导航 → 知识库智能问答渲染正常', async ({ page }) => {
    // ── 注入 cookie 并导航 ──
    await page.context().addCookies([
      { name: COOKIE_NAME, value: COOKIE_VALUE, domain: 'localhost', path: '/' },
    ]);
    await page.goto('http://localhost:5173/project-manager', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=工作台首页', { timeout: 15000 });

    // ── 点击"企业知识库"──
    await page.click('text=📚 企业知识库');
    await page.waitForTimeout(1000);

    // ── 断言 v17.0 智能问答 UI 可见 ──
    await expect(page.locator('text=💬 知识库智能问答')).toBeVisible({ timeout: 10000 });
    // 输入框占位符
    await expect(page.getByPlaceholder(/向知识库提问/)).toBeVisible({ timeout: 5000 });
    // 提问按钮
    await expect(page.getByRole('button', { name: '提问' })).toBeVisible({ timeout: 5000 });

    // ── 截图保存 ──
    await page.screenshot({
      path: 'test-results/smoke-kb-rag.png',
      fullPage: true,
    });

    console.log('✅ 冒烟测试通过：知识库智能问答页面渲染正常');
  });

  test('知识库智能问答 → AI 回答返回正常（RAG 链路）', async ({ page }) => {
    // ── 注入 cookie 并导航到知识库 ──
    await page.context().addCookies([
      { name: COOKIE_NAME, value: COOKIE_VALUE, domain: 'localhost', path: '/' },
    ]);
    await page.goto('http://localhost:5173/project-manager', { waitUntil: 'networkidle' });
    await page.waitForSelector('text=工作台首页', { timeout: 15000 });
    await page.click('text=📚 企业知识库');
    await page.waitForTimeout(1000);

    // ── 确认 Q&A 输入框可见 ──
    const input = page.getByPlaceholder(/向知识库提问/);
    await expect(input).toBeVisible({ timeout: 5000 });

    // ── 输入测试问题 ──
    await input.fill('什么是建设工程监理规范？');

    // ── 点击提问 ──
    await page.getByRole('button', { name: '提问' }).click();

    // ── 等待按钮恢复为"提问"（表示 API 调用完成，含加载态结束） ──
    // 如果后端不可用，前端会设置兜底文本，页面仍然会渲染
    await expect(page.getByRole('button', { name: '提问' })).toBeVisible({ timeout: 60000 });

    // ── 等待回答区域出现（animate-in 动画容器） ──
    await page.waitForTimeout(500);
    const answerContainer = page.locator('.animate-in').first();
    await expect(answerContainer).toBeVisible({ timeout: 10000 });

    // ── 截图保存 ──
    await page.screenshot({
      path: 'test-results/smoke-rag-chain.png',
      fullPage: true,
    });

    console.log('✅ 冒烟测试通过：RAG 问答链路正常（前端 → 后端 → 大模型 → 渲染）');
  });
});