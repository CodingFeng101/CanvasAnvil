/**
 * Where the OCR weights come from, and how they stop being downloaded twice.
 *
 * The three models and their dictionary come to about 16MB, which is too much
 * to carry in the repository and too much to fetch on every export. They are
 * pulled once, on the first run that needs them, and kept in the browser's
 * cache from then on.
 *
 * The base URL is configurable because the default CDN is not reachable
 * everywhere: behind a registry mirror, or offline, point this at a local
 * copy of `@gutenye/ocr-models/assets` served from `public/`.
 */

/** Pinned, because a silently newer model would change every measurement. */
const CDN_MODEL_BASE = "https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets";

/**
 * `VITE_OCR_MODEL_BASE_URL` overrides where the weights come from.
 *
 * Set it to a path under `public/` when the CDN is slow or unreachable --
 * behind a registry mirror, on a closed network, or in a test run that should
 * not depend on somebody else's uptime. Copy `@gutenye/ocr-models/assets`
 * there and point this at it.
 */
const configuredBase =
  typeof import.meta !== "undefined" && import.meta.env
    ? String(import.meta.env.VITE_OCR_MODEL_BASE_URL || "").trim()
    : "";

const DEFAULT_MODEL_BASE = configuredBase || CDN_MODEL_BASE;

const CACHE_NAME = "ppt-ocr-models-v1";

export interface ModelSource {
  baseUrl: string;
  detection: string;
  classification: string;
  recognition: string;
  dictionary: string;
}

export const DEFAULT_MODEL_SOURCE: ModelSource = {
  baseUrl: DEFAULT_MODEL_BASE,
  detection: "ch_PP-OCRv4_det_infer.onnx",
  classification: "ch_ppocr_mobile_v2.0_cls_infer.onnx",
  recognition: "ch_PP-OCRv4_rec_infer.onnx",
  dictionary: "ppocr_keys_v1.txt",
};

const join = (base: string, file: string) => `${base.replace(/\/+$/, "")}/${file}`;

/**
 * Fetch an asset, preferring the copy already in the cache.
 *
 * A cache that is unavailable -- a private window, a browser with site data
 * blocked -- is not an error. It only means paying for the download again.
 */
async function fetchCached(url: string, onProgress?: (message: string) => void): Promise<Response> {
  let cache: Cache | undefined;
  try {
    if (typeof caches !== "undefined") cache = await caches.open(CACHE_NAME);
  } catch {
    cache = undefined;
  }

  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) return cached;

  onProgress?.(url.split("/").pop() || url);

  // The most common way this whole feature fails, and the least obvious: the
  // weights come from a CDN that is slow or blocked on plenty of networks.
  // Saying which file and what to do about it beats "Failed to fetch".
  const advice =
    `无法下载文字识别模型：${url}\n` +
    "如果这个 CDN 在你的网络上不通，把 @gutenye/ocr-models 的 assets 目录复制到 public/ 下，" +
    "再设 VITE_OCR_MODEL_BASE_URL 指向它。";

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`${advice}\n(${error instanceof Error ? error.message : String(error)})`);
  }
  if (!response.ok) throw new Error(`${advice}\n(HTTP ${response.status})`);

  // Storing may fail on quota; the download still succeeded.
  try {
    await cache?.put(url, response.clone());
  } catch {
    // Nothing to do: the next run downloads it again.
  }
  return response;
}

export interface OcrAssets {
  detection: ArrayBuffer;
  classification: ArrayBuffer;
  recognition: ArrayBuffer;
  dictionary: string;
}

export async function loadOcrAssets(
  source: Partial<ModelSource> = {},
  onProgress?: (message: string) => void,
): Promise<OcrAssets> {
  const settings = { ...DEFAULT_MODEL_SOURCE, ...source };
  const at = (file: string) => join(settings.baseUrl, file);

  const [detection, classification, recognition, dictionary] = await Promise.all([
    fetchCached(at(settings.detection), onProgress).then((response) => response.arrayBuffer()),
    fetchCached(at(settings.classification), onProgress).then((response) => response.arrayBuffer()),
    fetchCached(at(settings.recognition), onProgress).then((response) => response.arrayBuffer()),
    fetchCached(at(settings.dictionary), onProgress).then((response) => response.text()),
  ]);

  return { detection, classification, recognition, dictionary };
}

/** Forget the cached weights, so the next run fetches them again. */
export async function clearOcrAssetCache(): Promise<void> {
  try {
    if (typeof caches !== "undefined") await caches.delete(CACHE_NAME);
  } catch {
    // A cache that cannot be opened cannot be holding anything either.
  }
}
