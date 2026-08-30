/**
 * Browser-side normalisation for images handed to a model.
 *
 * Anything the user drops into a workspace can be a blob: URL, an oversized
 * screenshot, or an already-inlined data URL. Models reject or choke on large
 * payloads, so references are inlined, downscaled, and de-duplicated here
 * before they reach the server proxy.
 */

const MAX_DIMENSION = 1536;
const MAX_DATA_URL_LENGTH = 1_800_000;
const JPEG_QUALITY = 0.86;

export const MAX_REFERENCE_IMAGES = 3;

export function cleanUrl(url: string) {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    // If it looks like a path but not absolute URL, return as is (might be base64 or relative)
    if (url.startsWith('data:image')) return url;
    return null;
}

async function objectUrlToDataUrl(objectUrl: string) {
    if (typeof window === "undefined") return null;
    if (!objectUrl || !objectUrl.startsWith("blob:")) return null;
    try {
        const resp = await fetch(objectUrl);
        const blob = await resp.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onerror = () => resolve(null);
            reader.onloadend = () => {
                const result = reader.result;
                resolve(typeof result === "string" ? result : null);
            };
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

function getImageMimeFromDataUrl(dataUrl: string) {
    const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
    return match?.[1]?.toLowerCase() || "image/png";
}

async function compressDataImageUrlForModel(dataUrl: string) {
    if (typeof window === "undefined" || typeof document === "undefined") return dataUrl;
    if (!String(dataUrl || "").startsWith("data:image")) return dataUrl;

    return await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const width = Number(img.naturalWidth || img.width || 0);
                const height = Number(img.naturalHeight || img.height || 0);
                if (!width || !height) {
                    resolve(dataUrl);
                    return;
                }

                const longestSide = Math.max(width, height);
                const needsResize = longestSide > MAX_DIMENSION;
                const needsReencode = dataUrl.length > MAX_DATA_URL_LENGTH;

                if (!needsResize && !needsReencode) {
                    resolve(dataUrl);
                    return;
                }

                const scale = needsResize ? MAX_DIMENSION / longestSide : 1;
                const targetWidth = Math.max(1, Math.round(width * scale));
                const targetHeight = Math.max(1, Math.round(height * scale));
                const canvas = document.createElement("canvas");
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(dataUrl);
                    return;
                }

                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                const originalMime = getImageMimeFromDataUrl(dataUrl);
                const targetMime =
                    originalMime === "image/jpeg" || originalMime === "image/jpg" || needsReencode
                        ? "image/jpeg"
                        : originalMime;
                const compressed =
                    targetMime === "image/jpeg"
                        ? canvas.toDataURL(targetMime, JPEG_QUALITY)
                        : canvas.toDataURL(targetMime);

                resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
            } catch {
                resolve(dataUrl);
            }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

export async function normalizeImageUrlForModel(url: string) {
    const raw = String(url || "").trim();
    if (!raw) return null;

    if (raw.startsWith("blob:")) {
        const dataUrl = await objectUrlToDataUrl(raw);
        if (!dataUrl) return null;
        return await compressDataImageUrlForModel(dataUrl);
    }

    if (raw.startsWith("data:image")) {
        return await compressDataImageUrlForModel(raw);
    }

    return cleanUrl(raw);
}

export async function normalizeImageUrlsForModel(imageUrls: string[], maxImages: number) {
    const normalized: string[] = [];
    for (const raw of imageUrls) {
        if (normalized.length >= maxImages) break;
        const url = await normalizeImageUrlForModel(raw);
        if (!url || normalized.includes(url)) continue;
        normalized.push(url);
    }
    return normalized;
}
