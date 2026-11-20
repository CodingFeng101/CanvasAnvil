"""Cut Noto Serif SC 500 down to the Chinese characters the portal uses.

The portal's serif headings need only a few hundred Chinese characters, while
the full font is megabytes. This collects every CJK character in
client/pages/portal, keeps just those glyphs, and writes

    client/pages/portal/fonts/portal-serif-sc.woff   the font (Vite hashes it)
    client/pages/portal/fonts/portal-serif-sc.txt    the characters inside it

tests/portal-font.test.ts fails when the portal's copy uses a character that
is not in the .txt; run this script again then:

    python scripts/subset-portal-font.py

It needs fontTools (pip install fonttools) and reads the .woff files from
@fontsource/noto-serif-sc, so it works without brotli. Characters outside the
set (a visitor's own work titles, say) fall back to the system serif.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
PORTAL = ROOT / "client" / "pages" / "portal"
OUT_DIR = PORTAL / "fonts"
SOURCE = ROOT / "node_modules" / "@fontsource" / "noto-serif-sc" / "files" / "noto-serif-sc-chinese-simplified-500-normal.woff"

# CJK punctuation, CJK ideographs (incl. extension A) and full-width forms.
# Latin text, quotes and dashes are drawn by Source Serif 4, which comes first.
CJK = re.compile(r"[　-〿㐀-䶿一-鿿＀-￯]")


def portal_chars() -> str:
    found: set[str] = set()
    for path in sorted(PORTAL.rglob("*")):
        if path.suffix in {".ts", ".tsx"}:
            found.update(CJK.findall(path.read_text(encoding="utf-8")))
    return "".join(sorted(found))


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not SOURCE.exists():
        print(f"missing {SOURCE}; run npm install first", file=sys.stderr)
        return 1
    chars = portal_chars()
    font = TTFont(SOURCE)
    cmap = font.getBestCmap()
    missing = [c for c in chars if ord(c) not in cmap]
    if missing:
        print("not in the source font, will use the fallback:", "".join(missing))

    options = subset.Options()
    options.flavor = "woff"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    sub = subset.Subsetter(options)
    sub.populate(text=chars)
    sub.subset(font)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    woff = OUT_DIR / "portal-serif-sc.woff"
    subset.save_font(font, str(woff), options)
    (OUT_DIR / "portal-serif-sc.txt").write_text(chars + "\n", encoding="utf-8")
    print(f"{len(chars)} characters, {woff.stat().st_size // 1024} KB -> {woff.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
