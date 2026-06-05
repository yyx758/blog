import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID?.trim();
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET?.trim();
const SITE_URL = (process.env.SITE_URL || 'https://my-blog-yyyyx.vercel.app').trim();
const SITE_ORIGIN = new URL(SITE_URL).origin;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    res.status(500).json({ error: 'GitHub OAuth 环境变量未配置' });
    return;
  }

  if (!code) {
    const redirectUri = `${SITE_ORIGIN}/api/auth`;
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`;
    res.redirect(url);
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    clearTimeout(timer);
    const data = await response.json();

    if (data.access_token) {
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <script>
          window.opener?.postMessage({ token: ${JSON.stringify(data.access_token)} }, ${JSON.stringify(SITE_ORIGIN)});
          window.close();
        </script>
        <p>授权成功，请关闭此窗口。</p>
      `);
    } else {
      res.status(400).json({ error: 'Authorization failed', detail: data });
    }
  } catch (error: any) {
    const msg = error.name === 'AbortError' ? 'GitHub OAuth 请求超时' : error.message;
    res.status(500).json({ error: msg });
  }
}
