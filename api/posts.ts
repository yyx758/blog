import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_REPO = (process.env.GITHUB_REPO || 'yyx758/blog').trim();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
const GITHUB_BRANCH = 'main';
const CONTENT_PATH = 'src/content/posts';

async function githubFetch(url: string, token?: string, options?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...((options?.headers as Record<string, string> | undefined) || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (options?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(timer);
  }
}

function getFileContent(data: Record<string, unknown>) {
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    return Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8');
  }
  return '';
}

async function triggerRedeploy() {
  const hookUrl = process.env.DEPLOY_HOOK_URL?.trim();
  if (hookUrl) {
    try {
      await fetch(hookUrl, { method: 'POST' });
    } catch {}
  }
}

function encodeContent(content: string) {
  return Buffer.from(content, 'utf8').toString('base64');
}

function yamlString(value: unknown) {
  return JSON.stringify(String(value || ''));
}

function buildFrontmatter(post: Record<string, unknown>) {
  const lines = ['---'];
  lines.push(`title: ${yamlString(post.title)}`);
  lines.push(`date: ${post.date || new Date().toISOString().split('T')[0]}`);
  if (Array.isArray(post.tags) && post.tags.length > 0) {
    lines.push(`tags: [${post.tags.map((t) => yamlString(t)).join(', ')}]`);
  }
  if (post.description) lines.push(`description: ${yamlString(post.description)}`);
  if (post.draft) lines.push(`draft: true`);
  lines.push('---');
  return lines.join('\n');
}

function escapeMdxJsxText(value: string) {
  return value
    .split(/(`[^`\n]*`)/g)
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`')) return part;
      return part.replace(/<\/?[A-Z][A-Za-z0-9_.-]*(?:\s[^>\n]*)?>/g, (match) =>
        match.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      );
    })
    .join('');
}

function sanitizeMdxBody(body: unknown) {
  const lines = String(body || '').split('\n');
  let inFence = false;
  let fenceMarker = '';

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s*(```+|~~~+)/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (!inFence) {
          inFence = true;
          fenceMarker = marker;
        } else if (marker === fenceMarker) {
          inFence = false;
          fenceMarker = '';
        }
        return line;
      }

      return inFence ? line : escapeMdxJsxText(line);
    })
    .join('\n');
}

function getQueryString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isSafeImageName(filename: unknown) {
  return (
    typeof filename === 'string' &&
    /^(?!\.)(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|jpe?g|gif|webp|avif)$/i.test(filename)
  );
}

function isSafePostFilename(filename: unknown) {
  return (
    typeof filename === 'string' &&
    /^(?!\.)(?!.*\.\.)[A-Za-z0-9_\-\u4e00-\u9fff][A-Za-z0-9._\-\u4e00-\u9fff]*\.(md|mdx)$/i.test(filename)
  );
}

function getImageMime(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  return 'image/png';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendImageError(res: VercelResponse, status: number, error: string, detail?: string) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json({ error, detail });
}

async function serveImage(filename: string, res: VercelResponse) {
  if (!isSafeImageName(filename)) {
    sendImageError(res, 400, 'Invalid image filename');
    return;
  }

  const imgPath = `public/images/${filename}`;
  const imgUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${imgPath}?ref=${GITHUB_BRANCH}`;
  let imgResp: Response | undefined;

  for (let attempt = 0; attempt < 4; attempt++) {
    imgResp = await githubFetch(imgUrl, GITHUB_TOKEN);
    if (imgResp.ok || imgResp.status !== 404) break;
    await sleep(250 * (attempt + 1));
  }

  if (!imgResp) {
    sendImageError(res, 502, 'GitHub image fetch failed');
    return;
  }

  if (!imgResp.ok) {
    const detail = await imgResp.json().catch(() => ({}));
    sendImageError(
      res,
      imgResp?.status === 404 ? 404 : 502,
      imgResp?.status === 404 ? 'Image not found' : 'GitHub image fetch failed',
      detail.message
    );
    return;
  }

  const imgData = await imgResp.json();
  if (typeof imgData.content !== 'string' || imgData.encoding !== 'base64') {
    sendImageError(res, 404, 'Image data error');
    return;
  }

  const buf = Buffer.from(imgData.content.replace(/\s/g, ''), 'base64');
  res.setHeader('Content-Type', getImageMime(filename));
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.status(200).send(buf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  try {
    const imageParam = getQueryString((req.query as Record<string, string | string[] | undefined>)?.image);
    if (method === 'GET' && imageParam) {
      await serveImage(imageParam, res);
      return;
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      res.status(401).json({ error: '未授权' });
      return;
    }

    switch (method) {
      case 'GET': {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CONTENT_PATH}?ref=${GITHUB_BRANCH}`;
        const response = await githubFetch(url, token);
        const files = await response.json();

        if (!Array.isArray(files)) {
          if (response.status === 404) {
            res.status(200).json([]);
            return;
          }
          const errMsg = (files as any)?.message || 'Unknown error';
          res.status(response.status || 500).json({ error: `GitHub API: ${errMsg}` });
          return;
        }

        const posts = [];
        for (const file of files) {
          if (!file.name.endsWith('.md') && !file.name.endsWith('.mdx')) continue;
          const contentRes = await githubFetch(file.url, token);
          const contentData = await contentRes.json();
          const content = getFileContent(contentData);

          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!fmMatch) continue;

          const fm = fmMatch[1];
          const titleMatch = fm.match(/title:\s*"?([^"\n]+)"?/);
          const dateMatch = fm.match(/date:\s*(.+)/);
          const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
          const descMatch = fm.match(/description:\s*"?([^"\n]*)"?.*/);
          const draftMatch = fm.match(/draft:\s*true/);

          const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

          posts.push({
            filename: file.name,
            sha: contentData.sha,
            title: titleMatch?.[1] || file.name,
            date: dateMatch?.[1]?.trim() || '',
            tags: tagsMatch
              ? tagsMatch[1].split(',').map((t: string) => t.trim().replace(/"/g, ''))
              : [],
            description: descMatch?.[1] || '',
            draft: !!draftMatch,
            body,
          });
        }

        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        res.status(200).json(posts);
        break;
      }

      case 'POST': {
        // 图片上传
        if (req.body.action === 'upload-image') {
          const { filename: imgFilename, content: imgContent } = req.body;
          if (!isSafeImageName(imgFilename) || !imgContent) {
            res.status(400).json({ error: '图片文件名或内容无效' });
            return;
          }
          const imgPath = `public/images/${imgFilename}`;
          const imgResponse = await githubFetch(
            `https://api.github.com/repos/${GITHUB_REPO}/contents/${imgPath}`,
            token,
            {
              method: 'PUT',
              body: JSON.stringify({
                message: `上传图片: ${imgFilename}`,
                content: imgContent,
                branch: GITHUB_BRANCH,
              }),
            }
          );
          const imgData = await imgResponse.json();
          if (imgResponse.ok) {
            triggerRedeploy();
            res.status(200).json({ success: true, path: `/api/posts?image=${encodeURIComponent(imgFilename)}`, sha: imgData.content?.sha });
          } else {
            res.status(imgResponse.status).json({ error: imgData.message });
          }
          return;
        }

        // 文章上传
        const { filename, title, date, tags, description, draft, body } = req.body;
        if (!isSafePostFilename(filename) || !title) {
          res.status(400).json({ error: '文件名或标题无效' });
          return;
        }

        const content = buildFrontmatter({ title, date, tags, description, draft }) + '\n\n' + sanitizeMdxBody(body);
        const encoded = encodeContent(content);

        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CONTENT_PATH}/${filename}`;
        const response = await githubFetch(url, token, {
          method: 'PUT',
          body: JSON.stringify({
            message: `新增文章: ${title}`,
            content: encoded,
            branch: GITHUB_BRANCH,
          }),
        });

        const data = await response.json();
        if (response.ok) {
          triggerRedeploy();
          res.status(200).json({ success: true, sha: data.content?.sha });
        } else {
          res.status(response.status).json({ error: data.message });
        }
        break;
      }

      case 'PUT': {
        const { filename: editFilename, sha, title: editTitle, date: editDate, tags: editTags, description: editDesc, draft: editDraft, body: editBody } = req.body;
        if (!isSafePostFilename(editFilename) || !sha) {
          res.status(400).json({ error: '文件名或 sha 无效' });
          return;
        }

        const editContent = buildFrontmatter({ title: editTitle, date: editDate, tags: editTags, description: editDesc, draft: editDraft }) + '\n\n' + sanitizeMdxBody(editBody);
        const editEncoded = encodeContent(editContent);

        const editUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CONTENT_PATH}/${editFilename}`;
        const editResponse = await githubFetch(editUrl, token, {
          method: 'PUT',
          body: JSON.stringify({
            message: `编辑文章: ${editTitle}`,
            content: editEncoded,
            sha,
            branch: GITHUB_BRANCH,
          }),
        });

        const editData = await editResponse.json();
        if (editResponse.ok) {
          triggerRedeploy();
          res.status(200).json({ success: true, sha: editData.content?.sha });
        } else {
          res.status(editResponse.status).json({ error: editData.message });
        }
        break;
      }

      case 'DELETE': {
        const { filename: delFilename, sha: delSha, title: delTitle } = req.body;
        if (!isSafePostFilename(delFilename) || !delSha) {
          res.status(400).json({ error: '文件名或 sha 无效' });
          return;
        }

        const delUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CONTENT_PATH}/${delFilename}`;
        const delResponse = await githubFetch(delUrl, token, {
          method: 'DELETE',
          body: JSON.stringify({
            message: `删除文章: ${delTitle || delFilename}`,
            sha: delSha,
            branch: GITHUB_BRANCH,
          }),
        });

        if (delResponse.ok) {
          triggerRedeploy();
          res.status(200).json({ success: true });
        } else {
          const delData = await delResponse.json();
          res.status(delResponse.status).json({ error: delData.message });
        }
        break;
      }

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    const msg = error.name === 'AbortError' ? 'GitHub API 请求超时' : error.message;
    res.status(500).json({ error: msg });
  }
}
