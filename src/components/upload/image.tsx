import * as React from "react"
import { useDropzone } from "react-dropzone"
import { AlertCircle, ImagePlus, Loader2, RefreshCw, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

import type { UploadCommonProps, UploadFile } from "./types"
import { useImagePreviewSrc, useUpload } from "./use-upload"

/**
 * 与 ImageUpload 组件外观相关的 className 槽位。
 *
 * 暴露这些字段是为了让业务方在不 fork 组件的前提下，仍能调整尺寸 / 颜色 /
 * 圆角等关键视觉属性。AI 二次生成时，可以只覆盖个别 slot。
 */
export interface ImageUploadClassNames {
  /** 最外层容器。 */
  root?: string
  /** 空态（点击/拖拽以上传）的占位框。 */
  placeholder?: string
  /** 已选图片的预览框。 */
  preview?: string
  /** 预览图本身（<img>）。 */
  image?: string
  /** 进度遮罩层。 */
  overlay?: string
  /** 错误提示条。 */
  error?: string
}

export interface ImageUploadProps extends Omit<UploadCommonProps, "maxCount"> {
  /**
   * 占位提示文案，可传 ReactNode 自定义图标 + 文案。
   * 默认: "点击或拖拽上传图片"
   */
  placeholder?: React.ReactNode
  /** 容器宽高比，默认 1（正方形）。 */
  aspectRatio?: number
  /** 各 slot 的样式覆盖。 */
  classNames?: ImageUploadClassNames
}

/**
 * 单图上传组件。
 *
 * 关键能力：
 * - 选择 / 拖拽即触发本地预览，无需等待上传完成。
 * - 上传中显示进度遮罩，失败显示错误条 + 重试按钮。
 * - 受控（value 用单元素数组）与非受控两种模式，与 attachment / drag 共用
 *   同一套数据结构，方便互换。
 */
export function ImageUpload(props: ImageUploadProps) {
  const {
    onUpload,
    value,
    defaultValue,
    onChange,
    onFileChange,
    onReject,
    accept = { "image/*": [] },
    maxSize = 5 * 1024 * 1024,
    disabled,
    className,
    placeholder,
    aspectRatio = 1,
    classNames,
  } = props

  const { files, handleDrop, remove, retry } = useUpload({
    multiple: false,
    uploader: onUpload,
    value,
    defaultValue,
    onChange,
    onFileChange,
    onReject,
    maxSize,
    accept,
  })

  const current: UploadFile | undefined = files[0]

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept,
    maxSize,
    disabled: disabled || current?.status === "uploading",
    onDrop: handleDrop,
    // 已上传后点击不再弹文件选择，由我们自定义按钮控制。
    noClick: !!current,
    noKeyboard: !!current,
  })

  return (
    <div className={cn("flex flex-col gap-2", className, classNames?.root)}>
      <div
        {...getRootProps()}
        style={{ aspectRatio }}
        className={cn(
          "group relative w-40 overflow-hidden rounded-md border border-dashed bg-muted/30 transition-colors",
          !current &&
            "flex cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/60",
          isDragActive && "border-primary bg-primary/5",
          disabled && "cursor-not-allowed opacity-60",
          current ? classNames?.preview : classNames?.placeholder,
        )}
      >
        <input {...getInputProps()} />

        {current ? (
          <PreviewContent
            file={current}
            disabled={disabled}
            classNames={classNames}
            onRemove={() => remove(current.id)}
            onRetry={() => retry(current.id)}
          />
        ) : placeholder && typeof placeholder !== "string" ? (
          <>{placeholder}</>
        ) : (
          <>
            <ImagePlus className="size-6" />
            <span className="text-xs">
              {typeof placeholder === "string"
                ? placeholder
                : isDragActive
                  ? "释放以上传"
                  : "点击或拖拽上传图片"}
            </span>
          </>
        )}
      </div>

      {current?.status === "error" && (
        <div
          className={cn(
            "flex items-start gap-1.5 text-xs text-destructive",
            classNames?.error,
          )}
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{current.error ?? "上传失败"}</span>
        </div>
      )}
    </div>
  )
}

interface PreviewContentProps {
  file: UploadFile
  disabled?: boolean
  classNames?: ImageUploadClassNames
  onRemove: () => void
  onRetry: () => void
}

function PreviewContent(props: PreviewContentProps) {
  const { file, disabled, classNames, onRemove, onRetry } = props
  const src = useImagePreviewSrc(file)

  return (
    <>
      {src && (
        <img
          src={src}
          alt={file.file.name}
          className={cn("size-full object-cover", classNames?.image)}
        />
      )}

      {file.status === "uploading" && (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 text-xs",
            classNames?.overlay,
          )}
        >
          <Loader2 className="size-5 animate-spin" />
          <Progress value={file.progress} className="h-1 w-3/4" />
          <span>{file.progress}%</span>
        </div>
      )}

      {file.status === "error" && (
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/10",
            classNames?.overlay,
          )}
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              onRetry()
            }}
            disabled={disabled}
          >
            <RefreshCw />
            重试
          </Button>
        </div>
      )}

      {/* 移除按钮：上传中也允许，因为会触发 abort。 */}
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute right-1 top-1 size-6 opacity-0 shadow transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        disabled={disabled}
        aria-label="移除"
      >
        <X />
      </Button>
    </>
  )
}
