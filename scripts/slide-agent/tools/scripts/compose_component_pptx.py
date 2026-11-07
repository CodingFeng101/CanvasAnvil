#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_AUTO_SHAPE_TYPE
from pptx.enum.text import PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt


SHAPES = {
    "rect": MSO_AUTO_SHAPE_TYPE.RECTANGLE,
    "round_rect": MSO_AUTO_SHAPE_TYPE.ROUNDED_RECTANGLE,
    "oval": MSO_AUTO_SHAPE_TYPE.OVAL,
    "star": MSO_AUTO_SHAPE_TYPE.STAR_5_POINT,
}

ALIGN = {
    "left": PP_ALIGN.LEFT,
    "center": PP_ALIGN.CENTER,
    "right": PP_ALIGN.RIGHT,
}

IMAGE_FITS = ("visible", "frame")
# Alpha at or above this counts as drawn when locating an asset's visible
# pixels; keyed sheets leave the rest fully transparent.
VISIBLE_ALPHA = 16


def rgb(value, default="000000"):
    if value is None:
        value = default
    value = str(value).strip()
    if value.startswith("#"):
        value = value[1:]
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    return RGBColor.from_string(value.upper())


def as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "y")
    return bool(value)


def resolve(base_dir, path):
    p = Path(path)
    return p if p.is_absolute() else base_dir / p


def frac_box(item, ref_w, ref_h):
    if "bbox_frac" in item:
        return item["bbox_frac"]
    x, y, w, h = item["bbox_px"]
    return x / ref_w, y / ref_h, w / ref_w, h / ref_h


def bbox(item, ref_w, ref_h, slide_w, slide_h):
    x, y, w, h = frac_box(item, ref_w, ref_h)
    return Inches(x * slide_w), Inches(y * slide_h), Inches(w * slide_w), Inches(h * slide_h)


def set_alpha(solid_fill, opacity):
    """Write <a:alpha> into a solid fill's colour; python-pptx has no API for it."""
    colour = solid_fill.find(qn("a:srgbClr"))
    for old in colour.findall(qn("a:alpha")):
        colour.remove(old)
    colour.append(colour.makeelement(qn("a:alpha"), {"val": str(round(opacity * 100000))}))


def apply_fill_transparency(shape, item):
    if "fill_transparency" not in item:
        return
    value = item["fill_transparency"]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100:
        raise ValueError(f"{item.get('id', '?')}: fill_transparency must be a percentage 0-100, got {value!r}")
    set_alpha(shape._element.spPr.find(qn("a:solidFill")), 1 - value / 100)


def apply_corner_radius(shape, item, ref_w, ref_h):
    """PowerPoint stores a rounded rectangle's radius as a share of its shorter side."""
    if "corner_radius_px" not in item:
        return
    _, _, w, h = frac_box(item, ref_w, ref_h)
    shorter_px = min(w * ref_w, h * ref_h)
    radius = float(item["corner_radius_px"])
    if radius < 0 or shorter_px <= 0:
        raise ValueError(f"{item.get('id', '?')}: corner_radius_px must be >= 0")
    shape.adjustments[0] = min(0.5, radius / shorter_px)


def add_geometry(slide, item, ref_w, ref_h, slide_w, slide_h):
    shape = draw_geometry(slide, item, ref_w, ref_h, slide_w, slide_h)
    # add_shape references the theme's effect style, which gives every shape a
    # drop shadow the source never had.
    shape.shadow.inherit = False
    return shape


def draw_geometry(slide, item, ref_w, ref_h, slide_w, slide_h):
    kind = item["kind"]
    if kind == "line":
        x, y, w, h = bbox(item, ref_w, ref_h, slide_w, slide_h)
        shape = slide.shapes.add_shape(MSO_AUTO_SHAPE_TYPE.RECTANGLE, x, y, w, max(h, Pt(1)))
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(item.get("fill") or item.get("line"), "C00000")
        apply_fill_transparency(shape, item)
        shape.line.fill.background()
        return shape

    if kind not in SHAPES:
        raise ValueError(f"unsupported geometry kind: {kind}")

    shape = slide.shapes.add_shape(SHAPES[kind], *bbox(item, ref_w, ref_h, slide_w, slide_h))
    if kind == "round_rect":
        apply_corner_radius(shape, item, ref_w, ref_h)
    fill = item.get("fill")
    if fill is None or fill == "none":
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(fill)
        apply_fill_transparency(shape, item)

    line = item.get("line")
    if line is None or line == "none":
        shape.line.fill.background()
    else:
        shape.line.color.rgb = rgb(line)
        shape.line.width = Pt(float(item.get("line_width", 1)))
    return shape


def visible_bounds(path):
    """(left, top, right, bottom) of the drawn pixels, and the image size."""
    with Image.open(path) as im:
        size = im.size
        if "A" not in im.getbands():
            return (0, 0) + size, size
        alpha = im.getchannel("A").point(lambda a: 255 if a >= VISIBLE_ALPHA else 0)
        return alpha.getbbox() or ((0, 0) + size), size


def add_image(slide, path, item, fit, ref_w, ref_h, slide_w, slide_h):
    """Place a PNG asset.

    `visible` (the default) treats the bbox as the bounds of the drawing, as
    element analysis measures it on the source slide. The sliced PNG carries
    transparent padding around that drawing, so the drawn pixels are fitted
    into the bbox at their own aspect ratio, centred, and the padding is
    allowed to spill outside it. `frame` stretches the whole PNG, padding
    included, to the bbox.
    """
    x, y, w, h = bbox(item, ref_w, ref_h, slide_w, slide_h)
    if fit == "frame":
        return slide.shapes.add_picture(str(path), x, y, w, h)

    (left, top, right, bottom), (width, height) = visible_bounds(path)
    scale = min(w / (right - left), h / (bottom - top))
    pic_x = x + (w - (right - left) * scale) / 2 - left * scale
    pic_y = y + (h - (bottom - top) * scale) / 2 - top * scale
    return slide.shapes.add_picture(
        str(path), round(pic_x), round(pic_y), round(width * scale), round(height * scale)
    )


def add_text(slide, item, ref_w, ref_h, slide_w, slide_h):
    box = slide.shapes.add_textbox(*bbox(item, ref_w, ref_h, slide_w, slide_h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    # A run cannot hold a line break; each line becomes its own paragraph.
    for index, line in enumerate(str(item.get("text", "")).split("\n")):
        p = tf.paragraphs[0] if index == 0 else tf.add_paragraph()
        p.alignment = ALIGN.get(item.get("align", "center"), PP_ALIGN.CENTER)
        if item.get("line_spacing_pt"):
            p.line_spacing = Pt(float(item["line_spacing_pt"]))
        run = p.add_run()
        run.text = line
        run.font.name = item.get("font_family", "Microsoft YaHei")
        run.font.size = Pt(float(item.get("font_size_pt", 18)))
        run.font.bold = as_bool(item.get("bold"), False)
        run.font.italic = as_bool(item.get("italic"), False)
        run.font.color.rgb = rgb(item.get("color"), "000000")
    return box


def compose(spec_path, out_path):
    spec_path = Path(spec_path)
    base_dir = spec_path.parent
    spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
    ref_w = spec.get("ref_width", 1920)
    ref_h = spec.get("ref_height", 1080)
    slide_w = float(spec.get("slide_width_in", 13.333333))
    # The slide takes the source page's shape unless told otherwise; a 4:3 page
    # forced onto a 16:9 slide stretches every shape and image sideways.
    slide_h = float(spec.get("slide_height_in") or slide_w * ref_h / ref_w)
    default_fit = spec.get("image_fit", "visible")

    prs = Presentation()
    prs.slide_width = Inches(slide_w)
    prs.slide_height = Inches(slide_h)
    blank = prs.slide_layouts[6]

    for slide_spec in spec["slides"]:
        slide = prs.slides.add_slide(blank)
        if slide_spec.get("base"):
            slide.shapes.add_picture(str(resolve(base_dir, slide_spec["base"])), 0, 0, prs.slide_width, prs.slide_height)

        for item in slide_spec.get("geometry", []):
            add_geometry(slide, item, ref_w, ref_h, slide_w, slide_h)

        for item in slide_spec.get("images", []):
            fit = item.get("fit", default_fit)
            if fit not in IMAGE_FITS:
                raise ValueError(f"{item.get('id', '?')}: fit must be one of {IMAGE_FITS}, got {fit!r}")
            add_image(slide, resolve(base_dir, item["path"]), item, fit, ref_w, ref_h, slide_w, slide_h)

        for item in slide_spec.get("texts", []):
            add_text(slide, item, ref_w, ref_h, slide_w, slide_h)

    prs.save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("compose_json")
    ap.add_argument("output_pptx")
    args = ap.parse_args()
    print(compose(args.compose_json, args.output_pptx))


if __name__ == "__main__":
    main()
