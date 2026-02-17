# Deploy

当前部署方式为单服务：一个 Node 进程同时提供静态站点和 `/api/*`。

## 目录结构

- `deploy/host/`：主机/裸机部署脚本与 Nginx 反向代理配置
- `deploy/docker/`：Docker 镜像与 Compose 配置

## Host（主机/裸机）

1. 安装依赖并构建

```bash
npm ci
npm run build
```

2. 启动服务

```bash
npm start
```

默认监听：`http://127.0.0.1:8080`

可选环境变量：

- `PORT`：服务端口（默认 `8080`）
- `API_BODY_LIMIT`：API 请求体大小限制（默认 `25mb`）
- `WEB_DIST_DIR`：静态资源目录（默认 `./dist`）

建议使用 `pm2` 或 `systemd` 守护。

3. （可选）Nginx 反向代理

将 `deploy/host/nginx.conf` 作为站点配置启用，重载 Nginx 后访问即可。
该配置已包含：

- `client_max_body_size 25m`（避免文件上传出现 `413 Request Entity Too Large`）
- `/api/chat` 的 `proxy_buffering off`（保证聊天流式输出实时返回）

## Docker

方式 A：Compose（推荐）

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```
Compose 配置已内置 `/healthz` 健康检查。

方式 B：直接运行

```bash
docker build -f deploy/docker/Dockerfile -t unified-ai-workspace:latest .
docker run --rm -p 8080:8080 unified-ai-workspace:latest
```

默认访问：`http://localhost:8080/`

Docker 构建使用项目根目录的 `.dockerignore`，避免把 `node_modules/` 等无关内容打进构建上下文。
`deploy/docker/Dockerfile` 使用多阶段构建：构建阶段安装完整依赖，运行阶段仅安装生产依赖。
