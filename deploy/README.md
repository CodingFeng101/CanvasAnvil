# Deploy

该项目包含两部分：

- Web：Vite 构建后的静态站点（`dist/`）
- API：Node/Express 服务（`/api/*` 路由）

仅部署静态站点会导致依赖 `/api/*` 的功能不可用（例如 Flow Next 的配置与聊天接口）。

## 目录结构

- `deploy/host/`：传统（主机/裸机）部署
- `deploy/docker/`：Docker 镜像与 Compose 部署

## 传统部署（Host）

1. 构建产物

```bash
./deploy/host/build.sh
```

或（Windows）

```powershell
.\deploy\host\build.ps1
```

2. 上传 `dist/` 到服务器，例如：

- `/var/www/unified-ai-workspace/dist`

3. 启动 API 服务（建议使用 `pm2`/`systemd` 守护）

```bash
npm ci
npm run start:api
```

默认监听：`http://127.0.0.1:8787`

4. Nginx 配置

将 `deploy/host/nginx.conf` 作为站点配置启用（并按实际目录调整 `root`），其中已包含 `/api` 反向代理到 `127.0.0.1:8787`。重载 Nginx 后访问即可。

## Docker 部署

方式 A：Compose（推荐）

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

默认对外端口：`http://localhost:8080/`

方式 B：仅启动 Web（不含 API，不推荐生产）

```bash
docker build -f deploy/docker/Dockerfile -t unified-ai-workspace:latest .
docker run --rm -p 8080:80 unified-ai-workspace:latest
```

Docker 构建使用项目根目录的 `.dockerignore` 以避免把 `node_modules/` 等无关内容打进构建上下文。
