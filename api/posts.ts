import type { VercelRequest, VercelResponse } from '@vercel/node';

const GITHUB_REPO = process.env.GITHUB_REPO || 'yyx758/blog';
const GITHUB_BRANCH = 'main';
const CONTENT_PATH = 'src/content/posts';

async function githubFetch(url: string, token: string, options?: RequestInit) {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

function getFileContent(data: Record<string, unknown>) {
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    return decodeURIComponent(
      atob(data.content)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  }
  return '';
}

function buildFrontmatter(post: Record<string, unknown>) {
  const lines = ['---'];
  lines.push(`title: "${post.title}"`);
  lines.push(`date: ${post.date}`);
  if (Array.isArray(post.tags) && post.tags.length > 0) {
    lines.push(`tags: [${post.tags.map((t: string) => `"${t}"`).join(', ')}]`);
  }
  if (post.description) lines.push(`description: "${post.description}"`);
  if (post.draft) lines.push(`draft: true`);
  lines.push('---');
  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: '未授权' });
    return;
  }

  const { method } = req;

  try {
    switch (method) {
      case 'GET': {
        // List all posts
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${CONTENT_PATH}?ref=${GITHUB_BRANCH}`;
        const response = await githubFetch(url, token);
        const files = await response.json();

        if (!Array.isArray(files)) {
          res.status(500).json({ error: 'Failed to list files' });
          return;
        }

        const posts = [];
        for (const file of files) {
          if (!file.name.endsWith('.md') && !file.name.endsWith('.mdx')) continue;
          const contentRes = await githubFetch(file.url, token);
          const contentData = await contentRes.json();
          const content = getFileContent(contentData);

          // Parse frontmatter
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
        // Create new post
        const { filename, title, date, tags, description, draft, body } = req.body;
        if (!filename || !title) {
          res.status(400).json({ error: '缺少必填字段' });
          return;
        }

        const content = buildFrontmatter({ title, date, tags, description, draft }) + '\n\n' + (body || '');
        const encoded = btoa(
          encodeURIComponent(content).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16))
          )
        );

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
          res.status(200).json({ success: true, sha: data.content?.sha });
        } else {
          res.status(response.status).json({ error: data.message });
        }
        break;
      }

      case 'PUT': {
        // Edit post
        const { filename: editFilename, sha, title: editTitle, date: editDate, tags: editTags, description: editDesc, draft: editDraft, body: editBody } = req.body;
        if (!editFilename || !sha) {
          res.status(400).json({ error: '缺少必填字段' });
          return;
        }

        const editContent = buildFrontmatter({ title: editTitle, date: editDate, tags: editTags, description: editDesc, draft: editDraft }) + '\n\n' + (editBody || '');
        const editEncoded = btoa(
          encodeURIComponent(editContent).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16))
          )
        );

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
          res.status(200).json({ success: true, sha: editData.content?.sha });
        } else {
          res.status(editResponse.status).json({ error: editData.message });
        }
        break;
      }

      case 'DELETE': {
        // Delete post
        const { filename: delFilename, sha: delSha, title: delTitle } = req.body;
        if (!delFilename || !delSha) {
          res.status(400).json({ error: '缺少必填字段' });
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
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
}
