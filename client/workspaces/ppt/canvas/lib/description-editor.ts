import { materialToken } from "@/workspaces/ppt/canvas/lib/material-tokens";

/**
 * The contenteditable behind a slide's画面描述 field.
 *
 * The stored value is plain text with `{{image:Name}}` tokens in it; the
 * editor shows those tokens as chips the user cannot type into or split in
 * half. These convert between the two, and are the only place that mapping is
 * written down.
 *
 * They touch the DOM directly, so they are exercised in the browser rather
 * than by the test runner.
 */

// Matches the material/slide chips in the chat panels. This one lives in a
// .ts file, which is why it survived the sweeps that globbed .tsx.
const CHIP_CLASS =
  "mx-0.5 inline-flex items-center rounded-md border border-primary/25 bg-primary/[0.08] px-1.5 py-0.5 text-[11px] text-primary-strong align-middle";

/** A material reference, rendered as one indivisible chip. */
export function createMaterialChip(name: string): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.setAttribute("data-material-token", name);
  // Without this the caret can land inside the chip and break the token.
  chip.setAttribute("contenteditable", "false");
  chip.className = CHIP_CLASS;
  chip.textContent = name;
  return chip;
}

const TOKEN = /\{\{image:([^}]+)\}\}/g;

/** Replaces the editor's contents with `value`, tokens rendered as chips. */
export function renderDescriptionInto(editor: HTMLElement, value: string): void {
  editor.innerHTML = "";
  const text = String(value || "");

  const appendText = (chunk: string) => {
    const lines = chunk.split("\n");
    lines.forEach((line, i) => {
      if (line) editor.appendChild(document.createTextNode(line));
      if (i < lines.length - 1) editor.appendChild(document.createElement("br"));
    });
  };

  const pattern = new RegExp(TOKEN.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const before = text.slice(last, match.index);
    if (before) appendText(before);
    editor.appendChild(createMaterialChip(String(match[1] || "").trim()));
    // A trailing space keeps the caret placeable after the chip.
    editor.appendChild(document.createTextNode(" "));
    last = match.index + match[0].length;
  }

  const rest = text.slice(last);
  if (rest) appendText(rest);

  // An empty contenteditable with no child node cannot be focused.
  if (!editor.lastChild) editor.appendChild(document.createTextNode(""));
}

/** Reads the editor back out as the stored text, chips becoming tokens again. */
export function readDescriptionFrom(editor: HTMLElement): string {
  const out: string[] = [];

  for (const node of Array.from(editor.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent || "");
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as HTMLElement;
    if (el.tagName === "BR") {
      out.push("\n");
      continue;
    }

    const name = el.getAttribute("data-material-token");
    out.push(name ? materialToken(name) : el.textContent || "");
  }

  return out.join("");
}
