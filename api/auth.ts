import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query;

  if (!code) {
    // Step 1: Redirect to GitHub OAuth
    const redirectUri = `${process.env.SITE_URL || 'https://my-blog-yyyyx.vercel.app'}/api/auth`;
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo`;
    res.redirect(url);
    return;
  }

  // Step 2: Exchange code for token
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
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
    const data = await response.json();

    if (data.access_token) {
      // Return token as HTML that posts to parent window
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <script>
          window.opener?.postMessage({ token: '${data.access_token}' }, '*');
          window.close();
        </script>
        <p>授权成功，请关闭此窗口。</p>
      `);
    } else {
      res.status(400).json({ error: 'Authorization failed' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}
