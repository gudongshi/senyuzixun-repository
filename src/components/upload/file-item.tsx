import * as React from "react"
import {
  AlertCircle,
  CheckCircle2,
  File as FileIcon,
  FileImage,
  FileText,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

import type { UploadFile } from "./types"
import { useImagePreviewSrc } from "./use-upload"

/**
 * 把字节数转成易读字符串。仅展示用，不参与逻辑判断。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

/** 根据 MIME 类型挑选合适的图标。 */
function pickIcon(file: File): React.ReactNode {
  if (file.type.startsWith("image/")) return <FileImage />
  if (file.type.startsWith("text/")) return <FileText />
  return <FileIcon />
}

export interface FileItemClassNames {
  /** 单行根容器。 */
  root?: string
  /** 左侧缩略图 / 图标容器。 */
  thumbnail?: string
  /** 中间信息块（文件名 + 状态）。 */
  meta?: string
  /** 进度条。 */
  progress?: string
  /** 右侧操作按钮组。 */
  actions?: string
}

export interface FileItemProps {
  file: UploadFile
  /** 是否禁用所有交互（删除、重试）。 */
  disabled?: boolean
  /** 是否显示图片缩略图（仅图片类型有效）。默认 true。 */
  showThumbnail?: boolean
  /** 各 slot 的样式覆盖。 */
  classNames?: FileItemClassNames
  /** 删除回调。未提供时不渲染删除按钮。 */
  onRemove?: (file: UploadFile) => void
  /** 重试回调。未提供时即使 status === "error" 也不渲染重试按钮。 */
  onRetry?: (file: UploadFile) => void
  /** 自定义渲染右侧操作区，会替换默认的删除/重试按钮。 */
  renderActions?: (file: UploadFile) => React.ReactNode
}

/**
 * 单个文件行。被 FileList、Attachment、Drag 复用。
 *
 * 设计成纯展示组件：所有状态来源于 props，自身不持有上传逻辑，便于二次组合。
 */
export const FileItem = React.forwardRef<HTMLDivElement, FileItemProps>(
  function FileItem(props, ref) {
    const {
      file,
      disabled,
      showThumbnail = true,
      classNames,
      onRemove,
      onRetry,
      renderActions,
    } = props

    const isImage = file.file.type.startsWith("image/")
    const previewSrc = useImagePreviewSrc(file)
    const showImageThumb = showThumbnail && isImage && !!previewSrc

    return (
      <div
        ref={ref}
        data-status={file.status}
        className={cn(
          "group flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm",
          file.status === "error" && "border-destructive/50",
          classNames?.root,
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground [&_svg]:size-5",
            classNames?.thumbnail,
          )}
        >
          {showImageThumb ? (
            <img
              src={previewSrc}
              alt={file.file.name}
              className="size-full object-cover"
            />
          ) : (
            pickIcon(file.file)
          )}
        </div>

        <div className={cn("min-w-0 flex-1", classNames?.meta)}>
          <div className="flex items-center gap-2">
            <span className="truncate font-medium" title={file.file.name}>
              {file.file.name}
            </span>
            <StatusBadge status={file.status} />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {file.status === "error" ? (
              <span className="text-destructive">{file.error ?? "上传失败"}</span>
            ) : (
              <span>
                {formatBytes(file.file.size)}
                {file.status === "uploading" && ` · ${file.progress}%`}
              </span>
            )}
          </div>
          {file.status === "uploading" && (
            <Progress
              value={file.progress}
              className={cn("mt-1.5 h-1", classNames?.progress)}
            />
          )}
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1 [&_svg]:size-4",
            classNames?.actions,
          )}
        >
          {renderActions ? (
            renderActions(file)
          ) : (
            <>
              {file.status === "error" && onRetry && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={disabled}
                  onClick={() => onRetry(file)}
                  aria-label="重试"
                >
                  <RefreshCw />
                </Button>
              )}
              {onRemove && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  disabled={disabled}
                  onClick={() => onRemove(file)}
                  aria-label="移除"
                >
                  <X />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    )
  },
)

function StatusBadge({ status }: { status: UploadFile["status"] }) {
  if (status === "uploading") {
    return (
      <span className="inline-flex items-center text-muted-foreground [&_svg]:size-3.5">
        <Loader2 className="animate-spin" />
      </span>
    )
  }
  if (status === "success") {
    return (
      <span className="inline-flex items-center text-emerald-600 [&_svg]:size-3.5">
        <CheckCircle2 />
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center text-destructive [&_svg]:size-3.5">
        <AlertCircle />
      </span>
    )
  }
  return null
}
