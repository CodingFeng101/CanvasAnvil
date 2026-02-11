import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from 'vite-plugin-trae-solo-badge';
import { GET as getConfig } from "./api/routes/config";
import { POST as postVerifyAccessCode } from "./api/routes/verify-access-code";
import { POST as postLogFeedback } from "./api/routes/log-feedback";
import { POST as postLogSave } from "./api/routes/log-save";
import { POST as postChat } from "./api/routes/chat";

type RouteHandler = (request: Request) => Promise<Response>;

const API_ROUTES: Record<string, RouteHandler> = {
  "GET /api/config": async () => getConfig(),
  "POST /api/verify-access-code": postVerifyAccessCode,
  "POST /api/log-feedback": postLogFeedback,
  "POST /api/log-save": postLogSave,
  "POST /api/chat": postChat,
};

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const origin = `http://${req.headers.host || "localhost"}`;
  const url = new URL(req.url || "/", origin);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return new Request(url.toString(), { method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  return new Request(url.toString(), {
    method,
    headers,
    body: bodyBuffer as BodyInit | null | undefined,
  });
}

async function sendWebResponse(webResponse: Response, res: ServerResponse) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  const reader = webResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

function createLocalApiPlugin(): Plugin {
  const attachApiMiddleware = (middlewares: Connect.ServerStack) => {
    middlewares.use(async (req, res, next) => {
      const method = (req.method || "GET").toUpperCase();
      const pathname = new URL(req.url || "/", "http://localhost").pathname;
      const routeKey = `${method} ${pathname}`;
      const handler = API_ROUTES[routeKey];

      if (!handler) {
        next();
        return;
      }

      try {
        const request = await toWebRequest(req);
        const response = await handler(request);
        await sendWebResponse(response, res);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Internal Server Error";
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: message }));
      }
    });
  };

  return {
    name: "local-api-routes",
    configureServer(server) {
      attachApiMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachApiMiddleware(server.middlewares);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    createLocalApiPlugin(),
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    traeBadgePlugin({
      variant: 'dark',
      position: 'bottom-right',
      prodOnly: true,
      clickable: true,
      clickUrl: 'https://www.trae.ai/solo?showJoin=1',
      autoTheme: true,
      autoThemeTarget: '#root'
    }), 
    tsconfigPaths()
  ],
})
