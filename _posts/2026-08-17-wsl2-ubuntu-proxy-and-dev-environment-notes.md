---
layout: post
title: "WSL2 Ubuntu 26.04：代理、Pi Agent、SSH 与 Vim 配置记录"
date: 2026-08-17 00:00:00 +0800
description: "Windows ShadowsocksR、Privoxy、systemd、Pi Agent OAuth、npm、SSH PATH 与 Vim 配色的完整配置记录。"
categories:
  - WSL2
  - Linux
tags:
  - Ubuntu
  - Privoxy
  - Pi Agent
  - npm
  - Vim
---

# WSL2 Ubuntu 26.04：代理、Pi Agent、SSH 与 Vim 配置记录

> 本文记录一次 Windows + WSL2 Ubuntu 26.04 开发环境的实际配置过程，重点说明最终修改、修改原因和验证方法。示例中的主机地址均使用动态变量或占位符。

## 目录

- [一、最终网络结构](#一最终网络结构)
- [二、Windows ShadowsocksR 使用 SOCKS5 1088](#二windows-shadowsocksr-使用-socks5-1088)
- [三、用 Privoxy 把 SOCKS5 转为 HTTP 代理](#三用-privoxy-把-socks5-转为-http-代理)
- [四、动态更新 WSL2 的 Windows Host IP](#四动态更新-wsl2-的-windows-host-ip)
- [五、用 systemd oneshot 开机自动更新](#五用-systemd-oneshot-开机自动更新)
- [六、配置 bash 代理环境变量](#六配置-bash-代理环境变量)
- [七、Pi Agent OpenAI OAuth 403](#七pi-agent-openai-oauth-403)
- [八、npm 网络与安装排查经验](#八npm-网络与安装排查经验)
- [九、mRemoteNG SSH 登录时补充 Windows PATH](#九mremoteng-ssh-登录时补充-windows-path)
- [十、Vim 黑底深蓝注释与终端颜色](#十vim-黑底深蓝注释与终端颜色)
- [十一、重启后的检查清单](#十一重启后的检查清单)
- [十二、常用故障对照表](#十二常用故障对照表)

## 一、最终网络结构

Windows 端的 ShadowsocksR-dotnet4.0 只提供 SOCKS5 代理，端口为 `1088`。部分 Linux 命令行工具可以直接使用 SOCKS5，但 Pi Agent 等 Node.js 程序的 OAuth 请求不一定读取 `ALL_PROXY`，因此在 WSL 内增加 Privoxy，将 SOCKS5 转换成 HTTP 代理。

```text
WSL2 中的 curl / git / npm / Pi / Node.js
          │
          ├── HTTP_PROXY / HTTPS_PROXY
          │          ↓
          │   Privoxy 127.0.0.1:8118
          │          ↓
          │   SOCKS5 Windows-Host-IP:1088
          │          ↓
          └──── Windows ShadowsocksR ──── 代理节点 ──── Internet
```

这里有两类代理变量：

- `ALL_PROXY`：直接指向 Windows 的 SOCKS5 端口，适合明确支持 SOCKS5 环境变量的工具。
- `HTTP_PROXY`、`HTTPS_PROXY`：指向 WSL 本机的 Privoxy，适合只支持 HTTP 代理的工具。

## 二、Windows ShadowsocksR 使用 SOCKS5 1088

### 故障现象

WSL2 中访问 GitHub Raw 等站点时报错：

```text
curl: (7) Failed to connect to raw.githubusercontent.com port 443
```

旧的 `1080` 端口已经无法使用，而 Windows ShadowsocksR-dotnet4.0 的 SOCKS5 端口已改为 `1088`。

### 原因

WSL2 默认不会自动继承 Windows 代理软件的设置。WSL 中如果仍指向旧端口，或者直接访问受限站点，请求就会失败。

此外，在传统 WSL2 NAT 网络中，Windows 代理程序通常还需要允许来自 WSL 虚拟网络的连接。Windows 端应确认 `1088` 正在监听，并按客户端能力启用“允许局域网连接”等选项。

### 修改

WSL2 通过默认路由动态取得 Windows Host IP：

```bash
WIN_HOST=$(ip route | awk '/default/ {print $3; exit}')
```

直接测试 SOCKS5：

```bash
curl --proxy "socks5h://${WIN_HOST}:1088" -I https://raw.githubusercontent.com
```

使用 `socks5h` 的目的是让目标域名通过 SOCKS5 代理侧解析，减少本地 DNS 与代理出口不一致的问题。

### 验证

```bash
echo "$WIN_HOST"
curl --proxy "socks5h://${WIN_HOST}:1088" https://ipinfo.io
```

应看到代理节点对应的出口地区，而不是本地直连出口。文档中不要记录真实节点地址或可识别的出口 IP。

## 三、用 Privoxy 把 SOCKS5 转为 HTTP 代理

### 故障现象

- `curl` 使用 `ALL_PROXY=socks5h://...:1088` 能正常访问。
- Pi Agent 完成浏览器登录后，终端中的 OAuth token exchange 仍返回 403。
- Windows ShadowsocksR-dotnet4.0 只有 SOCKS5 端口，没有单独的 HTTP 代理端口。

### 原因

不同程序读取的代理环境变量并不一致。能通过 SOCKS5 使用 `curl`，不代表 Node.js 程序或 OAuth 请求一定会读取 `ALL_PROXY`。因此需要为这些程序提供标准的 HTTP/HTTPS 代理入口。

### 修改

安装 Privoxy：

```bash
sudo apt update
sudo apt install -y privoxy
```

编辑配置：

```bash
sudo vi /etc/privoxy/config
```

加入一条 SOCKS5 转发规则：

```text
forward-socks5 / WINDOWS_HOST_IP:1088 .
```

实际运行时，`WINDOWS_HOST_IP` 由后面的脚本动态替换。例如配置最终可能呈现为：

```text
forward-socks5 / 172.xx.xx.1:1088 .
```

### 为什么末尾的点号不能漏

完整规则由三部分组成：

```text
forward-socks5  URL_PATTERN  SOCKS_PROXY  PARENT_HTTP_PROXY
```

本配置中的：

```text
forward-socks5 / WINDOWS_HOST_IP:1088 .
```

含义是：

- `/`：匹配所有 URL。
- `WINDOWS_HOST_IP:1088`：上游 SOCKS5 代理。
- 最后的 `.`：不再使用额外的上游 HTTP parent proxy，直接通过前面的 SOCKS5 代理访问目标。

曾经因为漏写末尾的 `.`，Privoxy 规则没有按预期工作，HTTP 代理测试仍显示本地直连出口。补上点号并重启 Privoxy 后，出口恢复为代理节点地区。

> 此处使用普通 `forward-socks5` 即可。不要把排障过程中的临时尝试误写成最终配置。

重启 Privoxy：

```bash
sudo systemctl restart privoxy
systemctl status privoxy --no-pager
```

### 验证

Privoxy 默认监听 WSL 本机的 `127.0.0.1:8118`：

```bash
curl -x http://127.0.0.1:8118 https://ipinfo.io
```

只有当该命令显示代理节点对应的地区时，才说明下面这条链路完整生效：

```text
curl → Privoxy :8118 → Windows SOCKS5 :1088 → 代理节点
```

如果结果仍是本地直连地区，应先修复 Privoxy 链路，不要急着让 Pi 使用 `8118`。

## 四、动态更新 WSL2 的 Windows Host IP

### 故障现象

Privoxy 配置中写死的 `172.xx.xx.1` 在 WSL2 重启后可能变化，导致原本正常的代理突然失效。

### 原因

WSL2 NAT 网络中的默认网关通常就是 WSL 可访问的 Windows Host 地址，但这个地址不应该被视为永久固定值。

### 修改

创建脚本：

```bash
sudo vi /usr/local/bin/update-privoxy-proxy.sh
```

推荐内容：

```bash
#!/usr/bin/env bash

set -euo pipefail

readonly CONFIG=/etc/privoxy/config
readonly SOCKS_PORT=1088

WIN_HOST=$(ip route | awk '/default/ {print $3; exit}')

if [ -z "$WIN_HOST" ]; then
    echo "Cannot find Windows host IP" >&2
    exit 1
fi

# 删除旧规则，确保配置中始终只有一条由本脚本管理的规则。
sed -i '/^[[:space:]]*forward-socks5[[:space:]]/d' "$CONFIG"
printf 'forward-socks5 / %s:%s .\n' "$WIN_HOST" "$SOCKS_PORT" >> "$CONFIG"

systemctl restart privoxy
```

赋予执行权限：

```bash
sudo chmod +x /usr/local/bin/update-privoxy-proxy.sh
```

这里采用“先删除旧规则，再追加新规则”的方式，避免多次运行后残留多条不同 IP 的 `forward-socks5` 规则。

> 如果 `/etc/privoxy/config` 中还有你自己维护的其他 `forward-socks5` 规则，不要直接使用上述删除表达式；应给自动生成的规则加专用标记，并只替换该规则。

### 验证

```bash
sudo /usr/local/bin/update-privoxy-proxy.sh
grep -nE '^[[:space:]]*forward-socks5' /etc/privoxy/config
curl -x http://127.0.0.1:8118 https://ipinfo.io
```

预期结果：

- 配置中只有一条受脚本管理的 `forward-socks5` 规则。
- 地址与 `ip route` 的默认网关一致。
- 规则末尾保留 `.`。
- HTTP 代理出口为代理节点所在地区。

## 五、用 systemd oneshot 开机自动更新

### 故障现象

手动运行更新脚本可以恢复代理，但每次 WSL2 网络地址变化后都要重新执行，不适合长期开发环境。

### 原因

Privoxy 配置是静态文件，而 Windows Host IP 是运行时信息。应在 WSL 启动后自动刷新配置，而不是在每次打开 shell 时使用 `sudo`。

### 修改

创建服务：

```bash
sudo vi /etc/systemd/system/update-privoxy-proxy.service
```

写入：

```ini
[Unit]
Description=Update Privoxy SOCKS5 upstream for WSL2
After=network-online.target privoxy.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/update-privoxy-proxy.sh

[Install]
WantedBy=multi-user.target
```

加载、启用并立即测试：

```bash
sudo systemctl daemon-reload
sudo systemctl enable update-privoxy-proxy.service
sudo systemctl start update-privoxy-proxy.service
systemctl status update-privoxy-proxy.service --no-pager
```

### 为什么 `inactive (dead)` 也可能完全正常

这是一个 `Type=oneshot` 服务。它的生命周期是：

```text
启动 → 执行脚本 → 脚本成功退出 → 服务结束
```

因此执行完成后看到：

```text
Active: inactive (dead)
```

并不代表失败。判断成功与否应看：

```text
code=exited, status=0/SUCCESS
```

或日志中是否出现成功完成的信息。

如果仅希望状态显示为 `active (exited)`，可以添加：

```ini
RemainAfterExit=yes
```

但这只改变显示方式，不影响代理功能，因此不是必需项。

### 验证

```bash
systemctl status update-privoxy-proxy.service --no-pager
grep -nE '^[[:space:]]*forward-socks5' /etc/privoxy/config
curl -x http://127.0.0.1:8118 https://ipinfo.io
```

如需查看最近日志：

```bash
journalctl -u update-privoxy-proxy.service -n 50 --no-pager
journalctl -u privoxy -n 50 --no-pager
```

如果极少数启动中脚本执行得早于 WSL 网络就绪，可再根据日志考虑重试机制；不要仅凭一次偶发现象盲目增加固定延时。

## 六、配置 bash 代理环境变量

### 故障现象

Privoxy 已经正常，但新终端中的程序仍然直连，或者只有显式使用 `curl -x` 时才走代理。

### 原因

Privoxy 提供了代理服务，但应用程序仍需通过环境变量知道代理地址。SOCKS5 和 HTTP 代理要分别声明，以兼容不同程序。

### 修改

编辑：

```bash
vi ~/.bashrc
```

加入：

```bash
# WSL2 -> Windows ShadowsocksR
export WIN_HOST="$(ip route | awk '/default/ {print $3; exit}')"

# Direct SOCKS5 proxy for tools that support ALL_PROXY
export ALL_PROXY="socks5h://${WIN_HOST}:1088"
export all_proxy="$ALL_PROXY"

# HTTP proxy supplied by Privoxy for Node.js and other tools
export HTTP_PROXY="http://127.0.0.1:8118"
export HTTPS_PROXY="http://127.0.0.1:8118"
export http_proxy="$HTTP_PROXY"
export https_proxy="$HTTPS_PROXY"
```

刷新当前 shell：

```bash
source ~/.bashrc
```

这里同时设置大小写变量，是为了兼容不同工具的读取习惯。

不建议在 `.bashrc` 中运行：

```bash
sudo /usr/local/bin/update-privoxy-proxy.sh
```

更新系统配置和重启服务属于 systemd 的职责；`.bashrc` 只负责当前交互式 shell 的环境变量。这样不会在每次开终端时重复请求 sudo 或重启 Privoxy。

### 验证

```bash
env | grep -i proxy
curl https://ipinfo.io
curl -x http://127.0.0.1:8118 https://ipinfo.io
```

如果某个工具行为异常，不要只看 `env`；应分别验证它真正使用的协议和出口。

## 七、Pi Agent OpenAI OAuth 403

### 故障现象

Pi Agent 通过 OpenAI account 完成浏览器登录后，终端返回：

```json
{
  "error": {
    "code": "unsupported_country_region_territory",
    "message": "Country, region, or territory not supported",
    "param": null,
    "type": "request_forbidden"
  }
}
```

与此同时，使用 `curl` 查看出口时已经显示为受支持的代理节点地区。

### 原因

这个现象不是 Pi 安装失败，也不必然表示账号本身有问题。实际原因是同一登录流程的不同阶段走了不同出口：

```text
浏览器 OAuth 登录
    ↓ Windows 浏览器代理
    ↓ 代理节点
    ↓ 成功

Pi 终端中的 token exchange
    ↓ Node.js fetch 未使用 ALL_PROXY / SOCKS5
    ↓ WSL 本地网络直连
    ↓ OpenAI 按请求出口地区拒绝
    ↓ 403 unsupported_country_region_territory
```

`curl` 能读取 `ALL_PROXY` 并不证明 Pi 内部的 Node.js 请求也能读取同一个 SOCKS5 变量。问题的关键不是“浏览器是否登录成功”，而是 **Pi 的 OAuth token exchange 实际从哪个网络出口发出**。

### 修改

通过 Privoxy 将 Windows SOCKS5 转为 HTTP 代理，然后在启动 Pi 的同一个 shell 中设置：

```bash
export HTTP_PROXY=http://127.0.0.1:8118
export HTTPS_PROXY=http://127.0.0.1:8118
export http_proxy="$HTTP_PROXY"
export https_proxy="$HTTPS_PROXY"
```

先临时设置并验证，成功后再写入 `~/.bashrc`。不要把 SOCKS5 端口错误写成：

```bash
export HTTP_PROXY=http://WINDOWS_HOST_IP:1088
```

`1088` 是 SOCKS5 端口，不是 HTTP 代理端口；协议写错不会完成转换。

### 验证

先确认 Privoxy 的出口：

```bash
curl -x http://127.0.0.1:8118 https://ipinfo.io
```

确认地区符合服务支持范围后，在同一个 shell 中重新启动 Pi，并重新执行 OpenAI 登录。此次配置中，加入正确的 HTTP/HTTPS 代理变量后 OAuth 登录成功。

> 代理只能解决请求没有走预期网络出口的问题。使用任何在线服务时，仍应遵守其当前服务地区、账号和使用条款；地区支持情况可能变化，应以服务方的最新规定为准。

## 八、npm 网络与安装排查经验

### 故障现象

Next.js 项目执行 `npm install` 后长时间显示转圈，似乎没有响应；中断后再次安装，最终又可以正常工作。期间还可能出现 `node_modules` 暂时不可见，或者 `npm run dev` 报 `Bus error`。

### 原因

“长时间没有新输出”不等于进程已经卡死。npm 安装包含多个阶段：

1. 解析依赖树。
2. 下载 tarball。
3. 解压大量小文件到 `node_modules`。
4. 运行 `install`、`postinstall`、`prepare` 等脚本。
5. 写入 `package-lock.json`。

后几个阶段可能很安静。Next.js 还会安装 SWC 等原生二进制包，首次下载经过较慢的代理节点时尤其容易让人误判。

如果在安装中途强制结束，`node_modules` 可能处于半安装状态。后续 `npm install` 通常会利用缓存并补齐依赖，而不是简单地永久跳过一个损坏模块。不过，中断仍可能留下不完整的原生二进制文件，导致运行阶段异常。

另一个常见原因是两个终端并不在同一个项目目录。一个窗口已经安装依赖，另一个窗口的 `pwd` 不同，看起来就像 `node_modules` 消失了。

### 修改与排查

先验证 npm registry 网络：

```bash
npm ping
npm config get registry
npm install --verbose
```

看到以下内容说明网络请求已成功，只是速度较慢：

```text
npm notice PONG ...
npm http fetch GET 200 https://registry.npmjs.org/...
```

另开窗口观察安装是否仍在推进：

```bash
ps -ef | grep '[n]pm install'
du -sh node_modules 2>/dev/null
```

若需确认运行中的 npm 到底在哪个目录，先找到 PID，再执行：

```bash
readlink -f /proc/NPM_PID/cwd
```

并与当前窗口比较：

```bash
pwd
ls -la
```

如果项目位于 `/mnt/c/...`，建议将 Node.js 项目移到 WSL 的 Linux 文件系统，例如：

```text
~/workspace/project-name
```

`node_modules` 包含大量小文件，在 WSL 的 Linux 文件系统中通常比 Windows 挂载目录更适合开发和文件监听。

如果确实发生过中断并怀疑依赖不完整，可在确认项目路径和 lockfile 状态后重新安装。优先保留可靠的 `package-lock.json` 并使用：

```bash
npm ci
```

只有在 lockfile 本身不可信、依赖定义确实需要重新解析时，才考虑删除 lockfile。不要把“删除 `package-lock.json` 和清空全部缓存”当成每次网络变慢的默认操作。

### 验证

```bash
npm ls
npx next --version
npm run dev
```

正常情况下不应出现 `missing`、`invalid`，Next.js 版本命令和开发服务器都应能启动。

如果仍出现 `Bus error`，再检查：

```bash
node -v
uname -m
ls node_modules/@next/
dmesg | tail -30
```

重点确认 Node.js 版本、CPU 架构、Next.js SWC 原生包和文件系统位置，而不是继续把所有问题归因于代理。

## 九、mRemoteNG SSH 登录时补充 Windows PATH

### 故障现象

在 Windows Terminal 直接进入 WSL Ubuntu 时可以执行：

```bash
explorer.exe .
```

但 mRemoteNG 通过 SSH 连接 `127.0.0.1` 登录同一个 WSL 后，命令提示找不到。使用绝对路径却可以运行：

```bash
/mnt/c/Windows/explorer.exe .
```

### 原因

绝对路径能够执行，说明：

- WSL 到 Windows 的 interop 正常。
- `/mnt/c` 挂载正常。
- 问题只是 SSH 会话的 `PATH` 没有自动包含 Windows 可执行文件目录。

Windows Terminal 启动 WSL 时通常会注入 Windows PATH；`mRemoteNG → sshd → bash` 是另一条启动链路，不一定得到相同的环境。即使两边的 `$SHELL` 和 `.profile` 内容相同，最终环境变量仍可能不同。

### 修改

在 `~/.bashrc` 中加入：

```bash
# Make basic Windows executables available in WSL SSH sessions.
if [ -d /mnt/c/Windows/System32 ]; then
    case ":$PATH:" in
        *:/mnt/c/Windows/System32:*) ;;
        *) export PATH="$PATH:/mnt/c/Windows/System32" ;;
    esac
fi

if [ -d /mnt/c/Windows ]; then
    case ":$PATH:" in
        *:/mnt/c/Windows:*) ;;
        *) export PATH="$PATH:/mnt/c/Windows" ;;
    esac
fi
```

刷新：

```bash
source ~/.bashrc
```

这里只加入用户明确需要的两个目录，避免把整个 Windows PATH 无限制复制到 SSH 会话。VS Code 的 `code` 命令路径因 Windows 用户名和安装方式而异，应先在能正常运行的 WSL 会话中执行 `command -v code`，再按实际路径决定是否加入；不要把个人用户名写进公开文档。

### 验证

```bash
command -v explorer.exe
explorer.exe .
```

预期能找到 `/mnt/c/Windows/.../explorer.exe` 并打开当前 WSL 目录。

如果绝对路径也不能运行，则不再是单纯 PATH 问题，应检查 WSL interop：

```bash
cat /proc/sys/fs/binfmt_misc/WSLInterop
```

## 十、Vim 黑底深蓝注释与终端颜色

### 故障现象

终端是黑色背景，但 Vim 默认主题把注释显示为深蓝色，文字几乎无法辨认。

### 原因

这是配色方案与终端背景对比度不足的问题。如果终端只报告 8 色能力，主题显示还会进一步受限。语法高亮已经开启并不代表当前颜色一定可读。

### 修改

使用 Vim 自带且适合暗色背景的配色，例如：

```vim
syntax enable
set background=dark
colorscheme desert

set number
set cursorline
```

也可以尝试自带的 `evening`、`elflord`，或另行安装适合 256 色终端的主题。公开备份中应区分“内置主题配置”和“需要额外下载的主题”。

#### `syntax on` 与 `syntax enable` 的区别

两者都会开启语法高亮，个人 `.vimrc` 中多数时候视觉效果相同。实际选择可理解为：

- `syntax on`：开启语法高亮，并按 Vim 的标准语法初始化流程加载设置。
- `syntax enable`：也开启语法高亮，但更倾向于保留当前已有的颜色高亮设置。

因此，在已经选择自定义配色或希望尽量保留已有高亮设置时，可使用：

```vim
syntax enable
```

真正解决“黑底深蓝注释看不清”的关键仍是 `set background=dark` 和合适的 `colorscheme`，而不是仅把 `syntax on` 换成 `syntax enable`。

### mRemoteNG 1.76 的 256 色检查建议

mRemoteNG 1.76 的终端能力和所使用的 PuTTY 组件/会话配置有关。不同构建和连接配置的界面名称可能不同，因此优先以实际能力验证，不要只看某个复选框。

SSH 登录后检查：

```bash
echo "$TERM"
tput colors
```

理想结果：

```text
xterm-256color
256
```

如果 mRemoteNG/PuTTY 的会话设置中存在以下项目，可确认：

- Terminal type string 设置为 `xterm-256color`。
- 允许终端使用 xterm 256-colour mode。
- 修改后保存到实际使用的会话，再完全断开并重新连接。

不要仅在 `~/.bashrc` 中强行设置 `TERM=xterm-256color` 来伪装能力。`TERM` 应描述终端实际支持的功能；如果前端不支持，强行声明可能导致颜色或控制序列异常。

mRemoteNG 1.76 的现实目标应优先放在稳定的 256 色显示。True Color（24 位色）与 256 色不是同一概念，不应仅凭 `TERM=xterm-256color` 判断已经支持 True Color。

### 验证

在 Vim 中执行：

```vim
:syntax
:set background?
:colorscheme
```

再打开包含注释的代码文件，确认注释、字符串、关键字在实际 mRemoteNG SSH 会话中都清晰可辨。

## 十一、重启后的检查清单

Windows 或 WSL2 重启后，可按以下顺序快速确认：

```bash
# 1. Windows Host IP 是否成功获取
echo "$WIN_HOST"
ip route | awk '/default/ {print $3; exit}'

# 2. 自动更新服务是否成功执行
systemctl status update-privoxy-proxy.service --no-pager

# 3. Privoxy 的上游规则是否正确，尤其检查最后的点号
grep -nE '^[[:space:]]*forward-socks5' /etc/privoxy/config

# 4. Privoxy 是否可用
systemctl status privoxy --no-pager

# 5. HTTP 代理出口是否正确
curl -x http://127.0.0.1:8118 https://ipinfo.io

# 6. 当前 shell 是否加载代理变量
env | grep -i proxy

# 7. npm 网络
npm ping

# 8. SSH 会话中的 Windows PATH
command -v explorer.exe

# 9. 终端颜色能力
echo "$TERM"
tput colors
```

## 十二、常用故障对照表

| 故障现象 | 主要原因 | 优先检查 |
|---|---|---|
| `curl: (7) Failed to connect` | SOCKS5 端口未监听、WSL 指向旧端口、Windows 未允许 WSL 访问 | Windows `1088`、`WIN_HOST`、显式 `curl --proxy` |
| Privoxy 可连接但出口仍为本地地区 | `forward-socks5` 规则不完整或未生效 | 末尾 `.`、规则数量、Privoxy 日志 |
| Pi OAuth 返回 `unsupported_country_region_territory` | token exchange 没走代理，实际出口与浏览器不同 | `HTTP_PROXY`、Privoxy 出口、在同一 shell 重启 Pi |
| oneshot 显示 `inactive (dead)` | 脚本执行完正常退出 | 是否有 `status=0/SUCCESS` |
| WSL 重启后代理突然失效 | Windows Host IP 变化 | 更新脚本、systemd 日志、当前默认网关 |
| `npm install` 长时间转圈 | 网络慢、解压/脚本阶段无输出、项目位于 `/mnt/c` | `npm ping`、`--verbose`、进程和目录大小 |
| `node_modules` 在另一个窗口看不到 | 两个终端工作目录不同，或安装尚未写入 | `pwd`、`/proc/PID/cwd`、`ls -la` |
| `npm run dev` 报 `Bus error` | 依赖中断、SWC 原生包/架构或文件系统问题 | `npm ls`、Node/架构、`@next/swc-*`、`dmesg` |
| SSH 中 `explorer.exe` 找不到，但绝对路径可运行 | SSH 会话没有注入 Windows PATH | `echo $PATH`、补充两个 Windows 目录 |
| Vim 注释为深蓝色看不清 | 主题与暗色背景对比不足，或终端颜色能力较低 | `background`、`colorscheme`、`TERM`、`tput colors` |

---

## 公开仓库安全检查

提交到 GitHub Pages 前，建议搜索以下内容：

```bash
grep -RniE '(password|passwd|token|secret|api[_-]?key|authorization|cookie|oauth)' .
grep -RniE '([0-9]{1,3}\.){3}[0-9]{1,3}' .
```

第二条会同时匹配文档中的无害示例地址，因此需要人工判断。应删除或替换：

- 实际代理节点和出口 IP。
- ShadowsocksR 服务器、端口以外的连接详情及订阅信息。
- OAuth 回调中的 `code`、token 和浏览器地址参数。
- OpenAI、GitHub、npm 或其他服务的凭据。
- Windows 用户名、内网主机名及不希望公开的目录结构。

如果敏感信息已经提交，仅从最新版本删除还不够：它仍可能存在于 Git 历史中，应立即轮换凭据，并清理仓库历史。
