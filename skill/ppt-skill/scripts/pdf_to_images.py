"""Renders every page of a PDF to PNG: python pdf_to_images.py <in.pdf> <out-dir> [width]

Prints one JSON line: {"pages": ["<out-dir>/page-01.png", ...]}. Needs PyMuPDF (pip install pymupdf).
"""
import json
import os
import sys

import fitz  # PyMuPDF


def main() -> None:
    source, out_dir = sys.argv[1], sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 1920
    os.makedirs(out_dir, exist_ok=True)
    pages = []
    with fitz.open(source) as doc:
        for index, page in enumerate(doc):
            zoom = width / page.rect.width
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
            target = os.path.join(out_dir, f"page-{index + 1:02d}.png")
            pix.save(target)
            pages.append(target)
    print(json.dumps({"pages": pages}))


if __name__ == "__main__":
    main()
