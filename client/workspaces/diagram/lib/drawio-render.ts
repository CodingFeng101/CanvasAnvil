import { DEFAULT_DRAWIO_URL, findLocalDrawio } from "@/workspaces/diagram/lib/drawio-source";

/**
 * draw.io XML → PNG, without the diagram canvas being open: a hidden draw.io
 * editor (the local copy when there is one, else the public embed) loads the
 * diagram and exports it, over the same message protocol the canvas uses.
 * One editor serves the renders in a row and is removed after a short idle.
 */

const RENDER_TIMEOUT_MS = 30_000;
const IDLE_MS = 60_000;

type Message = { event?: string; data?: string; message?: string };

let editor: { frame: HTMLIFrameElement; ready: Promise<void>; origin: string } | null = null;
let queue: Promise<unknown> = Promise.resolve();
let idleTimer: number | undefined;

async function editorUrl(): Promise<string> {
  const configured = typeof import.meta !== "undefined" && import.meta.env?.VITE_DRAWIO_BASE_URL ? String(import.meta.env.VITE_DRAWIO_BASE_URL).trim() : "";
  if (configured) return configured;
  const local = await findLocalDrawio(new URL(import.meta.env.BASE_URL || "/", window.location.href).href);
  return local ?? DEFAULT_DRAWIO_URL;
}

function waitFor(frame: HTMLIFrameElement, event: string, timeout = RENDER_TIMEOUT_MS): Promise<Message> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error(`draw.io did not answer (${event})`));
    }, timeout);
    function onMessage(e: MessageEvent) {
      if (e.source !== frame.contentWindow || typeof e.data !== "string") return;
      let message: Message;
      try {
        message = JSON.parse(e.data);
      } catch {
        return;
      }
      if (message.event !== event) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(message);
    }
    window.addEventListener("message", onMessage);
  });
}

async function openEditor() {
  if (editor) return editor;
  const base = await editorUrl();
  const url = new URL(base);
  for (const [key, value] of Object.entries({ embed: "1", proto: "json", spin: "0", ui: "min", libraries: "0", noSaveBtn: "1", noExitBtn: "1" })) url.searchParams.set(key, value);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden;pointer-events:none";
  const ready = waitFor(frame, "init").then(() => undefined);
  frame.src = url.href;
  document.body.appendChild(frame);
  editor = { frame, ready, origin: url.origin };
  ready.catch(() => closeEditor());
  return editor;
}

function closeEditor() {
  editor?.frame.remove();
  editor = null;
}

function scheduleClose() {
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(closeEditor, IDLE_MS);
}

/** The diagram as a PNG data URL (2× scale, white background). */
export function renderDrawioPng(xml: string): Promise<string> {
  const run = async () => {
    window.clearTimeout(idleTimer);
    const { frame, ready, origin } = await openEditor();
    await ready;
    const post = (message: object) => frame.contentWindow?.postMessage(JSON.stringify(message), origin === "null" ? "*" : origin);
    const loaded = waitFor(frame, "load");
    post({ action: "load", xml, autosave: 0 });
    await loaded;
    const exported = waitFor(frame, "export");
    post({ action: "export", format: "png", scale: 2, border: 16, background: "#ffffff", spinKey: "export" });
    const result = await exported;
    if (!result.data?.startsWith("data:image/")) throw new Error(result.message || "draw.io returned no image");
    return result.data;
  };
  const next = queue.then(run, run).finally(scheduleClose);
  queue = next.catch(() => undefined);
  return next;
}
