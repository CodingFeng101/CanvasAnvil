import type { IncomingMessage, ServerResponse } from "node:http";
import { sendError, sendWebResponse, toWebRequest } from "./adapter";
import { API_ROUTES, routeKey } from "./routes";

/**
 * Serves the API inside Vite's dev and preview servers, so `npm run dev` is
 * one command rather than an app and an API to keep in sync.
 *
 * vite.config.ts imports this, and Vite loads its config through plain Node —
 * which is why everything under server/ uses relative imports rather than the
 * `@/` alias.
 */
export function apiMiddleware() {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const handler = API_ROUTES[routeKey(req.method, pathname)];
    if (!handler) {
      next();
      return;
    }

    try {
      await sendWebResponse(await handler(await toWebRequest(req)), res);
    } catch (error) {
      sendError(res, error);
    }
  };
}
