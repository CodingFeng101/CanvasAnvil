import express from "express";
import type { Response as ExpressResponse } from "express";
import { GET as getConfig } from "./routes/config";
import { POST as postVerifyAccessCode } from "./routes/verify-access-code";
import { POST as postLogFeedback } from "./routes/log-feedback";
import { POST as postLogSave } from "./routes/log-save";
import { POST as postLogFileParser } from "./routes/log-file-parser";
import { POST as postThirdPartyParser } from "./routes/third-party-parser";
import { POST as postChat } from "./routes/chat";

const PORT = Number(process.env.API_PORT || 8787);
const BODY_LIMIT = process.env.API_BODY_LIMIT || "25mb";

const app = express();
app.use(express.json({ limit: BODY_LIMIT }));

function toWebRequest(req: express.Request): Request {
  const origin = `${req.protocol || "http"}://${req.get("host") || "localhost"}`;
  const url = new URL(req.originalUrl || req.url, origin);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (typeof req.body === "string") {
      body = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      body = req.body;
    } else if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  return new Request(url.toString(), {
    method: req.method,
    headers,
    body,
  });
}

async function sendWebResponse(webResponse: Response, res: ExpressResponse) {
  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  res.flushHeaders?.();
  const reader = webResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

function withHandler(
  handler: (request: Request) => Promise<Response>,
): express.RequestHandler {
  return async (req, res) => {
    try {
      const request = toWebRequest(req);
      const response = await handler(request);
      await sendWebResponse(response, res);
    } catch (error) {
      console.error("API route failed:", error);
      const message = error instanceof Error ? error.message : "Internal Server Error";
      res.status(500).json({ error: message });
    }
  };
}

app.get("/api/config", async (_req, res) => {
  try {
    const response = await getConfig();
    await sendWebResponse(response, res);
  } catch (error) {
    console.error("Config route failed:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/verify-access-code", withHandler(postVerifyAccessCode));
app.post("/api/log-feedback", withHandler(postLogFeedback));
app.post("/api/log-save", withHandler(postLogSave));
app.post("/api/log-file-parser", withHandler(postLogFileParser));
app.post("/api/third-party-parser", withHandler(postThirdPartyParser));
app.post("/api/chat", withHandler(postChat));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});
