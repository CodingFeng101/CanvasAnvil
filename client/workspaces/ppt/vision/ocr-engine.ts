/**
 * The three models, run in order: find the lines, straighten them, read them.
 *
 * Everything that can be decided without an inference engine lives in the
 * modules this one calls -- box geometry, normalisation, CTC collapsing --
 * so that the part which cannot be tested without 16MB of weights stays thin
 * enough to read in one sitting.
 */

import * as ort from "onnxruntime-web";
import { boxesFromProbabilityMap, type DetectionOptions } from "@/workspaces/ppt/vision/det-postprocess";
import { buildCharset, ctcGreedyDecode, readAngle } from "@/workspaces/ppt/vision/ctc-decode";
import { batchWidth, cropQuad, detectionInput, recognitionInput } from "@/workspaces/ppt/vision/preprocess";
import { loadOcrAssets, type ModelSource } from "@/workspaces/ppt/vision/ocr-models";
import type { Quad } from "@/workspaces/ppt/vision/geometry";
import type { RecognisedQuad } from "@/workspaces/ppt/vision/read-boxes";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";

/** Matches the pinned `onnxruntime-web`; a mismatch here fails at load time. */
const DEFAULT_WASM_PATHS = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";

const CLASSIFIER_HEIGHT = 48;
const CLASSIFIER_WIDTH = 192;
const RECOGNISER_HEIGHT = 48;
const RECOGNISER_MAX_WIDTH = 320;

/** Small enough that a dense page does not allocate one huge tensor. */
const BATCH_SIZE = 6;

export interface OcrReaderOptions {
  models?: Partial<ModelSource>;
  /** Where `onnxruntime-web` should find its own WASM binaries. */
  wasmPaths?: string;
  limitSideLength?: number;
  detection?: Partial<DetectionOptions>;
  onProgress?: (message: string) => void;
}

export interface OcrReader {
  read(image: RgbaImage): Promise<RecognisedQuad[]>;
  dispose(): Promise<void>;
}

function rotate180(image: RgbaImage): RgbaImage {
  const { data, width, height } = image;
  const out = new Uint8ClampedArray(data.length);
  const pixels = width * height;

  for (let i = 0; i < pixels; i += 1) {
    const source = i * 4;
    const target = (pixels - 1 - i) * 4;
    out[target] = data[source];
    out[target + 1] = data[source + 1];
    out[target + 2] = data[source + 2];
    out[target + 3] = data[source + 3];
  }

  return { data: out, width, height };
}

/** Top to bottom, left to right, with lines on the same row kept together. */
function inReadingOrder(boxes: { quad: Quad }[]): { quad: Quad }[] {
  return [...boxes].sort((a, b) => {
    const aTop = Math.min(...a.quad.map((point) => point.y));
    const bTop = Math.min(...b.quad.map((point) => point.y));
    const aHeight = Math.max(...a.quad.map((point) => point.y)) - aTop;
    // Two boxes overlapping vertically by most of their height are one row.
    if (Math.abs(aTop - bTop) < Math.max(4, aHeight * 0.5)) {
      return Math.min(...a.quad.map((point) => point.x)) - Math.min(...b.quad.map((point) => point.x));
    }
    return aTop - bTop;
  });
}

const run = async (session: ort.InferenceSession, tensor: ort.Tensor) => {
  const feeds: Record<string, ort.Tensor> = { [session.inputNames[0]]: tensor };
  const output = await session.run(feeds);
  return output[session.outputNames[0]];
};

/**
 * One page through the models at a time.
 *
 * The WASM backend runs single-threaded and its sessions are not re-entrant:
 * a second `run` entered while the first is in flight fails with "Session
 * already started" or "Session mismatch", and the page that hit it is
 * abandoned. The deck is rebuilt several pages at once -- which is right for
 * the model calls, where the wait is somebody else's network -- so the queue
 * belongs here, around the only part that cannot overlap, rather than in the
 * caller's concurrency limit.
 *
 * Serialising costs nothing anyway: inference is CPU-bound on one thread, so
 * two pages at once would have taken turns regardless.
 */
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work, work);
    // A failed page must not poison the queue for the pages behind it.
    tail = result.catch(() => undefined);
    return result;
  };
}

export async function createOcrReader(options: OcrReaderOptions = {}): Promise<OcrReader> {
  ort.env.wasm.wasmPaths = options.wasmPaths || DEFAULT_WASM_PATHS;
  // Threaded WASM needs cross-origin isolation headers this app does not set,
  // and without them the threaded build fails to start at all.
  ort.env.wasm.numThreads = 1;

  const assets = await loadOcrAssets(options.models, options.onProgress);
  const create = (model: ArrayBuffer) =>
    ort.InferenceSession.create(model, { executionProviders: ["wasm"] });

  const [detection, classification, recognition] = await Promise.all([
    create(assets.detection),
    create(assets.classification),
    create(assets.recognition),
  ]);
  const charset = buildCharset(assets.dictionary);

  const detect = async (image: RgbaImage): Promise<Quad[]> => {
    const input = detectionInput(image, options.limitSideLength ?? 736);
    const output = await run(
      detection,
      new ort.Tensor("float32", input.tensor, [1, 3, input.height, input.width]),
    );

    const probability = output.data as Float32Array;
    const boxes = boxesFromProbabilityMap(
      probability,
      input.width,
      input.height,
      { toWidth: image.width, toHeight: image.height },
      options.detection,
    );
    return inReadingOrder(boxes).map((box) => box.quad);
  };

  const straighten = async (crops: RgbaImage[]): Promise<RgbaImage[]> => {
    const out: RgbaImage[] = [];

    for (let start = 0; start < crops.length; start += BATCH_SIZE) {
      const batch = crops.slice(start, start + BATCH_SIZE);
      const size = 3 * CLASSIFIER_HEIGHT * CLASSIFIER_WIDTH;
      const tensor = new Float32Array(batch.length * size);
      batch.forEach((crop, index) => {
        const prepared = recognitionInput(crop, CLASSIFIER_HEIGHT, CLASSIFIER_WIDTH);
        tensor.set(prepared.tensor, index * size);
      });

      const output = await run(
        classification,
        new ort.Tensor("float32", tensor, [batch.length, 3, CLASSIFIER_HEIGHT, CLASSIFIER_WIDTH]),
      );
      const scores = output.data as Float32Array;
      const classes = output.dims[1];

      batch.forEach((crop, index) => {
        const own = scores.subarray(index * classes, (index + 1) * classes);
        out.push(readAngle(own, classes).upsideDown ? rotate180(crop) : crop);
      });
    }

    return out;
  };

  const recognise = async (crops: RgbaImage[]) => {
    const readings: { text: string; confidence: number }[] = [];

    for (let start = 0; start < crops.length; start += BATCH_SIZE) {
      const batch = crops.slice(start, start + BATCH_SIZE);
      // One width for the batch, from its widest member, so short words are
      // padded rather than stretched.
      const width = batchWidth(batch, RECOGNISER_HEIGHT, RECOGNISER_MAX_WIDTH);
      const size = 3 * RECOGNISER_HEIGHT * width;
      const tensor = new Float32Array(batch.length * size);
      batch.forEach((crop, index) => {
        tensor.set(recognitionInput(crop, RECOGNISER_HEIGHT, width).tensor, index * size);
      });

      const output = await run(
        recognition,
        new ort.Tensor("float32", tensor, [batch.length, 3, RECOGNISER_HEIGHT, width]),
      );
      const scores = output.data as Float32Array;
      const [, steps, classes] = output.dims;

      batch.forEach((_, index) => {
        const own = scores.subarray(index * steps * classes, (index + 1) * steps * classes);
        readings.push(ctcGreedyDecode(own, steps, classes, charset));
      });
    }

    return readings;
  };

  const enqueue = createQueue();

  return {
    read(image) {
      // The whole page, not each model call: detect, straighten and recognise
      // share these sessions, so interleaving two pages' stages would hit the
      // same re-entrancy the queue exists to avoid.
      return enqueue(async () => {
        const quads = await detect(image);
        if (quads.length === 0) return [];

        const straightened = await straighten(quads.map((quad) => cropQuad(image, quad)));
        const readings = await recognise(straightened);

        return quads.map((quad, index): RecognisedQuad => ({
          quad,
          text: readings[index]?.text || "",
          confidence: readings[index]?.confidence ?? 0,
        }));
      });
    },

    async dispose() {
      await Promise.all([
        detection.release?.(),
        classification.release?.(),
        recognition.release?.(),
      ]);
    },
  };
}

let shared: Promise<OcrReader> | null = null;

/**
 * The reader, created once per page load.
 *
 * Building a session parses 16MB of weights, so a deck of twenty slides must
 * not pay for it twenty times.
 */
export function getOcrReader(options: OcrReaderOptions = {}): Promise<OcrReader> {
  if (!shared) {
    shared = createOcrReader(options).catch((error) => {
      // A failed load must not poison every later attempt.
      shared = null;
      throw error;
    });
  }
  return shared;
}

export async function disposeOcrReader(): Promise<void> {
  const current = shared;
  shared = null;
  if (!current) return;
  await current.then((reader) => reader.dispose()).catch(() => undefined);
}
