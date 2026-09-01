import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { headersFrom, sendWebResponse } from "./http/adapter";
import { API_ROUTES, routeKey } from "./http/routes";

/**
 * The production API: serves `/api/*` and the built client from one process.
 *
 * In development Vite hosts the same routes in-process (see
 * http/vite-middleware.ts), so both hosts read the same route table.
 */

const PORT = Number(process.env.PORT || process.env.API_PORT || 8080);
const BODY_LIMIT = process.env.API_BODY_LIMIT || "25mb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.WEB_DIST_DIR
  ? path.resolve(process.cwd(), process.env.WEB_DIST_DIR)
  : path.resolve(__dirname, "../dist");
const indexHtmlPath = path.join(distDir, "index.html");

const app = express();
app.use(express.json({ limit: BODY_LIMIT }));

/**
 * express.json() has already consumed the socket, so the body is rebuilt from
 * `req.body` rather than re-read like the Vite middleware does.
 */
function toWebRequest(req: express.Request): Request {
  const origin = `${req.protocol || "http"}://${req.get("host") || "localhost"}`;
  const url = new URL(req.originalUrl || req.url, origin);
  const headers = headersFrom(req.headers);

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }

  return new Request(url.toString(), { method: req.method, headers, body });
}

app.use("/api", async (req, res, next) => {
  // req.path is relative to the mount point; the table keys include it.
  const handler = API_ROUTES[routeKey(req.method, `/api${req.path}`)];
  if (!handler) {
    next();
    return;
  }
  try {
    await sendWebResponse(await handler(toWebRequest(req)), res);
  } catch (error) {
    console.error("API route failed:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    res.status(500).json({ error: message });
  }
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

if (fs.existsSync(indexHtmlPath)) {
  app.use(express.static(distDir, { index: false, fallthrough: true }));

  // Everything else is a client route: hand back the SPA shell.
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/healthz") {
      next();
      return;
    }
    res.sendFile(indexHtmlPath);
  });
} else {
  console.warn(`[server] dist not found at "${distDir}". Build the client with "npm run build".`);
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] web root: ${distDir}`);
});
