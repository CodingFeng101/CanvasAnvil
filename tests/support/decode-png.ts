import { inflate } from "pako";
import type { RgbaImage } from "../../client/workspaces/ppt/vision/types";

/**
 * Just enough PNG to read a fixture slide in Node.
 *
 * The browser decodes images with `createImageBitmap`, so nothing shipped
 * needs this -- but the golden-file comparison runs under `node --test`,
 * where there is no canvas. Handles what a rendered slide actually is: eight
 * bits a channel, not interlaced, greyscale through to RGBA.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const dLeft = Math.abs(estimate - left);
  const dUp = Math.abs(estimate - up);
  const dUpperLeft = Math.abs(estimate - upperLeft);
  if (dLeft <= dUp && dLeft <= dUpperLeft) return left;
  return dUp <= dUpperLeft ? up : upperLeft;
}

export function decodePng(bytes: Uint8Array): RgbaImage {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) throw new Error("not a PNG");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  const compressed: Uint8Array[] = [];

  let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
      interlace = bytes[offset + 20];
    } else if (type === "PLTE") {
      palette = body.slice();
    } else if (type === "IDAT") {
      compressed.push(body.slice());
    } else if (type === "IEND") {
      break;
    }

    offset += 12 + length;
  }

  if (bitDepth !== 8) throw new Error(`unsupported bit depth: ${bitDepth}`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`unsupported colour type: ${colorType}`);

  const joined = new Uint8Array(compressed.reduce((total, part) => total + part.length, 0));
  let cursor = 0;
  for (const part of compressed) {
    joined.set(part, cursor);
    cursor += part.length;
  }

  const raw = inflate(joined);
  const lineBytes = width * channels;
  const pixels = new Uint8Array(height * lineBytes);

  let read = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[read];
    read += 1;
    const lineStart = y * lineBytes;
    const previousStart = lineStart - lineBytes;

    for (let i = 0; i < lineBytes; i += 1) {
      const value = raw[read + i];
      const left = i >= channels ? pixels[lineStart + i - channels] : 0;
      const up = y > 0 ? pixels[previousStart + i] : 0;
      const upperLeft = y > 0 && i >= channels ? pixels[previousStart + i - channels] : 0;

      let restored: number;
      switch (filter) {
        case 0: restored = value; break;
        case 1: restored = value + left; break;
        case 2: restored = value + up; break;
        case 3: restored = value + ((left + up) >> 1); break;
        case 4: restored = value + paeth(left, up, upperLeft); break;
        default: throw new Error(`unknown scanline filter: ${filter}`);
      }
      pixels[lineStart + i] = restored & 0xff;
    }
    read += lineBytes;
  }

  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const source = i * channels;
    const target = i * 4;

    if (colorType === 3) {
      const entry = pixels[source] * 3;
      data[target] = palette?.[entry] ?? 0;
      data[target + 1] = palette?.[entry + 1] ?? 0;
      data[target + 2] = palette?.[entry + 2] ?? 0;
      data[target + 3] = 255;
      continue;
    }

    const grey = colorType === 0 || colorType === 4;
    data[target] = grey ? pixels[source] : pixels[source];
    data[target + 1] = grey ? pixels[source] : pixels[source + 1];
    data[target + 2] = grey ? pixels[source] : pixels[source + 2];
    data[target + 3] =
      colorType === 6 ? pixels[source + 3] : colorType === 4 ? pixels[source + 1] : 255;
  }

  return { data, width, height };
}
