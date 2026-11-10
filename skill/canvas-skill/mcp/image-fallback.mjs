import { z } from 'zod';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { generateImage } from '../../../server/ai/image.ts';
import { buildDescribedEditPrompt, buildPlainEditPrompt } from '../../../client/workspaces/canvas/canvas/edit-prompts.ts';
import { IMAGE_QUALITIES, IMAGE_SIZES, DEFAULT_BASE_URL } from '../../../contracts/ai.ts';

/**
 * For hosts without an image tool (Claude Code has none): the canvas draws through the image API the user
 * configured, with the website's own image routes (server/ai/image.ts) and edit prompt. The config is
 * config/image-provider.json in the plugin or skill folder ({ apiKey, model, baseUrl? }), or CANVAS_IMAGE_CONFIG.
 */
export function imageConfigCandidates(root) {
  return [process.env.CANVAS_IMAGE_CONFIG, path.join(root, 'config/image-provider.json'), path.join(root, '../config/image-provider.json')].filter(Boolean);
}

async function loadChannel(root) {
  const file = imageConfigCandidates(root).find(candidate => existsSync(candidate));
  // A standalone skill folder runs from its runtime/ subfolder; its config sits beside that.
  const expected = path.join(path.basename(root) === 'runtime' ? path.dirname(root) : root, 'config/image-provider.json');
  if (!file) throw new Error(`No image API configured. Use the host's image tool, or fill ${expected} with {"apiKey","model","baseUrl"} (copy image-provider.example.json).`);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const apiKey = String(raw.apiKey || '').trim();
  const model = String(raw.model || '').trim();
  if (!apiKey || !model) throw new Error(`${file} needs apiKey and model.`);
  return { apiKey, model, baseUrl: String(raw.baseUrl || DEFAULT_BASE_URL).trim() };
}

export function registerImageFallback(tool, { root, readState, target }) {
  tool('generate_canvas_image', 'Draw an image through the configured image API when the host has no image tool of its own. For a new image pass `prompt` (the user\'s request, as the website sends it). For an edit pass the capture\'s `requestId` and, as `prompt`, the change in plain words (with annotations: what to change where, read from the annotated preview, quoted new text exact; without: the user\'s instruction); the clean original is sent as the reference. Returns imagePath; place it with insert_canvas_image.', {
    prompt: z.string().min(1), requestId: z.string().optional(), language: z.enum(['zh', 'en']).default('zh'),
    size: z.enum(IMAGE_SIZES).default('auto'), quality: z.enum(IMAGE_QUALITIES).default('auto'),
  }, async ({ projectDir, prompt, requestId, language, size, quality }) => {
    const channel = await loadChannel(root);
    let referenceImageUrl;
    let text = prompt;
    if (requestId) {
      const request = (await readState(projectDir)).requests.find(item => item.id === requestId);
      if (!request) throw new Error('Request not found');
      if (request.status !== 'pending') throw new Error(`Request is ${request.status}; capture it first with get_canvas_request.`);
      const original = request.references?.[0];
      if (!original) throw new Error('The request has no captured image.');
      const file = path.join(target(projectDir), original);
      const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
      referenceImageUrl = `data:image/${ext};base64,${(await readFile(file)).toString('base64')}`;
      // As on the website: a drawn annotation becomes a described change; without one the instruction goes as it is.
      text = request.annotationIds?.length ? buildDescribedEditPrompt(language, prompt) : buildPlainEditPrompt(language, prompt);
    }
    const dataUrl = await generateImage({ channel, prompt: text, referenceImageUrl, size, quality, signal: AbortSignal.timeout(240_000) });
    const match = /^data:image\/([a-z+]+);base64,(.*)$/s.exec(dataUrl);
    if (!match) throw new Error('The image API returned no image.');
    const folder = path.join(target(projectDir), 'generated');
    await mkdir(folder, { recursive: true });
    const imagePath = path.join(folder, `${randomUUID()}.${match[1].replace('jpeg', 'jpg')}`);
    await writeFile(imagePath, Buffer.from(match[2], 'base64'));
    return { imagePath, prompt: text, edited: Boolean(requestId) };
  });
}
