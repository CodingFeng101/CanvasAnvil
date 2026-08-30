# Deployment Guide

Chinese version: [README.zh-CN.md](README.zh-CN.md)

CanvasAnvil deploys as a single web service: one Node process serves the static assets and `/api/*`.

## Quick Start

| Scenario | Recommended | Command |
| --- | --- | --- |
| Run directly on host | Host deployment | `npm ci && npm run build && npm start` |
| Containerized deployment | Docker Compose (recommended) | `docker compose -f deploy/docker/docker-compose.yml up -d --build` |

Default Docker endpoint:

- Main app: `http://localhost:8001/`

## Directory Layout

- `deploy/host/`: host or bare-metal scripts and Nginx reverse proxy config
- `deploy/docker/`: Dockerfiles, Nginx config, and Docker Compose config

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

For production, use `pm2` or `systemd` to keep the service alive.

The main app listens on `PORT`, defaulting to `8080`. To use port `8001` directly on the host:

```bash
PORT=8001 npm start
```

3. Nginx (optional)

- Enable `deploy/host/nginx.conf` and reload Nginx
- Includes `client_max_body_size 25m`
- Sets `proxy_buffering off` for `/api/chat`
- Proxies `/healthz`

## Docker Deployment

Option A: Docker Compose

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

The Compose file starts the app service:

```yaml
services:
  app:
    ports:
      - "8001:8080"
```

Keep `PORT=8080` inside the main app container unless you specifically need to change the container's internal listen port.

Option B: Docker CLI

```bash
docker build -f deploy/docker/Dockerfile -t canvasanvil/app:latest .
docker run --rm -p 8001:8080 canvasanvil/app:latest
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Service listen port inside the container or host process |
| `API_BODY_LIMIT` | `25mb` | Maximum API request body size |
| `WEB_DIST_DIR` | `./dist` | Static web assets directory |
