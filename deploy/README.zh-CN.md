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

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 容器内或主机进程的服务监听端口 |
| `API_BODY_LIMIT` | `25mb` | API 请求体大小限制 |
| `WEB_DIST_DIR` | `./dist` | 前端静态资源目录 |
