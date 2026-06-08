/**
 * API fetch interceptor — automatically injects Authorization header.
 *
 * Usage:
 *   import { apiFetch } from '../lib/api';
 *   const res = await apiFetch('/api/contacts/employees/search?query=foo');
 *
 * Or use the global fetch patch (called once in src/index.tsx):
 *   import { patchFetch } from '../lib/api';
 *   patchFetch();  // after this, all fetch('/api/...') calls carry the token automatically
 */

import { getToken } from './auth';

/** 将相对路径拼接上 Vite BASE_URL，绝对 URL 原样返回 */
function resolveUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? url : '/' + url}`;
}

/**
 * Fetch wrapper that automatically injects the Authorization header.
 * Drop-in replacement for `fetch` — accepts the same arguments.
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken();
  if (token) {
    options = {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers as Record<string, string> | undefined),
      },
    };
  }
  url = resolveUrl(url);
  return fetch(url, options);
}

/**
 * Patches the global `fetch` so that any request whose URL starts with `/api/`
 * automatically receives the Authorization header and BASE_URL prefix.
 * Call this once at app startup.
 *
 * Example (src/index.tsx):
 *   import { patchFetch } from './lib/api';
 *   patchFetch();
 */
export function patchFetch(): void {
  const _originalFetch = window.fetch.bind(window);
  window.fetch = async function (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApiCall = url.startsWith('/api/') || url.startsWith('./api/');
    if (isApiCall) {
      const token = getToken();
      if (token && !(init.headers && (init.headers as Record<string, string>)['Authorization'])) {
        init = {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init.headers as Record<string, string> | undefined),
          },
        };
      }

      // ✅ 根据 input 类型，分别处理 resolveUrl
      const resolvedInput: RequestInfo | URL =
        typeof input === 'string'
          ? resolveUrl(input)
          : input instanceof URL
          ? new URL(resolveUrl(input.href))
          : new Request(resolveUrl(input.url), input); // Request 对象：用原 Request 作为 init 基础

      return _originalFetch(resolvedInput, init);
    }

    return _originalFetch(input, init);
  };
}
