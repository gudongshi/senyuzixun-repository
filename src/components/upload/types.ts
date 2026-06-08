/**
 * Upload 组件通用类型定义。
 *
 * 三个上传组件（image / attachment / drag）共享同一套数据模型与 API，
 * 方便业务方以统一心智模型使用，也方便 AI 二次生成与修改。
 */

/** 单个文件在上传流水线中的状态。 */
export type UploadStatus = "idle" | "uploading" | "success" | "error"

/**
 * 上传文件的运行时数据结构。
 *
 * 同时承载本地 File 对象（用于重试）与上传成功后的 uploader 完整响应
 * 组件内部以 id 为主键管理列表，
 * 避免依赖 File 引用相等。
 */
export interface UploadFile {
  /** 内部唯一 id（非业务字段，组件自动生成）。 */
  id: string
  /** 浏览器原始 File 对象，重试与本地图片预览均依赖它。 */
  file: File
  /** 当前上传状态。 */
  status: UploadStatus
  /** 上传进度，0-100。仅 status === "uploading" 时持续更新。 */
  progress: number
  /** 上传失败时的错误信息。 */
  error?: string
  /**
   * uploader 成功后返回的完整响应，原样透传给业务方。
   */
  response?: Record<string, unknown>
}

/**
 * 上传过程回调上下文。
 *
 * - onProgress: uploader 在分片/xhr 进度变化时调用，传入 0-100 的整数。
 * - signal: 当用户移除文件或组件卸载时会触发 abort，uploader 应当尊重它。
 */
export interface UploaderContext {
  onProgress: (percent: number) => void
  signal: AbortSignal
}

/**
 * 业务方提供的真正执行上传的函数。
 *
 * 抛出错误（或 reject）会被组件捕获并标记为 error 状态。
 */
export type Uploader = (
  file: File,
  ctx: UploaderContext,
) => Promise<UploadResponse>

/**
 * 上传组件的公共 Props 基类。各业务组件按需扩展。
 */
export interface UploadCommonProps {
  /** 真正执行上传的函数。未提供时默认使用内置的 API 上传。 */
  onUpload?: Uploader
  /** 受控值。 */
  value?: UploadFile[]
  /** 非受控初始值。 */
  defaultValue?: UploadFile[]
  /** 文件列表变化时触发（包含进度、状态等任意变化）。 */
  onChange?: (files: UploadFile[]) => void
  /** 单个文件变化时触发，便于业务做单点持久化。 */
  onFileChange?: (file: UploadFile) => void
  /**
   * 接受的 MIME / 扩展名规则。
   * 形如：{ "image/*": [".png", ".jpg"] }，遵循 react-dropzone 协议。
   */
  accept?: Record<string, string[]>
  /** 单文件最大字节数。超过会触发 onReject。 */
  maxSize?: number
  /** 最大文件数量。多文件组件超过会触发 onReject。 */
  maxCount?: number
  /** 是否禁用整体交互。 */
  disabled?: boolean
  /** 文件被拒绝时触发（超大、类型不符、超数量等）。 */
  onReject?: (rejections: UploadRejection[]) => void
  /** 容器额外 className。 */
  className?: string
}

/** 文件被拒绝时的描述。 */
export interface UploadRejection {
  file: File
  reason: "file-too-large" | "file-invalid-type" | "too-many-files" | "unknown"
  message: string
}

/**
 * 上传接口返回的数据结构。
 *
 * 服务端 `POST /api/storage/upload` 成功时返回 `{ success: true, data: { url, fileName, size, contentType, ... } }`；
 * 失败时返回 `{ success: false, error: string }`。
 *
 * 组件内部（[uploadFile](file:///Users/ldk/Desktop/dingtalk-ai-app/app/scaffolds/code/src/components/upload/api.ts)）会将服务端的相对路径 `url` 拼接 `window.location.origin`
 * 后存入 `UploadResponse.url`，方便业务方直接作为绝对地址使用/预览。
 */
export interface UploadResponse {
  /** 上传成功后的绝对访问 URL（已拼接 origin），图片可直接预览。 */
  url?: string
  /** 服务端返回的原始文件名。 */
  fileName: string
  /** 文件大小（字节）。 */
  size: number
  /** 文件 MIME 类型。 */
  contentType: string
  /** 允许服务端返回额外字段。 */
  [key: string]: unknown
}
