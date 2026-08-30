import { defineConfig } from 'vite'
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { GET as getConfig } from "./api/routes/config";
import { POST as postVerifyAccessCode } from "./api/routes/verify-access-code";
import { POST as postLogFeedback } from "./api/routes/log-feedback";
import { POST as postLogSave } from "./api/routes/log-save";
import { POST as postLogFileParser } from "./api/routes/log-file-parser";
import { POST as postThirdPartyParser } from "./api/routes/third-party-parser";
import { POST as postChat } from "./api/routes/chat";
import { POST as postPptAi } from "./api/routes/ppt-ai";

type RouteHandler = (request: Request) => Promise<Response>;

const API_ROUTES: Record<string, RouteHandler> = {
  "GET /api/config": async () => getConfig(),
  "POST /api/verify-access-code": postVerifyAccessCode,
  "POST /api/log-feedback": postLogFeedback,
  "POST /api/log-save": postLogSave,
  "POST /api/log-file-parser": postLogFileParser,
  "POST /api/third-party-parser": postThirdPartyParser,
  "POST /api/chat": postChat,
  "POST /api/ppt-ai": postPptAi,
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
  server: {
    host: "0.0.0.0",
    port: 8001,
  },
  preview: {
    host: "0.0.0.0",
    port: 8001,
  },
  optimizeDeps: {
    entries: ["index.html"],
  },
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Split by package rather than by named entry point: the object
        // form of manualChunks makes each listed package a chunk entry, which
        // let Vite's own preload helper get hoisted into a vendor chunk and
        // pulled into the initial load. Returning undefined leaves placement
        // to Rollup, which keeps the helper with the entry.
        manualChunks(id: string) {
          // Vite's dynamic-import preload helper is a virtual module every
          // lazy chunk needs. Left to Rollup it landed in the PowerPoint
          // chunk, which made the entry preload 800 kB to reach it.
          if (id.includes("vite/preload-helper")) return "vendor-react"
          if (!id.includes("node_modules")) return
          const match = /node_modules[\\\/](?:(@[^\\\/]+)[\\\/])?([^\\\/]+)/.exec(id)
          const pkg = match ? `${match[1] ? `${match[1]}/` : ""}${match[2]}` : ""
          if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") return "vendor-react"
          if (pkg === "pptxgenjs" || pkg === "pdf-lib") return "vendor-office"
          if (pkg === "jszip" || pkg === "pako") return "vendor-zip"
          if (pkg === "mammoth") return "vendor-docs"
          if (pkg === "react-markdown" || pkg === "remark-gfm" || pkg === "prism-react-renderer") {
            return "vendor-markdown"
          }
          if (pkg === "react-drawio") return "vendor-drawio"
          if (pkg === "ai" || pkg.startsWith("@ai-sdk/") || pkg === "openai") return "vendor-ai"
          if (pkg === "lucide-react" || pkg === "motion" || pkg === "framer-motion" || pkg === "sonner") {
            return "vendor-ui"
          }
          if (pkg.startsWith("@radix-ui/")) return "vendor-radix"
          return
        },
      },
    },
  },
  plugins: [
    createLocalApiPlugin(),
    react(),
    tsconfigPaths({ projects: ['./tsconfig.json'] })
  ],
})
