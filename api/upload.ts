import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_REPO = (process.env.GITHUB_REPO || 'yyx758/blog').trim();
const GITHUB_BRANCH = 'main';
const IMAGE_PATH = 'public/images';

async function githubFetch(url: string, token: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '未授权' });
    return;
  }

  try {
    const { filename, content, mimeType } = req.body;
    if (!filename || !content) {
      res.status(400).json({ error: '缺少文件名或内容' });
      return;
    }

    // content 是 base64 编码的图片数据（不带 data:... 前缀）
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${IMAGE_PATH}/${filename}`;
    const response = await githubFetch(url, token, {
      method: 'PUT',
      body: JSON.stringify({
        message: `上传图片: ${filename}`,
        content: content,
        branch: GITHUB_BRANCH,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      res.status(200).json({
        success: true,
        path: `/images/${filename}`,
        sha: data.content?.sha,
      });
    } else {
      res.status(response.status).json({ error: data.message });
    }
  } catch (error: any) {
    const msg = error.name === 'AbortError' ? '上传超时' : error.message;
    res.status(500).json({ error: msg });
  }
}
