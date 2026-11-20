import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// The portal's Chinese serif is a subset holding only the characters its copy
// uses (scripts/subset-portal-font.py). A new character in the copy would be
// drawn in the fallback font, so the subset has to be cut again.

const PORTAL = join(import.meta.dirname, "..", "client", "pages", "portal");
const CJK = /[　-〿㐀-䶿一-鿿＀-￯]/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

test("the portal font subset covers every Chinese character in the portal copy", () => {
  const inFont = new Set(readFileSync(join(PORTAL, "fonts", "portal-serif-sc.txt"), "utf8").trim());
  const missing = new Set<string>();
  for (const file of sources(PORTAL)) {
    for (const ch of readFileSync(file, "utf8").match(CJK) ?? []) {
      if (!inFont.has(ch)) missing.add(ch);
    }
  }
  assert.equal(
    [...missing].join(""),
    "",
    "run `python scripts/subset-portal-font.py` to add these characters to the portal font",
  );
});
