---
layout: home
title: 首页
---

# WSL 与开发环境笔记

这里记录 WSL2、Linux、代理、命令行工具和开发环境的配置与故障排查过程。

## 最新文章

{% if site.posts.size > 0 %}
<ul>
  {% for post in site.posts %}
    <li>
      <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
      <small>{{ post.date | date: "%Y-%m-%d" }}</small>
      {% if post.description %}<br>{{ post.description }}{% endif %}
    </li>
  {% endfor %}
</ul>
{% else %}
暂时还没有文章。
{% endif %}

