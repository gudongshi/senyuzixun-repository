import * as React from "react"

import { cn } from "@/lib/utils"

import { FileItem, type FileItemClassNames, type FileItemProps } from "./file-item"
import type { UploadFile } from "./types"

export interface FileListProps {
  files: UploadFile[]
  disabled?: boolean
  showThumbnail?: boolean
  /** 列表为空时是否完全不渲染（默认 true）。 */
  hideWhenEmpty?: boolean
  /** 列表容器 className。 */
  className?: string
  /** 透传到每个 FileItem 的 classNames。 */
  itemClassNames?: FileItemClassNames
  onRemove?: FileItemProps["onRemove"]
  onRetry?: FileItemProps["onRetry"]
  /** 自定义文件项渲染。提供时不再渲染默认 FileItem。 */
  renderItem?: (file: UploadFile, index: number) => React.ReactNode
}

/**
 * 简单的文件列表容器。被 attachment / drag 共享。
 *
 * 不引入虚拟滚动，业务方有大量文件需求时建议自行包一层 ScrollArea。
 */
export function FileList(props: FileListProps) {
  const {
    files,
    disabled,
    showThumbnail,
    hideWhenEmpty = true,
    className,
    itemClassNames,
    onRemove,
    onRetry,
    renderItem,
  } = props

  if (hideWhenEmpty && files.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {files.map((file, index) =>
        renderItem ? (
          <React.Fragment key={file.id}>{renderItem(file, index)}</React.Fragment>
        ) : (
          <FileItem
            key={file.id}
            file={file}
            disabled={disabled}
            showThumbnail={showThumbnail}
            classNames={itemClassNames}
            onRemove={onRemove}
            onRetry={onRetry}
          />
        ),
      )}
    </div>
  )
}
