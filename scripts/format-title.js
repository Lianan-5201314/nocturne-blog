/* Hexo 插件：美化 <title>
 *
 * 主题默认拼成 `${alternate} = ${title} = ${subtitle}`，本站 alternate 与 title
 * 同值时会出现「Nocturne = Nocturne = 深夜编码手记」这样的重复。
 * 这里在渲染后统一去重，把 " = " 换成 " | "，并给子页面补上站点名后缀。
 *
 * 放在 project/scripts/ 下会被 Hexo 自动加载（注意：不要加 shebang）。
 */
hexo.extend.filter.register('after_render:html', function (str) {
  if (typeof str !== 'string' || str.indexOf('<title>') === -1) return str;

  var siteName = (hexo.config && hexo.config.title) || '';

  return str.replace(/<title>([\s\S]*?)<\/title>/i, function (match, inner) {
    var parts = inner
      .split(' = ')
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    var seen = Object.create(null);
    parts = parts.filter(function (s) {
      if (seen[s]) return false;
      seen[s] = true;
      return true;
    });

    // 子页面（关于 / 归档 / 文章）只有自己的标题，补站点名方便收藏与搜索
    if (siteName && parts.length === 1 && inner.indexOf(siteName) === -1) {
      parts.push(siteName);
    }

    if (!parts.length) return match;
    return '<title>' + parts.join(' | ') + '</title>';
  });
}, 9);
