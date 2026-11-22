# API and model client

The browser never talks to a model provider directly; every request goes through CanvasAnvil's own server. This page lists those endpoints, and how the model client reaches every vendor with a single protocol.

## The route table

Every endpoint is registered in one table, `API_ROUTES` in `server/http/routes.ts`, which Express and the Vite dev middleware both read.

| Endpoint | What it does |
| --- | --- |
| `POST /api/chat` | The diagram canvas's streaming conversation, with tool calls |
| `POST /api/ppt-ai` | Non-streaming model calls, shared by interior design, slides and the free canvas |
| `POST /api/ppt-ai/stream` | The streaming version of the above |
| `POST /api/cad/recognize` | Recognise walls and openings from an existing floor plan (needs Python) |
| `POST /api/cad/qa` | The floor plan's delivery check (needs a browser) |
| `POST /api/editable-export` | Editable PPTX export |
| `GET /api/skills` | List the installable skills and whether they are installed |
| `GET /api/skills/zip` | Download one skill as a zip |
| `POST /api/skills/install` | One-click local install of a skill |
| `GET /api/config` | The server's public configuration |

## One protocol

Every model call speaks the OpenAI HTTP protocol:

| Purpose | Route |
| --- | --- |
| Chat, vision, all text generation | `POST {baseUrl}/chat/completions` |
| Image generation | `POST {baseUrl}/images/generations` |
| Image editing, given a reference | `POST {baseUrl}/images/edits` |

There is no provider list. Using another vendor means pointing the Base URL at its OpenAI-compatible endpoint in Settings.

> [!WHY]
> A provider list means writing each vendor's quirks into the code, and following along every time one changes its API. The OpenAI protocol is already the common tongue: nearly every provider and gateway offers a compatible endpoint. Speaking only this one language means the least code and the most reach.

Image generation tries the images route first and falls back to `/chat/completions` with `image_url` parts, because a number of compatible gateways expose their image models as chat models. That fallback order is pinned by `tests/ai-request-shape.test.ts`.

## Two roads to the model

- **`/api/ppt-ai`**: non-streaming, called through `client/ai/client.ts`. The key stays out of cross-origin requests, and the server can inline remote images the browser could not fetch.
- **`/api/chat`**: streaming with tool calls, for the diagram canvas. It is a pipeline: validate, extract attachments, summarise, assemble the prompt, stream. See [Diagram chat pipeline](/docs/diagram-pipeline).

## Debugging

Set the `PROMPT_LOG_DIR` environment variable to write each fully assembled prompt to disk. It is off by default, because the logs hold users' content.
