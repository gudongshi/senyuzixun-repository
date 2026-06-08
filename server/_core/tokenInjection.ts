import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlRoot = path.join(__dirname, '..', '..');

/**
 * Token injection middleware for the SPA fallback route.
 *
 * When the request carries `access_token` & `refresh_token` query params,
 * it reads `index.html`, injects a <script> block that exposes the tokens
 * to the client, and serves the modified HTML.
 *
 * Otherwise it falls through to the default static-file handler.
 */
export function createTokenInjectionMiddleware() {
  return (req: any, res: any, next: any) => {
    // Only intercept root path requests with token params
    if (req.path !== '/') {
      return next();
    }
    const accessToken = req.query.access_token as string | undefined;
    const refreshToken = req.query.refresh_token as string | undefined;

    if (!accessToken || !refreshToken) {
      return next();
    }

    const htmlPath = path.join(htmlRoot, 'index.html');
    fs.readFile(htmlPath, 'utf8', (err: NodeJS.ErrnoException | null, html: string) => {
      if (err) {
        console.error('[TokenInjection] Failed to read index.html:', err);
        res.status(500).send('Internal Server Error');
        return;
      }
      const tokenScript = `<script>
var query = new URLSearchParams(location.search);
window.__SUPABASE_ANON_KEY__ = '';
window.__SUPABASE_ACCESS_TOKEN__ = query.get('access_token') || '${accessToken}';
window.__SUPABASE_REFRESH_TOKEN__ = query.get('refresh_token') || '${refreshToken}';
</script>`;
      const injectedHtml = html.replace(/<\/title>/, `</title>\n${tokenScript}`);
      res.type('html').send(injectedHtml);
    });
  };
}