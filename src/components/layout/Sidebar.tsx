import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard, ClipboardList, ShieldCheck, Globe, Settings,
  Menu, X, LogOut, ChevronLeft, Printer,
} from 'lucide-react';

// ============================================================
// 类型
// ============================================================
export type PageKey = 'home' | 'qualifications' | 'siteHub' | 'print' | 'settings';

export interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home',        label: '工作台首页',   icon: LayoutDashboard },
  { key: 'qualifications', label: '人员资质',  icon: ShieldCheck },
  { key: 'siteHub',     label: '官网管理',     icon: Globe },
  { key: 'print',       label: '🖨️ 打印分摊', icon: Printer },
  { key: 'settings',    label: '系统设置',     icon: Settings },
];

// ============================================================
// Props
// ============================================================
interface SidebarProps {
  activePage: PageKey;
  onNavigate: (page: PageKey) => void;
  userName?: string;
  userAvatar?: string;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ============================================================
// 组件
// ============================================================
export default function Sidebar({
  activePage,
  onNavigate,
  userName,
  userAvatar,
  onLogout,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <>
      {/* ── 桌面端侧边栏 ── */}
      <aside
        className={`
          hidden lg:flex flex-col fixed inset-y-0 left-0 z-40
          bg-white border-r border-slate-200
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[72px]' : 'w-[240px]'}
        `}
      >
        {/* Logo 区域 */}
        <div className={`
          flex items-center h-16 px-4 border-b border-slate-100 shrink-0
          ${collapsed ? 'justify-center' : 'gap-3'}
        `}>
          {!collapsed && (
            <>
              <img
                src="https://dt-beebot-prod.oss-cn-zhangjiakou.aliyuncs.com/dingtalk_prod_media/20260511/14/22/34/468053ed-51e7-4f77-ab5b-f0c6e1cdd6ee/%E6%A3%AE%E5%AE%87logo-1.jpg"
                alt="森宇集团"
                className="h-8 w-auto rounded-lg"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
              <span className="text-sm font-bold text-slate-800 truncate">
                森宇集团
              </span>
            </>
          )}
          {collapsed && (
            <div className="size-9 rounded-lg bg-slate-900 flex items-center justify-center text-white text-xs font-bold">
              SY
            </div>
          )}
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`
                  w-full flex items-center rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5 gap-3'}
                  ${isActive
                    ? 'bg-slate-100 text-slate-900 shadow-sm border-l-2 border-slate-800'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }
                `}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={20} className={isActive ? 'text-slate-800' : 'text-slate-400'} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-800 font-semibold">
                        {item.badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* 底部：折叠按钮 + 用户 + 登出 */}
        <div className="border-t border-slate-100 p-3 space-y-2 shrink-0">
          {/* 折叠切换 */}
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          >
            <ChevronLeft size={18} className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
          </button>

          {!collapsed && userName && (
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <div className="size-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {userName.charAt(0) || '?'}
              </div>
              <span className="text-xs text-slate-600 truncate flex-1">{userName}</span>
            </div>
          )}

          <button
            onClick={onLogout}
            className={`
              w-full flex items-center rounded-lg text-sm text-slate-400
              hover:text-red-500 hover:bg-red-50 transition-colors
              ${collapsed ? 'justify-center py-2.5' : 'px-3 py-2 gap-2.5'}
            `}
            title="登出"
          >
            <LogOut size={17} />
            {!collapsed && <span>登出</span>}
          </button>
        </div>
      </aside>

      {/* ── 移动端汉堡菜单按钮 ── */}
      <MobileSidebar
        activePage={activePage}
        onNavigate={onNavigate}
        userName={userName}
        userAvatar={userAvatar}
        onLogout={onLogout}
      />
    </>
  );
}

// ============================================================
// 移动端：汉堡按钮 + 滑出抽屉
// ============================================================
function MobileSidebar({
  activePage,
  onNavigate,
  userName,
  userAvatar,
  onLogout,
}: Omit<SidebarProps, 'collapsed' | 'onToggleCollapse'>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 汉堡按钮 — 固定左上角 */}
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-600 hover:text-slate-900 transition-colors"
        aria-label="打开菜单"
      >
        <Menu size={20} />
      </button>

      {/* 遮罩 */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 抽屉 */}
      <aside
        className={`
          lg:hidden fixed inset-y-0 left-0 z-50 w-[260px] bg-white border-r border-slate-200
          shadow-2xl transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img
              src="https://dt-beebot-prod.oss-cn-zhangjiakou.aliyuncs.com/dingtalk_prod_media/20260511/14/22/34/468053ed-51e7-4f77-ab5b-f0c6e1cdd6ee/%E6%A3%AE%E5%AE%87logo-1.jpg"
              alt="森宇集团"
              className="h-8 w-auto rounded-lg"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
            <span className="text-sm font-bold text-slate-800">森宇集团</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* 导航 */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { onNavigate(item.key); setOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${isActive
                    ? 'bg-slate-100 text-slate-900 shadow-sm border-l-2 border-slate-800'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }
                `}
              >
                <item.icon size={20} className={isActive ? 'text-slate-800' : 'text-slate-400'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 用户 + 登出 */}
        <div className="border-t border-slate-100 p-4 space-y-3">
          {userName && (
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white text-xs font-bold">
                {userName.charAt(0) || '?'}
              </div>
              <span className="text-sm text-slate-700">{userName}</span>
            </div>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors w-full"
          >
            <LogOut size={17} />
            <span>登出</span>
          </button>
        </div>
      </aside>
    </>
  );
}