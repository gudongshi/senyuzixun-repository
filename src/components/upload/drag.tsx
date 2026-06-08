import * as React from "react"
import { useDropzone } from "react-dropzone"
import { Upload } from "lucide-react"

import { cn } from "@/lib/utils"

import type { FileItemClassNames } from "./file-item"
import { FileList } from "./file-list"
import type { UploadCommonProps } from "./types"
import { useUpload } from "./use-upload"

export interface DragUploadClassNames {
  /** 最外层容器。 */
  root?: string
  /** 拖拽区。 */
  dropzone?: string
  /** 拖拽区内的图标容器。 */
  icon?: string
  /** 拖拽区内的标题。 */
  title?: string
  /** 拖拽区内的描述。 */
  description?: string
  /** 文件列表容器。 */
  list?: string
  /** 透传到每个 FileItem。 */
  item?: FileItemClassNames
}

export interface DragUploadProps extends UploadCommonProps {
  /** 是否多文件，默认 true。 */
  multiple?: boolean
  /** 拖拽区主标题。 */
  title?: React.ReactNode
  /** 拖拽区描述（小字提示）。 */
  description?: React.ReactNode
  /** 拖拽区图标。 */
  icon?: React.ReactNode
  /** 文件项是否展示缩略图。默认 true。 */
  showThumbnail?: boolean
  /** 各 slot 的样式覆盖。 */
  classNames?: DragUploadClassNames
}

/**
 * 大面积拖拽上传组件，支持单/多文件两种模式。
 *
 * 与 AttachmentUpload 复用同一份 FileList 与 useUpload，差异仅在视觉形态：
 * 这里把整个区域做成可拖拽的虚线框，更适合"导入文件 / 批量上传"语义。
 *
 * multiple = false 时，新文件会替换旧文件（包括取消旧文件的上传请求）。
 */
export function DragUpload(props: DragUploadProps) {
  const {
    onUpload,
    value,
    defaultValue,
    onChange,
    onFileChange,
    onReject,
    accept,
    maxSize = 5 * 1024 * 1024,
    maxCount,
    disabled,
    className,
    multiple = true,
    title,
    description,
    icon,
    showThumbnail = true,
    classNames,
  } = props

  const { files, handleDrop, remove, retry } = useUpload({
    multiple,
    uploader: onUpload,
    value,
    defaultValue,
    onChange,
    onFileChange,
    onReject,
    maxCount,
    maxSize,
    accept,
  })

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      multiple,
      accept,
      maxSize,
      disabled,
      onDrop: handleDrop,
    })

  const defaultTitle = isDragActive
    ? isDragReject
      ? "文件类型不支持"
      : "释放以上传"
    : multiple
      ? "点击或拖拽多个文件到此处"
      : "点击或拖拽文件到此处"

  return (
    <div className={cn("flex flex-col gap-3", className, classNames?.root)}>
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed bg-muted/20 px-6 py-10 text-center text-muted-foreground transition-colors",
          "hover:bg-muted/40",
          isDragActive && !isDragReject && "border-primary bg-primary/5 text-primary",
          isDragReject && "border-destructive bg-destructive/5 text-destructive",
          disabled && "cursor-not-allowed opacity-60 hover:bg-muted/20",
          classNames?.dropzone,
        )}
      >
        <input {...getInputProps()} />
        <div className={cn("[&_svg]:size-8", classNames?.icon)}>
          {icon ?? <Upload />}
        </div>
        <div
          className={cn("text-sm font-medium text-foreground", classNames?.title)}
        >
          {title ?? defaultTitle}
        </div>
        {description !== null && (
          <div className={cn("text-xs", classNames?.description)}>
            {description ?? <DefaultDescription accept={accept} maxSize={maxSize} maxCount={maxCount} />}
          </div>
        )}
      </div>

      <FileList
        files={files}
        disabled={disabled}
        showThumbnail={showThumbnail}
        className={classNames?.list}
        itemClassNames={classNames?.item}
        onRemove={(file) => remove(file.id)}
        onRetry={(file) => retry(file.id)}
      />
    </div>
  )
}

interface DefaultDescriptionProps {
  accept?: UploadCommonProps["accept"]
  maxSize?: number
  maxCount?: number
}

/** 根据 accept / maxSize / maxCount 推导一段默认提示。 */
function DefaultDescription(props: DefaultDescriptionProps) {
  const { accept, maxSize, maxCount } = props
  const parts: string[] = []

  if (accept) {
    const exts = Object.values(accept).flat().filter(Boolean)
    if (exts.length > 0) parts.push(`支持 ${exts.join(" / ")}`)
  }
  if (typeof maxSize === "number") {
    parts.push(`单文件 ≤ ${formatSize(maxSize)}`)
  }
  if (typeof maxCount === "number") {
    parts.push(`最多 ${maxCount} 个`)
  }

  if (parts.length === 0) return null
  return <>{parts.join(" · ")}</>
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${bytes}B`
}
