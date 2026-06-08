/**
 * Upload 组件统一出口。
 *
 * 推荐通过此文件导入：
 *   import { ImageUpload, AttachmentUpload, DragUpload } from "@/components/upload"
 */

export { ImageUpload } from "./image"
export type { ImageUploadProps, ImageUploadClassNames } from "./image"

export { AttachmentUpload } from "./attachment"
export type {
  AttachmentUploadProps,
  AttachmentUploadClassNames,
} from "./attachment"

export { DragUpload } from "./drag"
export type { DragUploadProps, DragUploadClassNames } from "./drag"

export { FileItem, formatBytes } from "./file-item"
export type { FileItemProps, FileItemClassNames } from "./file-item"

export { FileList } from "./file-list"
export type { FileListProps } from "./file-list"

export { useUpload } from "./use-upload"
export type { UseUploadOptions, UseUploadReturn } from "./use-upload"

export type {
  UploadFile,
  UploadStatus,
  UploadResponse,
  Uploader,
  UploaderContext,
  UploadCommonProps,
  UploadRejection,
} from "./types"

export { uploadFile, defaultUploader } from "./api"
