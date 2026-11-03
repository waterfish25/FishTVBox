# FishTVBox 家庭电视盒

把装有浏览器的电视 / 电视盒 / 平板变成 IPTV + 电影 + 短视频终端。单个 Docker 容器运行，电脑上完成配置，电视端直接使用，手机可当遥控器。

- 在线演示（可直接访问）：<https://htmlpreview.github.io/?https://raw.githubusercontent.com/waterfish25/FishTVBox/main/docs/index.html>
- 在线演示（GitHub Pages，启用后）：<https://waterfish25.github.io/FishTVBox/>
- 容器镜像：`ghcr.io/waterfish25/fishtvbox:latest`
- 源码仓库：<https://github.com/waterfish25/FishTVBox>

> 在线演示为静态示例站，展示界面与布局；真实播放、直播源与电影源需要运行下面的 Docker 容器。

## 功能

- **IPTV 直播（左侧主区）**：解析 M3U / M3U8 / TXT 直播源，支持频道分组、台标与今日节目单。
- **当天回看**：优先读取 XMLTV 今日 EPG；源未提供节目单时，按 1 小时时段生成今日回看，可直接点选播放。
- **电影（右侧）**：配置苹果 CMS V10 采集源，自动获取列表、搜索、详情与选集播放。
- **短视频（右侧）**：抓取 B 站热门视频，内嵌播放器直接观看。
- **遥控器**：手机打开 `/remote` 使用方向键、确认、返回、搜索、音量；也支持键盘方向键、遥控器按键与 Gamepad。
- **配置页**：电脑打开 `/settings` 设置直播源、电影源、短视频开关等，保存后电视端自动刷新。
- **零第三方依赖**：后端仅使用 Node 标准库，`/data` 持久化配置。

## 快速开始

### 方式一：直接拉取镜像

```bash
docker run -d --name fishtvbox \
  --restart unless-stopped \
  -p 8686:8686 \
  -e TZ=Asia/Shanghai \
  -v "$(pwd)/data:/data" \
  ghcr.io/waterfish25/fishtvbox:latest
```

### 方式二：Docker Compose

```bash
git clone https://github.com/waterfish25/FishTVBox.git
cd FishTVBox
docker compose up -d --build
```

只使用已构建镜像：

```bash
docker compose pull && docker compose up -d
```

### 方式三：本地构建

```bash
docker build -t fishtvbox:latest .
docker run -d --name fishtvbox -p 8686:8686 -v "$(pwd)/data:/data" fishtvbox:latest
```

启动后：

| 页面 | 地址 | 用途 |
| --- | --- | --- |
| TV 端 | `http://<宿主机IP>:8686/` | 电视 / 盒子全屏打开 |
| 电脑配置 | `http://<宿主机IP>:8686/settings` | 设置直播源、电影源、短视频 |
| 手机遥控 | `http://<宿主机IP>:8686/remote` | 方向键、确认、搜索、音量 |

电视端建议用浏览器全屏模式（F11 / 全屏按钮）打开，并使用方向键或遥控器操作。

## 配置说明

### 直播源

默认内置几条咪咕视频源与 GH 加速地址：

- `https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/interface.txt`
- `https://develop202.github.io/migu_video/interface.txt`
- `https://gh-proxy.com/https://raw.githubusercontent.com/develop202/migu_video/refs/heads/main/interface.txt`

后端会按顺序尝试；若全部不可用或返回 0 个频道，会回退到内置演示频道（公共 HLS 测试流），保证界面不空白。你可以在配置页添加自己的 M3U / TXT 直播源。

支持的源格式：

- M3U / M3U8：`#EXTINF` + `tvg-logo` / `group-title` / `catchup` / `catchup-source`
- TXT：`分组名,#genre#` 后每行 `频道名,播放地址`

### 当天回看

回看依赖直播源提供的 `catchup-source` 模板（常见占位符 `{start}`、`{end}`、`${(b)yyyyMMddHHmmss}` 等），并结合今日 EPG 生成回看地址；没有 EPG 时按小时生成今日时段。源本身不支持回看时，界面会提示“当前频道未提供回看地址”。

### 电影源

填写苹果 CMS V10 采集接口，例如：

```
https://caiji.dyttzyapi.com/api.php/provide/vod
```

可在配置页点击“测试”验证列表接口是否可用。支持多源，按顺序回退。

### 短视频

默认启用 B 站热门抓取，可设置条数与最长时长。若网络无法访问 B 站接口，该区块会显示为空并给出提示，不影响其他功能。

## 数据与端口

- 端口：`8686`
- 持久化目录：`/data`（`config.json` 与运行时缓存）
- 环境变量：`PORT`、`DATA_DIR`、`TZ`

## 镜像构建

仓库内置 GitHub Actions：

- `.github/workflows/docker-publish.yml`：推送到 `main` 或打 `v*` 标签时自动构建并推送镜像到 GHCR。
- `.github/workflows/pages.yml`：推送 `docs/` 时自动部署在线演示站到 GitHub Pages。

镜像标签包括 `latest`、分支名、语义化版本与短 SHA。

本地语法检查：

```bash
node --check server/index.js
node --check server/iptv.js
node --check server/movies.js
node --check server/bilibili.js
node --check server/stream.js
node --check web/js/app.js
```

## 目录结构

```text
server/            Node 标准库后端（IPTV / EPG / 回看、电影、B 站、流代理、SSE 遥控）
web/               TV 端、电脑配置页、手机遥控页与前端资源
docs/              静态在线演示站（GitHub Pages）
data/              运行时配置持久化（挂载到 /data，不提交仓库）
Dockerfile
docker-compose.yml
```

## 免责声明

本项目仅作为个人学习与家庭自用的媒体聚合界面，不提供、不存储任何音视频内容。直播源、电影源、B 站内容均来自第三方公开接口，其可用性、合法性与版权归相应提供方所有。请自行确认所在地区的法律法规与内容授权后再使用。
