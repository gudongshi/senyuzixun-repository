# Upload 组件

基于 [`react-dropzone`](https://react-dropzone.js.org/) 与 shadcn 风格 UI 组件实现的轻量上传组件。

| 组件                | 形态                | 典型场景                       |
| ------------------- | ------------------- | ------------------------------ |
| `ImageUpload`       | 单张图片预览框      | 头像、封面图                   |
| `AttachmentUpload`  | 按钮 + 文件列表     | 表单内"附件"字段               |
| `DragUpload`        | 大面积拖拽区 + 列表 | 批量导入、独立上传页           |

---

## 通用 API

公共 Props（来自 `UploadCommonProps`）：

| 字段           | 类型                                              | 说明                                                                |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| `onUpload`     | `Uploader`                                        | 真正执行上传的函数。**未提供时**，文件仅在本地预览，状态直接为成功 |
| `value`        | `UploadFile[]`                                    | 受控值                                                              |
| `defaultValue` | `UploadFile[]`                                    | 非受控初始值                                                        |
| `onChange`     | `(files: UploadFile[]) => void`                   | 列表任何变化都会触发（含进度更新）                                  |
| `onFileChange` | `(file: UploadFile) => void`                      | 单个文件变化时触发，便于做单点持久化                                |
| `accept`       | `Record<string, string[]>`                        | 接受的 MIME / 扩展名，遵循 `react-dropzone` 协议                    |
| `maxSize`      | `number`                                          | 单文件最大字节数，默认 `5 * 1024 * 1024`（5MB）。超出时自动 toast 提示（文件类型不支持同理） |
| `maxCount`     | `number`                                          | 最大文件数。**仅 `AttachmentUpload` / `DragUpload` 支持，`ImageUpload` 不支持此属性（单图替换式，无需限制数量）** |
| `disabled`     | `boolean`                                         | 整体禁用                                                            |
| `onReject`     | `(rejections: UploadRejection[]) => void`         | 文件被拒绝（超大、类型不符、超数量）                                |
| `className`    | `string`                                          | 容器额外 className                                                  |

### `Uploader` 协议

调用 Upload 组件必须传递实现 **`Uploader` 协议** 的 `onUpload` 属性，用于向真实的后端接口上传文件、计算进度、处理异常：

```ts
type Uploader = (
  file: File,
  ctx: { onProgress: (percent: number) => void; signal: AbortSignal },
) => Promise<UploadResponse>
```
- **应当** 监听 `signal.aborted`：当用户移除文件 / 卸载组件时，请求会被取消。
- **可以** 在进度变化时调用 `onProgress(percent)`，传 0-100 的整数。

最小可用示例（XHR 实现进度）：

```ts
const uploader: Uploader = (file, { onProgress, signal }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/storage/upload")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error("网络错误"))
    signal.addEventListener("abort", () => xhr.abort())
    const form = new FormData()
    form.append("file", file)
    xhr.send(form)
  })
```

### `UploadFile` 数据结构

```ts
interface UploadFile {
  id: string                           // 内部唯一 id
  file: File                           // 原始 File
  status: "idle" | "uploading" | "success" | "error"
  progress: number                     // 0-100
  error?: string
  response?: UploadResponse
}
```

> 图片预览 src 由 `useImagePreviewSrc(file)` 统一计算：优先用 `response.url`（api.ts 已帮你拼接为 `window.location.origin + url` 的绝对地址），否则对原始 `file` 即时 `URL.createObjectURL`，并自动 revoke。

---

## ImageUpload（单图上传）

> ⚠️ **`ImageUpload` 是单图替换式组件，不支持 `maxCount` / `multiple` 属性。** 选择新图片会直接替换旧图片。如需多图上传请使用 `AttachmentUpload` 或 `DragUpload`。

```tsx
import { ImageUpload } from "@/components/upload"

<ImageUpload
  accept={{ "image/*": [".png", ".jpg", ".jpeg", ".webp"] }}
  maxSize={5 * 1024 * 1024}
  onUpload={uploader}
  onChange={(files) => console.log(files[0]?.response?.url)}
/>
```

**专属 Props**：

- `placeholder`：空态文案，默认"点击或拖拽上传图片"
- `aspectRatio`：默认 `1`（正方形），可设为 `16/9` 等
- `classNames`：`{ root, placeholder, preview, image, overlay, error }`

**特性**：

- 始终只保留一张图片，选择新图即替换旧图
- 选中即本地预览，无需等上传完成
- 上传中显示半透明遮罩 + 进度条 + 百分比
- 失败时遮罩内显示"重试"按钮
- 鼠标悬停在预览图上会出现右上角"移除"按钮

---

## AttachmentUpload（多文件附件）

```tsx
import { AttachmentUpload } from "@/components/upload"

<AttachmentUpload
  triggerText="上传附件"
  hint="支持 pdf/docx/zip，单文件 ≤ 5MB，最多 5 个"
  accept={{
    "application/pdf": [".pdf"],
    "application/zip": [".zip"],
  }}
  maxSize={5 * 1024 * 1024}
  maxCount={5}
  onUpload={uploader}
/>
```

**专属 Props**：

- `triggerText`：按钮文案（默认"选择文件"）
- `triggerVariant` / `triggerSize`：透传到内部 `Button`
- `hint`：按钮右侧的小字说明
- `showThumbnail`：图片类型是否显示缩略图（默认 `true`）
- `classNames`：`{ root, trigger, list, item }`

**特性**：

- 既支持点击按钮选择，也支持把文件拖到组件区域内（顶部会出现 ring 提示）
- 达到 `maxCount` 时按钮自动禁用
- 文件列表中每行展示：缩略图/图标、文件名、大小或进度、状态徽标、移除/重试按钮

---

## DragUpload（大拖拽区）

```tsx
import { DragUpload } from "@/components/upload"

// 多文件（默认 maxSize 5MB，可按需覆盖）
<DragUpload
  multiple
  maxCount={10}
  maxSize={5 * 1024 * 1024}
  accept={{ "image/*": [], "application/pdf": [".pdf"] }}
  onUpload={uploader}
/>

// 单文件（替换式）
<DragUpload
  multiple={false}
  title="拖入 CSV 文件以导入"
  description="表头需匹配模板"
  onUpload={uploader}
/>
```

**专属 Props**：

- `multiple`：默认 `true`。`false` 时新文件会替换旧文件并取消其上传
- `title` / `description` / `icon`：完全自定义拖拽区文案与图标。`description={null}` 可隐藏描述
- `showThumbnail`：列表中图片是否展示缩略图
- `classNames`：`{ root, dropzone, icon, title, description, list, item }`

**特性**：

- 拖拽进入时整块变蓝（合法）或变红（`isDragReject`）
- 描述未传时会按 `accept / maxSize / maxCount` 自动生成（如"支持 .pdf · 单文件 ≤ 50MB · 最多 10 个"）

---

## 复用底层组件 & hook

如果默认形态不满足，可以直接组合底层模块：

```tsx
import {
  useUpload,
  FileList,
  FileItem,
  formatBytes,
} from "@/components/upload"

function CustomUpload() {
  const { files, addFiles, remove, retry } = useUpload({
    multiple: true,
    uploader,
  })
  // ...完全自定义触发器与布局，但仍复用列表 / 进度 / 重试 UI
  return (
    <FileList
      files={files}
      onRemove={(f) => remove(f.id)}
      onRetry={(f) => retry(f.id)}
    />
  )
}
```

`useUpload` 暴露的命令式 API：

| 方法         | 说明                                                  |
| ------------ | ----------------------------------------------------- |
| `addFiles`   | 接收 `File[]`，自动转换并触发上传                    |
| `handleDrop` | 直接喂给 `useDropzone` 的 `onDrop`                    |
| `remove`     | 移除并取消请求                                        |
| `retry`      | 重新上传失败项                                        |
| `clear`      | 清空全部                                              |

---

## 样式定制

- 所有组件接收 `className`（最外层）和 `classNames`（按 slot 细分）。
- `classNames` 通过 `cn()` 合并到默认 class 之后，**会覆盖默认样式**（受益于 `tailwind-merge`）。
- 颜色完全使用主题变量（`bg-muted`、`text-destructive`、`border-primary` 等），跟随项目主题切换。

```tsx
<DragUpload
  classNames={{
    dropzone: "min-h-[240px] border-blue-500 bg-blue-50/30",
    title: "text-blue-600 text-base",
  }}
/>
```

---

## 受控用法

```tsx
const [files, setFiles] = React.useState<UploadFile[]>([])

<AttachmentUpload
  value={files}
  onChange={setFiles}
  onUpload={uploader}
/>
```

> 受控时请把组件 `onChange` 拿到的整份 `files` 写回 state，包括上传中变化的 `progress`，否则进度条不会更新。
