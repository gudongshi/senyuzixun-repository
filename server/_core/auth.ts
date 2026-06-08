import { createClient } from '@supabase/supabase-js';
import { UserContext } from '../lib/user-context.js';
import { ENV } from './env.js';

/**
 * 构建登录跳转 URL。
 *
 * 将当前请求的完整 URL 作为 continue_url 参数传递给登录页，
 * 同时从 continue_url 中移除 aiapp_auth_token 参数（避免循环），
 * 如果原始请求中携带了 aiapp_auth_token 则单独透传给登录页。
 */
function buildLoginRedirectUrl(req: any): string {
  const protocol = req.protocol;
  const host = req.get('host');
  const pathname = req.path;
  const aiappAuthToken = req.query.aiapp_auth_token as string | undefined;

  // 构建干净的 query string，移除 aiapp_auth_token
  const cleanQueryParts: string[] = [];
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'aiapp_auth_token') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        cleanQueryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
      }
    } else {
      cleanQueryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  const cleanQueryString = cleanQueryParts.length > 0 ? '?' + cleanQueryParts.join('&') : '';
  const continueUrl = `${protocol}://${host}${pathname}${cleanQueryString}`;

  let loginUrl = `${ENV.aiappPlatformOrigin}/oauth/dingtalk-login?continue_url=${encodeURIComponent(continueUrl)}`;
  if (aiappAuthToken) {
    loginUrl += `&aiapp_auth_token=${encodeURIComponent(aiappAuthToken)}`;
  }
  return loginUrl;
}

/**
 * Authentication middleware for all /api routes.
 * Extracts Bearer token from Authorization header, validates it via Supabase,
 * and mounts req.user (UserContext) and req.supabase on the request object.
 */
export async function need_login(req: any, res: any, next: any) {
  const requestPath = req.originalUrl || req.url;
  try {
    // 优先从 Authorization header 取 token，其次从 Cookie 中取 access_token
    const headerToken = req.headers.authorization?.split(' ')[1];
    const cookieToken = req.cookies?.access_token;
    const token = headerToken || cookieToken;
    if (!token) {
      const loginUrl = buildLoginRedirectUrl(req);
      console.warn(`[NeedLogin] No token found (header and cookie both empty), redirecting to login. path=${requestPath}, loginUrl=${loginUrl}`);
      res.redirect(302, loginUrl);
      return;
    }
    const supabase = createClient(
      ENV.supabaseUrl!,
      ENV.supabaseAnonKey!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      const loginUrl = buildLoginRedirectUrl(req);
      console.warn(`[NeedLogin] Token verification failed (${error?.message || 'user is null'}), redirecting to login. path=${requestPath}, loginUrl=${loginUrl}`);
      res.redirect(302, loginUrl);
      return;
    }
    req.user = new UserContext({
      corp_id: user.user_metadata?.corp_id,
      emp_id: user.user_metadata?.emp_id,
      name: user.user_metadata?.nick,
      avatar: user.user_metadata?.avatar,
      app_id: ENV.appId,
    });
    req.supabase = supabase;
    next();
  } catch (e) {
    const loginUrl = buildLoginRedirectUrl(req);
    console.error(`[NeedLogin] Unexpected error during auth, redirecting to login. path=${requestPath}, error=`, e);
    res.redirect(302, loginUrl);
  }
}
