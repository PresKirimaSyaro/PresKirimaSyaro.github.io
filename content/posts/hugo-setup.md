---
title: "博客写作与维护指南"
date: 2026-10-02T12:00:00+08:00
draft: false
slug: "hugo-setup"
tags: ["Hugo", "教程"]
categories: ["技术"]
summary: "如何预览博客、创建文章、添加相册，以及通过 GitHub Pages 发布更新。"
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

## 添加相册

在 `content/gallery/` 下创建目录和 `index.md`，将图片放在 `static/images/` 中。在相册头部的 `photos` 列表填写图片路径、描述和实际宽高。可以参考示例相册。

## 发布更新

仓库 Settings → Pages → Build and deployment 的 Source 选择 **GitHub Actions**。推送到 `main` 后，工作流会构建并部署网站。详细设置见仓库 README。
