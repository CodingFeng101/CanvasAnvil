# Deployment Guide

English version: [`README.md`](README.md)

当前部署模型是单服务：一个 Node 进程同时提供静态站点与 `/api/*`。

## 快速开始

| 场景 | 推荐方式 | 命令 |
| --- | --- | --- |
| 直接在主机运行 | Host 部署 | `npm ci && npm run build && npm start` |
| 容器化部署 | Docker Compose（推荐） | `docker compose -f deploy/docker/docker-compose.yml up -d --build` |

默认端口：`8080`  
默认访问地址：`http://localhost:8080/`

## 目录结构

- `deploy/host/`: 主机/裸机部署脚本和 Nginx 反向代理配置
- `deploy/docker/`: Dockerfile 与 Compose 配置

## Host 部署

1. 构建
- Linux/macOS:
```bash
bash deploy/host/build.sh
```
- Windows PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File deploy/host/build.ps1
```
- 或手动执行：
```bash
npm ci
npm run build
```

2. 启动
```bash
npm start
```
生产环境建议使用 `pm2` 或 `systemd` 守护。

3. Nginx（可选）
- 启用 `deploy/host/nginx.conf` 并重载 Nginx
- 已包含 `client_max_body_size 25m`
- 已对 `/api/chat` 配置 `proxy_buffering off`
- 已转发 `/healthz`

## Docker 部署

方式 A：Compose（推荐）

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

方式 B：Docker CLI

```bash
docker build -f deploy/docker/Dockerfile -t canvasanvil/app:latest .
docker run --rm -p 8080:8080 canvasanvil/app:latest
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 服务监听端口 |
| `API_BODY_LIMIT` | `25mb` | API 请求体大小限制 |
| `WEB_DIST_DIR` | `./dist` | 前端静态资源目录 |
