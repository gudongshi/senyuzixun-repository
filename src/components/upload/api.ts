import { getAuthHeader } from "@/lib/auth"
import type { UploadResponse } from "./types"

// ============================================================
// Upload — API layer
// Centralised upload function so components don't need an
// uploader prop; they can call this directly.
// ============================================================

/**
 * 将服务端返回的相对路径拼接为绝对地址：`window.location.origin + url`。
 * - 若已是 http(s) 绝对地址，原样返回
 * - 非浏览器环境（SSR）下返回原值，避免访问 window 报错
 */
function toAbsoluteUrl(url?: string): string | undefined {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  if (typeof window === "undefined") return url
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`
}

/**
 * Upload a single file to the server.
 * @param file - The browser File object to upload.
 * @param onProgress - Optional callback receiving 0-100 progress updates.
 * @param signal - Optional AbortSignal to cancel the upload.
 * @returns
 */
export function uploadFile(
  file: File,
  options: {
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  } = {},
): Promise<UploadResponse> {
  const { onProgress, signal } = options

  const formData = new FormData()
  formData.append("file", file)

  const xhr = new XMLHttpRequest()

  const responsePromise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.open("POST", "/api/storage/upload")

    // Apply auth headers
    const authHeaders = getAuthHeader()
    for (const [key, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, value as string)
    }

    // Progress tracking
    if (onProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          onProgress(percent)
        }
      })
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText)
          if (json.success && json.data) {
            const data = json.data as UploadResponse
            // 统一将服务端返回的相对路径拼接为绝对地址，方便业务方直接使用
            data.url = toAbsoluteUrl(data.url)
            resolve(data)
          } else {
            reject(new Error(json.error || "Upload failed"))
          }
        } catch {
          reject(new Error("Upload failed: invalid JSON response"))
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
      }
    })

    xhr.addEventListener("error", () => reject(new Error("Upload failed: network error")))
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")))

    // Wire up AbortSignal
    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        reject(new Error("Upload aborted"))
        return
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true })
    }

    xhr.send(formData)
  })

  return responsePromise
}

/**
 * Convenience wrapper that adapts `uploadFile` to the `Uploader` signature
 * expected by the upload components (`use-upload.ts`).
 *
 * Usage:
 * ```tsx
 * import { defaultUploader } from "@/components/upload/api"
 * <ImageUpload onUpload={defaultUploader} />
 * ```
 */
export const defaultUploader = (
  file: File,
  ctx: { onProgress: (percent: number) => void; signal: AbortSignal },
): Promise<UploadResponse> => {
  return uploadFile(file, {
    onProgress: ctx.onProgress,
    signal: ctx.signal,
  })
}
