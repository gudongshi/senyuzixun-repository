# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## 1. Commands (常用命令)
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Run E2E Tests**: `npm run test:e2e`
- **Run a Single Test**: `npx playwright test tests/smoke.spec.ts`

## 2. Code Architecture (系统架构)
The codebase follows a modern architecture with the following major components:
- **Frontend**: React 18 + Vite + Tailwind CSS (Vercel Minimalist Style).
- **Backend**: Node.js (Express) with PM2.
- **Database & Storage**: Supabase (PostgreSQL + RLS) for metadata, 阿里云 OSS for large files.
- **AI Services**: 阿里云百炼 (DashScope) for text (deepseek-v4-pro) and vision (qwen4-max) models.

## 3. Development Tips (开发避坑指南)
- 确保本地同时启动前后端（前端 `npm run dev`，后端 `cd server && npm start`）。
- **严禁在前端使用 `pdfjs-dist`** 解析 PDF（Vite 环境下 Worker 会报 `UnknownErrorException`）。PDF 解析必须通过 FormData 传给 Node.js 后端处理。
- **严禁在服务器硬盘写入临时文件**（如 `writeFileSync`）。图片 Buffer 必须在内存中转为 Base64 直接发送给大模型，避免撑爆服务器硬盘。

## 4. 🚨 AI 协同与自动验证闭环 (Crucial Rules)
作为 AI 代码手，在交付任何代码前，必须严格遵守以下铁律：
1. **强制 E2E 验证**：凡涉及前端 UI 或路由的新增/修改，必须同步更新 `tests/smoke.spec.ts`，并运行 `npm run test:e2e`。必须确保 `test-results/smoke-success.png` 生成，并在简报中附带截图。
2. **三轮修复限制**：遇到 Bug 时，最多尝试自动修复 3 次。如果 3 次仍未通过，**立刻停止瞎猜**，输出完整的报错堆栈、你的排查思路以及卡壳点，请求人类介入。
3. **防幻觉红线**：调用视觉大模型时，必须在 Prompt 中加入“绝对禁止凭空捏造，看不清必须返回【未识别】”的指令，并确保 `temperature: 0.1`。

## 5. Important Files (关键文件索引)
- `server/index.js`: 后端所有 API 路由及 AI 核心逻辑（发票、合同、知识库）。
- `src/components/ocr/UniversalOcr.tsx`: 通用 OCR 组件（支持 PDF/图片，自带进度条与防幻觉）。
- `src/pages/`: 包含发票提取、合同提取、OA审批、个人/企业知识库等页面。

## 6. Known Documentation
- [README.md](README.md): 项目简介与使用说明。