# OCR 通用提取组件 — 使用指南

## 架构原理

```
用户选择文件
    │
    ├── PDF  ──→ FormData 上传 ──→ 后端 pdfjs-dist 提取文本 ──→ 文本 LLM (deepseek-v4-pro)
    │
    └── 图片 ──→ FormData 上传 ──→ 后端读 Buffer → Base64 ──→ 视觉 LLM (qwen4-max)
                                      │
                                      ▼
                              AI 返回结构化文本
                                      │
                                      ▼
                          前端 textarea + 一键复制
```

## 避坑指南

### ⚠️ 绝对不要做的事
1. **不要把 PDF 当图片发给视觉模型** — 会报 `InternalError.Algo.InvalidParameter: The image format is illegal`
2. **不要在前端安装 pdfjs-dist** — Vite 下 Worker 加载会崩溃（`a.toHex is not a function`）
3. **不要让前端同时发多个 OCR 请求** — 阿里云 429 限流

### ✅ 正确做法
- PDF 由**后端** `extractPdfText()` 提取文本（使用 `pdfjs-dist/legacy/build/pdf.mjs`，Node.js 专用）
- 图片由后端读 `req.file.buffer` → Base64 → qwen4-max 视觉模型
- 前端只负责 `FormData` 上传文件 + `prompt` 字段

## 后端双模型配置

### 文本 LLM（用于 PDF 提取后的文本）
- 函数：`callAIText(prompt)` → deepseek-v4-pro
- 环境变量：`DASHSCOPE_API_KEY=sk-...`

### 视觉 LLM（用于图片）
- 模型：`qwen4-max`
- 接口：`DASHSCOPE_VISION_URL`

## 通用端点

```
POST /api/ocr/extract
Content-Type: multipart/form-data

字段：
  file   — 上传的文件（JPG/PNG/PDF）
  prompt — AI 提取指令（纯文本）

响应：
  { success: true, data: { text: "提取结果..." } }
```

也支持 JSON 模式：
```
POST /api/ocr/extract
Content-Type: application/json

{ "text": "已提取的文本内容", "prompt": "请提取..." }
// 或
{ "image": "base64...", "mimeType": "image/jpeg", "prompt": "请提取..." }
```

## 前端用法

### 快速新建提取功能

```tsx
import UniversalOcr from '../components/ocr/UniversalOcr';

// 只需定义 prompt，其余全部自动处理
export default function ContractExtractor() {
  return (
    <UniversalOcr
      title="📄 合同关键信息提取"
      prompt="请提取合同中的甲方、乙方、合同金额、签署日期、合同期限、违约责任条款"
    />
  );
}
```

### 完整 Props

| Prop | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | ✅ | 页面标题 |
| `prompt` | string | ✅ | 发送给 AI 的提取指令 |
| `accept` | Record<string, string[]> | ❌ | 文件类型限制（默认 JPG/PNG/PDF） |
| `resultTitle` | string | ❌ | 结果区标题（默认"识别结果"） |

### 注册到导航

1. 在 `src/components/layout/Sidebar.tsx` 的 `PageKey` 中添加页面 key
2. 在 `NAV_ITEMS` 中添加菜单项
3. 在 `src/pages/ProjectManager.tsx` 中 import 页面组件并添加路由分支

### 更多示例

**营业执照识别：**
```tsx
<UniversalOcr
  title="🏢 营业执照识别"
  prompt="请提取营业执照中的统一社会信用代码、企业名称、法定代表人、注册资本、成立日期、经营范围、登记机关"
/>
```

**简历提取：**
```tsx
<UniversalOcr
  title="📋 简历信息提取"
  prompt="请提取简历中的姓名、手机号、邮箱、最高学历、毕业院校、工作年限、技能列表"
/>
```

## 后端核心函数

```javascript
// server/index.js

// PDF 文本提取（Node.js 专用）
async function extractPdfText(buffer) {
  const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  return textContent.items.map(item => item.str).join('');
}

// 通用 OCR 核心
async function ocrExtract(reqFile, prompt) {
  const isPdf = path.extname(reqFile.originalname).toLowerCase() === '.pdf';
  if (isPdf) {
    const pdfText = await extractPdfText(reqFile.buffer);
    return await callAIText(prompt + '\n\n' + pdfText.slice(0, 8000));
  } else {
    const b64 = reqFile.buffer.toString('base64');
    // 调用 qwen4-max 视觉模型
    return await callVisionModel(b64, reqFile.mimetype, prompt);
  }
}
```