# Quickstart

From a clean checkout to your first diagram in the browser takes about five minutes.

## Use it online

If you would rather not install anything, open the hosted version: [canvasanvil.codingfgd.asia](https://canvasanvil.codingfgd.asia). Fill in your own model in Settings and you can begin.

## Run it locally

You need Node.js 20 or later.

### 1. Install dependencies

```bash
npm install
```

### 2. Start

```bash
npm run dev
```

This one command starts both the web app and the API. Open `http://127.0.0.1:8001` to see the home page.

> [!NOTE]
> In development the API is served in the same process by Vite middleware, so there is no separate backend to start. On a server CanvasAnvil also runs as a single service; see `deploy/README.md` in the repository.

### 3. Connect a model

Open Settings from the bottom left, or press `Ctrl + ,`, and go to Models: enter a Base URL, an API key and a model name, then press Test connection. Details are in [Connecting a model](/docs/models).

### 4. Draw your first diagram

Back on the home page, choose a canvas and write what you want in the input, for example:

```text
Draw the architecture of an online shop: a frontend, a gateway, order / inventory / payment services, each with its own database, and a message queue.
```

A few seconds later the first draft appears on the canvas to the right. Every sentence after that keeps editing the same diagram.

## Common commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app on port 8001 |
| `npm run check` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm test` | Run the tests |
| `npm run build` | Production build |

## Optional dependencies

Most features need nothing but Node. The two below add to the interior design canvas; without them nothing breaks, the matching button simply does not appear:

- **Uploading an existing floor plan**: the server needs Python and `pip install -r server/recognizer/requirements.txt`.
- **Delivery check**: the server needs Chrome, Edge or Chromium (or point `CHROME_PATH` at one).

The Docker image ships with both.
