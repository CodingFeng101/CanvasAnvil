#!/usr/bin/env python3
"""Render PPTX previews with headless LibreOffice and PyMuPDF on Linux."""
import argparse
from pathlib import Path
import subprocess
import tempfile

import fitz
from pptx import Presentation


def render_preview(pptx: Path, out_dir: Path):
    pptx = pptx.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    # Each conversion gets its own profile so parallel page agents cannot attach
    # to another LibreOffice process and return before their PDF is written.
    with tempfile.TemporaryDirectory(prefix=".slide-preview-", dir=out_dir.resolve()) as folder:
        work = Path(folder)
        result = subprocess.run(
            [
                "soffice",
                f"-env:UserInstallation={(work / 'profile').as_uri()}",
                "--headless",
                "--convert-to", "pdf:impress_pdf_Export",
                "--outdir", str(work),
                str(pptx),
            ],
            capture_output=True, text=True, timeout=240,
        )
        pdf = work / f"{pptx.stem}.pdf"
        # LibreOffice can return success even when conversion produced no file.
        if result.returncode != 0 or not pdf.is_file():
            raise RuntimeError(f"LibreOffice conversion failed\n{result.stdout}\n{result.stderr}")
        with fitz.open(pdf) as document:
            expected = len(Presentation(pptx).slides)
            if document.page_count != expected:
                raise RuntimeError(f"Expected {expected} slide previews, got {document.page_count}")
            for index, page in enumerate(document, 1):
                scale = 1672 / page.rect.width
                page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).save(
                    work / f"slide_{index:03d}.png"
                )
        # Publish only after every page rendered, replacing previews from a prior QA round.
        for old in out_dir.glob("slide_*.png"):
            old.unlink()
        for preview in sorted(work.glob("slide_*.png")):
            preview.replace(out_dir / preview.name)
        print(f"exported {expected}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pptx", type=Path)
    parser.add_argument("out_dir", type=Path)
    args = parser.parse_args()
    render_preview(args.pptx, args.out_dir)
