import { useEffect, useRef, useState } from "react";

/**
 * Editable PPTX export through the server's editable PPTX pipeline.
 *
 * The run happens on the server (POST /api/editable-export) and takes
 * minutes: this uploads the chosen slides one request each, starts the job,
 * polls the pipeline's progress events for the run panel, and when the run is
 * done downloads the file and closes the panel.
 */

export type EditableExportState = "idle" | "uploading" | "running" | "done" | "failed";

export interface EditableExportSlide {
  id: string;
  title: string;
  imageUrl: string;
}

/** What the pipeline reports (scripts/slide-agent/pipeline.ts, ProgressEvent). */
export type RunEvent =
  | { type: "stage"; t: number; stage: string; status: "start" | "done" | "failed"; seconds?: number }
  | { type: "page"; t: number; page: number; status: "start" | "done" }
  | { type: "line"; t: number; stage: string; text: string; level?: "info" | "warn" | "error"; page?: number }
  | { type: "artifact"; t: number; stage: string; label: string; path: string; page?: number };

const POLL_MS = 2500;
/** The job in flight, so a reload picks its run back up. */
const RUNNING_JOB_KEY = "CanvasAnvil-editable-export-job";

const remember = (id: string | null) => {
  try {
    if (id) localStorage.setItem(RUNNING_JOB_KEY, id);
    else localStorage.removeItem(RUNNING_JOB_KEY);
  } catch {
    // Without storage a reload only loses the panel, not the run.
  }
};
const recall = () => {
  try {
    return localStorage.getItem(RUNNING_JOB_KEY);
  } catch {
    return null;
  }
};

async function api<T>(body: object): Promise<T> {
  const response = await fetch("/api/editable-export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json as T;
}

/** Any slide image (data, blob or same-origin URL, any format) as a PNG data URL. */
async function toPngDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

function download(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function useEditableExport(tr: (zh: string, en: string) => string) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [state, setState] = useState<EditableExportState>("idle");
  const [uploadText, setUploadText] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [jobId, setJobId] = useState("");
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPolling, []);

  const poll = (id: string, after: number) => {
    pollRef.current = window.setTimeout(async () => {
      let next = after;
      try {
        const status = await api<{ state: string; error: string; seconds: number; events: RunEvent[]; total: number }>({
          action: "status",
          jobId: id,
          after,
        });
        setSeconds(status.seconds);
        if (status.events.length) setEvents((prev) => [...prev, ...status.events]);
        next = status.total;
        if (status.state === "done") {
          remember(null);
          setState("done");
          setPanelOpen(false);
          download(`/api/editable-export/file?job=${encodeURIComponent(id)}`, `editable-${id}.pptx`);
          return;
        }
        if (status.state === "failed") {
          remember(null);
          setState("failed");
          setError(status.error || tr("导出失败", "Export failed"));
          setPanelOpen(true);
          return;
        }
      } catch (e) {
        // A job the server has never heard of is gone; anything else is a
        // dropped poll, and the next one asks again.
        if (e instanceof Error && e.message === "Unknown job") {
          remember(null);
          setState("idle");
          setPanelOpen(false);
          return;
        }
      }
      poll(id, next);
    }, POLL_MS);
  };

  // A run that was in flight when the page reloaded: replay its events and keep following it.
  useEffect(() => {
    const id = recall();
    if (!id) return;
    setJobId(id);
    setState("running");
    poll(id, 0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (slides: EditableExportSlide[], qaRounds: number) => {
    stopPolling();
    setDialogOpen(false);
    setPanelOpen(true);
    setState("uploading");
    setError("");
    setEvents([]);
    setSeconds(0);
    setJobId("");
    try {
      const { jobId: id } = await api<{ jobId: string }>({ action: "create", count: slides.length, qaRounds });
      setJobId(id);
      for (const [index, slide] of slides.entries()) {
        setUploadText(tr(`上传第 ${index + 1}/${slides.length} 页`, `Uploading ${index + 1}/${slides.length}`));
        await api({ action: "slide", jobId: id, index, dataUrl: await toPngDataUrl(slide.imageUrl) });
      }
      await api({ action: "start", jobId: id });
      remember(id);
      setUploadText("");
      setState("running");
      poll(id, 0);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setState("failed");
      setError(reason === "busy" ? tr("已有一个导出任务在运行，请等它结束", "Another export is running; wait for it to finish") : reason);
    }
  };

  /** A finished or failed run's panel goes away; a running one only collapses. */
  const close = () => {
    setPanelOpen(false);
    if (state === "failed" || state === "done") setState("idle");
  };

  return {
    dialogOpen,
    setDialogOpen,
    panelOpen,
    setPanelOpen,
    state,
    busy: state === "uploading" || state === "running",
    uploadText,
    error,
    events,
    seconds,
    artifactUrl: (path: string) =>
      `/api/editable-export/artifact?job=${encodeURIComponent(jobId)}&path=${encodeURIComponent(path)}`,
    start,
    close,
  };
}

export type EditableExport = ReturnType<typeof useEditableExport>;
