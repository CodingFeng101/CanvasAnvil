#!/usr/bin/env python3
import argparse
from pathlib import Path
from PIL import Image


def inspect(path: Path, threshold: int = 1):
    im = Image.open(path).convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return {"file": str(path), "empty": True, "touches": []}
    l, t, r, b = bbox
    touches = []
    if l <= threshold:
        touches.append("left")
    if t <= threshold:
        touches.append("top")
    if r >= im.width - threshold:
        touches.append("right")
    if b >= im.height - threshold:
        touches.append("bottom")
    return {
        "file": str(path),
        "size": [im.width, im.height],
        "bbox": [l, t, r, b],
        "touches": touches,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--threshold", type=int, default=1)
    args = ap.parse_args()
    files = []
    for p in args.paths:
        path = Path(p)
        if path.is_dir():
            files.extend(sorted(path.rglob("*.png")))
        else:
            files.append(path)
    if not files:
        raise SystemExit("no PNG files found")
    failed = False
    for f in files:
        result = inspect(f, args.threshold)
        touches = result.get("touches", [])
        status = "EDGE_TOUCH" if touches else "ok"
        if touches:
            failed = True
        print(f"{status}\t{f}\t{','.join(touches)}")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
