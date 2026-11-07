#!/usr/bin/env python3
import argparse
import json
import re
from numbers import Real
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]+$")


def safe_output_path(output_dir, item_id):
    if not isinstance(item_id, str) or not item_id:
        raise ValueError(f"crop id must be a non-empty string, got {item_id!r}")
    if not SAFE_ID.fullmatch(item_id):
        raise ValueError(f"unsafe crop id: {item_id!r}")

    output_dir = output_dir.resolve()
    path = (output_dir / f"{item_id}.png").resolve()
    if output_dir != path.parent and output_dir not in path.parents:
        raise ValueError(f"output path escapes output_dir: {item_id!r}")
    return path


def validate_bbox(item_id, bbox):
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError(f"crop {item_id!r}: bbox must be [x,y,w,h]")
    if not all(isinstance(value, Real) and not isinstance(value, bool) for value in bbox):
        raise ValueError(f"crop {item_id!r}: bbox values must be numbers")
    if bbox[2] <= 0 or bbox[3] <= 0:
        raise ValueError(f"crop {item_id!r}: bbox width/height must be positive")
    return bbox


def validate_crop_item(index, item):
    if not isinstance(item, dict):
        raise ValueError(f"crop entry {index}: must be an object")
    item_id = item.get("id")
    bbox = validate_bbox(item_id, item.get("bbox"))
    return item_id, bbox


def key_to_alpha(img, key=(0, 255, 0), tolerance=70, edge_px=2):
    rgba = np.array(img.convert("RGBA"))
    rgb = rgba[..., :3].astype(np.float32)
    keyed = (np.abs(rgb - np.array(key, np.float32)) <= tolerance).all(axis=2)
    rgba[keyed, 3] = 0
    if edge_px > 0 and keyed.any() and not keyed.all():
        unmix_edges(rgba, keyed, np.array(key, np.float32), edge_px)
    return Image.fromarray(rgba, "RGBA")


def unmix_edges(rgba, keyed, key, edge_px):
    """Take the key colour back out of the anti-aliased rim.

    A rim pixel is a blend of the drawing and the key, and the tolerance test
    keeps it fully opaque, so every asset comes out with a coloured fringe.
    Each rim pixel is matched to the nearest solid pixel inside the drawing;
    projecting it onto the line from the key to that colour gives its coverage,
    and dividing the key back out gives its own colour.
    """
    near_key = cv2.dilate(keyed.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=edge_px).astype(bool)
    rim = near_key & ~keyed
    solid = ~near_key & ~keyed
    if not rim.any() or not solid.any():
        return

    # Distance to the nearest solid pixel, labelled with that pixel's index.
    _, labels = cv2.distanceTransformWithLabels(
        (~solid).astype(np.uint8), cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL
    )
    solid_ys, solid_xs = np.nonzero(solid)
    by_label = np.zeros(labels.max() + 1, dtype=np.int64)
    by_label[labels[solid_ys, solid_xs]] = np.arange(solid_ys.size)

    ys, xs = np.nonzero(rim)
    nearest = by_label[labels[ys, xs]]
    rgb = rgba[..., :3].astype(np.float32)
    colour = rgb[ys, xs]
    fore = rgb[solid_ys[nearest], solid_xs[nearest]]

    span = fore - key
    span_sq = (span * span).sum(axis=1)
    usable = span_sq > 900  # a drawing within ~30 of the key cannot be unmixed
    coverage = np.ones(len(ys), np.float32)
    coverage[usable] = np.clip(((colour - key) * span).sum(axis=1)[usable] / span_sq[usable], 0, 1)

    unmixed = key + (colour - key) / np.maximum(coverage, 1e-3)[:, None]
    restored = np.where(coverage[:, None] > 0.2, np.clip(unmixed, 0, 255), fore)
    rgba[ys, xs, :3] = np.where(usable[:, None], restored, colour).astype(np.uint8)
    rgba[ys, xs, 3] = np.round(rgba[ys, xs, 3] * np.where(usable, coverage, 1)).astype(np.uint8)


def parse_hex_color(value):
    value = value.strip().lstrip("#")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet_png")
    ap.add_argument("crops_json", help="JSON list of crops or {key_color, crops}")
    ap.add_argument("output_dir")
    ap.add_argument("--key-color", help="Override the crop spec key color (default: #00ff00)")
    ap.add_argument("--tolerance", type=int, default=70)
    ap.add_argument("--edge-px", type=int, default=2, help="Rim width to unmix from the key colour; 0 turns it off")
    ap.add_argument("--pad", type=int, default=16)
    ap.add_argument("--trim", action="store_true", help="Trim alpha bbox but keep --pad. Off by default.")
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    crop_spec = json.loads(Path(args.crops_json).read_text(encoding="utf-8-sig"))
    if isinstance(crop_spec, dict):
        crops = crop_spec.get("crops")
        key_color = args.key_color or crop_spec.get("key_color", "#00ff00")
    else:
        crops = crop_spec
        key_color = args.key_color or "#00ff00"
    if not isinstance(crops, list):
        raise ValueError("crops JSON must be an array or an object containing a crops array")
    sheet = key_to_alpha(Image.open(args.sheet_png), parse_hex_color(key_color), args.tolerance, args.edge_px)

    for index, item in enumerate(crops):
        item_id, item_bbox = validate_crop_item(index, item)
        x, y, w, h = item_bbox
        l = max(0, x - args.pad)
        t = max(0, y - args.pad)
        r = min(sheet.width, x + w + args.pad)
        b = min(sheet.height, y + h + args.pad)
        crop = sheet.crop((l, t, r, b))
        if args.trim:
            bbox = crop.getbbox()
            if bbox:
                tl = max(0, bbox[0] - args.pad)
                tt = max(0, bbox[1] - args.pad)
                tr = min(crop.width, bbox[2] + args.pad)
                tb = min(crop.height, bbox[3] + args.pad)
                crop = crop.crop((tl, tt, tr, tb))
        crop.save(safe_output_path(out, item_id))


if __name__ == "__main__":
    main()
