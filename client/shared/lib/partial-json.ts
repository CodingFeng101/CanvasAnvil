/**
 * Parse a JSON object the model is still writing: close the open string, arrays and objects,
 * dropping a dangling key or comma, so a half-written plan can be shown as it streams.
 */
export function parsePartialJson(text: string): any {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let body = text.slice(start);
  for (let attempt = 0; attempt < 8 && body; attempt++) {
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    let end = body.length;
    // Commas outside strings: where a half-written member can be dropped without cutting into text.
    let lastComma = -1;
    for (let index = 0; index < body.length; index++) {
      const character = body[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === ",") lastComma = index;
      else if (character === "{" || character === "[") stack.push(character === "{" ? "}" : "]");
      else if (character === "}" || character === "]") {
        stack.pop();
        if (!stack.length) { end = index + 1; break; }
      }
    }
    // A half-typed escape ("\" or "\u4e") at the very end would break the string.
    let head = body.slice(0, end);
    if (quoted) head = head.replace(/\\(u[0-9a-fA-F]{0,3})?$/, "");
    const candidate = (head + (quoted ? '"' : "")).replace(/[,:\s]+$/, "");
    try { return JSON.parse(candidate + stack.reverse().join("")); }
    catch { body = lastComma > 0 ? body.slice(0, lastComma) : ""; }
  }
  return null;
}
