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

Editable PPTX export, like every other feature, runs on the text and image models the user enters in the page's AI settings (key, base URL, model). They travel with each export and are only held in memory; the server needs no model keys in its environment and does not use any.

The image includes the reconstruction scripts, Python dependencies, LibreOffice and fonts. Linux exports PDF through LibreOffice and renders page previews through PyMuPDF for QA. Windows hosts continue using PowerPoint. Font metrics and layout can differ between renderers, so verify the exported slides after deployment.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Service listen port inside the container or host process |
| `API_BODY_LIMIT` | `25mb` | Maximum API request body size |
| `WEB_DIST_DIR` | `./dist` | Static web assets directory |
| `PYTHON` | `python3` (`python` on Windows) | Python for floorplan recognition and the CAD delivery check (needs `server/recognizer/requirements.txt`) |
| `CHROME_PATH` | auto-detected | Chrome / Edge / Chromium for the CAD delivery check |
