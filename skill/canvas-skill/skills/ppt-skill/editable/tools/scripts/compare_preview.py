#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageOps, ImageDraw


def fit(im, size):
    return ImageOps.contain(im.convert("RGB"), size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_png")
    ap.add_argument("preview_png")
    ap.add_argument("output_dir")
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    src = Image.open(args.source_png).convert("RGB")
    prv = Image.open(args.preview_png).convert("RGB")
    if prv.size != src.size:
        prv = prv.resize(src.size)

    diff = ImageChops.difference(src, prv)
    heat = ImageOps.grayscale(diff)
    heat = ImageOps.autocontrast(heat)
    heat = ImageOps.colorize(heat, black="#000000", white="#ff0000")

    w, h = src.size
    sheet = Image.new("RGB", (w * 2, h), "white")
    sheet.paste(src, (0, 0))
    sheet.paste(prv, (w, 0))
    draw = ImageDraw.Draw(sheet)
    draw.rectangle([0, 0, 180, 36], fill="white")
    draw.text((10, 10), "source", fill="black")
    draw.rectangle([w, 0, w + 180, 36], fill="white")
    draw.text((w + 10, 10), "preview", fill="black")

    sheet.save(out / "side_by_side.png")
    heat.save(out / "diff_heatmap.png")
    print(out / "side_by_side.png")
    print(out / "diff_heatmap.png")


if __name__ == "__main__":
    main()
