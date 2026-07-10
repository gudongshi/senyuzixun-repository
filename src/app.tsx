import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectManager from './pages/ProjectManager';
import { AuthGate, useAuthUser } from './components/AuthGate';

/**
 * App 入口
 *
 * 职责：
 *  1. 检测 URL 中的 ?code=xxx（钉钉 OAuth 回调），调用后端完成登录
 *  2. 登录态确认后，通过 AuthGate 守卫渲染路由页面
 *  3. 路由权限控制（双白名单分权）：
 *     - /                  → 大屏：仅 roles.dashboard === true
 *     - /project-manager   → 项目管理后台：仅 roles.manager === true
 *     - 无任何角色 → 显示"无权限"页面
 */
const App = () => {
  const [processingCode, setProcessingCode] = useState(hasCodeInUrl());
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    // —— 无 code 参数：直接进入 AuthGate 检测 ——
    if (!code) return;

    // —— 有 code 参数：调用后端登录接口 ——
    let cancelled = false;

    console.log('[App] 检测到 code，即将调用后端:', code);

    fetch(`/api/dingtalk/login?code=${encodeURIComponent(code)}`)
      .then(async (resp) => {
        const data = await resp.json().catch(() => ({} as Record<string, unknown>));
        console.log('[App] 后端响应状态:', resp.status, data);
        if (!resp.ok || !data.success) {
          throw new Error((data.error as string) || `登录失败 (${resp.status})`);
        }
        // 登录成功：清除 URL 中的 code 参数，刷新页面让 AuthGate 走正常检测
        if (!cancelled) {
          window.history.replaceState(null, '', window.location.pathname);
          setProcessingCode(false);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        console.error('[App] 钉钉登录回调失败:', err.message);
        window.history.replaceState(null, '', window.location.pathname);
        setLoginError(err.message);
        setProcessingCode(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── 阶段 1：正在处理 OAuth 回调 code ──
  if (processingCode) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="size-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">正在完成钉钉登录…</p>
        </div>
      </div>
    );
  }

  // ── 阶段 2：AuthGate 守卫 + 路由权限控制 ──
  return (
    <BrowserRouter>
      <AuthGate loginError={loginError}>
        <AppRoutes />
      </AuthGate>
    </BrowserRouter>
  );
};

/**
 * 路由守卫组件（必须在 AuthGate / UserContext.Provider 内部使用）
 */
function AppRoutes() {
  const user = useAuthUser();

  // AuthGate 已处理 loading 和未登录状态，这里 user 一定存在
  if (!user) return null;

  const { dashboard, manager } = user.roles;

  // 没有任何角色（AuthGate 应该已经拦截，此处作为兜底）
  if (!dashboard && !manager) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <div className="flex flex-col items-center gap-6 p-10 bg-slate-800/60 border border-blue-900/30 rounded-2xl max-w-sm w-full mx-4 text-center">
          <div className="size-16 rounded-full bg-red-900/30 flex items-center justify-center">
            <span className="text-3xl">🚫</span>
          </div>
          <h2 className="text-xl font-bold text-slate-200">无访问权限</h2>
          <p className="text-sm text-slate-400">
            您没有访问任何模块的权限，请联系管理员开通。
          </p>
          <p className="text-xs text-slate-500">
            当前用户：{user.name}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          dashboard ? (
            <Dashboard />
          ) : (
            <Navigate to={manager ? '/project-manager' : '/'} replace />
          )
        }
      />
      <Route
        path="/project-manager"
        element={
          manager ? (
            <ProjectManager />
          ) : (
            <Navigate to={dashboard ? '/' : '/project-manager'} replace />
          )
        }
      />
    </Routes>
  );
}

/** 当前 URL 是否携带 OAuth 回调的 code 参数 */
function hasCodeInUrl(): boolean {
  return new URLSearchParams(window.location.search).has('code');
}

export default App;