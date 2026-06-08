# Frontend Template

AI App 前端脚手架模板，基于 React 18 + Vite 7 + TypeScript 5 + Tailwind CSS 3 + shadcn/ui 构建。

## 技术栈

- **React 18** — UI 框架
- **Vite 7** — 构建工具，构建目标 ES2015
- **TypeScript 5.8** — 类型系统，bundler 模式
- **Tailwind CSS 3.4** — 原子化 CSS 框架，使用 CSS 变量主题系统
- **shadcn/ui** — 基于 Radix UI 的组件库（default 风格，CSS 变量模式）
- **ESLint 9** — 代码检查
- **PostCSS + Autoprefixer** — CSS 后处理

### 关键依赖

- **class-variance-authority** — 组件变体管理
- **clsx + tailwind-merge** — 条件样式合并（`cn()` 工具函数）
- **Radix UI** — 无障碍原语组件
- **Recharts** — 图表库
- **Embla Carousel** — 轮播组件
- **Sonner** — Toast 通知
- **Vaul** — Drawer 组件
- **cmdk** — Command Palette
- **react-day-picker + date-fns** — 日期选择
- **react-resizable-panels** — 可调整大小面板
- **input-otp** — OTP 输入
- **next-themes** — 主题切换
- **lucide-react** — 图标库
- **ai-app-client** — AI App 客户端 SDK

## 项目结构

```
src/
├── app.tsx              # 应用主组件
├── app.css              # 全局样式 & CSS 变量（light/dark 主题）
├── main.tsx             # 入口文件
├── vite-env.d.ts        # Vite 类型声明
├── lib/
│   └── utils.ts         # cn() 样式合并工具函数
├── hooks/
│   └── use-mobile.tsx   # 移动端检测 hook
└── components/
|   └── ui/              # shadcn/ui 组件目录
index.html               # HTML 入口，挂载 #root 节点，加载 /src/main.tsx；其中的 <title> 内容需要替换为应用实际名称。
public/app.icon.svg      # 应用图标，需要根据应用实际情况生成，注意规格尺寸要符合 favicon 标准。
```

## 路径别名

使用 `@/*` 映射到 `./src/*`，在 `tsconfig.app.json` 和 `vite.config.ts` 中均已配置。

## shadcn/ui 组件列表

组件位于 `src/components/ui/`，通过 `@/components/ui/<name>` 引用。所有 shadcn/ui 组件都已内置，无需额外生成或者添加 shadcn/ui 组件。

### 表单 & 输入

| 组件 | 文件 | 描述 |
|------|------|------|
| Button | `button.tsx` | 按钮组件，支持 default / destructive / outline / secondary / ghost / link 等变体 |
| Button Group | `button-group.tsx` | 按钮组，将多个按钮组合在一起 |
| Input | `input.tsx` | 文本输入框 |
| Input Group | `input-group.tsx` | 输入框组，支持前缀和后缀附加内容 |
| Input OTP | `input-otp.tsx` | 一次性密码输入组件 |
| Textarea | `textarea.tsx` | 多行文本输入框 |
| Checkbox | `checkbox.tsx` | 复选框 |
| Radio Group | `radio-group.tsx` | 单选按钮组 |
| Select | `select.tsx` | 下拉选择器 |
| Switch | `switch.tsx` | 开关切换组件 |
| Slider | `slider.tsx` | 滑块输入组件 |
| Calendar | `calendar.tsx` | 日历组件，用于日期选择 |
| Label | `label.tsx` | 表单标签 |
| Field | `field.tsx` | 表单字段组件，包含标签和错误信息 |

### 布局 & 导航

| 组件 | 文件 | 描述 |
|------|------|------|
| Accordion | `accordion.tsx` | 可折叠手风琴组件 |
| Breadcrumb | `breadcrumb.tsx` | 面包屑导航 |
| Navigation Menu | `navigation-menu.tsx` | 无障碍导航菜单，支持下拉子菜单 |
| Sidebar | `sidebar.tsx` | 可折叠侧边栏布局组件 |
| Tabs | `tabs.tsx` | 选项卡切换组件 |
| Separator | `separator.tsx` | 内容分隔线 |
| Scroll Area | `scroll-area.tsx` | 自定义滚动区域，带有样式化滚动条 |
| Resizable | `resizable.tsx` | 可调整大小的面板布局 |

### 弹层 & 对话框

| 组件 | 文件 | 描述 |
|------|------|------|
| Dialog | `dialog.tsx` | 模态对话框 |
| Alert Dialog | `alert-dialog.tsx` | 确认提示对话框 |
| Sheet | `sheet.tsx` | 滑出面板（侧边抽屉） |
| Drawer | `drawer.tsx` | 移动端友好的抽屉组件（基于 Vaul） |
| Popover | `popover.tsx` | 浮动弹出框 |
| Tooltip | `tooltip.tsx` | 工具提示 |
| Hover Card | `hover-card.tsx` | 悬停时显示的卡片 |
| Context Menu | `context-menu.tsx` | 右键上下文菜单 |
| Dropdown Menu | `dropdown-menu.tsx` | 下拉菜单 |
| Menubar | `menubar.tsx` | 水平菜单栏 |
| Command | `command.tsx` | 命令面板（基于 cmdk） |

### 反馈 & 状态

| 组件 | 文件 | 描述 |
|------|------|------|
| Alert | `alert.tsx` | 提示/警告消息组件 |
| Sonner | `sonner.tsx` | Toast 通知组件（基于 Sonner） |
| Progress | `progress.tsx` | 进度条 |
| Spinner | `spinner.tsx` | 加载旋转指示器 |
| Skeleton | `skeleton.tsx` | 骨架屏加载占位 |
| Badge | `badge.tsx` | 徽章标签，用于标签和状态指示 |
| Empty | `empty.tsx` | 空状态组件 |

### 展示 & 媒体

| 组件 | 文件 | 描述 |
|------|------|------|
| Avatar | `avatar.tsx` | 头像组件 |
| Card | `card.tsx` | 卡片容器 |
| Table | `table.tsx` | 数据表格 |
| Chart | `chart.tsx` | 图表组件（基于 Recharts） |
| Carousel | `carousel.tsx` | 轮播组件（基于 Embla Carousel） |
| Aspect Ratio | `aspect-ratio.tsx` | 保持宽高比的容器 |
| Item | `item.tsx` | 通用列表/菜单项组件 |
| Kbd | `kbd.tsx` | 键盘快捷键展示组件 |

### 其他

| 组件 | 文件 | 描述 |
|------|------|------|
| Collapsible | `collapsible.tsx` | 可折叠容器 |
| Toggle | `toggle.tsx` | 切换按钮 |
| Toggle Group | `toggle-group.tsx` | 切换按钮组 |
| Pagination | `pagination.tsx` | 分页组件 |

## 主题配置

主题通过 CSS 变量定义在 `src/app.css` 中，支持 light/dark 模式。颜色使用 HSL 格式，在 `tailwind.config.js` 中通过 `hsl(var(--<token>))` 引用。

核心 design tokens：`--background`、`--foreground`、`--primary`、`--secondary`、`--muted`、`--accent`、`--destructive`、`--border`、`--input`、`--ring`、`--radius`。
