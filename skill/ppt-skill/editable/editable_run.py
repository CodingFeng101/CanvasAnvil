#!/usr/bin/env python3
"""Mechanical steps of the editable PPTX export, for the host agent to drive.

The host agent (Claude Code, Codex, ...) makes every judgment: base grouping
and prompts, element analysis, each page's compose spec, and what to fix after
QA. This tool does everything else: OCR, image calls with retries, aspect
checks, slicing with a drawing-count check, composition, previews (PowerPoint, else LibreOffice),
QA and the final merge. The steps, in order (see references/editable-pptx-workflow.md):

  python editable_run.py init     --run DIR (--manifest-file slides.manifest.json | slide.png ...) [--qa-rounds 3]
  python editable_run.py base     --run DIR --group g1 --slides 1,2 --reference 1 --prompt-file prompt.txt
  python editable_run.py analysis --run DIR
  python editable_run.py assets   --run DIR
  python editable_run.py page     --run DIR --page N
  python editable_run.py sheet    --run DIR --page N --kind icon|complex --assets-file assets.json
  python editable_run.py check    --run DIR --page N
  python editable_run.py merge    --run DIR --output deck.pptx

The image model comes from SLIDE_AGENT_IMAGE_API_KEY / _BASE_URL / _MODEL, or
else from this skill's config/image-provider.json. No chat model is needed.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
TOOLS = HERE / "tools" / "scripts"
REFS = HERE / "tools" / "references"
SKILL_ROOT = HERE.parent
IMAGE_CONFIG = SKILL_ROOT / "config" / "image-provider.json"
KEY = "#00FF00"
MIN_QA_ROUNDS, MAX_QA_ROUNDS = 3, 10
ASSET_PLAN = {
    "simple_geometry_svg_ooxml": "svg_to_ooxml",
    "icon_png": "generate_png_asset",
    "complex_png_whole": "generate_png_whole",
}


def pad3(n):
    return f"{int(n):03d}"


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def image_env():
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    if not env.get("SLIDE_AGENT_IMAGE_API_KEY") and IMAGE_CONFIG.exists():
        cfg = read_json(IMAGE_CONFIG)
        if str(cfg.get("apiKey", "")).strip() and str(cfg.get("model", "")).strip():
            env["SLIDE_AGENT_IMAGE_API_KEY"] = str(cfg["apiKey"]).strip()
            env["SLIDE_AGENT_IMAGE_MODEL"] = str(cfg["model"]).strip()
            if str(cfg.get("baseUrl", "")).strip():
                env["SLIDE_AGENT_IMAGE_BASE_URL"] = str(cfg["baseUrl"]).strip()
    return env


def run_py(script, argv, cwd, timeout=15 * 60):
    """Run one of the Python tools; returns (exit code, combined output)."""
    try:
        r = subprocess.run([sys.executable, str(script), *map(str, argv)], cwd=str(cwd), env=image_env(),
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return -1, f"killed after {timeout}s"


def tool(name, argv, cwd, timeout=15 * 60):
    return run_py(TOOLS / name, argv, cwd, timeout)


def clip(text, n=1500):
    return text if len(text) <= n else f"{text[: n // 2]}\n...[{len(text) - n} chars cut]...\n{text[-n // 2:]}"


def generate_image(cwd, prompt_rel, out_rel, reference=None, size=None):
    """One image call; the gateway drops connections now and then, so five tries with a growing pause."""
    argv = [f"@{prompt_rel}", out_rel]
    if reference:
        argv += ["--reference", reference]
    if size:
        argv += ["--size", size]
    for attempt in range(1, 6):
        code, out = tool("generate_image.py", argv, cwd)
        if code == 0:
            m = re.search(r"\{[\s\S]*\}", out)
            return json.loads(m.group(0)) if m else {}
        if attempt < 5:
            print(f"  image call failed ({clip(out, 160).strip()}), retry {attempt + 1}/5")
            time.sleep(10 * attempt)
    raise RuntimeError(f"generate_image failed: {clip(out, 800)}")


def export_preview(pptx, out_dir):
    """The previews the checks compare: PowerPoint on Windows (what the user will see when opening the file);
    headless LibreOffice + PyMuPDF elsewhere or when PowerPoint is not installed, as the website does on Linux."""
    if sys.platform == "win32":
        code, out = export_preview_powerpoint(pptx, out_dir)
        if code == 0:
            return code, out
        print(f"  PowerPoint preview failed, trying LibreOffice ({clip(out, 160).strip()})")
    return run_py(HERE / "render_preview.py", [str(pptx), str(out_dir)], Path(out_dir).parent, timeout=300)


def export_preview_powerpoint(pptx, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    q = lambda s: str(s).replace("'", "''")
    ps = f"""$ErrorActionPreference='Stop'
$pp = New-Object -ComObject PowerPoint.Application
$p = $pp.Presentations.Open('{q(pptx)}', $true, $false, $false)
$ratio = $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth
$i = 1
foreach ($s in $p.Slides) {{ $s.Export((Join-Path '{q(out_dir)}' ('slide_{{0:D3}}.png' -f $i)), 'PNG', 1672, [int](1672 * $ratio)); $i++ }}
$p.Close()
"exported $($i-1)" """
    r = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", ps],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def run_dir(args):
    run = Path(args.run).resolve()
    if args.cmd != "init" and not (run / "run.json").exists():
        fail(f"{run} is not an editable run; start with: editable_run.py init --run {run} ...")
    return run


def slide_count(run):
    return len(list((run / "source").glob("slide_*.png")))


# ---------- init: sources + OCR ----------
def cmd_init(args):
    run = run_dir(args)
    if not MIN_QA_ROUNDS <= args.qa_rounds <= MAX_QA_ROUNDS:
        fail(f"--qa-rounds must be {MIN_QA_ROUNDS} to {MAX_QA_ROUNDS}")
    sources = [Path(s).resolve() for s in args.slides]
    if args.manifest_file:
        manifest_path = Path(args.manifest_file).resolve()
        manifest = read_json(manifest_path)
        missing = [item.get("slideId", "?") for item in manifest.get("slides", []) if not item.get("imageFile") or item.get("status") == "failed"]
        if missing:
            fail(f"no image for {', '.join(missing)}: redraw them (generate-slides --only) first")
        sources += [(manifest_path.parent / item["imageFile"]).resolve() for item in manifest.get("slides", [])]
    if not sources:
        fail("no slides: pass --manifest-file or slide images")
    for d in ["source", "analysis/pages", "prompts", "base", "out", "pages"]:
        (run / d).mkdir(parents=True, exist_ok=True)
    for i, src in enumerate(sources, 1):
        if not src.exists():
            fail(f"missing slide image: {src}")
        Image.open(src).convert("RGB").save(run / "source" / f"slide_{pad3(i)}.png")
    write_json(run / "run.json", {"slides": len(sources), "qa_rounds": args.qa_rounds})
    rel = [f"source/slide_{pad3(i)}.png" for i in range(1, len(sources) + 1)]
    code, out = tool("extract_text.py", [*rel, "--out", "analysis/texts_layout.json"], run)
    if code != 0:
        fail(f"OCR failed: {clip(out, 800)}")
    layout = read_json(run / "analysis" / "texts_layout.json")
    print(f"run: {run}")
    for s in layout["slides"]:
        print(f"slide {s['slide']}: {s['width']}x{s['height']} px, {len(s['texts'])} text blocks -> source/slide_{pad3(s['slide'])}.png")
    print("OCR: analysis/texts_layout.json")
    print("next: look at every slide, plan the clean bases, then run `base` once per group")


# ---------- base: one clean base per group ----------
def cmd_base(args):
    run = run_dir(args)
    slides = [int(s) for s in args.slides.split(",") if s.strip()]
    ref = args.reference or slides[0]
    prompt_rel = f"prompts/base_{args.group}.txt"
    shutil.copyfile(Path(args.prompt_file).resolve(), run / prompt_rel)
    src_rel = f"source/slide_{pad3(ref)}.png"
    with Image.open(run / src_rel) as im:
        src_ratio = im.width / im.height
    out_rel = f"base/base_{args.group}.png"
    # A base off the source's aspect ratio by more than 1% is regenerated, never stretched or cropped.
    for attempt in range(1, 4):
        info = generate_image(run, prompt_rel, out_rel, src_rel)
        w, h = (info.get("size") or [0, 0])[:2]
        if w and abs(w / h - src_ratio) / src_ratio <= 0.01:
            break
        if attempt == 3:
            fail(f"base {args.group}: aspect {w}x{h} still off the source after 3 attempts; not stretching it")
        print(f"base {args.group}: aspect {w}x{h} off the source, regenerating ({attempt + 1}/3)")
    for s in slides:
        shutil.copyfile(run / out_rel, run / "base" / f"slide_{pad3(s)}_base.png")
    print(f"base {args.group}: {out_rel} -> slides {', '.join(map(str, slides))}")
    print("look at it: everything that is not background must be gone; if not, rewrite the prompt and run base again")


# ---------- analysis: normalise + merge the host's per-page analyses ----------
def normalise_page(raw, page, w, h):
    components = {}
    for cid, c in (raw.get("components") or {}).items():
        if not isinstance(c, dict) or c.get("category") not in ASSET_PLAN:
            continue
        components[cid] = {**c, "asset_plan": ASSET_PLAN[c["category"]], "reuse": str(c.get("reuse") or "single use")}
    instances = []
    for n, inst in enumerate(raw.get("instances") or []):
        box = inst.get("bbox_px")
        if inst.get("component") not in components or not isinstance(box, list) or len(box) != 4:
            continue
        x0, y0, w0, h0 = map(float, box)
        x, y = max(0.0, x0), max(0.0, y0)  # clamp to the slide: the schema rejects negative origins
        bw, bh = w0 - (x - x0), h0 - (y - y0)
        if bw <= 0 or bh <= 0:
            continue
        instances.append({**inst, "id": str(inst.get("id") or f"{inst['component']}_{n + 1}"), "bbox_px": [x, y, bw, bh],
                          "bbox_frac": [round(v, 6) for v in (x / w, y / h, bw / w, bh / h)]})
    return components, {"slide": page, "instances": instances, "notes": str(raw.get("notes") or "")}


def cmd_analysis(args):
    run = run_dir(args)
    layout = read_json(run / "analysis" / "texts_layout.json")
    components, slides = {}, []
    for s in layout["slides"]:
        page = s["slide"]
        f = run / "analysis" / "pages" / f"page_{pad3(page)}.json"
        if not f.exists():
            fail(f"missing {f.relative_to(run)}: write the analysis of page {page} first")
        comps, slide = normalise_page(read_json(f), page, s["width"], s["height"])
        pre = f"p{page}_"
        rename = lambda i: i if i.startswith(pre) else pre + i  # page-prefixed ids cannot collide
        for cid, c in comps.items():
            components[rename(cid)] = c
        slide["instances"] = [{**i, "component": rename(i["component"]), "id": rename(i["id"])} for i in slide["instances"]]
        slides.append(slide)
        print(f"page {page}: {len(slide['instances'])} instances, {len(comps)} components")
    merge_file = run / "analysis" / "merge.json"
    merge = read_json(merge_file).get("merge", {}) if merge_file.exists() else {}
    merge = {d: k for d, k in merge.items() if d != k and d in components and k in components and components[d]["category"] == components[k]["category"]}
    for dup in merge:
        del components[dup]
    for s in slides:
        for i in s["instances"]:
            i["component"] = merge.get(i["component"], i["component"])
    # The sheet plan is mechanical: PNG components in first-use order, icons 9 per sheet, complex 4.
    order = []
    for s in slides:
        for i in s["instances"]:
            if i["component"] not in order:
                order.append(i["component"])
    order += [c for c in components if c not in order]
    sheets = []
    for category, size, prefix in (("icon_png", 9, "icons"), ("complex_png_whole", 4, "complex")):
        ids = [c for c in order if components[c]["category"] == category]
        for k in range(0, len(ids), size):
            sheets.append({"id": f"{prefix}_{pad3(k // size + 1)}", "max": size, "components": ids[k:k + size]})
    first = layout["slides"][0]
    result = {"ref_width": first["width"], "ref_height": first["height"], "components": components, "slides": slides}
    if sheets:
        result["png_asset_sheet_plan"] = {"key_color": KEY, "sheets": sheets}
    write_json(run / "analysis" / "element_analysis.json", result)
    code, out = tool("validate_element_analysis.py", ["analysis/element_analysis.json"], run, 60)
    if code != 0:
        fail(f"element analysis invalid:\n{clip(out, 1500)}")
    print(f"{len(components)} components ({len(merge)} merged across pages), {sum(len(s['instances']) for s in slides)} instances")
    print("analysis/element_analysis.json is valid; next: `assets`")


# ---------- sheets: generate, slice by drawings, check edges ----------
def clean_notes(text):
    """'Transparent background' makes image models paint a checkerboard no key can remove; transparency is the slicer's job."""
    parts = re.split(r"(?<=[.!?。；;])\s*", text or "")
    return " ".join(p for p in parts if not re.search(r"transparen|checker|alpha|rgba|matte|透明|棋盘", p, re.I)).strip()


def sheet_template():
    m = re.search(r"```text\s*([\s\S]*?)```", (REFS / "icon-sheet-prompt-template.md").read_text(encoding="utf-8"))
    if not m:
        fail("icon-sheet-prompt-template.md has no ```text block")
    return m.group(1).strip()


def sheet_prompt(kind, assets, notes):
    listing = "\n".join(f"{i + 1}. {a['id']}: {a['description']}" for i, a in enumerate(assets))
    text = sheet_template().replace("<list icon ids and descriptions>", listing).replace("<run key_color>", KEY)
    if kind == "icon":
        text += f"\nLayout: put the {len(assets)} assets in a 3x3 layout in the listed order, left to right and top to bottom; leave unused positions empty key colour."
    else:
        # One composite per canvas shaped like its bbox: a grid cell is too small for it.
        text = re.sub(r"^Make one 16:9 asset sheet[^\n]*$",
                      f"Make one asset sheet holding only this single composite, filling the canvas with about 5% key-colour margin on every side, on a solid key-color background {KEY}. Keep its own proportions and the arrangement of all its parts exactly as on the slide.",
                      text, flags=re.M)
    no_checker = f"Paint the key colour {KEY} as one flat solid fill: never a checkerboard or transparency pattern, no plate or tile behind an asset."
    return f"{text}\n{no_checker}\n{notes}".strip()


def canvas_for(bbox):
    if not bbox or len(bbox) != 4 or not bbox[2] or not bbox[3]:
        return "1024x1024"
    r = bbox[2] / bbox[3]
    return "1536x1024" if r > 1.25 else "1024x1536" if r < 0.8 else "1024x1024"


def make_sheet(cwd, name, kind, assets, notes, reference):
    for d in ("prompts", "assets/sheets", "assets/crop_specs", "assets/png"):
        (cwd / d).mkdir(parents=True, exist_ok=True)
    prompt_rel = f"prompts/sheet_{name}.txt"
    (cwd / prompt_rel).write_text(sheet_prompt(kind, assets, notes), encoding="utf-8")
    sheet_rel = f"assets/sheets/{name}.png"
    generate_image(cwd, prompt_rel, sheet_rel, reference, "1536x1024" if kind == "icon" else canvas_for(assets[0].get("bbox_px")))
    crop_rel = f"assets/crop_specs/{name}.json"
    ids = [a["id"] for a in assets]
    code, out = run_py(HERE / "slice_blobs.py", [sheet_rel, crop_rel, "--ids", ",".join(ids), "--key", KEY], cwd, 60)
    try:
        blobs = json.loads(out.strip().splitlines()[-1])
    except Exception:
        blobs = {"ok": False, "error": clip(out, 300)}
    if not blobs.get("ok"):
        # Pairing a wrong count would give every icon after the gap the wrong picture: reject, slice nothing.
        for a in assets:
            (cwd / "assets" / "png" / f"{a['id']}.png").unlink(missing_ok=True)
        return False, f"sheet {name}: REJECTED, found {blobs.get('found', '?')} drawings for {len(assets)} assets ({', '.join(ids)}) {blobs.get('error', '')}".strip()
    code, out = tool("slice_asset_sheet.py", [sheet_rel, crop_rel, "assets/png", "--trim", "--pad", "16", "--edge-px", "3"], cwd)
    if code != 0:
        return False, f"sheet {name}: slicing failed {clip(out, 400)}"
    _, edges = tool("inspect_edges.py", [f"assets/png/{i}.png" for i in ids], cwd)
    return True, f"sheet {name} ({', '.join(ids)}) -> {sheet_rel}: {' '.join(edges.split())}"


def make_sheet_twice(cwd, name, kind, assets, notes, reference):
    try:
        ok, report = make_sheet(cwd, name, kind, assets, notes, reference)
    except RuntimeError as err:
        ok, report = False, f"sheet {name}: FAILED {err}"
    if not ok:
        print(f"{report} -> regenerating once")
        try:
            ok, report = make_sheet(cwd, f"{name}b", kind, assets, notes, reference)
        except RuntimeError as err:
            ok, report = False, f"sheet {name}b: FAILED {err}"
    print(report)
    return ok


def cmd_assets(args):
    run = run_dir(args)
    a = read_json(run / "analysis" / "element_analysis.json")
    first_use = {}
    for s in a["slides"]:
        for inst in s["instances"]:
            first_use.setdefault(inst["component"], (s["slide"], inst["bbox_px"]))
    pngs = [(cid, c) for cid, c in a["components"].items() if c["category"] in ("icon_png", "complex_png_whole") and cid in first_use]
    jobs, n, by_slide = [], 0, {}
    for cid, c in pngs:
        if c["category"] == "icon_png":
            by_slide.setdefault(first_use[cid][0], []).append((cid, c))
    for slide, items in by_slide.items():  # icons drawn against the slide they first appear on, 9 per sheet
        for k in range(0, len(items), 9):
            n += 1
            jobs.append((f"icon_{pad3(n)}", "icon", slide, [{"id": cid, "description": clean_notes(c.get("png_hint") or c.get("notes") or cid), "bbox_px": first_use[cid][1]} for cid, c in items[k:k + 9]]))
    for cid, c in pngs:
        if c["category"] == "complex_png_whole":
            n += 1
            jobs.append((f"complex_{pad3(n)}", "complex", first_use[cid][0], [{"id": cid, "description": clean_notes(c.get("png_hint") or c.get("notes") or cid), "bbox_px": first_use[cid][1]}]))
    ready = 0
    for name, kind, slide, assets in jobs:
        make_sheet_twice(run, name, kind, assets, "", f"source/slide_{pad3(slide)}.png")
        ready += sum((run / "assets" / "png" / f"{x['id']}.png").exists() for x in assets)
    if jobs:
        tool("build_contact_sheet.py", ["assets/png", "assets/contact_sheets/shared.png"], run)
        print("contact sheet: assets/contact_sheets/shared.png (each thumbnail labelled with its id)")
    print(f"{ready}/{sum(len(j[3]) for j in jobs)} PNG components ready from {len(jobs)} sheet(s); next: `page` for each page")


# ---------- page: one page's working folder ----------
def page_dir(run, page):
    return run / "pages" / f"p{pad3(page)}"


def cmd_page(args):
    run, page = run_dir(args), args.page
    d = page_dir(run, page)
    for sub in ("source", "base", "analysis", "assets/png", "assets/sheets", "assets/crop_specs", "assets/contact_sheets", "prompts", "out"):
        (d / sub).mkdir(parents=True, exist_ok=True)
    shutil.copyfile(run / "source" / f"slide_{pad3(page)}.png", d / "source" / "slide_001.png")
    shutil.copyfile(run / "base" / f"slide_{pad3(page)}_base.png", d / "base" / "slide_001_base.png")
    layout = read_json(run / "analysis" / "texts_layout.json")
    slide_layout = next(s for s in layout["slides"] if s["slide"] == page)
    write_json(d / "analysis" / "texts_layout.json", {**layout, "slides": [{**slide_layout, "slide": 1, "source": "slide_001.png"}]})
    deck = read_json(run / "analysis" / "element_analysis.json")
    page_analysis = next((s for s in deck["slides"] if s["slide"] == page), {"slide": page, "instances": []})
    used = list(dict.fromkeys(i["component"] for i in page_analysis["instances"]))
    write_json(d / "analysis" / "element_analysis.json", {**deck, "slides": [{**page_analysis, "slide": 1}]})
    status = []
    for c in used:
        if deck["components"][c]["category"] == "simple_geometry_svg_ooxml":
            continue
        src = run / "assets" / "png" / f"{c}.png"
        if src.exists():
            shutil.copyfile(src, d / "assets" / "png" / f"{c}.png")
        status.append(f"{c}: {'ready at assets/png/' + c + '.png' if src.exists() else 'MISSING'}")
    if any((d / "assets" / "png").iterdir()):
        tool("build_contact_sheet.py", ["assets/png", "assets/contact_sheets/shared.png"], d)
    write_json(d / "state.json", {"rounds": 0, "passed": False})
    texts = [{k: t.get(k) for k in ("id", "text", "bbox_px", "font_size_pt", "color", "bold", "align")} for t in slide_layout["texts"]]
    print(f"page {page}: {d}")
    print(f"source: {d / 'source' / 'slide_001.png'}  (read coordinates from this one)")
    print(f"base:   {d / 'base' / 'slide_001_base.png'}")
    if (d / "assets" / "contact_sheets" / "shared.png").exists():
        print(f"assets: {d / 'assets' / 'contact_sheets' / 'shared.png'}")
    print(f"size {slide_layout['width']}x{slide_layout['height']} px")
    print("OCR text (added by `check`; correct it only through text_edits / drop_texts / extra_texts):")
    print(json.dumps(texts, ensure_ascii=False))
    print("instances:")
    print(json.dumps(page_analysis["instances"], ensure_ascii=False))
    print("components:")
    print(json.dumps({c: deck["components"][c] for c in used}, ensure_ascii=False))
    print("PNG assets:\n" + ("\n".join(status) or "(none)"))
    print(f"next: write {d / 'analysis' / 'compose_spec.json'}, then `check --page {page}`")


def cmd_sheet(args):
    """Regenerate or add PNG assets for one page: icons 9 per sheet, each complex visual on its own canvas."""
    run, page = run_dir(args), args.page
    d = page_dir(run, page)
    assets = [{"id": re.sub(r"[^\w-]", "_", str(a["id"])), "description": clean_notes(str(a["description"])), "bbox_px": a.get("bbox_px")} for a in read_json(args.assets_file)]
    size = 9 if args.kind == "icon" else 1
    n = len(list((d / "prompts").glob("sheet_*.txt")))
    for k in range(0, len(assets), size):
        n += 1
        make_sheet_twice(d, f"{args.kind}_{pad3(n)}", args.kind, assets[k:k + size], clean_notes(args.notes or ""), "source/slide_001.png")
    tool("build_contact_sheet.py", ["assets/png", "assets/contact_sheets/contact.png"], d)
    print(f"contact sheet: {d / 'assets' / 'contact_sheets' / 'contact.png'}")


def cmd_check(args):
    run, page = run_dir(args), args.page
    d = page_dir(run, page)
    max_rounds = read_json(run / "run.json")["qa_rounds"]
    state = read_json(d / "state.json")
    layout = read_json(d / "analysis" / "texts_layout.json")
    slide_layout = layout["slides"][0]
    spec_file = d / "analysis" / "compose_spec.json"
    if not spec_file.exists():
        fail(f"write {spec_file} first")
    partial = read_json(spec_file)
    drop, edits = set(partial.get("drop_texts") or []), partial.get("text_edits") or {}
    texts = [{**t, **edits.get(t["id"], {})} for t in slide_layout["texts"] if t["id"] not in drop]
    images = [im for im in partial.get("images") or [] if (d / "analysis" / im["path"]).resolve().exists()]
    missing = [im["path"] for im in partial.get("images") or [] if not (d / "analysis" / im["path"]).resolve().exists()]
    spec = {"ref_width": slide_layout["width"], "ref_height": slide_layout["height"], "slide_width_in": layout.get("slide_width_in") or 13.333333,
            "image_fit": "visible",
            "slides": [{"base": "../base/slide_001_base.png", "geometry": partial.get("geometry") or [], "images": images, "texts": texts + (partial.get("extra_texts") or [])}]}
    write_json(d / "analysis" / "compose_full.json", spec)
    code, out = tool("compose_component_pptx.py", ["analysis/compose_full.json", "out/editable.pptx"], d)
    if code != 0:
        fail(f"compose failed:\n{clip(out)}")
    code, out = export_preview(d / "out" / "editable.pptx", d / "out" / "preview")
    if code != 0:
        fail(f"Preview export failed (needs PowerPoint, or LibreOffice with pymupdf):\n{clip(out)}")
    code, qa = run_py(HERE / "qa_check.py", [d, "--skill", HERE / "tools"], d, 10 * 60)
    state["rounds"] += 1
    state["passed"] = bool(re.search(r"^QA PASS", qa, re.M))
    write_json(d / "state.json", state)
    rounds = d / "out" / "rounds"  # each round's pictures are kept: the next round overwrites out/
    rounds.mkdir(parents=True, exist_ok=True)
    for src, dst in ((d / "out" / "preview" / "slide_001.png", f"r{state['rounds']}_preview.png"), (d / "out" / "qa" / "slide_001_qa.png", f"r{state['rounds']}_qa.png")):
        if src.exists():
            shutil.copyfile(src, rounds / dst)
    if missing:
        print(f"MISSING asset files (skipped): {', '.join(missing)}")
    print(clip(qa, 3500))
    print(f"QA image (source | preview, problems boxed red): {rounds / ('r%d_qa.png' % state['rounds'])}")
    left = max_rounds - state["rounds"]
    if state["passed"]:
        print(f"round {state['rounds']}/{max_rounds}: PASSED, page done")
    elif left > 0:
        print(f"round {state['rounds']}/{max_rounds}: FAILED, fix what is fixable and check again ({left} left)")
    else:
        print(f"round {state['rounds']}/{max_rounds}: FAILED, rework rounds used up; page done with the remaining defects")


# ---------- merge: one deck ----------
def cmd_merge(args):
    run = run_dir(args)
    n = slide_count(run)
    slides, first = [], None
    for page in range(1, n + 1):
        f = page_dir(run, page) / "analysis" / "compose_full.json"
        if not f.exists():
            fail(f"page {page} has no checked spec yet (run `check --page {page}`)")
        spec = read_json(f)
        first = first or spec
        prefix = f"../pages/p{pad3(page)}/"
        fix = lambda p: prefix + p[3:] if p.startswith("../") else p
        s = spec["slides"][0]
        slides.append({**s, "base": fix(s["base"]), "images": [{**im, "path": fix(im["path"])} for im in s["images"]]})
    deck = {"ref_width": first["ref_width"], "ref_height": first["ref_height"], "slide_width_in": first["slide_width_in"], "image_fit": "visible", "slides": slides}
    write_json(run / "analysis" / "compose_spec.json", deck)
    code, out = tool("compose_component_pptx.py", ["analysis/compose_spec.json", "out/editable.pptx"], run)
    if code != 0:
        fail(f"deck compose failed:\n{clip(out, 800)}")
    export_preview(run / "out" / "editable.pptx", run / "out" / "preview")
    for i in range(1, n + 1):
        tool("compare_preview.py", [f"source/slide_{pad3(i)}.png", f"out/preview/slide_{pad3(i)}.png", f"out/compare/slide_{pad3(i)}"], run)
    _, qa = run_py(HERE / "qa_check.py", [run, "--skill", HERE / "tools"], run, 10 * 60)
    print(clip(qa, 3500))
    if args.output:
        out_path = Path(args.output).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(run / "out" / "editable.pptx", out_path)
        print(f"editable PPTX: {out_path}")
    print(f"previews: {run / 'out' / 'preview'}; intermediate files: {run}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("init")
    p.add_argument("slides", nargs="*")
    p.add_argument("--manifest-file")
    p.add_argument("--qa-rounds", type=int, default=MIN_QA_ROUNDS)
    p = sub.add_parser("base")
    p.add_argument("--group", required=True)
    p.add_argument("--slides", required=True)
    p.add_argument("--reference", type=int)
    p.add_argument("--prompt-file", required=True)
    sub.add_parser("analysis")
    sub.add_parser("assets")
    p = sub.add_parser("page")
    p.add_argument("--page", type=int, required=True)
    p = sub.add_parser("sheet")
    p.add_argument("--page", type=int, required=True)
    p.add_argument("--kind", choices=["icon", "complex"], required=True)
    p.add_argument("--assets-file", required=True)
    p.add_argument("--notes", default="")
    p = sub.add_parser("check")
    p.add_argument("--page", type=int, required=True)
    p = sub.add_parser("merge")
    p.add_argument("--output")
    for p in sub.choices.values():
        p.add_argument("--run", required=True)
    args = ap.parse_args()
    {"init": cmd_init, "base": cmd_base, "analysis": cmd_analysis, "assets": cmd_assets, "page": cmd_page,
     "sheet": cmd_sheet, "check": cmd_check, "merge": cmd_merge}[args.cmd](args)


if __name__ == "__main__":
    main()
