/**
 * Reads a bill-of-materials table out of a model's Markdown reply. The model
 * is asked for a table, not JSON, because tables survive partial streaming
 * legibly; this turns the result back into rows.
 */

export const parseMarkdownBomTable = (text: string) => {
  const normalized = String(text || "");
  const lines = normalized.split(/\r?\n/);
  for (let i = 0; i < lines.length - 2; i += 1) {
    const header = lines[i];
    const sep = lines[i + 1];
    if (!header.includes("|")) continue;
    if (!/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(sep)) continue;

    const parseRow = (line: string) => {
      const trimmed = line
        .trim()
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+\.\s+/, "");
      const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
      const body2 = body.endsWith("|") ? body.slice(0, -1) : body;
      return body2.split("|").map((c) => c.trim());
    };

    const columns = parseRow(header).filter((c) => c);
    if (columns.length === 0) continue;

    const rows: any[] = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const rowLine = lines[j];
      if (!rowLine.includes("|")) break;
      const row = parseRow(rowLine);
      if (row.every((c) => !String(c || "").trim())) break;
      const fixed = row.slice(0, columns.length);
      while (fixed.length < columns.length) fixed.push("");
      rows.push(fixed);
    }

    if (rows.length === 0) continue;
    return { type: "cad_bom", columns, rows };
  }
  return null;
};
