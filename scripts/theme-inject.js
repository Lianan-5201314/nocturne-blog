/**
 * 主题工坊注入：把主色变量与自定义样式塞进每个页面的 </head>
 * 项目内文件由 tools/studio 维护
 */
'use strict';

const fs = require('fs');
const path = require('path');

function readIfExists(file) {
  try {
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf8').trim();
  } catch (e) {
    return '';
  }
}

hexo.extend.filter.register('after_render:html', (str) => {
  const dataDir = path.join(hexo.base_dir, 'source', '_data');
  const color = readIfExists(path.join(dataDir, 'theme-color.css'));
  const custom = readIfExists(path.join(dataDir, 'custom.css'));
  const css = [color, custom].filter(Boolean).join('\n');
  if (!css) return str;
  return str.replace('</head>', `<style id="shoka-custom">\n${css}\n</style>\n</head>`);
});
