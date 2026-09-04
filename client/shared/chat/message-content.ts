/**
 * Reading the text back out of a chat message.
 *
 * Every workspace's transcript renders the same underlying shape, and every
 * one of them appends uploaded file contents to the user's own words before
 * sending. These are the readers that undo that for display.
 */

export interface MessagePart {
  type: string;
  text?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  [key: string]: unknown;
}

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string | unknown[];
  parts?: MessagePart[];
  [key: string]: unknown;
}

export interface TextSection {
  type: "text" | "file";
  content: string;
  filename?: string;
  fileType?: "pdf" | "text";
  /** Size of the extracted text, shown on the collapsed attachment. */
  charCount?: number;
}

/** Matches the `[PDF: name]` / `[File: name]` blocks the chat panels append. */
const FILE_SECTION = /\[(PDF|File):\s*([^\]]+)\]\n([\s\S]*?)(?=\n\n\[(PDF|File):|$)/g;

/**
 * Splits a message into what the user typed and the file contents that were
 * appended to it, so the transcript can show the files as collapsed
 * attachments instead of walls of extracted text.
 */
export function splitTextIntoFileSections(text: string): TextSection[] {
  const sections: TextSection[] = [];
  const pattern = new RegExp(FILE_SECTION.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const beforeText = text.slice(lastIndex, match.index).trim();
    if (beforeText) sections.push({ type: "text", content: beforeText });

    const fileContent = match[3].trim();
    sections.push({
      type: "file",
      content: fileContent,
      filename: match[2].trim(),
      fileType: match[1].toLowerCase() === "pdf" ? "pdf" : "text",
      charCount: fileContent.length,
    });
    lastIndex = match.index + match[0].length;
  }

  const remainingText = text.slice(lastIndex).trim();
  if (remainingText) sections.push({ type: "text", content: remainingText });

  // No file blocks at all: hand back the message unchanged rather than empty.
  if (sections.length === 0) sections.push({ type: "text", content: text });

  return sections;
}

/**
 * The message's text, from whichever of the three shapes it arrived in:
 * streaming `parts`, an array `content`, or a plain string.
 */
export function getMessageTextContent(message: UIMessage): string {
  if (message.parts && Array.isArray(message.parts)) {
    return message.parts
      .filter((part) => part.type === "text")
      .map((part) => String(part.text ?? ""))
      .join("\n");
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is MessagePart => (part as MessagePart)?.type === "text")
      .map((part) => String(part.text || ""))
      .join("\n");
  }

  return message.content || "";
}

/** What the user actually typed, with the appended file contents stripped. */
export function getUserOriginalText(message: UIMessage): string {
  return getMessageTextContent(message)
    .replace(/\n\n\[(PDF|File):\s*[^\]]+\]\n[\s\S]*$/, "")
    .trim();
}

/**
 * Whether a markdown `code` node is a fenced block rather than an inline span.
 *
 * react-markdown stopped passing an `inline` prop in v9, but the chat panels
 * were still branching on it against v10. It is always `undefined` there, so
 * `if (!inline)` matched everything and every inline `code` span rendered as a
 * full-width code block.
 *
 * A tagged fence carries `language-*`; an untagged one still spans lines. A
 * single-line untagged fence is the one case this reads as inline, which costs
 * a chip instead of a block.
 */
export function isFencedCode(className?: string, children?: unknown): boolean {
  if (/\blanguage-\w+/.test(String(className || ""))) return true;
  return String(children ?? "").includes("\n");
}
