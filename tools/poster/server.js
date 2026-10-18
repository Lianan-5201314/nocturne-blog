#!/usr/bin/env node
/**
 * 星舞互娱 · 发文台
 * 本地零依赖服务：写文章 -> git commit -> push -> GitHub Actions 自动部署
 *
 * 启动：node tools/poster/server.js  （或双击 tools/poster/start.bat）
 * 默认地址：http://localhost:4399
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const DRAFTS_DIR = path.join(ROOT, 'source', '_drafts');
const IMAGES_DIR = path.join(ROOT, 'source', 'images');
const UPLOADS_DIR = path.join(IMAGES_DIR, 'uploads');
const CONFIG_YML = path.join(ROOT, '_config.yml');
const CNAME_FILE = path.join(ROOT, 'source', 'CNAME');
const UI_FILE = path.join(__dirname, 'ui.html');

const BASE_PORT = Number(process.env.POSTER_PORT || 4399);
const MAX_BODY = 30 * 1024 * 1024;
const IGNORE_COVERS = new Set();

/* ------------------------------------------------------------------ utils */

const pad = (n) => String(n).padStart(2, '0');

function stamp(d = new Date()) {
  return {
    y: d.getFullYear(),
    m: pad(d.getMonth() + 1),
    d: pad(d.getDate()),
    hh: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
}

function yamlEscape(text) {
  return String(text == null ? '' : text).replace(/\r?\n/g, ' ').replace(/'/g, "''").trim();
}

function plainText(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(title) {
  const base = String(title || '')
    .toLowerCase()
    .replace(/['"“”‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'note';
}

function uniqueFile(dir, base) {
  let file = path.join(dir, base + '.md');
  let i = 2;
  while (fs.existsSync(file)) {
    file = path.join(dir, `${base}-${i}.md`);
    i += 1;
  }
  return file;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    // HOME 若是 /c/Users/xxx 这类 MSYS 路径，原生 ssh 读不到 known_hosts，统一换成 Windows 路径
    const winHome = process.env.USERPROFILE || os.homedir();
    const env = { ...process.env, HOME: winHome };
    execFile(cmd, args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, env, ...opts }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === 'number' ? err.code : err ? 1 : 0,
        out: (stdout || '').trim(),
        err: (stderr || '').trim(),
      });
    });
  });
}

/** 双击 bat 启动时 PATH 可能不全，按候选位置找 git */
let GIT_BIN = null;
const GIT_CANDIDATES = [
  'git',
  'D:\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  'E:\\TXAI\\WorkBuddy\\resources\\vendor\\PortableGit\\mingw64\\bin\\git.exe',
];

async function resolveGit() {
  if (GIT_BIN) return GIT_BIN;
  for (const bin of GIT_CANDIDATES) {
    const probe = await run(bin, ['--version']);
    if (probe.ok && /git version/.test(probe.out)) {
      GIT_BIN = bin;
      return bin;
    }
  }
  GIT_BIN = 'git';
  return GIT_BIN;
}

async function git(args) {
  const bin = await resolveGit();
  return run(bin, args);
}

/* ------------------------------------------------------------------ 站点信息 */

function readSiteConfig() {
  let url = 'https://xwhy.online';
  try {
    if (fs.existsSync(CNAME_FILE)) {
      const host = fs.readFileSync(CNAME_FILE, 'utf8').trim();
      if (host) url = 'https://' + host;
    }
    if (fs.existsSync(CONFIG_YML)) {
      const m = fs.readFileSync(CONFIG_YML, 'utf8').match(/^url:\s*(\S+)/m);
      if (m && /^https?:\/\//.test(m[1]) && !/workbuddy\.host|github\.io/.test(m[1])) url = m[1];
    }
  } catch (_) {}
  return { url, root: '/' };
}

function listCovers() {
  try {
    return fs
      .readdirSync(path.join(IMAGES_DIR, 'covers'))
      .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
      .filter((f) => !IGNORE_COVERS.has(f))
      .map((f) => '/images/covers/' + f);
  } catch (_) {
    return [];
  }
}

/* ------------------------------------------------------------------ 文章读写 */

function parsePost(file) {
  const full = path.join(POSTS_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  const fmEnd = raw.indexOf('\n---', 3);
  const head = fmEnd > -1 ? raw.slice(0, fmEnd) : '';
  const body = fmEnd > -1 ? raw.slice(fmEnd + 4) : raw;
  const pick = (key) => {
    const m = head.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
    return m ? m[1].replace(/^['"]|['"]$/g, '').trim() : '';
  };
  const tags = [];
  const tagBlock = head.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
  if (tagBlock) {
    tagBlock[1].split('\n').forEach((line) => {
      const t = line.replace(/^\s*-\s*/, '').trim();
      if (t) tags.push(t);
    });
  }
  return {
    file,
    title: pick('title') || file.replace(/\.md$/, ''),
    date: pick('date'),
    desc: pick('description'),
    cover: pick('cover'),
    tags,
    words: plainText(body).length,
    excerpt: plainText(body).slice(0, 90),
  };
}

function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      try {
        return parsePost(f);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* ------------------------------------------------------------------ 发布 */

let publishQueue = Promise.resolve();
const recentPublishes = new Map();

function enqueue(task) {
  const run = publishQueue.then(task, task);
  publishQueue = run.catch(() => {});
  return run;
}

async function publish(payload) {
  const content = String(payload.content || '').trim();
  if (!content) throw new Error('正文是空的，先写点什么吧');

  const rawTitle = String(payload.title || '').trim();
  const firstLine = plainText(content.split('\n')[0]).slice(0, 40);
  const title = rawTitle || firstLine || '无题';
  const isDraft = !!payload.draft;

  const now = new Date();
  const t = stamp(now);
  const slug = `${slugify(rawTitle || 'note')}-${t.y}${t.m}${t.d}-${t.hh}${t.mm}${t.ss}`;

  // 不选封面时留空，交给主题在每次构建时从 source/_data/images.yml 随机抽一张
  const cover = String(payload.cover || '').trim();

  const tags = (Array.isArray(payload.tags) ? payload.tags : String(payload.tags || '').split(/[,，\s]+/))
    .map((t2) => String(t2).trim())
    .filter(Boolean)
    .slice(0, 8);
  const categories = (Array.isArray(payload.categories) ? payload.categories : String(payload.categories || '').split(/[,，\s]+/))
    .map((t2) => String(t2).trim())
    .filter(Boolean)
    .slice(0, 3);

  const dateStr = `${t.y}-${t.m}-${t.d} ${t.hh}:${t.mm}:${t.ss}`;
  const desc = plainText(content).slice(0, 110);

  const lines = ['---', `title: '${yamlEscape(title)}'`, `date: ${dateStr}`];
  if (categories.length) {
    lines.push('categories:');
    categories.forEach((c) => lines.push(`  - ${c}`));
  }
  if (tags.length) {
    lines.push('tags:');
    tags.forEach((c) => lines.push(`  - ${c}`));
  }
  if (desc) lines.push(`description: '${yamlEscape(desc)}'`);
  // ShokaX 的 _cover 会用 statics('/') 拼一次前缀，cover 带前导 / 会变成 //images/... 被当成协议相对地址而裂图
  if (cover) lines.push(`cover: ${cover.replace(/^\/+/, '')}`);
  lines.push('---', '');

  const dir = isDraft ? DRAFTS_DIR : POSTS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const target = uniqueFile(dir, slug);
  fs.writeFileSync(target, lines.join('\n') + content + '\n', 'utf8');

  const relFile = path.relative(ROOT, target).split(path.sep).join('/');
  const site = readSiteConfig();
  const url = `${site.url}/${t.y}/${t.m}/${t.d}/${path.basename(target, '.md')}/`;

  const result = {
    ok: true,
    draft: isDraft,
    file: relFile,
    title,
    date: dateStr,
    cover,
    url,
    pushed: false,
    commit: '',
    log: [],
  };

  if (isDraft) {
    result.log.push({ step: '写入草稿', ok: true, detail: relFile });
    return result;
  }

  result.log.push({ step: '写入文章', ok: true, detail: relFile });

  // 只提交本次涉及的文件，避免带到无关改动
  const addTargets = ['source/_posts/' + path.basename(target)];
  if (payload.uploaded && fs.existsSync(UPLOADS_DIR)) addTargets.push('source/images/uploads');
  await git(['add', '--'].concat(addTargets));
  result.log.push({ step: '暂存改动', ok: true, detail: addTargets.join(' ') });

  const commit = await git(['commit', '-m', `post: ${title}`.slice(0, 72)]);
  const nothingToCommit = /nothing to commit|no changes added/i.test(commit.out + commit.err);
  if (!commit.ok && !nothingToCommit) {
    result.log.push({ step: '提交', ok: false, detail: commit.err || commit.out });
    result.error = '本地提交失败，请检查 git 配置';
    return result;
  }
  const hash = await git(['rev-parse', '--short', 'HEAD']);
  result.commit = hash.out || '';
  result.log.push({ step: '提交', ok: true, detail: result.commit });

  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
  const push = await git(['push', 'origin', branch]);
  if (push.ok) {
    result.pushed = true;
    result.log.push({ step: '推送到 GitHub', ok: true, detail: `${branch} @ ${result.commit}` });
  } else {
    result.log.push({ step: '推送到 GitHub', ok: false, detail: push.err || push.out });
    result.error = '文章已保存并提交到本地，但推送失败（网络或代理问题）。稍后可运行 git push 补推。';
  }
  return result;
}

/* ------------------------------------------------------------------ HTTP */

function send(res, code, data, type) {
  const body = type ? data : JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('内容过大（图片请控制在 20MB 内）'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(new Error('请求格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function saveUpload(name, dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new Error('只支持 PNG / JPG / GIF / WEBP 图片');
  const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 20 * 1024 * 1024) throw new Error('单张图片不要超过 20MB');
  const t = stamp();
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  const base = (slugify(String(name || '').replace(/\.[^.]+$/, '')) || 'img').replace(/^note$/, 'img').slice(0, 24);
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const file = `${t.y}${t.m}${t.d}-${t.hh}${t.mm}${t.ss}-${base}-${hash}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, file), buf);
  return { path: '/images/uploads/' + file, bytes: buf.length };
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { ok: false, error: 'not found' });
    const ext = path.extname(file).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.avif': 'image/avif',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, UI_FILE);

  if (req.method === 'GET' && p === '/avatar.jpg') {
    return serveFile(res, path.join(ROOT, 'source', '_data', 'assets', 'avatar.jpg'));
  }

  if (req.method === 'GET' && p.startsWith('/files/')) {
    const rel = decodeURIComponent(p.slice('/files/'.length));
    const abs = path.resolve(ROOT, 'source', rel);
    if (!abs.startsWith(path.join(ROOT, 'source'))) return send(res, 403, { ok: false });
    return serveFile(res, abs);
  }

  if (req.method === 'GET' && p === '/api/config') {
    const site = readSiteConfig();
    return send(res, 200, {
      ok: true,
      site,
      covers: listCovers(),
      posts: listPosts().slice(0, 12),
      branch: (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main',
    });
  }

  if (req.method === 'GET' && p === '/api/posts') {
    return send(res, 200, { ok: true, posts: listPosts() });
  }

  if (req.method === 'POST' && p === '/api/upload') {
    try {
      const body = await readBody(req);
      const saved = saveUpload(body.name, body.dataUrl);
      return send(res, 200, { ok: true, ...saved });
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/publish') {
    try {
      const body = await readBody(req);
      const key = crypto.createHash('md5').update(JSON.stringify([body.title, body.content, !!body.draft])).digest('hex');
      const hit = recentPublishes.get(key);
      if (hit && Date.now() - hit.at < 8000) return send(res, 200, hit.result);

      const result = await enqueue(() => publish(body));
      if (!result.draft) recentPublishes.set(key, { at: Date.now(), result });
      return send(res, result.error ? 207 : 200, result);
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/push') {
    const result = await enqueue(async () => {
      const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
      const push = await git(['push', 'origin', branch]);
      return {
        ok: push.ok,
        pushed: push.ok,
        log: [{ step: '重新推送 ' + branch, ok: push.ok, detail: push.ok ? 'ok' : (push.err || push.out) }],
        error: push.ok ? '' : '推送仍然失败，检查网络或 SSH 配置',
      };
    });
    return send(res, result.ok ? 200 : 207, result);
  }

  if (req.method === 'POST' && p === '/api/delete') {
    try {
      const body = await readBody(req);
      const file = String(body.file || '').replace(/^.*[\\/]/, '');
      const target = path.join(POSTS_DIR, file);
      if (!fs.existsSync(target)) return send(res, 404, { ok: false, error: '文件不存在' });

      const result = await enqueue(async () => {
        const rel = 'source/_posts/' + file;
        const rm = await git(['rm', '-q', '--', rel]);
        if (!rm.ok) fs.unlinkSync(target);
        const commit = await git(['commit', '-m', `delete: ${file}`]);
        if (!commit.ok) return { ok: false, error: commit.err || commit.out };
        const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
        const push = await git(['push', 'origin', branch]);
        return { ok: true, pushed: push.ok, error: push.ok ? '' : '已删除并提交，但推送失败' };
      });
      return send(res, 200, result);
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  return send(res, 404, { ok: false, error: 'not found' });
}

function start(port, tries = 0) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, { ok: false, error: e.message }));
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries < 10) {
      start(port + 1, tries + 1);
      return;
    }
    console.error('启动失败：', err.message);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    const addr = `http://localhost:${port}/`;
    console.log('');
    console.log('  星舞互娱 · 发文台已启动');
    console.log('  ' + addr);
    console.log('  关闭窗口或按 Ctrl+C 结束');
    console.log('');
    if (process.argv.includes('--open')) {
      const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      const args = process.platform === 'win32' ? ['/c', 'start', '""', addr] : [addr];
      try {
        spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
      } catch (_) {}
    }
  });
}

start(BASE_PORT);
