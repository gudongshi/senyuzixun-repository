// ============================================================
// v16.13: Playwright 轻量级 E2E 冒烟测试
// 验证核心页面渲染：侧边栏导航 → 合同提取
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
    // 侧边栏包含导航项，等待"工作台首页"出现作为加载完成的信号
    await page.waitForSelector('text=工作台首页', { timeout: 15000 });

    // ── Step 4: 点击左侧导航栏的"企业知识库" ──
    await page.click('text=📚 企业知识库');
    // 等待知识库页面渲染（上传区域出现）
    await page.waitForTimeout(1000);

    // ── Step 5: 点击左侧导航栏的"合同提取" ──
    await page.click('text=📄 合同提取');
    // 等待合同提取页面渲染
    await page.waitForTimeout(1000);

    // ── Step 6: 断言页面标题是否包含"合同关键信息提取" ──
    const heading = page.locator('text=合同关键信息提取');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // ── Step 7: 截图保存 ──
    await page.screenshot({
      path: 'test-results/smoke-success.png',
      fullPage: true,
    });

    console.log('✅ 冒烟测试通过：合同提取页面渲染正常');
  });
});