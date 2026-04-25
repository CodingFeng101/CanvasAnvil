# 部署说明

English version: [View English document](README.md)

CanvasAnvil 部署时包含两个可运行的 Web 服务：

- 主应用：一个 Node 进程同时提供 CanvasAnvil 静态站点与 `/api/*`。
- PPTist Lab：独立静态 Vue 应用，单独部署和访问。

## 快速开始

| 场景 | 推荐方式 | 命令 |
| --- | --- | --- |
| 直接在主机运行 | Host 部署 | `npm ci && npm run build && npm start` |
| 容器化部署 | Docker Compose（推荐） | `docker compose -f deploy/docker/docker-compose.yml up -d --build` |

默认 Docker 访问地址：

- 主应用：`http://localhost:8001/`
- PPTist Lab 容器本机地址：`http://127.0.0.1:18003/`
- 使用 Nginx TLS 时的 PPTist Lab 对外地址：`https://你的域名:8003/`

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

3. 构建并启动 PPTist Lab

```bash
cd pptist-lab
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 8003
```

生产环境更建议用 Nginx 或其他静态文件服务托管 `pptist-lab/dist`；如果使用 Vite preview，则建议用 `pm2` 或 `systemd` 守护。

4. Nginx（可选）

- 启用 `deploy/host/nginx.conf` 并重载 Nginx
- 启用 `deploy/host/pptist-lab.nginx.conf` 部署 PPTist Lab，并把其中的 `root` 改成实际的 `pptist-lab/dist` 路径
- 已包含 `client_max_body_size 25m`
- 已对 `/api/chat` 配置 `proxy_buffering off`
- 已转发 `/healthz`

## Docker 部署

方式 A：Docker Compose

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Compose 文件会同时启动两个服务：

```yaml
services:
  app:
    ports:
      - "8001:8080"
  pptist-lab:
    ports:
      - "127.0.0.1:18003:80"
```

除非确实需要修改容器内部监听端口，否则主应用容器内保持 `PORT=8080` 即可。

方式 B：Docker CLI

```bash
docker build -f deploy/docker/Dockerfile -t canvasanvil/app:latest .
docker run --rm -p 8001:8080 canvasanvil/app:latest
```

```bash
docker build -f deploy/docker/Dockerfile.pptist-lab -t canvasanvil/pptist-lab:latest .
docker run --rm -p 127.0.0.1:18003:80 canvasanvil/pptist-lab:latest
```

## PPTist Lab 说明

主应用和 PPTist Lab 按独立服务部署。本地开发统一使用主应用 `8001`、PPTist Lab `8003`。Docker + Nginx 部署时，PPTist Lab 对外仍由 Nginx 暴露 `8003`，Nginx 再反代到容器映射的本机端口 `18003`。根目录 `vite.config.ts` 会在本地开发时把 `/pptist-lab` 代理到 `127.0.0.1:8003`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 容器内或主机进程的服务监听端口 |
| `API_BODY_LIMIT` | `25mb` | API 请求体大小限制 |
| `WEB_DIST_DIR` | `./dist` | 前端静态资源目录 |
