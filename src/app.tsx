import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ProjectManager from './pages/ProjectManager';
import { AuthGate } from './components/AuthGate';

/**
 * App 入口
 *
 * 职责：
 *  1. 检测 URL 中的 ?code=xxx（钉钉 OAuth 回调），调用后端完成登录
 *  2. 登录态确认后，通过 AuthGate 守卫渲染路由页面
 *  3. 路由：
 *     - /                  → Dashboard（指挥大屏）
 *     - /project-manager   → ProjectManager（项目管理后台）
 */
const App = () => {
  const [processingCode, setProcessingCode] = useState(hasCodeInUrl());
  const [loginError, setLoginError]         = useState<string | null>(null);

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
        setProcessingCode(false); // 停止 loading，显示登录页（此时 URL 仍保留 code）
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

  // ── 阶段 2：AuthGate 守卫 + 路由 ──
  return (
    <BrowserRouter>
      <AuthGate loginError={loginError}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/project-manager" element={<ProjectManager />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
};

/** 当前 URL 是否携带 OAuth 回调的 code 参数 */
function hasCodeInUrl(): boolean {
  return new URLSearchParams(window.location.search).has('code');
}

export default App;