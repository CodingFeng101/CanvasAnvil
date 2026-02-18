# Deployment Guide

中文版本: [`README.zh-CN.md`](README.zh-CN.md)

The deployment model is a single service: one Node process serves both static assets and `/api/*`.

## Quick Start

| Scenario | Recommended | Command |
| --- | --- | --- |
| Run directly on host | Host deployment | `npm ci && npm run build && npm start` |
| Containerized deployment | Docker Compose (recommended) | `docker compose -f deploy/docker/docker-compose.yml up -d --build` |

Default port: `8080`  
Default URL: `http://localhost:8080/`

## Directory Layout

- `deploy/host/`: host/bare-metal scripts and Nginx reverse proxy config
- `deploy/docker/`: Dockerfile and Compose config

## Host Deployment

1. Build
- Linux/macOS:
```bash
bash deploy/host/build.sh
```
- Windows PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File deploy/host/build.ps1
```
- Or run manually:
```bash
npm ci
npm run build
```

2. Run
```bash
npm start
```
For production, use `pm2` or `systemd` to keep it alive.

3. Nginx (Optional)
- Enable `deploy/host/nginx.conf` and reload Nginx
- Includes `client_max_body_size 25m`
- Sets `proxy_buffering off` for `/api/chat`
- Proxies `/healthz`

## Docker Deployment

Option A: Compose (recommended)

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

Option B: Docker CLI

```bash
docker build -f deploy/docker/Dockerfile -t canvasanvil/app:latest .
docker run --rm -p 8080:8080 canvasanvil/app:latest
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | service listen port |
| `API_BODY_LIMIT` | `25mb` | max API request body size |
| `WEB_DIST_DIR` | `./dist` | static web assets directory |
