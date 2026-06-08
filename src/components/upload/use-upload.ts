import * as React from "react"
import type { FileRejection } from "react-dropzone"

import type {
  UploadCommonProps,
  UploadFile,
  UploadRejection,
  Uploader,
} from "./types"
import { defaultUploader } from "./api"
import { toast } from "sonner"

/**
 * 三个上传组件共享的核心状态机。
 *
 * 关注点：
 * 1. 受控 / 非受控双模式，统一通过 emit 发出 onChange。
 * 2. 通过 AbortController 串联 uploader，文件被移除即取消请求。
 * 3. 暴露 addFiles / remove / retry / clear 等命令式 API，三个组件直接复用。
 * 4. 额外提供 useImagePreviewSrc 用于统一图片预览逻辑：优先用 response.url，
 *    否则对原始 File 即时 URL.createObjectURL，并在卸载/切换时 revoke。
 */

/** 生成一个轻量的内部 id，无需额外依赖 uuid。 */
function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 把字节数格式化为易读字符串，用于提示消息。 */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${bytes}B`
}

/** 把 react-dropzone 的拒绝结构转成组件层统一的拒绝结构。 */
function normalizeRejections(rejections: FileRejection[]): UploadRejection[] {
  return rejections.flatMap((rejection) =>
    rejection.errors.map((error) => {
      const reason: UploadRejection["reason"] =
        error.code === "file-too-large"
          ? "file-too-large"
          : error.code === "file-invalid-type"
            ? "file-invalid-type"
            : error.code === "too-many-files"
              ? "too-many-files"
              : "unknown"
      return { file: rejection.file, reason, message: error.message }
    }),
  )
}

/** 从 accept 配置中提取可读的文件类型说明。 */
function describeAccept(accept?: Record<string, string[]>): string {
  if (!accept) return ""
  const extensions = Object.values(accept).flat().filter(Boolean)
  if (extensions.length > 0) return extensions.join("、")
  const mimeKeys = Object.keys(accept)
  if (mimeKeys.length > 0) return mimeKeys.join("、")
  return ""
}

export interface UseUploadOptions
  extends Pick<
    UploadCommonProps,
    "value" | "defaultValue" | "onChange" | "onFileChange" | "onReject" | "maxCount"
  > {
  /** 是否多文件模式。单文件模式下 addFiles 会用新文件覆盖旧文件。 */
  multiple: boolean
  /** 真正执行上传的函数。未提供时默认使用内置的 API 上传。 */
  uploader?: Uploader
  /** 单文件最大字节数，用于在 toast 中显示限制信息。 */
  maxSize?: number
  /** 接受的文件类型，用于在 toast 中显示支持的类型。 */
  accept?: Record<string, string[]>
}

export interface UseUploadReturn {
  files: UploadFile[]
  /** 接收浏览器 File 列表，自动转换、预览、并触发上传。 */
  addFiles: (files: File[]) => void
  /** 处理 react-dropzone 的 onDrop 回调（已含 accept/size 校验结果）。 */
  handleDrop: (accepted: File[], rejected: FileRejection[]) => void
  /** 移除指定文件（同时取消上传、释放预览 url）。 */
  remove: (id: string) => void
  /** 重试某个失败文件。 */
  retry: (id: string) => void
  /** 清空所有文件。 */
  clear: () => void
}

export function useUpload(options: UseUploadOptions): UseUploadReturn {
  const {
    multiple,
    uploader = defaultUploader,
    value,
    defaultValue,
    onChange,
    onFileChange,
    onReject,
    maxCount,
    maxSize,
    accept,
  } = options

  const isControlled = value !== undefined
  const [internal, setInternal] = React.useState<UploadFile[]>(
    () => defaultValue ?? [],
  )
  const files = isControlled ? value! : internal

  /**
   * 由于 onChange 中可能依赖最新的 files，但我们又需要在异步进度回调中读取
   * 最新值，因此用 ref 始终镜像最新数组，避免闭包过期。
   */
  const filesRef = React.useRef<UploadFile[]>(files)
  React.useEffect(() => {
    filesRef.current = files
  }, [files])

  /** 与每个 UploadFile.id 关联的 AbortController，用于取消请求。 */
  const controllersRef = React.useRef<Map<string, AbortController>>(new Map())

  /** 统一的 setter，自动处理受控 / 非受控并触发 onChange。 */
  const commit = React.useCallback(
    (next: UploadFile[]) => {
      filesRef.current = next
      if (!isControlled) setInternal(next)
      onChange?.(next)
    },
    [isControlled, onChange],
  )

  /** 局部更新某个文件并触发 onFileChange。 */
  const patchFile = React.useCallback(
    (id: string, patch: Partial<UploadFile>) => {
      const next = filesRef.current.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      )
      const target = next.find((item) => item.id === id)
      commit(next)
      if (target) onFileChange?.(target)
    },
    [commit, onFileChange],
  )

  const startUpload = React.useCallback(
    (target: UploadFile) => {
      if (!uploader) return
      const controller = new AbortController()
      controllersRef.current.set(target.id, controller)
      patchFile(target.id, { status: "uploading", progress: 0, error: undefined })

      uploader(target.file, {
        signal: controller.signal,
        onProgress: (percent) => {
          // 进度可能在请求被取消后回调，这里再校验一次。
          if (controller.signal.aborted) return
          patchFile(target.id, {
            progress: Math.max(0, Math.min(100, Math.round(percent))),
          })
        },
      })
        .then((response) => {
          if (controller.signal.aborted) return
          patchFile(target.id, {
            status: "success",
            progress: 100,
            response,
          })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          console.error('[Upload] error', error)
          const message =
            error instanceof Error ? error.message : String(error ?? "上传失败")
          patchFile(target.id, { status: "error", error: message })
        })
        .finally(() => {
          controllersRef.current.delete(target.id)
        })
    },
    [patchFile, uploader],
  )

  const addFiles = React.useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return

      const wrapped: UploadFile[] = incoming.map((file) => ({
        id: createId(),
        file,
        status: uploader ? "uploading" : "success",
        progress: uploader ? 0 : 100,
      }))

      let next: UploadFile[]
      if (!multiple) {
        // 单文件模式：替换旧文件并取消其上传请求。
        filesRef.current.forEach((old) => {
          controllersRef.current.get(old.id)?.abort()
        })
        next = wrapped.slice(0, 1)
      } else {
        next = [...filesRef.current, ...wrapped]
        if (typeof maxCount === "number" && next.length > maxCount) {
          // 超出 maxCount 的部分作为拒绝项反馈给业务方。
          const overflow = next.slice(maxCount)
          next = next.slice(0, maxCount)
          onReject?.(
            overflow.map((item) => ({
              file: item.file,
              reason: "too-many-files" as const,
              message: `最多仅支持 ${maxCount} 个文件`,
            })),
          )
        }
      }

      commit(next)
      // 上传需要拿到最新的引用，所以用 next 中的对应项触发。
      wrapped.forEach((item) => {
        const inList = next.find((f) => f.id === item.id)
        if (inList && uploader) startUpload(inList)
      })
    },
    [commit, maxCount, multiple, onReject, startUpload, uploader],
  )

  const handleDrop = React.useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        const normalized = normalizeRejections(rejected)
        onReject?.(normalized)

        // 文件过大 toast 提示，包含限制大小
        const tooLargeFiles = normalized.filter((r) => r.reason === "file-too-large")
        if (tooLargeFiles.length > 0) {
          const sizeLimit = maxSize ? formatBytes(maxSize) : "5MB"
          const names = tooLargeFiles.map((r) => r.file.name).join("、")
          toast.error(`${names} 超出大小限制（最大 ${sizeLimit}）`)
        }

        // 文件类型不支持 toast 提示，包含支持的类型
        const invalidTypeFiles = normalized.filter((r) => r.reason === "file-invalid-type")
        if (invalidTypeFiles.length > 0) {
          const typeDesc = describeAccept(accept)
          const names = invalidTypeFiles.map((r) => r.file.name).join("、")
          const suffix = typeDesc ? `，仅支持 ${typeDesc}` : ""
          toast.error(`${names} 文件类型不支持${suffix}`)
        }
      }
      if (accepted.length > 0) addFiles(accepted)
    },
    [addFiles, onReject, maxSize, accept],
  )

  const remove = React.useCallback(
    (id: string) => {
      controllersRef.current.get(id)?.abort()
      controllersRef.current.delete(id)
      commit(filesRef.current.filter((item) => item.id !== id))
    },
    [commit],
  )

  const retry = React.useCallback(
    (id: string) => {
      const target = filesRef.current.find((item) => item.id === id)
      if (!target) return
      startUpload(target)
    },
    [startUpload],
  )

  const clear = React.useCallback(() => {
    filesRef.current.forEach((item) => {
      controllersRef.current.get(item.id)?.abort()
    })
    controllersRef.current.clear()
    commit([])
  }, [commit])

  /** 组件卸载时统一清理副作用。 */
  React.useEffect(() => {
    const controllers = controllersRef.current
    return () => {
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
    }
  }, [])

  return { files, addFiles, handleDrop, remove, retry, clear }
}

/**
 * 统一的图片预览 src 计算。
 *
 * 优先用 response.url（api.ts 中已拼接为 `window.location.origin + url` 的绝对地址）；
 * 否则对原始 File 即时 createObjectURL，并在依赖变化 / 组件卸载时 revoke，避免内存泄露。
 * 非图片文件返回 undefined。
 */
export function useImagePreviewSrc(file: UploadFile): string | undefined {
  const isImage = file.file.type.startsWith("image/")
  const responseUrl =
    typeof file.response?.url === "string" ? (file.response.url as string) : undefined

  const [objectUrl, setObjectUrl] = React.useState<string | undefined>(undefined)
  React.useEffect(() => {
    if (!isImage || responseUrl) {
      setObjectUrl(undefined)
      return
    }
    const url = URL.createObjectURL(file.file)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file.file, isImage, responseUrl])

  if (!isImage) return undefined
  return responseUrl ?? objectUrl
}
