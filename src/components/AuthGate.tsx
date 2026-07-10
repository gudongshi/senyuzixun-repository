import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';

// ============================================================
// AuthGate — 登录守卫组件
//
// 1. 挂载后调用 GET /api/dingtalk/me 检测登录态
// 2. 已登录 → 通过 UserContext 提供用户信息（含 roles），渲染 children
// 3. 未登录 → 显示「钉钉登录」按钮，跳转钉钉 OAuth 授权页
// 4. 检测中 → 全屏 loading spinner
// 5. 无任何角色权限 → 显示"您没有访问任何模块的权限"
// ============================================================

const APP_ID = import.meta.env.VITE_DINGTALK_APP_ID as string;
const REDIRECT = (import.meta.env.VITE_DINGTALK_REDIRECT_URI as string) || window.location.origin;

/** 登录页中显示的提示文字（可用于外部注入错误信息） */
interface AuthGateProps {
  children: ReactNode;
  /** 登录失败时显示的错误信息 */
  loginError?: string | null;
}

/** 后端 /api/dingtalk/me 返回的用户信息 */
export interface UserInfo {
  userId: string;
  name: string;
  loginTime?: number;
  roles: {
    dashboard: boolean;
    manager: boolean;
  };
}

// ── 用户上下文 ──
const UserContext = createContext<UserInfo | null>(null);

/** 在 AuthGate 内部使用，获取当前登录用户信息 */
export function useAuthUser(): UserInfo | null {
  return useContext(UserContext);
}

export function AuthGate({ children, loginError }: AuthGateProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 本地开发环境跳过钉钉登录（mock 用户）
    if (import.meta.env.DEV) {
      console.log('🔧 开发模式：使用 mock 用户（双角色）');
      setUser({
        userId: 'dev',
        name: '本地开发',
        loginTime: Date.now(),
        roles: { dashboard: true, manager: true },
      });
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetch('/api/dingtalk/me')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          const u = data.user;
          setUser({
            userId: u.userId,
            name: u.name,
            loginTime: u.loginTime,
            roles: u.roles || { dashboard: false, manager: false },
          });
        } else {
          setError(data.error || '未登录');
        }
      })
      .catch(() => {
        if (!cancelled) setError('网络错误，请检查网络连接');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── 检测中 ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">正在验证登录状态…</p>
        </div>
      </div>
    );
  }

  // ── 已登录 → 透传 children（通过 Context 提供用户信息）──
  if (user) {
    // 检查是否没有任何角色权限
    if (!user.roles.dashboard && !user.roles.manager) {
      return (
        <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="flex flex-col items-center gap-6 p-10 bg-white rounded-2xl shadow-lg max-w-sm w-full mx-4 text-center">
            <div className="size-16 rounded-full bg-red-100 flex items-center justify-center">
              <span className="text-3xl">🚫</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800">无访问权限</h2>
            <p className="text-sm text-gray-500">
              您没有访问任何模块的权限，请联系管理员开通。
            </p>
            <p className="text-xs text-gray-400">
              当前用户：{user.name}
            </p>
          </div>
        </div>
      );
    }

    return (
      <UserContext.Provider value={user}>
        {children}
      </UserContext.Provider>
    );
  }

  // ── 未登录 → 登录页 ──
  const displayError = loginError || error;

  // 获取当前 URL 中的 code 参数（用于调试）
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromUrl = urlParams.get('code');

  const loginUrl =
    `https://login.dingtalk.com/oauth2/auth` +
    `?redirect_uri=${encodeURIComponent(REDIRECT)}` +
    `&response_type=code` +
    `&client_id=${encodeURIComponent(APP_ID)}` +
    `&scope=openid` +
    `&prompt=consent`;

  // 复制文本到剪贴板的辅助函数
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => alert('已复制到剪贴板'),
      () => alert('复制失败，请手动复制')
    );
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="flex flex-col items-center gap-6 p-10 bg-white rounded-2xl shadow-lg max-w-sm w-full mx-4">
        {/* 图标 */}
        <div className="size-16 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
          <svg className="size-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
        </div>

        {/* 标题 */}
        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-gray-800">森宇集团项目指挥大屏</h2>
          <p className="text-sm text-gray-500">请使用钉钉账号登录后查看</p>
        </div>

        {/* 错误提示 */}
        {displayError && (
          <div className="w-full px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
            <p className="text-xs text-red-600 text-center">{displayError}</p>
          </div>
        )}

        {/* 调试信息：如果 URL 中有 code，显示出来并提供复制按钮 */}
        {codeFromUrl && (
          <div className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs">
            <p className="font-mono text-gray-700 break-all">
              <span className="font-bold">🔑 code:</span> {codeFromUrl}
            </p>
            <button
              onClick={() => copyToClipboard(codeFromUrl)}
              className="mt-2 w-full py-1 bg-gray-200 hover:bg-gray-300 rounded text-gray-800 transition"
            >
              复制 code
            </button>
            <p className="mt-2 text-gray-500">
              💡 提示：登录失败时，可复制上方的 code，然后在服务器执行 curl 命令测试后端接口。
            </p>
          </div>
        )}

        {/* 登录按钮 */}
        <a
          href={loginUrl}
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors shadow-md hover:shadow-lg active:scale-95"
        >
          {/* 钉钉图标（简化的 D 形 logo） */}
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3.5 5.5h-7a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0V9h5v6h-2.25a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75z" />
          </svg>
          钉钉登录
        </a>
      </div>
    </div>
  );
}

// ── 导出一个 Hook 供其他组件获取当前用户 ──
export function useCurrentUser() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dingtalk/me')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setUser({
            userId: d.user.userId,
            name: d.user.name,
            loginTime: d.user.loginTime,
            roles: d.user.roles || { dashboard: false, manager: false },
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}