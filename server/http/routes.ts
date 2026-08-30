import { GET as getConfig } from "../routes/config";
import { POST as postChat } from "../routes/chat";
import { POST as postLogFeedback } from "../routes/log-feedback";
import { POST as postLogFileParser } from "../routes/log-file-parser";
import { POST as postLogSave } from "../routes/log-save";
import { POST as postPptAi } from "../routes/ppt-ai";
import { POST as postThirdPartyParser } from "../routes/third-party-parser";
import { POST as postVerifyAccessCode } from "../routes/verify-access-code";

/**
 * The API surface, in one table.
 *
 * Both hosts read it: the Express server in production, and the Vite dev
 * middleware. Adding a route here is enough for both.
 */

export type RouteHandler = (request: Request) => Promise<Response>;

export const API_ROUTES: Record<string, RouteHandler> = {
  "GET /api/config": async () => getConfig(),
  "POST /api/verify-access-code": postVerifyAccessCode,
  "POST /api/log-feedback": postLogFeedback,
  "POST /api/log-save": postLogSave,
  "POST /api/log-file-parser": postLogFileParser,
  "POST /api/third-party-parser": postThirdPartyParser,
  "POST /api/chat": postChat,
  "POST /api/ppt-ai": postPptAi,
};

export function routeKey(method: string | undefined, pathname: string) {
  return `${(method || "GET").toUpperCase()} ${pathname}`;
}
