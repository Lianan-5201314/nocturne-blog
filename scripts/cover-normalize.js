'use strict';

/**
 * 兜底：把文章封面路径的前导斜杠去掉。
 * ShokaX 的 _cover 会自己拼 statics('/') 前缀，cover 若写成 /images/x.jpg
 * 会变成 //images/x.jpg，浏览器当成协议相对地址（https://images/...）而裂图。
 * 这里在渲染前统一规范化，避免任何来源（发文台、手写、工坊）写错。
 */
hexo.extend.filter.register('before_post_render', function (data) {
  if (typeof data.cover === 'string' && data.cover.trim()) {
    data.cover = data.cover.trim().replace(/^\/+/, '');
  }
  return data;
});
