---
title: "博客写作与维护指南"
date: 2026-10-02T12:00:00+08:00
draft: false
slug: "hugo-setup"
tags: ["Hugo", "教程"]
categories: ["技术"]
summary: "如何预览博客、创建文章、插入图片，以及通过 GitHub Pages 发布更新。"
---

## 本地预览

安装 Hugo Extended 0.155.3，初始化主题后启动预览：

```shell
git submodule update --init --recursive
hugo server -D
```

访问 <http://localhost:1313/>。`-D` 会显示草稿，正式构建不会发布草稿。

## 文章目录

文章放在 `content/posts/`，支持标题、日期、摘要、标签和分类。使用 `hugo new content posts/文章名.md` 创建草稿。

## 插入图片

图片可以和文章一起提交到博客仓库，不需要图床。推荐每篇文章使用一个目录：

```text
content/posts/my-post/
├── index.md
└── screenshot.webp
```

在 `index.md` 中引用同目录图片：

```markdown
![图片说明](screenshot.webp)
```

文章的 front matter 中可设置 `slug: "my-post"` 来固定网址。文章文件应命名为 `index.md`。

也可以将多篇文章共用的图片放在 `static/images/`，例如 `static/images/example.webp`，然后在正文引用：

```markdown
![图片说明](/images/example.webp)
```

将文章和图片一起提交并推送到 `main`，自动部署后图片即可访问。建议上传前压缩图片并使用简短文件名。图片很多或需要独立管理时，可以使用图床并引用其公开 HTTPS 图片链接。

## 发布更新

仓库 Settings → Pages → Build and deployment 的 Source 选择 **GitHub Actions**。推送到 `main` 后，工作流会构建并部署网站。部署地址可在工作流运行结果中查看。
