/**
 * Shared auth helpers — consistent token extraction for all API calls.
 *
 * Priority:
 *   1. window.__SUPABASE_ACCESS_TOKEN__  (runtime injection by host)
 *   2. Cookie 'access_token'              (set during OAuth redirect)
 */

export function getCookie(name: string): string | null {
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split('=');
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export const getToken = (): string | null => {
  return (window as any).__SUPABASE_ACCESS_TOKEN__ || getCookie('access_token');
};

export function getAuthHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
