import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface UseDarkModeResult {
  /** 当前用户选择的主题（包含 'system'） */
  theme: ThemeMode
  /** 实际生效的主题（'light' 或 'dark'，已解析 system 偏好） */
  resolvedTheme: 'light' | 'dark'
  /** 当前是否处于暗黑模式 */
  isDark: boolean
  /** Provider 是否已完成挂载，用于避免 SSR/水合期闪烁 */
  mounted: boolean
  /** 直接设置主题 */
  setTheme: (theme: ThemeMode) => void
  /** 在 light / dark 之间切换 */
  toggle: () => void
}

/**
 * 暗黑主题适配 Hook。
 *
 * 与 `tailwind.config.js` 中 `darkMode: ["class"]` 配置对接：
 * 当主题切换时，next-themes 会在 `<html>` 上加/去除 `dark` class，
 * 从而让 Tailwind 的 `dark:xxx` 工具类与 `app.css` 中 `.dark` 选择器下的 CSS 变量同时生效。
 *
 * 必须在 `<ThemeProvider attribute="class">` 内部使用，`Layout` 组件已默认提供。
 */
export function useDarkMode(): UseDarkModeResult {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // next-themes 在首屏水合前 resolvedTheme 为 undefined，
  // 通过 mounted 守卫让消费方可在水合完成后再渲染依赖主题的 UI，避免闪烁。
  useEffect(() => {
    setMounted(true)
  }, [])

  const currentResolved: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light'
  const isDark = mounted && currentResolved === 'dark'

  const toggle = useCallback(() => {
    setTheme(currentResolved === 'dark' ? 'light' : 'dark')
  }, [currentResolved, setTheme])

  return {
    theme: (theme as ThemeMode) ?? 'system',
    resolvedTheme: currentResolved,
    isDark,
    mounted,
    setTheme: setTheme as (theme: ThemeMode) => void,
    toggle,
  }
}
