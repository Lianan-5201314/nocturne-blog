#!/usr/bin/env node
/**
 * 星舞互娱 · 主题工坊
 * 本地零依赖服务：改站点/主题配置 -> 预览 -> 提交推送
 *
 * 启动：node tools/studio/server.js   （或双击 tools/studio/start.bat / 根目录 theme.bat）
 * 地址：http://localhost:4400   （预览站点跑在 4401）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE_YML = path.join(ROOT, '_config.yml');
const THEME_YML = path.join(ROOT, '_config.shokax.yml');
const DATA_DIR = path.join(ROOT, 'source', '_data');
const COLOR_CSS = path.join(DATA_DIR, 'theme-color.css');
const CUSTOM_CSS = path.join(DATA_DIR, 'custom.css');
const COVERS_DIR = path.join(ROOT, 'source', 'images', 'covers');
const CATE_DIR = path.join(ROOT, 'source', '_posts', '_cate');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const UI_FILE = path.join(__dirname, 'ui.html');
const PUBLIC_DIR = path.join(ROOT, 'public');

const PORT = Number(process.env.STUDIO_PORT || 4400);
const PREVIEW_PORT = PORT + 1;

let yaml = null;
try {
  yaml = require(path.join(ROOT, 'node_modules', 'js-yaml'));
} catch (e) {
  yaml = null;
}

/* ------------------------------------------------------------------ 基础工具 */

function read(file) {
  if (!fs.existsSync(file)) return '';
  // 统一行尾：Windows 编辑器改过的配置常是 CRLF，直接 split('\n') 会让每行末尾带 \r，YAML 解析全挂
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function winHome() {
  return process.env.USERPROFILE || os.homedir();
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd: ROOT, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, HOME: winHome() }, ...opts },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          out: (stdout || '').trim(),
          err: (stderr || '').trim(),
        });
      }
    );
  });
}

let GIT_BIN = null;
const GIT_CANDIDATES = [
  'git',
  'D:\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\cmd\\git.exe',
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
  return run(await resolveGit(), args);
}

/* ------------------------------------------------------------------ YAML 逐行改写（保留注释） */

function parseLine(line) {
  const clean = line.replace(/\r$/, '');
  const m = clean.match(/^(\s*)([^\s:#][^:]*):(\s*)(.*)$/);
  if (!m) return null;
  return { indent: m[1].length, key: m[2], value: m[4], comment: '' };
}

function findPath(lines, pathArr) {
  const stack = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const info = parseLine(line);
    if (!info) continue;
    while (stack.length && stack[stack.length - 1].indent >= info.indent) stack.pop();
    stack.push({ indent: info.indent, key: info.key, line: i });
    if (stack.length === pathArr.length && stack.every((s, idx) => s.key === pathArr[idx])) {
      return { line: i, indent: info.indent, value: info.value };
    }
  }
  return null;
}

function blockEnd(lines, startLine, indent) {
  for (let i = startLine + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const info = parseLine(line);
    const curIndent = info ? info.indent : line.match(/^\s*/)[0].length;
    if (curIndent <= indent) return i;
  }
  return lines.length;
}

const NEED_QUOTE = /^[\s\-?:,[\]{}#&*!|>'"%@`]|:\s|\s#|\s$/;

function quoteWith(text, ch) {
  return ch === '"' ? `"${text.replace(/"/g, '\\"')}"` : `'${text.replace(/'/g, "''")}'`;
}

/** originalRaw 用来保持原有引号风格，避免无意义 diff */
function formatValue(value, originalRaw) {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  const text = String(value == null ? '' : value);
  if (text === '') return "''";

  const orig = String(originalRaw == null ? '' : originalRaw).trim();
  const origQuote = orig[0] === "'" ? "'" : orig[0] === '"' ? '"' : '';
  const mustQuote = NEED_QUOTE.test(text) || /^(true|false|null|yes|no|on|off|~)$/i.test(text);
  if (origQuote) return quoteWith(text, origQuote);
  return mustQuote ? quoteWith(text, "'") : text;
}

function setScalar(text, pathArr, value) {
  const lines = text.split('\n');
  const hit = findPath(lines, pathArr);
  if (!hit) return null;
  const original = lines[hit.line];
  const keyMatch = original.match(/^(\s*)([^\s:#][^:]*):/);
  const inlineComment = original.match(/(\s+#.*)$/);
  const oldValue = hit.value.replace(/\s+#.*$/, '').trim();
  lines[hit.line] = `${keyMatch[1]}${keyMatch[2]}: ${formatValue(value, oldValue)}${inlineComment ? inlineComment[1] : ''}`;
  return lines.join('\n');
}

function setBlock(text, pathArr, blockLines, keepComments) {
  const lines = text.split('\n');
  const hit = findPath(lines, pathArr);
  if (!hit) return null;
  const end = blockEnd(lines, hit.line, hit.indent);
  const keyMatch = lines[hit.line].match(/^(\s*)([^\s:#][^:]*):/);
  const inlineComment = lines[hit.line].match(/\s+#.*$/);
  const head = `${keyMatch[1]}${keyMatch[2]}:${inlineComment ? '  ' + inlineComment[0].trim() : ''}`;
  const body = blockLines.map((l) => l);
  if (keepComments) {
    const orphan = lines
      .slice(hit.line + 1, end)
      .filter((l) => /^\s*#/.test(l));
    body.push(...orphan);
  }
  const tailBlank = end > hit.line + 1 && !lines[end - 1].trim();
  lines.splice(hit.line, end - hit.line, head, ...body, ...(tailBlank ? [''] : []));
  return lines.join('\n');
}

/* ------------------------------------------------------------------ 读取状态 */

function loadYaml(file) {
  if (!yaml) return {};
  try {
    return yaml.load(read(file)) || {};
  } catch (e) {
    return {};
  }
}

function postsCategories() {
  const set = new Set();
  if (!fs.existsSync(POSTS_DIR)) return [];
  fs.readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .forEach((f) => {
      const text = read(path.join(POSTS_DIR, f));
      const m = text.match(/^categories:\s*\n((?:\s*-\s*.+\n?)+)/m);
      if (m) {
        m[1].split('\n').forEach((line) => {
          const name = line.replace(/^\s*-\s*/, '').trim();
          if (name) set.add(name);
        });
      }
    });
  return Array.from(set).sort();
}

function listFiles(dir, filter, prefix) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => filter.test(f))
      .sort()
      .map((f) => prefix + f);
  } catch (e) {
    return [];
  }
}

function getState() {
  const site = loadYaml(SITE_YML);
  const theme = loadYaml(THEME_YML);
  const home = theme.homeConfig || {};
  const coverCfg = home.coverConfig || {};
  const modules = theme.modules || {};
  const loader = theme.loader || {};
  const autoDark = theme.auto_dark || {};
  const sidebar = theme.sidebar || {};
  const footer = theme.footer || {};
  const menu = theme.menu || {};
  const social = theme.social || {};
  const tagcloud = theme.tagcloud || {};

  const menuFlags = {
    home: !!menu.home,
    about: !!menu.about,
    archives: !!(menu.posts && menu.posts.archives),
    categories: !!(menu.posts && menu.posts.categories),
    tags: !!(menu.posts && menu.posts.tags),
  };

  const socialList = Object.keys(social)
    .map((key) => {
      const raw = String(social[key] || '').split('||').map((s) => s.trim());
      return { key, url: raw[0] || '', icon: raw[1] || key, color: (raw[2] || '').replace(/^"|"$/g, '') };
    })
    .filter((s) => /^https?:|^mailto:/.test(s.url));

  return {
    site: {
      title: site.title || '',
      subtitle: site.subtitle || '',
      description: site.description || '',
      keywords: site.keywords || '',
      author: site.author || '',
      language: site.language || 'zh-CN',
    },
    theme: {
      alternate: theme.alternate || '',
      grayMode: !!theme.grayMode,
      darkmode: !!theme.darkmode,
      autoDark: { enable: !!autoDark.enable, start: autoDark.start || 20, end: autoDark.end || 7 },
      autoScroll: !!theme.auto_scroll,
      loaderStart: !!loader.start,
      loaderSwitch: !!loader.switch,
      fireworks: !!((theme.fireworks || {}).enable && modules.fireworks),
      player: !!modules.player,
      sidebarPosition: sidebar.position || 'left',
      avatar: sidebar.avatar || 'avatar.jpg',
      home: {
        gradient: !!home.gradient,
        fixedCover: home.fixedCover || '',
        enableCover: coverCfg.enableCover !== false,
        enablePreload: coverCfg.enablePreload !== false,
        enableNextGradientCover: !!coverCfg.enableNextGradientCover,
      },
      cateCards: Array.isArray(home.cateCards) ? home.cateCards.filter((c) => c && c.slug) : [],
      menu: menuFlags,
      social: socialList,
      footer: { since: footer.since || new Date().getFullYear(), powered: footer.powered !== false, count: footer.count !== false },
      pagefind: !!((theme.pagefind || {}).enable),
      tagcloud: { start: tagcloud.start || '#72cecf', end: tagcloud.end || '#ffbac3' },
    },
    css: read(CUSTOM_CSS),
    primaryColor: (read(COLOR_CSS).match(/--primary-color:\s*([^;\s]+)/) || [])[1] || '#e9546b',
    meta: {
      categories: postsCategories(),
      covers: listFiles(COVERS_DIR, /\.(svg|png|jpe?g|webp|gif)$/i, '/images/covers/'),
      cateCovers: listFiles(CATE_DIR, /\.(svg|png|jpe?g|webp)$/i, '_cate/'),
      avatars: listFiles(ASSETS_DIR, /\.(png|jpe?g|webp|gif)$/i, ''),
      yamlOk: !!yaml,
    },
  };
}

/* ------------------------------------------------------------------ 写入配置 */

const PALETTES = [
  ['#7c5cff', '#ffb37a'],
  ['#3178c6', '#7ee8fa'],
  ['#ff5c8a', '#ffc36b'],
  ['#00b894', '#a8e063'],
  ['#5b6bff', '#b06ab3'],
  ['#d94fd0', '#ffd06b'],
  ['#f97316', '#facc15'],
  ['#0ea5e9', '#a5f3fc'],
];

function gradientSvg(a, b) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="720" height="480" fill="url(#g)"/>
  <circle cx="600" cy="70" r="190" fill="#ffffff" opacity="0.10"/>
  <circle cx="110" cy="430" r="150" fill="#ffffff" opacity="0.08"/>
</svg>
`;
}

function ensureCateCover(slug, index) {
  const safe = slug.replace(/[\\/:*?"<>|]/g, '-');
  const file = path.join(CATE_DIR, `${safe}.svg`);
  if (fs.existsSync(file)) return `_cate/${safe}.svg`;
  const palette = PALETTES[index % PALETTES.length];
  mkdirp(CATE_DIR);
  fs.writeFileSync(file, gradientSvg(palette[0], palette[1]), 'utf8');
  return `_cate/${safe}.svg`;
}

function writeColorCss(hex) {
  const color = /^#[0-9a-fA-F]{3,8}$/.test(String(hex || '')) ? hex : '#e9546b';
  const css = `/* 由主题工坊生成，请勿手改（改主色请用主题工坊） */\n:root,\n[data-theme="dark"]:root {\n  --primary-color: ${color} !important;\n}\n`;
  mkdirp(DATA_DIR);
  fs.writeFileSync(COLOR_CSS, css, 'utf8');
  return css;
}

function saveState(payload) {
  const changed = [];
  const notes = [];

  /* --- 站点配置 --- */
  let siteText = read(SITE_YML);
  const site = payload.site || {};
  const siteMap = [
    ['title', site.title],
    ['subtitle', site.subtitle],
    ['description', site.description],
    ['keywords', site.keywords],
    ['author', site.author],
    ['language', site.language],
  ];
  siteMap.forEach(([key, value]) => {
    if (value === undefined) return;
    const next = setScalar(siteText, [key], value);
    if (next && next !== siteText) {
      siteText = next;
      changed.push(`_config.yml:${key}`);
    }
  });
  if (siteText !== read(SITE_YML)) fs.writeFileSync(SITE_YML, siteText, 'utf8');

  /* --- 主题配置 --- */
  let themeText = read(THEME_YML);
  const theme = payload.theme || {};
  const scalarMap = [];
  if (theme.alternate !== undefined) scalarMap.push([['alternate'], theme.alternate]);
  if (theme.grayMode !== undefined) scalarMap.push([['grayMode'], theme.grayMode]);
  if (theme.darkmode !== undefined) scalarMap.push([['darkmode'], theme.darkmode]);
  if (theme.autoDark) {
    scalarMap.push([['auto_dark', 'enable'], theme.autoDark.enable]);
    scalarMap.push([['auto_dark', 'start'], Number(theme.autoDark.start)]);
    scalarMap.push([['auto_dark', 'end'], Number(theme.autoDark.end)]);
  }
  if (theme.autoScroll !== undefined) scalarMap.push([['auto_scroll'], theme.autoScroll]);
  if (theme.loaderStart !== undefined) scalarMap.push([['loader', 'start'], theme.loaderStart]);
  if (theme.loaderSwitch !== undefined) scalarMap.push([['loader', 'switch'], theme.loaderSwitch]);
  if (theme.sidebarPosition !== undefined) scalarMap.push([['sidebar', 'position'], theme.sidebarPosition]);
  if (theme.avatar !== undefined) scalarMap.push([['sidebar', 'avatar'], theme.avatar]);
  if (theme.pagefind !== undefined) scalarMap.push([['pagefind', 'enable'], theme.pagefind]);
  if (theme.tagcloud) {
    scalarMap.push([['tagcloud', 'start'], theme.tagcloud.start]);
    scalarMap.push([['tagcloud', 'end'], theme.tagcloud.end]);
  }
  if (theme.home) {
    scalarMap.push([['homeConfig', 'gradient'], theme.home.gradient]);
    scalarMap.push([['homeConfig', 'fixedCover'], theme.home.fixedCover]);
    scalarMap.push([['homeConfig', 'coverConfig', 'enableCover'], theme.home.enableCover]);
    scalarMap.push([['homeConfig', 'coverConfig', 'enablePreload'], theme.home.enablePreload]);
    scalarMap.push([['homeConfig', 'coverConfig', 'enableNextGradientCover'], theme.home.enableNextGradientCover]);
  }
  if (theme.footer) {
    scalarMap.push([['footer', 'since'], Number(theme.footer.since)]);
    scalarMap.push([['footer', 'powered'], theme.footer.powered]);
    scalarMap.push([['footer', 'count'], theme.footer.count]);
  }
  if (theme.player !== undefined) scalarMap.push([['modules', 'player'], theme.player]);
  if (theme.fireworks !== undefined) {
    scalarMap.push([['fireworks', 'enable'], theme.fireworks]);
    if (theme.fireworks) scalarMap.push([['modules', 'fireworks'], true]);
  }

  scalarMap.forEach(([pathArr, value]) => {
    if (value === undefined) return;
    const next = setScalar(themeText, pathArr, value);
    if (next === null) {
      notes.push(`未找到配置项 ${pathArr.join('.')}，已跳过`);
      return;
    }
    if (next !== themeText) {
      themeText = next;
      changed.push(`_config.shokax.yml:${pathArr.join('.')}`);
    }
  });

  /* --- 分类卡片 --- */
  if (Array.isArray(theme.cateCards)) {
    const cats = postsCategories();
    const cards = theme.cateCards.filter((c) => c.slug).map((c, i) => {
      const cover = c.cover ? c.cover : ensureCateCover(c.slug, i);
      if (cats.indexOf(c.slug) === -1) {
        notes.push(`分类「${c.slug}」在文章里不存在，首页不会显示这张卡片（需先有该分类的文章）`);
      }
      return { slug: c.slug, cover };
    });
    const block = [];
    if (!cards.length) block.push('    - slug:');
    cards.forEach((c) => {
      block.push(`    - slug: ${c.slug}`);
      block.push(`      cover: ${c.cover}`);
    });
    const next = setBlock(themeText, ['homeConfig', 'cateCards'], block);
    if (next && next !== themeText) {
      themeText = next;
      changed.push('_config.shokax.yml:homeConfig.cateCards');
    }
  }

  /* --- 导航菜单 --- */
  if (theme.menu) {
    const m = theme.menu;
    const block = [];
    if (m.home) block.push('  home: / || home');
    if (m.about) block.push('  about: /about/ || user');
    if (m.archives || m.categories || m.tags) {
      block.push('  posts:');
      if (m.archives) block.push('    default: /archives/ || feather');
      if (m.archives) block.push('    archives: /archives/ || list-alt');
      if (m.categories) block.push('    categories: /categories/ || th');
      if (m.tags) block.push('    tags: /tags/ || tags');
    }
    if (!block.length) block.push('  home: / || home');
    const next = setBlock(themeText, ['menu'], block);
    if (next && next !== themeText) {
      themeText = next;
      changed.push('_config.shokax.yml:menu');
    }
  }

  /* --- 社交链接 --- */
  if (Array.isArray(theme.social)) {
    const block = theme.social
      .filter((s) => s.url)
      .map((s) => {
        const color = s.color ? ` || "${s.color}"` : '';
        return `  ${s.key}: ${s.url} || ${s.icon || s.key}${color}`;
      });
    const next = setBlock(themeText, ['social'], block.length ? block : ['  github: https://github.com/ || github'], true);
    if (next && next !== themeText) {
      themeText = next;
      changed.push('_config.shokax.yml:social');
    }
  }

  if (themeText !== read(THEME_YML)) fs.writeFileSync(THEME_YML, themeText, 'utf8');

  /* --- 颜色与自定义 CSS --- */
  if (payload.primaryColor) {
    const before = read(COLOR_CSS);
    const after = writeColorCss(payload.primaryColor);
    if (before !== after) changed.push('source/_data/theme-color.css');
  }
  if (payload.css !== undefined) {
    const before = read(CUSTOM_CSS);
    if (before !== payload.css) {
      mkdirp(DATA_DIR);
      fs.writeFileSync(CUSTOM_CSS, payload.css, 'utf8');
      changed.push('source/_data/custom.css');
    }
  }

  return { ok: true, changed, notes };
}

/* ------------------------------------------------------------------ 构建 / 发布 */

function build(previewOnly) {
  return new Promise((resolve) => {
    const args = previewOnly
      ? ['node_modules/hexo/bin/hexo', 'generate']
      : ['run', 'build'];
    const cmd = previewOnly ? process.execPath : 'npm';
    const started = Date.now();
    execFile(
      cmd,
      args,
      { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, HOME: winHome() }, shell: !previewOnly },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          ms: Date.now() - started,
          out: String(stdout || '').slice(-4000),
          err: String(stderr || '').slice(-2000),
        });
      }
    );
  });
}

async function publish() {
  const log = [];
  const buildRes = await build(false);
  log.push({ step: '构建站点', ok: buildRes.ok, detail: `${(buildRes.ms / 1000).toFixed(1)}s` });
  if (!buildRes.ok) return { ok: false, log, error: '构建失败，看日志' };

  const files = ['_config.yml', '_config.shokax.yml', 'source/_data/theme-color.css', 'source/_data/custom.css', 'source/_posts/_cate', 'source/images/covers', 'source/_data/assets']
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
  await git(['add', '--'].concat(files));
  const diff = await git(['diff', '--cached', '--name-only']);
  if (!diff.out) {
    log.push({ step: '提交', ok: true, detail: '没有需要提交的改动' });
    return { ok: true, pushed: false, log };
  }

  const commit = await git(['commit', '-m', 'chore(theme): 主题工坊更新配置']);
  if (!commit.ok) {
    log.push({ step: '提交', ok: false, detail: commit.err || commit.out });
    return { ok: false, log, error: 'git 提交失败' };
  }
  const hash = await git(['rev-parse', '--short', 'HEAD']);
  log.push({ step: '提交', ok: true, detail: hash.out });

  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
  const push = await git(['push', 'origin', branch]);
  log.push({ step: '推送到 GitHub', ok: push.ok, detail: push.ok ? branch : push.err || push.out });
  return { ok: true, pushed: push.ok, log, error: push.ok ? '' : '已提交，但推送失败' };
}

/* ------------------------------------------------------------------ 预览服务 */

let previewServer = null;

function startPreviewServer() {
  if (previewServer) return Promise.resolve(PREVIEW_PORT);
  return new Promise((resolve) => {
    previewServer = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/' || rel === '') rel = '/index.html';
      let file = path.join(PUBLIC_DIR, rel);
      if (!file.startsWith(PUBLIC_DIR)) {
        res.writeHead(403).end('forbidden');
        return;
      }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        const alt = path.join(PUBLIC_DIR, rel, 'index.html');
        if (fs.existsSync(alt)) file = alt;
        else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
          return;
        }
      }
      const ext = path.extname(file).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ico': 'image/x-icon',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
    previewServer.listen(PREVIEW_PORT, '127.0.0.1', () => resolve(PREVIEW_PORT));
  });
}

/* ------------------------------------------------------------------ HTTP */

function send(res, code, data, type) {
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(type ? data : JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 40 * 1024 * 1024) {
        reject(new Error('内容过大'));
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
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function saveUpload(kind, name, dataUrl) {
  const m = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) throw new Error('只支持 PNG / JPG / GIF / WEBP / SVG');
  const ext = m[1].toLowerCase() === 'svg+xml' ? 'svg' : m[1].toLowerCase().replace('jpeg', 'jpg');
  const buf = Buffer.from(m[2], 'base64');
  const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 6);
  const base = String(name || 'img').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '') || 'img';
  const file = `${base}-${hash}.${ext}`;

  if (kind === 'avatar') {
    mkdirp(ASSETS_DIR);
    fs.writeFileSync(path.join(ASSETS_DIR, file), buf);
    return { path: file, preview: '/avatar/' + file };
  }
  if (kind === 'cate') {
    mkdirp(CATE_DIR);
    fs.writeFileSync(path.join(CATE_DIR, file), buf);
    return { path: '_cate/' + file, preview: '/files/_posts/_cate/' + file };
  }
  mkdirp(COVERS_DIR);
  fs.writeFileSync(path.join(COVERS_DIR, file), buf);
  return { path: '/images/covers/' + file, preview: '/files/images/covers/' + file };
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  if (req.method === 'GET' && (p === '/' || p === '/index.html')) return serveFile(res, UI_FILE);

  if (req.method === 'GET' && p === '/avatar.jpg') {
    return serveFile(res, path.join(ASSETS_DIR, 'avatar.jpg'));
  }

  if (req.method === 'GET' && p.startsWith('/avatar/')) {
    return serveFile(res, path.join(ASSETS_DIR, decodeURIComponent(p.slice('/avatar/'.length))));
  }

  if (req.method === 'GET' && p.startsWith('/files/')) {
    const rel = decodeURIComponent(p.slice('/files/'.length));
    const file = path.resolve(ROOT, 'source', rel);
    if (!file.startsWith(path.join(ROOT, 'source'))) return send(res, 403, { ok: false });
    return serveFile(res, file);
  }

  if (req.method === 'GET' && p === '/api/state') return send(res, 200, { ok: true, state: getState() });

  if (req.method === 'POST' && p === '/api/upload') {
    try {
      const body = await readBody(req);
      return send(res, 200, { ok: true, ...saveUpload(body.kind || 'cover', body.name, body.dataUrl) });
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/save') {
    try {
      const body = await readBody(req);
      const result = saveState(body);
      return send(res, 200, result);
    } catch (e) {
      return send(res, 400, { ok: false, error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/preview') {
    const buildRes = await build(true);
    if (!buildRes.ok) return send(res, 500, { ok: false, error: '构建失败', log: buildRes.err || buildRes.out });
    await startPreviewServer();
    return send(res, 200, { ok: true, url: `http://localhost:${PREVIEW_PORT}/?t=${Date.now()}`, ms: buildRes.ms });
  }

  if (req.method === 'POST' && p === '/api/publish') {
    const result = await publish();
    return send(res, result.ok ? 200 : 500, result);
  }

  if (req.method === 'POST' && p === '/api/reset') {
    const targets = ['_config.yml', '_config.shokax.yml', 'source/_data/theme-color.css', 'source/_data/custom.css', 'source/_posts/_cate'];
    const log = [];
    for (const t of targets) {
      const res1 = await git(['checkout', '--', t]);
      if (!res1.ok) log.push({ step: t, ok: false, detail: '未纳入版本管理，跳过' });
    }
    return send(res, 200, { ok: true, log: log.length ? log : [{ step: '已从 git 恢复配置文件', ok: true }] });
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
    console.log('  星舞互娱 · 主题工坊已启动');
    console.log(`  ${addr}`);
    console.log(`  预览站点：http://localhost:${PREVIEW_PORT}/`);
    console.log('  按 Ctrl+C 结束');
    console.log('');
    if (process.argv.includes('--open')) {
      const { spawn } = require('child_process');
      try {
        spawn('cmd', ['/c', 'start', '""', addr], { detached: true, stdio: 'ignore' }).unref();
      } catch (e) {
        /* 打不开就算了，用户手动访问 */
      }
    }
  });
}

start(PORT);
