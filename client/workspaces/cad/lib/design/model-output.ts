/** Extract complete JSON objects from model text; small syntax slips are repaired before giving up. */
export function parseCadPayload(text: string): any {
  const candidates = jsonCandidates(text);
  for (const candidate of candidates) {
    const value = tryPayload(candidate);
    if (value) return value;
  }
  // Models sometimes leave a trailing comma, a comment or one mismatched bracket in a long spec.
  // An answer cut off mid-way is not one of those: closing its brackets would turn half a design
  // into a valid but emptier one (a spec with no walls), so it is reported for the model to resend.
  let truncated = false;
  for (const candidate of candidates) {
    if (looksTruncated(candidate)) { truncated = true; continue; }
    const value = tryPayload(repairJson(candidate));
    if (value) return flattenLists(value);
  }
  throw new Error(truncated
    ? '模型的 CAD JSON 被截断（没有写完）/ Model CAD JSON was cut off before it ended'
    : '模型未返回完整的 CAD JSON 数据 / Model returned no complete CAD JSON payload');
}

/**
 * Whether JSON text stops before its end, as a reply cut off by the output limit does: it ends inside a
 * string, right after an opener, comma or colon, or with two or more brackets still open. One missing
 * closer at the very end is a slip, not a cut.
 */
export function looksTruncated(source: string): boolean {
  const text = source.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) return false;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') depth--;
  }
  if (quoted) return true;
  if (depth <= 0) return false;
  return depth >= 2 || /[[{,:]$/.test(text);
}

/** Why the model text did not parse, with the text around the failing position, for logs and the repair request. */
export function describeJsonError(text: string): string {
  const candidate = jsonCandidates(text)
    .filter(item => item.trimStart().startsWith('{'))
    .sort((a, b) => b.length - a.length)[0];
  if (!candidate) return '没有找到以 { 开头的 JSON 对象 / no JSON object found';
  try {
    const value = JSON.parse(candidate);
    return value && typeof value.type === 'string' ? '' : '顶层对象缺少 type 字段 / top-level object has no "type"';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = Number(/position (\d+)/.exec(message)?.[1] ?? NaN);
    if (!Number.isFinite(position)) return message;
    return `${message}\n出错位置附近 / near: …${candidate.slice(Math.max(0, position - 120), position)}⟦这里⟧${candidate.slice(position, position + 80)}…`;
  }
}

// "rooms":[[{…}]] — a doubled bracket the repair closes as a nested list; unwrap it.
const LIST_KEYS = new Set(['walls', 'rooms', 'furniture', 'openings', 'structs', 'ops', 'floors']);
function flattenLists(value: any): any {
  if (Array.isArray(value)) return value.map(flattenLists);
  if (!value || typeof value !== 'object') return value;
  for (const [key, item] of Object.entries(value)) {
    value[key] = LIST_KEYS.has(key) && Array.isArray(item) && item.some(Array.isArray)
      ? item.flat().map(flattenLists)
      : flattenLists(item);
  }
  return value;
}

function tryPayload(candidate: string): any {
  try {
    const value = JSON.parse(candidate);
    if (value && !Array.isArray(value) && typeof value.type === 'string' && value.type.trim()) return value;
  } catch { /* not complete JSON */ }
  return null;
}

function jsonCandidates(text: string): string[] {
  const candidates = [...text.matchAll(/```[^\n]*\n([\s\S]*?)(?:```|$)/g)].map(match => match[1]);
  candidates.push(text.trim());
  let depth = 0;
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (depth === 0) {
      if (character === '{') { start = i; depth = 1; quoted = false; escaped = false; }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      if (depth === 0) candidates.push(text.slice(start, i + 1));
    }
  }
  return candidates;
}

/**
 * Fix the slips that break a long, otherwise sound JSON answer: comments, trailing commas,
 * a missing comma between values, a closing bracket of the wrong kind, and unclosed brackets.
 */
export function repairJson(source: string): string {
  const text = source.trim();
  let out = '';
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  let stringStart = -1;
  const lastSignificant = () => out.trimEnd().slice(-1);
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      out += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (character === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? text.length : end + 1; continue; }
    if (character === '"') {
      // Two values in a row ("a" "b", } "x", ] {): the comma between them went missing.
      if (stack.length && /["\d}\]el]/.test(lastSignificant()) && !/[:,[{]/.test(lastSignificant())) out = out.trimEnd() + ',';
      quoted = true;
      stringStart = out.length;
      out += character;
      continue;
    }
    if (character === ':' && stack[stack.length - 1] === ']' && stringStart >= 0 && stack.includes('}')) {
      // A key inside a list ("rooms":[[{…}],"furniture":…): a list was left open; close it before the key.
      const key = out.slice(stringStart);
      out = out.slice(0, stringStart).trimEnd().replace(/,$/, '');
      while (stack[stack.length - 1] === ']') out += stack.pop();
      out += ',' + key + ':';
      continue;
    }
    if (character === '{' || character === '[') {
      if (stack.length && /["\d}\]el]/.test(lastSignificant())) out = out.trimEnd() + ',';
      stack.push(character === '{' ? '}' : ']');
      out += character;
      continue;
    }
    if (character === '}' || character === ']') {
      if (!stack.includes(character)) continue; // stray closer
      out = out.trimEnd().replace(/,$/, '');
      // Close whatever was left open inside, then this one.
      while (stack.length) {
        const expected = stack.pop()!;
        out += expected;
        if (expected === character) break;
      }
      if (!stack.length) return out;
      continue;
    }
    if (character === ',' && /[,[{]/.test(lastSignificant())) continue; // doubled or leading comma
    out += character;
  }
  out = out.trimEnd().replace(/,$/, '');
  while (stack.length) out += stack.pop();
  return out;
}
