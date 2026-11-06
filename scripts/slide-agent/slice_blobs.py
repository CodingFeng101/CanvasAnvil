#!/usr/bin/env python3
"""Slice a key-colour asset sheet by finding its drawings, not by assuming a grid.

  python slice_blobs.py <sheet.png> <out_crop_spec.json> --ids a,b,c [--key #00FF00] [--tolerance 90] [--pad 12]

A port of CanvasAnvil's findBlobs (client/workspaces/ppt/vision/sheets.ts):
key the background out, close small gaps with a square kernel 3% of the short
side so one icon's parts stay together, keep connected components larger than
0.04% of the sheet, and order them in reading order by rows banded at 0.6x the
median height. The boxes are paired with the requested ids in that order.

A sheet whose drawing count differs from the id count is NOT sliced: pairing
would hand every icon after a skipped or extra drawing the wrong picture.
Prints JSON: {"ok": bool, "found": n, "expected": m, "boxes": [...]}.
On success it writes a crop spec for the skill's slice_asset_sheet.py.
"""
import argparse
import json
import sys

import cv2
import numpy as np


def hex_bgr(value):
    v = value.lstrip("#")
    return np.array([int(v[4:6], 16), int(v[2:4], 16), int(v[0:2], 16)], dtype=np.int16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("crop_spec_out")
    ap.add_argument("--ids", required=True)
    ap.add_argument("--key", default="#00FF00")
    ap.add_argument("--tolerance", type=float, default=90.0)
    ap.add_argument("--pad", type=int, default=12)
    ap.add_argument("--min-area", type=float, default=0.0004)
    a = ap.parse_args()
    ids = [s for s in a.ids.split(",") if s]

    img = cv2.imdecode(np.fromfile(a.sheet, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        print(json.dumps({"ok": False, "error": f"cannot read {a.sheet}"}))
        sys.exit(0)
    h, w = img.shape[:2]
    dist = np.sqrt(((img.astype(np.int32) - hex_bgr(a.key).astype(np.int32)) ** 2).sum(axis=2))
    fg = (dist > a.tolerance).astype(np.uint8)

    span = max(9, int(min(h, w) * 0.03)) | 1
    joined = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((span, span), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(joined, connectivity=8)
    minimum = a.min_area * h * w
    boxes = [
        [int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP]), int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT])]
        for i in range(1, n)
        if stats[i, cv2.CC_STAT_AREA] >= minimum
    ]
    if boxes and len(ids) == 1:
        # One asset on the canvas (a complex visual): its floating parts are
        # separate blobs but one picture, which the skill says never to split.
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
        x1 = max(b[0] + b[2] for b in boxes); y1 = max(b[1] + b[3] for b in boxes)
        boxes = [[x0, y0, x1 - x0, y1 - y0]]
    if boxes:
        # Reading order. Differs from findBlobs on purpose: floor(y / band)
        # splits a row whose tops straddle a band edge (seen on a real sheet:
        # tops at 565 and 596, band 195). Rows are grouped by centre distance.
        half = np.median([b[3] for b in boxes]) * 0.5
        boxes.sort(key=lambda b: b[1] + b[3] / 2)
        rows, row = [], [boxes[0]]
        for b in boxes[1:]:
            centre = b[1] + b[3] / 2
            row_centre = np.mean([r[1] + r[3] / 2 for r in row])
            if abs(centre - row_centre) > half:
                rows.append(row)
                row = [b]
            else:
                row.append(b)
        rows.append(row)
        boxes = [b for r in rows for b in sorted(r, key=lambda b: b[0])]

    result = {"ok": len(boxes) == len(ids), "found": len(boxes), "expected": len(ids), "boxes": boxes}
    if result["ok"]:
        crops = []
        for item_id, (x, y, bw, bh) in zip(ids, boxes):
            x0, y0 = max(0, x - a.pad), max(0, y - a.pad)
            x1, y1 = min(w, x + bw + a.pad), min(h, y + bh + a.pad)
            crops.append({"id": item_id, "bbox": [x0, y0, x1 - x0, y1 - y0]})
        with open(a.crop_spec_out, "w", encoding="utf-8") as f:
            json.dump({"key_color": a.key, "crops": crops}, f)
    print(json.dumps(result))


if __name__ == "__main__":
    main()
