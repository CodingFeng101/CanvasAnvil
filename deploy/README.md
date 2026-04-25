# Deployment Guide

Chinese version: [README.zh-CN.md](README.zh-CN.md)

CanvasAnvil deployment has two runnable web services:

- Main app: one Node process serves the CanvasAnvil static assets and `/api/*`.
- PPTist Lab: a separate static Vue app served independently.

## Quick Start

| Scenario | Recommended | Command |
| --- | --- | --- |
| Run directly on host | Host deployment | `npm ci && npm run build && npm start` |
| Containerized deployment | Docker Compose (recommended) | `docker compose -f deploy/docker/docker-compose.yml up -d --build` |

Default Docker endpoints:

- Main app: `http://localhost:8001/`
- PPTist Lab container: `http://127.0.0.1:18003/`
- PPTist Lab public URL when using Nginx TLS: `https://your-domain:8003/`

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

3. Build and run PPTist Lab

```bash
cd pptist-lab
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 8003
```

For production, prefer serving `pptist-lab/dist` with Nginx or another static file server, and keep that process under `pm2` or `systemd` if you use Vite preview.

4. Nginx (optional)

- Enable `deploy/host/nginx.conf` and reload Nginx
- Enable `deploy/host/pptist-lab.nginx.conf` for PPTist Lab and update its `root` path to your deployed `pptist-lab/dist`
- Includes `client_max_body_size 25m`
- Sets `proxy_buffering off` for `/api/chat`
- Proxies `/healthz`

## Docker Deployment

Option A: Docker Compose

```bash
docker compose -f deploy/docker/docker-compose.yml up -d --build
```

The Compose file starts both services:

```yaml
services:
  app:
    ports:
      - "8001:8080"
  pptist-lab:
    ports:
      - "127.0.0.1:18003:80"
```

Keep `PORT=8080` inside the main app container unless you specifically need to change the container's internal listen port.

Option B: Docker CLI

```bash
docker build -f deploy/docker/Dockerfile -t canvasanvil/app:latest .
docker run --rm -p 8001:8080 canvasanvil/app:latest
```

```bash
docker build -f deploy/docker/Dockerfile.pptist-lab -t canvasanvil/pptist-lab:latest .
docker run --rm -p 127.0.0.1:18003:80 canvasanvil/pptist-lab:latest
```

## PPTist Lab Notes

The main app and PPTist Lab are deployed as separate services. In local development, use port `8001` for the main app and port `8003` for PPTist Lab. In Docker deployment behind Nginx, expose PPTist Lab publicly through Nginx on `8003`, and proxy it to the container's local host port `18003`. The root Vite config proxies `/pptist-lab` to `127.0.0.1:8003` during local development.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Service listen port inside the container or host process |
| `API_BODY_LIMIT` | `25mb` | Maximum API request body size |
| `WEB_DIST_DIR` | `./dist` | Static web assets directory |
