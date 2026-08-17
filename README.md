# GitHub Pages 站点文件

## 使用方法

将本目录中的所有内容复制到 GitHub Pages 发布源的根目录，必须保留以下结构：

```text
仓库根目录/
├── _config.yml
├── index.md
├── 404.html
├── .github/
│   └── workflows/
│       └── jekyll.yml
└── _posts/
    └── 2026-08-17-wsl2-ubuntu-proxy-and-dev-environment-notes.md
```

不要只上传 `_posts` 中的文章；根目录必须保留 `index.md`。

在 GitHub 仓库中打开：

1. **Settings → Pages**。
2. **Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送到 `main` 后，等待 **Build and deploy Jekyll site to Pages** 工作流完成。

如果仓库中已有 `.github/workflows/static.yml`，请先删除它。该模板只会原样上传文件，不会把 Markdown 和 Liquid 模板构建成 HTML；同时保留两个 Pages 部署工作流还可能造成部署互相覆盖。

如果使用 `用户名.github.io` 仓库，站点根地址通常是：

```text
https://用户名.github.io/
```

如果使用普通项目仓库，地址通常是：

```text
https://用户名.github.io/仓库名/
```

页面出现 404 时，优先检查 Pages 所选分支/目录、文件名大小写，以及 `index.md` 是否确实位于发布源根目录。
