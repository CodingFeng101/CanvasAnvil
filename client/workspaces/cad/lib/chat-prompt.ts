/**
 * Turning what the user typed and attached into the two texts a turn needs:
 * the prompt the model sees, and the message the transcript shows.
 *
 * They differ deliberately. The prompt carries extracted file text and the
 * current CAD context; the transcript carries image tags and the same files
 * as collapsible attachments, so the user sees what they sent rather than
 * the wall of text the model got.
 */

/** A document the user pinned to the conversation as reference material. */
export interface Attachment {
  id: string;
  type: "xml" | "python" | "json" | "image" | "text";
  content: string;
  name: string;
}

/** How much of the attached context the prompt will carry. */
const MAX_CONTEXT_ATTACHMENTS = 12;
const MAX_CONTEXT_CHARS = 12_000;

export interface UploadedImage {
  name: string;
  url: string;
}

/**
 * The pieces of a turn, in the order they are joined. Empty ones are dropped
 * rather than leaving blank gaps the model has to read past.
 */
export interface PromptSections {
  rawInput: string;
  fileTexts: string[];
  contextAttachments: string;
  cadContext: string;
  history: string;
}

export function assemblePrompt(sections: PromptSections): string {
  return [
    sections.rawInput,
    sections.fileTexts.length > 0 ? sections.fileTexts.join("\n\n") : "",
    sections.contextAttachments,
    sections.cadContext,
    sections.history,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** What the transcript shows: the images sent, the text typed, the files attached. */
export function assembleDisplay(
  imageTags: string,
  rawInput: string,
  displayFileTexts: string[],
): string {
  return [imageTags, rawInput, displayFileTexts.length > 0 ? displayFileTexts.join("\n\n") : ""]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Attached context, capped twice: at a number of files and at a size each.
 *
 * Both caps matter for the same reason -- everything here is spent from the
 * model's context window, and a single large paste would otherwise crowd out
 * the user's actual question.
 */
export function buildContextAttachments(attachments: Attachment[]): string {
  if (!attachments || attachments.length === 0) return "";

  return attachments
    .slice(0, MAX_CONTEXT_ATTACHMENTS)
    .map((attachment, index) => {
      const header = `[Context ${index + 1}: ${attachment.name} | ${attachment.type}]`;
      const body = String(attachment.content || "").slice(0, MAX_CONTEXT_CHARS);
      return `${header}\n\`\`\`${attachment.type}\n${body}\n\`\`\``;
    })
    .join("\n\n");
}

/**
 * Strips the characters that would break an `[[IMAGE|name|url]]` marker.
 *
 * The name comes from a filename, so it can contain anything; a pipe or a
 * `]]` in it would end the marker early and leave the rest as visible junk
 * in the transcript.
 */
export function safeTagText(text: string): string {
  return String(text || "")
    .split("|")
    .join(",")
    .split("]]")
    .join("")
    .replace(/\r?\n/g, " ");
}

/** One marker per uploaded image, for the transcript to render inline. */
export function buildImageTags(images: UploadedImage[]): string {
  return (images || [])
    .map((image) => `[[IMAGE|${safeTagText(image.name)}|${image.url}]]`)
    .join("\n");
}
