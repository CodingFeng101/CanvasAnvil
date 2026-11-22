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
- `deploy/docker/`: the Dockerfile and the Docker Compose config

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

## Windows Desktop App

Packages the web app and its local server as one Windows installer that runs on each person's own computer, without your server: works, settings and model keys stay on that computer.

```bash
npm run desktop:build
```

It builds the web client (`dist/`), then `desktop/build.mjs` stages the Electron entry, the server bundled into one file, `dist/`, `resources/` and `skill/` in `build/desktop/app` and packages them with electron-builder. The installer is `build/desktop/out/CanvasAnvil-Setup-<version>.exe`. On a slow network set `ELECTRON_MIRROR` and `ELECTRON_BUILDER_BINARIES_MIRROR` to a mirror first.

- Per-user install, no admin prompt; unsigned, so SmartScreen asks once ("More info → Run anyway").
- The local server listens on `127.0.0.1:38001` (38002–38005 if taken). Works live in that origin's browser storage, apart from the web app's; move them with the backup export / import in Settings.
- Server log: `%APPDATA%\CanvasAnvil\server.log`.
- No Python or other external tools are shipped: floorplan upload appears only when Python with `server/recognizer/requirements.txt` is installed; the delivery check is not offered; editable PPTX export points to ppt-skill instead.

## Environment Variables

Editable PPTX export, like every other feature, runs on the text and image models the user enters in Settings → Models (key, base URL, model). They travel with each export and are only held in memory; the server needs no model keys in its environment and does not use any.

The image includes the reconstruction scripts, Python dependencies, LibreOffice and fonts. Linux exports PDF through LibreOffice and renders page previews through PyMuPDF for QA. Windows hosts continue using PowerPoint. Font metrics and layout can differ between renderers, so verify the exported slides after deployment.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | Service listen port inside the container or host process |
| `API_BODY_LIMIT` | `25mb` | Maximum API request body size |
| `WEB_DIST_DIR` | `./dist` | Static web assets directory |
| `PYTHON` | `python3` (`python` on Windows) | Python for floorplan recognition and the CAD delivery check (needs `server/recognizer/requirements.txt`) |
| `CHROME_PATH` | auto-detected | Chrome / Edge / Chromium for the CAD delivery check |
| `LISTEN_HOST` | unset (all addresses) | Listen on one address only, e.g. `127.0.0.1` |
| `RUNS_KEEP_DAYS` | `7` | How long the CAD delivery check and editable export keep their job folders under `runs/`; pruned when a new job starts |
| `ACCESS_CODE_LIST` | unset | Comma-separated access codes, checked by the diagram chat only. Settings has no field for a code yet, so setting this turns the diagram chat away; not recommended for now |
| `DAILY_REQUEST_LIMIT` / `DAILY_TOKEN_LIMIT` / `TPM_LIMIT` | `0` (no limit) | Per-browser daily requests, daily tokens and tokens per minute in the diagram chat, counted by the page |
| `MAX_OUTPUT_TOKENS` | unset | Output cap for one diagram chat reply; unset, the provider's own maximum applies |
| `TEMPERATURE` | unset | Sampling temperature for the diagram chat |
| `HTTPS_PROXY` / `HTTP_PROXY` | unset | Proxy the server uses to reach model providers |
| `PROMPT_LOG_DIR` | unset | When set, the diagram chat's prompts are written to `llm-prompts.log` in this folder, for debugging |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASEURL` | unset | When set, model calls are traced to Langfuse |

Installing dependencies (`npm install` / `npm ci`) downloads draw.io into `public/drawio/`; the build ships it in `dist`, and the diagram canvas uses it first, without reaching the internet. These variables apply at install or build time:

| Variable | Default | Description |
| --- | --- | --- |
| `DRAWIO_WAR_URL` | draw.io's release on GitHub | Download `draw.war` from elsewhere (a mirror on a slow network, or a `file://` path); in Docker, `--build-arg DRAWIO_WAR_URL=...` |
| `CANVASANVIL_SKIP_DRAWIO` | unset | Any value skips the download; the canvas uses the online draw.io |
| `VITE_DRAWIO_BASE_URL` | unset | A draw.io address fixed at build time (for example one hosted on an intranet); when set, only it is used |
