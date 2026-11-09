"""Regression checks for Linux slide preview conversion without an office installation."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import fitz
from PIL import Image
from pptx import Presentation


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/slide-agent/render_preview.py"
spec = importlib.util.spec_from_file_location("render_preview", SCRIPT)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


class SlidePreviewTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.pptx = self.root / "中文 deck.pptx"
        deck = Presentation()
        deck.slides.add_slide(deck.slide_layouts[6])
        deck.slides.add_slide(deck.slide_layouts[6])
        deck.save(self.pptx)
        self.out = self.root / "preview"
        self.out.mkdir()
        (self.out / "slide_003.png").write_bytes(b"old preview")

    def conversion(self, command, **options):
        self.assertEqual(command[0], "soffice")
        self.assertIn("--headless", command)
        work = Path(command[command.index("--outdir") + 1])
        self.assertEqual(command[1], f"-env:UserInstallation={(work / 'profile').as_uri()}")
        self.assertEqual(command[-1], str(self.pptx.resolve()))
        with fitz.open() as pdf:
            pdf.new_page(width=960, height=540)
            pdf.new_page(width=960, height=540)
            pdf.save(work / f"{self.pptx.stem}.pdf")
        return subprocess.CompletedProcess(command, 0, "converted", "")

    def test_renders_every_page_at_preview_size_and_removes_stale_pages(self):
        with patch.object(renderer.subprocess, "run", side_effect=self.conversion):
            renderer.render_preview(self.pptx, self.out)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), ["slide_001.png", "slide_002.png"])
        with Image.open(self.out / "slide_001.png") as image:
            self.assertEqual(image.size, (1672, 941))
            self.assertEqual(image.mode, "RGB")

    def test_success_without_pdf_is_rejected_and_previous_preview_survives(self):
        result = subprocess.CompletedProcess([], 0, "", "conversion error")
        with patch.object(renderer.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(RuntimeError, "conversion error"):
                renderer.render_preview(self.pptx, self.out)
        self.assertEqual((self.out / "slide_003.png").read_bytes(), b"old preview")

    def test_incomplete_pdf_is_rejected(self):
        def incomplete(command, **options):
            result = self.conversion(command, **options)
            work = Path(command[command.index("--outdir") + 1])
            with fitz.open() as pdf:
                pdf.new_page()
                pdf.save(work / f"{self.pptx.stem}.pdf")
            return result

        with patch.object(renderer.subprocess, "run", side_effect=incomplete):
            with self.assertRaisesRegex(RuntimeError, "Expected 2 slide previews, got 1"):
                renderer.render_preview(self.pptx, self.out)


if __name__ == "__main__":
    unittest.main()
