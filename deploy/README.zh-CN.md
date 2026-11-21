# 部署说明

English version: [View English document](README.md)

CanvasAnvil 以单个 Web 服务部署：一个 Node 进程同时提供静态站点与 `/api/*`。

## 快速开始

| 场景 | 推荐方式 | 命令 |
| --- | --- | --- |
| 直接在主机运行 | Host 部署 | `npm ci && npm run build && npm start` |
| 容器化部署 | Docker Compose（推荐） | `docker compose -f deploy/docker/docker-compose.yml up -d --build` |

默认 Docker 访问地址：

- 主应用：`http://localhost:8001/`

## 目录结构

- `deploy/host/`: 主机/裸机部署脚本和 Nginx 反向代理配置
- `deploy/docker/`: Dockerfile、Nginx 配置与 Compose 配置

## Host 部署

1. 构建

Linux/macOS:

```bash
bash deploy/host/build.sh
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/host/build.ps1
```

或手动执行：

```bash
npm ci
npm run build
```

2. 启动

```bash
npm start
```

生产环境建议使用 `pm2` 或 `systemd` 守护。

主应用监听 `PORT`，默认值是 `8080`。如果主机直接使用 `8001`：

```bash
PORT=8001 npm start
```

3. Nginx（可选）

- 启用 `deploy/host/nginx.conf` 并重载 Nginx
- 已包含 `client_max_body_size 25m`
- 已对 `/api/chat` 配置 `proxy_buffering off`
- 已转发 `/healthz`

## Docker 部署

方式 A：Docker Compose

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Compose 文件会启动主应用服务：

```yaml
services:
  app:
    ports:
      - "8001:8080"
```

除非确实需要修改容器内部监听端口，否则主应用容器内保持 `PORT=8080` 即可。

方式 B：Docker CLI

```bash
docker build -f deploy/docker/Dockerfile -t canvasanvil/app:latest .
docker run --rm -p 8001:8080 canvasanvil/app:latest
```

## 环境变量

可编辑 PPTX 导出和其它功能一样，用的是用户在网页“AI 设置”里填的文本模型和图片模型（密钥、地址、模型名），随每次导出发给服务端，只在内存里使用；服务端不需要、也不会使用环境变量里的模型密钥。

镜像包含重建脚本、Python 依赖、LibreOffice 和字体。Linux 通过 LibreOffice 导出 PDF，再由 PyMuPDF 生成逐页预览供 QA 使用。Windows 主机继续使用 PowerPoint。两种渲染器的字体和排版可能存在差异，部署后需核对实际导出效果。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 容器内或主机进程的服务监听端口 |
| `API_BODY_LIMIT` | `25mb` | API 请求体大小限制 |
| `WEB_DIST_DIR` | `./dist` | 前端静态资源目录 |
| `PYTHON` | `python3`（Windows 为 `python`） | 户型识别和 CAD 交付检查用的 Python（需装 `server/recognizer/requirements.txt`） |
| `CHROME_PATH` | 自动查找 | CAD 交付检查用的 Chrome / Edge / Chromium |

安装依赖（`npm install` / `npm ci`）时会下载一份 draw.io 到 `public/drawio/`，构建时随 `dist` 一起发布，图表画布优先用它，不依赖外网。下面两个变量在安装或构建时生效：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DRAWIO_WAR_URL` | GitHub 上 draw.io 的发布包 | 从别的地址下载 `draw.war`（网络慢时换镜像，也可以是 `file://` 本地文件）；Docker 用 `--build-arg DRAWIO_WAR_URL=...` |
| `CANVASANVIL_SKIP_DRAWIO` | 未设置 | 设为任意值则不下载，画布直接用在线的 draw.io |
| `VITE_DRAWIO_BASE_URL` | 未设置 | 构建时指定 draw.io 地址（例如内网自建的），设置后只用它 |
