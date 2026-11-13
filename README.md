# PresKS Blog

这是一个采用 Hugo Extended 0.155.3 + PaperMod + GitHub Actions + GitHub Pages 的博客。详细参考 https://github.com/chuanxo/chuanx-blog

访问：https://PresKirimaSyaro.github.io

## 文章浏览次数

每篇 `posts` 文章在正文末尾显示 [Moe Counter](https://count.getloli.com/) 计数器，按图片请求累计浏览次数，并非独立访客数。重复访问可能增加计数；从接入后开始统计。

在 `hugo.yaml` 的 `params.moeCounter` 中，可用 `enabled` 开关显示、用 `theme` 更换样式（默认 `moebooru`）。计数标识是文章正式完整 URL 的 MD5，长度为 32 个字符，不同文章分别累计；修改域名或文章链接会使用新的计数标识。计数数据由 Moe Counter 公共服务保存。

本地 `hugo server` 预览不加载计数图片，以免测试访问增加正式计数；正式构建会输出计数器。首页、归档及关于等独立页面不显示计数器。
