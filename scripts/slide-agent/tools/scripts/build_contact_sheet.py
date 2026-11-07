#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image, ImageDraw


def positive_int(value):
    value = int(value)
    if value < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return value


def checker(size):
    img = Image.new("RGB", size, (245, 245, 245))
    draw = ImageDraw.Draw(img)
    for y in range(0, size[1], 20):
        for x in range(0, size[0], 20):
            if (x // 20 + y // 20) % 2 == 0:
                draw.rectangle([x, y, x + 19, y + 19], fill=(220, 220, 220))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_dir")
    ap.add_argument("output_png")
    ap.add_argument("--thumb-w", type=positive_int, default=220)
    ap.add_argument("--thumb-h", type=positive_int, default=160)
    ap.add_argument("--cols", type=positive_int, default=3)
    args = ap.parse_args()

    input_dir = Path(args.input_dir)
    output_png = Path(args.output_png).resolve()
    files = sorted(path for path in input_dir.rglob("*.png") if path.resolve() != output_png)
    if not files:
        raise SystemExit("no PNG files found")
    cell_w = args.thumb_w + 80
    cell_h = args.thumb_h + 60
    rows = max(1, (len(files) + args.cols - 1) // args.cols)
    sheet = Image.new("RGB", (cell_w * args.cols, cell_h * rows), (235, 235, 235))
    draw = ImageDraw.Draw(sheet)

    for i, file in enumerate(files):
        im = Image.open(file).convert("RGBA")
        im.thumbnail((args.thumb_w, args.thumb_h), Image.LANCZOS)
        col = i % args.cols
        row = i // args.cols
        x = col * cell_w + 30
        y = row * cell_h + 20
        bg = checker((args.thumb_w + 20, args.thumb_h + 10))
        sheet.paste(bg, (x - 10, y - 10))
        sheet.paste(im, (x + (args.thumb_w - im.width) // 2, y + (args.thumb_h - im.height) // 2), im)
        draw.text((x - 10, y + args.thumb_h + 8), str(file.relative_to(input_dir)), fill=(20, 20, 20))

    sheet.save(args.output_png)
    print(args.output_png)


if __name__ == "__main__":
    main()
