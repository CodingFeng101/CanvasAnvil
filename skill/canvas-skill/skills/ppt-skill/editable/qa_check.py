#!/usr/bin/env python3
"""Deterministic QA for an editable PPTX rebuild: source pages vs exported previews.

  python qa_check.py <run_dir> [--skill <tools dir>] [--no-text]

Writes <run_dir>/out/qa/qa_report.json and one annotated image per slide
(out/qa/slide_XXX_qa.png: source | preview, worst regions boxed in red).
Prints a compact report. Exit code 0 always; "pass" lives in the report.

Checks per slide:
  similarity   blurred colour difference, 0-100 (regenerated art never matches
               pixel for pixel, so the blur forgives texture and keeps layout)
  hot regions  grid cells much worse than the page's own typical cell: a
               missing element, a misplaced block, a colour that went wrong
  green spill  chroma-key green in the preview where the source has none
  text         OCR of the preview matched to analysis/texts_layout.json:
               missing strings, boxes moved, font size off
"""
import argparse
import json
import subprocess
import sys
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

import cv2
import numpy as np

W, H = 836, 470          # working size for pixel checks
GRID_X, GRID_Y = 32, 18
MIN_SIMILARITY = 80.0
HOT_ABS = 22.0            # a cell's mean LAB delta that is wrong on its own
HOT_REL = 2.5             # ... or this many times the page median
MAX_HOT = 0
MAX_GREEN_PX = 150        # at full source resolution
POS_TOL = 0.012           # fraction of page width/height
SIZE_TOL = 0.15


def load(path, size=(W, H)):
    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"cannot read {path}")
    return img, cv2.resize(img, size, interpolation=cv2.INTER_AREA)


def lab_delta(a, b):
    la = cv2.cvtColor(cv2.GaussianBlur(a, (7, 7), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    lb = cv2.cvtColor(cv2.GaussianBlur(b, (7, 7), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    return np.sqrt(((la - lb) ** 2).sum(axis=2))


def green_mask(img):
    b, g, r = [img[..., i].astype(np.int16) for i in range(3)]
    return (g > 140) & (g - np.maximum(r, b) > 55)


def text_check(run, slide_no, src_full, prev_path, skill, expected_texts):
    if not expected_texts:
        return [], None
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "t.json"
        exp = Path(tmp) / "expected.txt"
        exp.write_text("\n".join(t["text"] for t in expected_texts), encoding="utf-8")
        r = subprocess.run(
            [sys.executable, str(skill / "scripts" / "extract_text.py"), str(prev_path), "--out", str(out), "--expected", str(exp)],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if r.returncode != 0 or not out.exists():
            return [], f"preview OCR failed: {r.stdout[-300:]}{r.stderr[-300:]}"
        got = json.loads(out.read_text(encoding="utf-8"))["slides"][0]["texts"]
    ph, pw = src_full.shape[:2]
    issues, used = [], set()
    for t in expected_texts:
        want = t["text"].replace("\n", "")
        best, best_i, best_r = None, -1, 0.0
        for i, g in enumerate(got):
            if i in used:
                continue
            ratio = SequenceMatcher(None, want, g["text"].replace("\n", "")).ratio()
            if ratio > best_r:
                best, best_i, best_r = g, i, ratio
        if best is None or best_r < 0.6:
            issues.append({"id": t["id"], "text": want, "problem": "missing in preview"})
            continue
        used.add(best_i)
        sx, sy, _, _ = t.get("ink_bbox_px") or t["bbox_px"]
        gx, gy, _, _ = best.get("ink_bbox_px") or best["bbox_px"]
        dx, dy = (gx - sx) / pw, (gy - sy) / ph
        ds = (best["font_size_pt"] - t["font_size_pt"]) / max(t["font_size_pt"], 1)
        probs = []
        if abs(dx) > POS_TOL or abs(dy) > POS_TOL:
            probs.append(f"moved dx={gx - sx:+.0f}px dy={gy - sy:+.0f}px")
        if abs(ds) > SIZE_TOL:
            probs.append(f"font size {best['font_size_pt']:.1f}pt vs {t['font_size_pt']:.1f}pt")
        if best_r < 0.95:
            probs.append(f"reads as '{best['text']}'")
        if probs:
            issues.append({"id": t["id"], "text": want, "problem": "; ".join(probs)})
    return issues, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--skill", default=str(Path(__file__).resolve().parent / "tools"))
    ap.add_argument("--no-text", action="store_true")
    a = ap.parse_args()
    run, skill = Path(a.run), Path(a.skill)
    qa_dir = run / "out" / "qa"
    qa_dir.mkdir(parents=True, exist_ok=True)

    layout = {}
    tl = run / "analysis" / "texts_layout.json"
    if tl.exists():
        for s in json.loads(tl.read_text(encoding="utf-8")).get("slides", []):
            layout[s["slide"]] = s["texts"]

    report = {"pass": True, "slides": []}
    sources = sorted((run / "source").glob("slide_*.png"))
    for idx, src_path in enumerate(sources, 1):
        prev_path = run / "out" / "preview" / f"slide_{idx:03d}.png"
        entry = {"slide": idx, "pass": False}
        if not prev_path.exists():
            entry["problems"] = ["no preview exported"]
            report["slides"].append(entry)
            report["pass"] = False
            continue
        src_full, src = load(src_path)
        prev_full, prev = load(prev_path)
        ph, pw = src_full.shape[:2]
        prev_full = cv2.resize(prev_full, (pw, ph), interpolation=cv2.INTER_AREA)

        d = lab_delta(src, prev)
        # Text is judged by OCR below; glyph-level font differences would
        # otherwise drown every other finding. Ink outside a text box (a
        # gradient word the OCR box missed) stays in.
        text_mask = np.zeros(d.shape, dtype=bool)
        for t in layout.get(idx, []):
            # ink_bbox can be narrower than the text itself; mask the union.
            bx, by, bw, bh = t["bbox_px"]
            ix, iy, iw, ih = t.get("ink_bbox_px") or t["bbox_px"]
            x, y = min(bx, ix), min(by, iy)
            w_, h_ = max(bx + bw, ix + iw) - x, max(by + bh, iy + ih) - y
            pad = 0.1 * min(h_, 80)
            x0, y0 = int(max(0, (x - pad) * W / pw)), int(max(0, (y - pad) * H / ph))
            x1, y1 = int(min(W, (x + w_ + pad) * W / pw)), int(min(H, (y + h_ + pad) * H / ph))
            text_mask[y0:y1, x0:x1] = True
        d[text_mask] = 0.0
        similarity = max(0.0, 100.0 - float(d[~text_mask].mean()) * 2.0)
        cw, ch = W // GRID_X, H // GRID_Y
        cells = []
        for gy in range(GRID_Y):
            for gx in range(GRID_X):
                cells.append((float(d[gy * ch:(gy + 1) * ch, gx * cw:(gx + 1) * cw].mean()), gx, gy))
        median = float(np.median([c[0] for c in cells]))
        sx, sy = pw / W, ph / H
        # Adjacent hot cells are one finding: merge them into regions.
        hot_grid = np.zeros((GRID_Y, GRID_X), dtype=np.uint8)
        cell_val = np.zeros((GRID_Y, GRID_X), dtype=np.float32)
        for v, gx, gy in cells:
            cell_val[gy, gx] = v
            if v > HOT_ABS and v > HOT_REL * max(median, 1.0):
                hot_grid[gy, gx] = 1
        n, labels = cv2.connectedComponents(hot_grid, connectivity=8)
        hot = []
        for k in range(1, n):
            ys, xs = np.nonzero(labels == k)
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            hot.append({
                "bbox_px": [int(x0 * cw * sx), int(y0 * ch * sy), int((x1 - x0) * cw * sx), int((y1 - y0) * ch * sy)],
                "delta": round(float(cell_val[labels == k].max()), 1),
                "cells": int(len(xs)),
            })
        hot.sort(key=lambda h: h["delta"] * h["cells"] ** 0.5, reverse=True)

        spill = green_mask(prev_full) & ~cv2.dilate(green_mask(src_full).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
        green_px = int(spill.sum())
        green_bbox = None
        if green_px:
            ys, xs = np.nonzero(spill)
            green_bbox = [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]

        text_issues, text_err = ([], None) if a.no_text else text_check(run, idx, src_full, prev_path, skill, layout.get(idx, []))

        problems = []
        if similarity < MIN_SIMILARITY:
            problems.append(f"similarity {similarity:.1f} < {MIN_SIMILARITY}")
        if len(hot) > MAX_HOT:
            problems.append(f"{len(hot)} hot regions (worst first): " + ", ".join(f"{h['bbox_px']} d={h['delta']}" for h in hot[:8]))
        if green_px > MAX_GREEN_PX:
            problems.append(f"green key spill {green_px}px around {green_bbox}")
        for t in text_issues:
            problems.append(f"text {t['id']} '{t['text'][:20]}': {t['problem']}")
        if text_err:
            problems.append(text_err)

        entry.update(
            similarity=round(similarity, 1), median_cell_delta=round(median, 1), hot_regions=hot[:12],
            green_spill_px=green_px, green_bbox=green_bbox, text_issues=text_issues,
            problems=problems, pass_=not problems,
        )
        entry["pass"] = entry.pop("pass_")
        report["pass"] = report["pass"] and entry["pass"]
        report["slides"].append(entry)

        # annotated side-by-side for the agent to look at
        canvas = np.concatenate([src_full, prev_full], axis=1).copy()
        for h in hot[:12]:
            x, y, w_, h_ = h["bbox_px"]
            for off in (0, pw):
                cv2.rectangle(canvas, (x + off, y), (x + off + w_, y + h_), (0, 0, 255), 3)
        if green_bbox:
            x, y, w_, h_ = green_bbox
            cv2.rectangle(canvas, (x + pw, y), (x + pw + w_, y + h_), (255, 0, 255), 3)
        cv2.imencode(".png", canvas)[1].tofile(str(qa_dir / f"slide_{idx:03d}_qa.png"))

    (qa_dir / "qa_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"QA {'PASS' if report['pass'] else 'FAIL'}")
    for s in report["slides"]:
        print(f"slide {s['slide']}: {'pass' if s['pass'] else 'FAIL'} similarity={s.get('similarity')} green={s.get('green_spill_px')}")
        for p in s.get("problems", []):
            print(f"  - {p}")
    print(f"annotated images: out/qa/slide_XXX_qa.png (red = hot region, magenta = green spill)")


if __name__ == "__main__":
    main()
