import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA;
const currentSha = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD';
const commitMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE || '';

function continueBuild(reason) {
  console.log(`[vercel-ignore] build: ${reason}`);
  process.exit(1);
}

function skipBuild(reason) {
  console.log(`[vercel-ignore] skip: ${reason}`);
  process.exit(0);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function isDraft(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return Boolean(frontmatter?.[1].match(/^draft:\s*true\s*$/m));
}

function readPreviousFile(path) {
  try {
    return git(['show', `${previousSha}:${path}`]);
  } catch {
    return '';
  }
}

function isPostPath(path) {
  return /^src\/content\/posts\/[^/]+\.md$/u.test(path);
}

function isImagePath(path) {
  return /^public\/images\/[^/]+\.(png|jpe?g|gif|webp|avif)$/iu.test(path);
}

if (/\[(deploy|build)\]/i.test(commitMessage)) {
  continueBuild('commit message requested deployment');
}

if (!previousSha || /^0+$/.test(previousSha)) {
  continueBuild('missing previous commit');
}

let changedFiles = [];
try {
  changedFiles = git(['diff', '--name-only', previousSha, currentSha])
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
} catch (error) {
  continueBuild(`unable to diff commits: ${error.message}`);
}

if (changedFiles.length === 0) {
  continueBuild('no changed files detected');
}

for (const file of changedFiles) {
  if (isImagePath(file)) continue;

  if (!isPostPath(file)) {
    continueBuild(`code or config changed: ${file}`);
  }

  const previousContent = readPreviousFile(file);
  const currentContent = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const wasPublic = previousContent ? !isDraft(previousContent) : false;
  const isPublic = currentContent ? !isDraft(currentContent) : false;

  if (wasPublic || isPublic) {
    continueBuild(`public post changed: ${file}`);
  }
}

skipBuild('only draft posts and images changed');
