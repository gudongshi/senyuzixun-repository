import type { ReactNode } from 'react'
import { ThemeProvider, type ThemeProviderProps } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'

export interface AppProvidersProps {
  children: ReactNode
  /** 是否挂载全局 Toaster（基于 components/ui/sonner，已对接 next-themes） */
  enableToaster?: boolean
  /** 透传给 next-themes 的额外配置 */
  themeProps?: Omit<ThemeProviderProps, 'children'>
}

/**
 * AppProviders 默认主题配置。
 *
 * - `attribute: 'class'`：与 `tailwind.config.js` 中 `darkMode: ["class"]` 对齐，
 *   next-themes 会在 `<html>` 上加 `dark` class，从而：
 *     1) 触发 `app.css` 中 `.dark` 选择器下的 CSS 变量；
 *     2) 让 Tailwind `dark:xxx` 工具类生效。
 * - `enableSystem`：跟随系统偏好。
 * - `disableTransitionOnChange`：切换主题时禁用过渡，防止全屏闪烁。
 */
const defaultThemeProps: Omit<ThemeProviderProps, 'children'> = {
  attribute: 'class',
  defaultTheme: 'system',
  enableSystem: true,
  disableTransitionOnChange: true,
}

/**
 * 应用全局能力 Provider 集合：仅注入运行时能力，不产生任何 DOM 布局结构。
 * 1. 通过 next-themes 注入暗黑主题能力，对接 Tailwind 的 `darkMode: 'class'`；
 * 2. 默认挂载基于 `components/ui/sonner` 的 Toaster，全局可调用 `toast(...)`。
 *
 * 页面的视觉布局（容器、间距、背景等）请在业务组件中自行实现。
 *
 * 推荐在 `main.tsx` 中包裹 `<App />` 使用。
 */
export function AppProviders({
  children,
  enableToaster = true,
  themeProps,
}: AppProvidersProps) {
  const mergedThemeProps = { ...defaultThemeProps, ...themeProps }

  return (
    <ThemeProvider {...mergedThemeProps}>
      {children}
      {enableToaster ? <Toaster /> : null}
    </ThemeProvider>
  )
}
