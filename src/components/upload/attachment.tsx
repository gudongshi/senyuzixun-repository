import * as React from "react"
import { useDropzone } from "react-dropzone"
import { Paperclip, Upload } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"

import type { FileItemClassNames } from "./file-item"
import { FileList } from "./file-list"
import type { UploadCommonProps } from "./types"
import { useUpload } from "./use-upload"

export interface AttachmentUploadClassNames {
  /** 最外层容器。 */
  root?: string
  /** 顶部触发区（按钮所在的行）。 */
  trigger?: string
  /** 文件列表容器。 */
  list?: string
  /** 透传到 FileList 中每个 FileItem。 */
  item?: FileItemClassNames
}

export interface AttachmentUploadProps extends UploadCommonProps {
  /** 触发按钮文案，默认 "选择文件"。 */
  triggerText?: React.ReactNode
  /** 触发按钮的 variant，默认 outline。 */
  triggerVariant?: ButtonProps["variant"]
  /** 触发按钮的 size，默认 default。 */
  triggerSize?: ButtonProps["size"]
  /** 是否在按钮右侧显示提示文案（如 "支持 jpg/png，单文件 ≤ 10MB"）。 */
  hint?: React.ReactNode
  /** 文件项是否展示缩略图（图片类型才会真正展示）。默认 true。 */
  showThumbnail?: boolean
  /** 各 slot 的样式覆盖。 */
  classNames?: AttachmentUploadClassNames
}

/**
 * 多文件附件上传组件。
 *
 * 视觉形式：顶部一个触发按钮（点击 / 拖入到按钮上即可弹出选择窗），下方
 * 是垂直排列的文件列表（与 DragUpload 共享 FileList，行为完全一致）。
 *
 * 适用场景：表单字段中需要"附件"语义但又不希望整个表单变成大拖拽区时。
 */
export function AttachmentUpload(props: AttachmentUploadProps) {
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
    triggerText = "选择文件",
    triggerVariant = "outline",
    triggerSize,
    hint,
    showThumbnail = true,
    classNames,
  } = props

  const { files, handleDrop, remove, retry } = useUpload({
    multiple: true,
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

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    multiple: true,
    accept,
    maxSize,
    disabled,
    onDrop: handleDrop,
    // 由我们自己的按钮触发，避免整行被点击。
    noClick: true,
    noKeyboard: true,
  })

  const reachedLimit =
    typeof maxCount === "number" && files.length >= maxCount

  return (
    <div
      {...getRootProps()}
      className={cn("flex flex-col gap-3", className, classNames?.root)}
    >
      <input {...getInputProps()} />

      <div
        className={cn(
          "flex items-center gap-3",
          isDragActive && "rounded-md ring-2 ring-primary/40",
          classNames?.trigger,
        )}
      >
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          disabled={disabled || reachedLimit}
          onClick={open}
        >
          <Paperclip />
          {triggerText}
        </Button>
        {hint && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
      </div>

      {/* 拖拽进入时的视觉提示，仅当列表为空时显示，避免遮挡列表。 */}
      {isDragActive && files.length === 0 && (
        <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-primary bg-primary/5 px-4 py-6 text-sm text-primary">
          <Upload className="size-4" />
          释放以上传
        </div>
      )}

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
