#!/usr/bin/env node
/**
 * 在 CI 里按仓库形态改写 _config.yml 的 url 与 root。
 *
 * - 用户页仓库 `<owner>/<owner>.github.io`  -> url = https://<owner>.github.io, root = /
 * - 普通项目页仓库                          -> url = https://<owner>.github.io, root = /<repo>/
 * - 存在 source/CNAME（自定义域名）          -> url = https://<CNAME>,     root = /
 *
 * 只替换这两行，不动注释与其他配置（`hexo config key value` 会把整个文件重写成
 * 无注释的 YAML，还会把 root 解析成磁盘路径，所以不用它）。
 *
 * 用法：node scripts/set-site-root.js <owner> <repo>
 */
const fs = require('fs');
const path = require('path');

const [owner, repo] = process.argv.slice(2);
if (!owner || !repo) {
  console.error('用法: node scripts/set-site-root.js <owner> <repo>');
  process.exit(1);
}

const cnamePath = path.join(__dirname, '..', 'source', 'CNAME');
let siteUrl;
let root;

if (fs.existsSync(cnamePath)) {
  const domain = fs.readFileSync(cnamePath, 'utf8').trim().split(/\r?\n/)[0];
  if (domain) {
    siteUrl = `https://${domain}`;
    root = '/';
  }
}

if (!siteUrl) {
  const isUserPage = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
  siteUrl = `https://${owner}.github.io`;
  root = isUserPage ? '/' : `/${repo}/`;
}

const file = path.join(__dirname, '..', '_config.yml');
const before = fs.readFileSync(file, 'utf8');

const urlLine = /^url:.*$/m;
const rootLine = /^root:.*$/m;
if (!urlLine.test(before) || !rootLine.test(before)) {
  console.error('✗ _config.yml 里找不到 url/root 行，无法改写');
  process.exit(1);
}

const after = before
  .replace(urlLine, `url: ${siteUrl}`)
  .replace(rootLine, `root: ${root}`);

if (after !== before) fs.writeFileSync(file, after, 'utf8');

console.log(`url  = ${siteUrl}`);
console.log(`root = ${root}`);
