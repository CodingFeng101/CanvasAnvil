import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Bridges Node's http types and the Fetch API's Request/Response.
 *
 * Route handlers are written against Request/Response so they read the same
 * whichever host is running them.
 */

export function headersFrom(source: NodeJS.Dict<string | string[]>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }
  return headers;
}

/** Reads the raw body off the socket; use where nothing has consumed it yet. */
export async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const origin = `http://${req.headers.host || "localhost"}`;
  const url = new URL(req.url || "/", origin);
  const headers = headersFrom(req.headers);
  const method = (req.method || "GET").toUpperCase();

  if (method === "GET" || method === "HEAD") {
    return new Request(url.toString(), { method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  return new Request(url.toString(), { method, headers, body: body as BodyInit | undefined });
}

/**
 * Streams a Response back out. `transfer-encoding` is dropped: Node sets it
 * itself, and echoing the upstream value corrupts chunked replies.
 */
export async function sendWebResponse(webResponse: Response, res: ServerResponse) {
  res.statusCode = webResponse.status;
  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  // Flush headers before the first chunk so streamed replies start immediately.
  (res as ServerResponse & { flushHeaders?: () => void }).flushHeaders?.();

  const reader = webResponse.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) res.write(Buffer.from(value));
  }
  res.end();
}

export function sendError(res: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : "Internal Server Error";
  res.statusCode = 500;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}
