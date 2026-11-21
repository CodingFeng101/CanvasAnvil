#!/usr/bin/env python3
"""Extract editable text layout from slide images with OCR and pixel measurement.

The OCR model does the one thing only a model can do -- turn pixels into
characters. Everything else (position, size, colour, weight) is measured from
the pixels, because a vision model asked for sixty text boxes returns sixty
approximations.

Two parts of the measurement chain are load-bearing and easy to get wrong:

  * The ink mask needs a saturation test, not just a colour-distance test. A
    green tick is 136 away from dark grey text in L1, and the distance
    threshold is 130 -- six apart. Saturation separates them by a mile.
  * Stroke width must come from a distance transform, not from ink coverage.
    Coverage cannot tell a dense regular glyph from a simple bold one.
"""
import argparse
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

# --- filters -----------------------------------------------------------------

MIN_CONF = 0.5
SHORT_STRING_CONF = 0.75
SHORT_STRING_LEN = 2
LONE_GLYPH_CONF = 0.90
MAX_SKEW = 0.45

# --- ink separation ----------------------------------------------------------

RING_PAD = 4
MIN_INK_DISTANCE = 60
INK_DISTANCE_RATIO = 0.45
TEXT_COLOUR_TOLERANCE = 130
SATURATION_HEADROOM = 45

# --- style measurement -------------------------------------------------------

HEIGHT_PERCENTILE = 80
STROKE_PERCENTILE = 88
# Measured glyph height as a share of the em, for the face the composer uses
# (Microsoft YaHei) as PowerPoint renders it: CJK 0.93-0.96 across 11-48pt,
# regular and bold alike; Latin with capitals or ascenders 0.73-0.77. The
# source face does not matter here -- what has to match is the rebuilt ink.
CJK_FACE_RATIO = 0.94
LATIN_FACE_RATIO = 0.75
# Colours measured off small anti-aliased glyphs drift line to line, so the
# merge test is loose. Geometry and size carry the decision; colour only has
# to rule out a genuinely different run of text.
MERGE_COLOUR_TOLERANCE = 100

ITALIC_SLANT = 0.13

# Weight is the stroke width over the em, with the width taken as twice the
# ink area over the outline length (a stroke of width w and length L has area
# wL and perimeter about 2L). Counting anti-aliased pixels by their coverage
# makes the width continuous and sub-pixel; the distance transform used before
# moves in steps of about a pixel, which put 15-18pt regular text on the same
# step as bold headings.
#
# Rendered fonts (YaHei, DengXian, HarmonyOS Sans, Noto Sans SC, SimHei at
# 16-80px em, both polarities, 1x and 1.15x resampling): regular and light
# faces measure at most 0.099 of the em at 16px, falling to 0.076 at 80px;
# bold and black faces 0.108-0.156; medium in between. Body text drawn by image
# models sits heavier than a true regular -- 0.094-0.119 at a 27-36px em on
# generated slides, where headings from a 44px em up measure 0.112-0.148. The
# composer only has regular and bold, so that medium-looking body text has to
# land on regular. Hence a threshold that is high for small text and eases with
# size: it keeps every rendered bold from a 30px em up and every generated
# heading, and gives up bold below about a 26px em (13pt), where a missed bold
# is the lesser error. Sizes are taken on a 1920px-wide page so the decision
# does not move with the render resolution.
BOLD_RATIO_BASE = 0.0915
BOLD_RATIO_SIZE_PX = 0.75
REFERENCE_PAGE_WIDTH = 1920.0
# Below this em the glyphs are too few pixels to show weight at all.
MIN_BOLD_EM_PX = 12
# Weight is relative within a deck: one generated deck's regular body text
# measured heavier than another deck's bold labels at the same size. So `auto`
# takes each block's margin over the threshold above and looks across the whole
# deck for the valley between the regular cluster and the bold one -- a local
# minimum of the smoothed margin density, inside this window, well below the
# peaks on both sides, with enough blocks on each side. Without such a valley
# (a single-weight deck, a handful of blocks) the threshold is used as is.
# Measured: a year-end deck splits at +0.003, a course deck at -0.022.
WEIGHT_VALLEY_WINDOW = (-0.035, 0.02)
WEIGHT_VALLEY_BANDWIDTH = 0.003
WEIGHT_VALLEY_DEPTH = 0.6
WEIGHT_VALLEY_MIN_SHARE = 0.1
WEIGHT_VALLEY_MIN_BLOCKS = 8
# Blocks on one page within this share of each other's em and this colour
# distance are taken as one style and given one weight.
SIBLING_EM_TOLERANCE = 0.06
SIBLING_COLOUR_TOLERANCE = 60

# --- text box frame ----------------------------------------------------------

# Slack for font substitution on the opening machine: the same string is wider
# there, and a box cut to the measured width wraps.
TEXT_WIDTH_SLACK = 1.35
TEXT_WIDTH_EXTRA_PT = 12.0
TEXT_HEIGHT_EXTRA_PT = 6.0
# PowerPoint puts line leading above the first baseline, so a text box has to
# start a little above the ink it is meant to cover.
BASELINE_LIFT = 0.16
# With exact line spacing PowerPoint also puts about 0.6 of whatever the
# spacing adds over single spacing (1.2 em) above the first line. Measured on
# PowerPoint 365 renders: 0.55-0.66 across six paragraphs.
SINGLE_SPACING_EM = 1.2
EXACT_SPACING_LIFT = 0.6

BULLET_CHARS = "•·‣▪◦●○∙–—-"

# --- spaces ------------------------------------------------------------------

# OCR drops the spaces in mixed CJK text ("上线 3 个月" reads as "上线3个月"),
# and the rebuilt line comes out narrower than the source. Measured on
# generated slides, an ink gap that holds a space is 0.36-0.49 em, and a gap
# without one -- including digit-to-CJK -- at most 0.31 em.
SPACE_GAP_EM = 0.33
# A space with an interpunct in it spans about 0.7 em. Anything much wider is
# part of a glyph the ink mask lost (a lighter-coloured name, say), not a space.
SPACE_GAP_MAX_EM = 0.9
# Full-width punctuation carries its own whitespace inside the glyph, so a wide
# gap next to it is not a missing space.
NO_SPACE_AFTER = set("，。、；：！？（《“‘【〔「『")
NO_SPACE_BEFORE = set("，。、；：！？）》”’】〕」』")
# OCR reads the interpunct between CJK words as a bullet or katakana dot.
INTERPUNCT_LOOKALIKES = "•・･∙"
CJK_PATTERN = re.compile(r"[㐀-鿿豈-﫿　-〿]")

DEFAULT_SLIDE_WIDTH_IN = 13.333333

_engine = None
_engine_name = None


def _ocr_engine():
    """RapidOCR 3.x (`rapidocr`), or the older `rapidocr_onnxruntime` build.

    The older package stops at Python 3.12; 3.x runs on 3.13+ and ships its
    models in the wheel, so neither needs a download at run time.
    """
    global _engine, _engine_name
    if _engine is None:
        try:
            from rapidocr import RapidOCR
        except ImportError:
            try:
                from rapidocr_onnxruntime import RapidOCR
            except ImportError as error:
                raise SystemExit(
                    "rapidocr and onnxruntime are required: pip install -r requirements.txt"
                ) from error
            _engine_name = "rapidocr-onnxruntime"
            _engine = RapidOCR()
        else:
            _engine_name = "rapidocr"
            # 3.x pads its boxes more. A loose box around a small badge puts
            # the background sample on the card outside the badge, and the
            # badge itself then measures as text. This padding matches the
            # older build's boxes, which the measurement was tuned on.
            _engine = RapidOCR(params={"Det.unclip_ratio": 1.1, "Global.log_level": "warning"})
    return _engine


def run_ocr(image):
    """(quad, text, confidence, chars) from whichever engine is installed.

    `chars` holds each recognised character's (left, right) columns; only
    RapidOCR 3.x reports them, and the older build gives None.
    """
    engine = _ocr_engine()
    if _engine_name == "rapidocr":
        result = engine(image, return_word_box=True, return_single_char_box=True)
        if result.boxes is None:
            return []
        words = result.word_results or [None] * len(result.txts)
        return [
            (quad, text, score, char_columns(word))
            for quad, text, score, word in zip(result.boxes, result.txts, result.scores, words)
        ]
    lines, _ = engine(image)
    return [(quad, text, conf, None) for quad, text, conf in (lines or [])]


def char_columns(word_result):
    if not word_result:
        return None
    columns = []
    for char, _, quad in word_result:
        if len(char) != 1:
            return None
        xs = [float(point[0]) for point in quad]
        columns.append((min(xs), max(xs)))
    return columns


def read_image(path):
    """cv2.imread cannot open non-ASCII paths on Windows; decoding bytes can."""
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR) if data.size else None
    if image is None:
        raise ValueError(f"cannot read image: {path}")
    return image


@dataclass
class OcrBox:
    text: str
    conf: float
    x: int
    y: int
    w: int
    h: int
    # (left, right) page columns of each non-space character, when the OCR
    # engine reports them.
    chars: list = None


@dataclass
class TextMetrics:
    stroke_px: float = 0.0
    stroke_ratio: float = 0.0
    stroke_ratio_area: float = 0.0
    # The em in pixels on a page scaled to REFERENCE_PAGE_WIDTH.
    em_ref_px: float = 0.0
    stroke_cv: float = 0.0
    slant: float = 0.0


@dataclass
class TextBlock:
    id: str
    text: str
    # Measured glyph bounds, in page fractions [x, y, w, h].
    bbox: tuple
    font_size_pt: float
    color: str = "#111827"
    bold: bool = False
    italic: bool = False
    script: str = "cjk"
    align: str = "left"
    bullet: bool = False
    # Left edge of the line including its bullet mark, in page fractions.
    mark_x: float = 0.0
    # Line-to-line distance of a merged paragraph, in page-height fractions.
    line_pitch: float = 0.0
    conf: float = 1.0
    metrics: TextMetrics = field(default_factory=TextMetrics)


def clamp_bbox(x, y, w, h):
    x = min(1.0, max(0.0, float(x)))
    y = min(1.0, max(0.0, float(y)))
    w = min(1.0 - x, max(0.0, float(w)))
    h = min(1.0 - y, max(0.0, float(h)))
    return (x, y, w, h)


def read_boxes(image):
    """Run OCR and drop the three classes of result that cause damage."""
    boxes = []

    for quad, text, conf, chars in run_ocr(image):
        text = str(text or "").strip()
        conf = float(conf)
        if not text or conf < MIN_CONF:
            continue
        # A short, low-confidence string is usually an icon read as a glyph.
        # Left in, it both writes nonsense into the deck and lets the ink mask
        # eat the icon.
        if conf < SHORT_STRING_CONF and len(text) <= SHORT_STRING_LEN:
            continue
        # A lone latin character is an icon far more often than it is text.
        # "01" and "02" style markers are two characters and survive this.
        if len(text) == 1 and not CJK_PATTERN.search(text) and conf < LONE_GLYPH_CONF:
            continue

        xs = [float(p[0]) for p in quad]
        ys = [float(p[1]) for p in quad]
        x, y = min(xs), min(ys)
        w, h = max(xs) - x, max(ys) - y
        if w <= 1 or h <= 1:
            continue
        # Slanted text rebuilt in a horizontal box lands wrong; leave it in the
        # background instead.
        if abs(ys[0] - ys[1]) > h * MAX_SKEW:
            continue

        boxes.append(OcrBox(text, conf, int(x), int(y), int(round(w)), int(round(h)), chars))

    return boxes


def ring_background(image, box):
    """The median colour of a ring just outside the box.

    Sampling inside the box risks sampling the glyphs themselves; the ring is
    what "the colour underneath this text" actually means.
    """
    h, w = image.shape[:2]
    x0 = max(0, box.x - RING_PAD)
    y0 = max(0, box.y - RING_PAD)
    x1 = min(w, box.x + box.w + RING_PAD)
    y1 = min(h, box.y + box.h + RING_PAD)

    outer = image[y0:y1, x0:x1].reshape(-1, 3)
    inner = image[box.y:box.y + box.h, box.x:box.x + box.w].reshape(-1, 3)
    if outer.shape[0] <= inner.shape[0]:
        return np.median(outer, axis=0)

    mask = np.ones((y1 - y0, x1 - x0), dtype=bool)
    mask[box.y - y0:box.y - y0 + box.h, box.x - x0:box.x - x0 + box.w] = False
    ring = image[y0:y1, x0:x1][mask]
    return np.median(ring if ring.size else outer, axis=0)


def ink_mask(crop, background):
    """Separate glyph pixels from whatever else the OCR box caught.

    Returns the mask and the dominant text colour.
    """
    crop_f = crop.astype(np.int16)
    d_bg = np.abs(crop_f - background.astype(np.int16)).sum(axis=2)
    threshold = max(MIN_INK_DISTANCE, float(d_bg.max()) * INK_DISTANCE_RATIO)
    candidate = d_bg >= threshold

    if not candidate.any():
        return candidate.astype(np.uint8), background.astype(np.int16)

    text_colour = np.median(crop_f[candidate], axis=0)
    d_text = np.abs(crop_f - text_colour).sum(axis=2)

    # max-min stands in for saturation, which avoids an HSV conversion and is
    # what actually separates coloured icons from neutral glyphs.
    saturation = crop_f.max(axis=2) - crop_f.min(axis=2)
    text_saturation = float(text_colour.max() - text_colour.min())

    strict = (
        candidate
        & (d_text < TEXT_COLOUR_TOLERANCE)
        & (saturation <= text_saturation + SATURATION_HEADROOM)
    )
    return strict.astype(np.uint8), text_colour


def components(mask):
    count, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    return [
        (int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP]),
         int(stats[i, cv2.CC_STAT_WIDTH]), int(stats[i, cv2.CC_STAT_HEIGHT]))
        for i in range(1, count)
        if stats[i, cv2.CC_STAT_AREA] >= 3
    ]


def font_height_px(mask, script="cjk"):
    """Glyph height from connected components, not from the whole-line box.

    Brackets, commas and quotes have wildly different extents; the 80th
    percentile of component heights tracks the body of the text instead.

    Thin anti-aliased strokes break a glyph into pieces, so components far
    shorter than the tallest are dropped before the percentile is taken. When
    the percentile still lands well under the ink extent, the glyph fragmented
    rather than being small -- CJK fills its em box, so the extent is the
    better answer there.
    """
    heights = [h for _, _, _, h in components(mask)]
    extent = float(mask.shape[0])
    if not heights:
        return extent

    tallest = max(heights)
    solid = [h for h in heights if h >= tallest * 0.5] or heights
    measured = float(np.percentile(solid, HEIGHT_PERCENTILE))

    floor = extent * (0.8 if script == "cjk" else 0.55)
    return extent if measured < floor else measured


def core_colour(crop, mask, fallback):
    """Median colour of the eroded mask.

    Anti-aliased edge pixels are a blend of glyph and background; sampling them
    washes dark text lighter and light text greyer.
    """
    core = cv2.erode(mask, np.ones((3, 3), np.uint8), iterations=1)
    pixels = crop[core.astype(bool)]
    if pixels.shape[0] < 8:
        pixels = crop[mask.astype(bool)]
    if pixels.shape[0] == 0:
        b, g, r = fallback
    else:
        b, g, r = np.median(pixels, axis=0)
    return f"#{int(r):02X}{int(g):02X}{int(b):02X}"


def stroke_metrics(mask):
    """Stroke width from a distance transform, and its variation.

    The distance transform reports the actual stroke thickness, independent of
    how complicated the character is.
    """
    distance = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    values = distance[distance > 0]
    if values.size == 0:
        return 0.0, 0.0
    width = float(np.percentile(values, STROKE_PERCENTILE)) * 2.0

    thick = distance[distance > 0.8]
    variation = float(np.std(thick) / np.mean(thick)) if thick.size > 4 else 0.0
    return width, variation


def area_stroke_px(crop, mask, background, text_colour):
    """Stroke width as twice the ink area over the outline length.

    Each pixel near the glyphs counts by how far it sits from the background
    towards the text colour, so the anti-aliased rim adds its true share
    instead of a whole pixel or none.
    """
    crop_f = crop.astype(np.float32)
    background = np.asarray(background, np.float32)
    span = np.asarray(text_colour, np.float32) - background
    span_sq = float((span * span).sum())
    if span_sq < 1.0:
        return 0.0
    coverage = np.clip(((crop_f - background) * span).sum(axis=2) / span_sq, 0.0, 1.0)
    near = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1).astype(bool)
    coverage = np.where(near, coverage, 0.0)

    solid = (coverage >= 0.5).astype(np.uint8)
    contours, _ = cv2.findContours(solid, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    perimeter = sum(cv2.arcLength(contour, True) for contour in contours)
    return 2.0 * float(coverage.sum()) / perimeter if perimeter > 0 else 0.0


def bold_threshold(em_px):
    return BOLD_RATIO_BASE + BOLD_RATIO_SIZE_PX / em_px


def slant(mask):
    """Shear the mask until the vertical projection is most peaked.

    Vertical strokes line up at the true slant, which maximises the variance
    of the column sums.
    """
    h, w = mask.shape
    if h < 4 or w < 4:
        return 0.0

    best_angle, best_variance = 0.0, -1.0
    for angle in np.arange(-0.05, 0.36, 0.03):
        matrix = np.float32([[1, angle, -angle * h / 2], [0, 1, 0]])
        sheared = cv2.warpAffine(mask, matrix, (w, h), flags=cv2.INTER_NEAREST)
        variance = float(np.var(sheared.sum(axis=0)))
        if variance > best_variance:
            best_angle, best_variance = float(angle), variance
    return best_angle


def leading_bullet(mask, glyph_height):
    """Column where the text starts, if a bullet glyph precedes it.

    Returns 0 when there is no bullet. Both this and the textual strip below
    are needed: geometry alone leaves the character in the text, and text
    alone leaves the mark in the picture.
    """
    boxes = sorted(components(mask), key=lambda item: item[0])
    if len(boxes) < 2 or glyph_height <= 0:
        return 0

    x, y, w, h = boxes[0]
    gap = boxes[1][0] - (x + w)
    # A bullet sits in the middle band of the line. A speck at the baseline or
    # the top is the edge of a badge or card the OCR box caught, not a mark.
    centre = (y + h / 2) / mask.shape[0]
    if (
        w <= glyph_height * 0.55
        and h <= glyph_height * 0.60
        and gap >= glyph_height * 0.18
        and 0.2 <= centre <= 0.8
    ):
        return boxes[1][0]
    return 0


def ink_gaps(mask, origin_x, min_width, max_width):
    """Page-column centres of interior blank runs between the two widths."""
    columns = np.where(mask.any(axis=0))[0]
    gaps = []
    for left, right in zip(columns, columns[1:]):
        if min_width <= right - left - 1 <= max_width:
            gaps.append(origin_x + (left + right) / 2.0)
    return gaps


def restore_spaces(text, chars, mask, origin_x, em_px):
    """Put back the spaces OCR drops, where the ink has a space-wide gap.

    Each wide gap is assigned to the nearest boundary between two recognised
    characters, using the per-character columns the OCR engine reports.
    Without them the text is returned as read.
    """
    glyphs = [(i, c) for i, c in enumerate(text) if not c.isspace()]
    if not chars or len(chars) != len(glyphs) or len(glyphs) < 2 or em_px <= 0:
        return text

    boundaries = [
        (chars[k][1] + chars[k + 1][0]) / 2.0 for k in range(len(glyphs) - 1)
    ]
    spaced = set()
    for gap in ink_gaps(mask, origin_x, SPACE_GAP_EM * em_px, SPACE_GAP_MAX_EM * em_px):
        k = min(range(len(boundaries)), key=lambda n: abs(boundaries[n] - gap))
        if abs(boundaries[k] - gap) <= em_px * 0.6:
            spaced.add(k)

    out = []
    for k, (i, char) in enumerate(glyphs):
        out.append(char)
        if k + 1 == len(glyphs):
            break
        following_index, following = glyphs[k + 1]
        already = following_index > i + 1
        if already:
            out.append(" ")
        elif k in spaced and char not in NO_SPACE_AFTER and following not in NO_SPACE_BEFORE:
            out.append(" ")
    return "".join(out)


def normalise_interpunct(text):
    """A dot read between two words is the interpunct, not a bullet."""
    chars = list(text)
    for i, char in enumerate(chars):
        if char in INTERPUNCT_LOOKALIKES and 0 < i < len(chars) - 1 and text[:i].strip():
            chars[i] = "·"
    return "".join(chars)


def strip_bullet(text):
    stripped = text.lstrip()
    if stripped and stripped[0] in BULLET_CHARS:
        return stripped[1:].lstrip(), True
    return text, False


def is_cjk(text):
    return bool(CJK_PATTERN.search(text))


def deck_weight_offset(blocks):
    """Where this deck's own regular/bold valley sits, relative to the threshold."""
    margins = np.array([
        weight_margin(block) for block in blocks if block.metrics.em_ref_px >= MIN_BOLD_EM_PX
    ])
    if margins.size < WEIGHT_VALLEY_MIN_BLOCKS:
        return 0.0
    grid = np.arange(-0.1, 0.1, 0.0005)
    density = np.exp(
        -((grid[:, None] - margins[None, :]) ** 2) / (2 * WEIGHT_VALLEY_BANDWIDTH ** 2)
    ).sum(axis=1)

    low, high = WEIGHT_VALLEY_WINDOW
    best, best_score = 0.0, WEIGHT_VALLEY_DEPTH
    for i in range(1, grid.size - 1):
        x = grid[i]
        if not low <= x <= high:
            continue
        if density[i] > density[i - 1] or density[i] > density[i + 1]:
            continue
        below = float((margins < x).mean())
        if below < WEIGHT_VALLEY_MIN_SHARE or below > 1 - WEIGHT_VALLEY_MIN_SHARE:
            continue
        score = density[i] / min(density[:i].max(), density[i + 1:].max())
        if score < best_score:
            best, best_score = float(x), score
    return best


def resolve_bold(blocks, mode, offset=None):
    """Decide weight.

    `auto` compares the area-based stroke width with a share of the em that
    eases with size, shifted by `offset` to where this deck's own regular and
    bold clusters part (found from `blocks` when not given). When the guess is
    wrong for a template, pin a threshold on `stroke_ratio_area` with
    `ratio:<value>` instead -- the measurements stay in the JSON so one
    calibration serves a whole batch of same-template slides.
    """
    mode = (mode or "auto").strip().lower()
    if mode == "off" or not blocks:
        for block in blocks:
            block.bold = False
        return
    if mode == "on":
        for block in blocks:
            block.bold = True
        return
    if mode.startswith("ratio:"):
        try:
            threshold = float(mode.split(":", 1)[1])
        except ValueError:
            threshold = 0.1
        for block in blocks:
            block.bold = block.metrics.stroke_ratio_area >= threshold
        return

    if offset is None:
        offset = deck_weight_offset(blocks)
    for block in blocks:
        block.bold = block.metrics.em_ref_px >= MIN_BOLD_EM_PX and weight_margin(block) >= offset
    harmonise_siblings(blocks, offset)


def weight_margin(block):
    return block.metrics.stroke_ratio_area - bold_threshold(max(block.metrics.em_ref_px, 1.0))


def siblings(left, right):
    """Same size and colour on one page: almost always one style, like a row of card titles."""
    a, b = left.metrics.em_ref_px, right.metrics.em_ref_px
    return (
        a > 0 and b > 0
        and abs(a - b) <= max(a, b) * SIBLING_EM_TOLERANCE
        and colour_distance(left.color, right.color) <= SIBLING_COLOUR_TOLERANCE
    )


def harmonise_siblings(blocks, offset=0.0):
    """Give each group of sibling blocks one weight, by majority.

    The same style measures a little differently from string to string, and a
    style that sits near the threshold otherwise comes out with some titles of
    a row bold and the rest regular. A tie goes by the group's mean margin.
    """
    parent = list(range(len(blocks)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(blocks)):
        for j in range(i + 1, len(blocks)):
            if siblings(blocks[i], blocks[j]):
                parent[root(i)] = root(j)

    groups = {}
    for i, block in enumerate(blocks):
        groups.setdefault(root(i), []).append(block)
    for group in groups.values():
        if len(group) < 2:
            continue
        bold = sum(block.bold for block in group)
        if bold * 2 == len(group):
            verdict = sum(weight_margin(block) - offset for block in group) >= 0
        else:
            verdict = bold * 2 > len(group)
        for block in group:
            block.bold = verdict


def extract_text(image_path, slide_id, bold_mode="auto", expected=None,
                 slide_width_pt=DEFAULT_SLIDE_WIDTH_IN * 72):
    """Read one page into text blocks with measured style."""
    image = read_image(image_path)
    page_h, page_w = image.shape[:2]
    pt_per_px = slide_width_pt / page_w

    blocks = []

    for index, box in enumerate(read_boxes(image)):
        crop = image[box.y:box.y + box.h, box.x:box.x + box.w]
        if crop.size == 0:
            continue

        background = ring_background(image, box)
        mask, text_colour = ink_mask(crop, background)
        if mask.sum() < 4:
            continue

        # OCR boxes routinely swallow a neighbouring icon. Re-deriving the
        # bounds from the ink is what stops the rebuilt text from sitting on
        # top of it.
        cols = np.where(mask.any(axis=0))[0]
        rows = np.where(mask.any(axis=1))[0]
        left, right = int(cols[0]), int(cols[-1]) + 1
        top, bottom = int(rows[0]), int(rows[-1]) + 1
        mark_left = left

        text, had_bullet_char = strip_bullet(box.text)
        script = "cjk" if is_cjk(text) else "latin"
        glyph_px = font_height_px(mask[top:bottom, left:right], script)
        line_em = glyph_px / (CJK_FACE_RATIO if script == "cjk" else LATIN_FACE_RATIO)
        text, _ = strip_bullet(
            normalise_interpunct(restore_spaces(box.text, box.chars, mask, box.x, line_em))
        )

        bullet_start = leading_bullet(mask[top:bottom, left:right], glyph_px)
        if bullet_start:
            left += bullet_start
            had_bullet_char = True
            mask_view = mask[top:bottom, left:right]
            if mask_view.sum() < 4:
                continue
            glyph_px = font_height_px(mask_view, script)

        region = mask[top:bottom, left:right]
        crop_region = crop[top:bottom, left:right]
        if region.size == 0 or region.sum() < 4:
            continue

        face_ratio = CJK_FACE_RATIO if script == "cjk" else LATIN_FACE_RATIO
        em_px = glyph_px / face_ratio

        stroke_px, stroke_cv = stroke_metrics(region)
        area_px = area_stroke_px(crop_region, region, background, text_colour)
        slant_value = slant(region)

        blocks.append(
            TextBlock(
                id=f"{slide_id}_t{index + 1}",
                text=text,
                bbox=clamp_bbox(
                    (box.x + left) / page_w,
                    (box.y + top) / page_h,
                    (right - left) / page_w,
                    (bottom - top) / page_h,
                ),
                font_size_pt=round(em_px * pt_per_px, 2),
                color=core_colour(crop_region, region, text_colour),
                italic=slant_value > ITALIC_SLANT,
                script=script,
                bullet=had_bullet_char,
                mark_x=(box.x + mark_left) / page_w,
                conf=round(box.conf, 3),
                metrics=TextMetrics(
                    stroke_px=round(stroke_px, 2),
                    stroke_ratio=round(stroke_px / em_px, 3) if em_px > 0 else 0.0,
                    stroke_ratio_area=round(area_px / em_px, 4) if em_px > 0 else 0.0,
                    em_ref_px=round(em_px * REFERENCE_PAGE_WIDTH / page_w, 2),
                    stroke_cv=round(stroke_cv, 3),
                    slant=round(slant_value, 3),
                ),
            )
        )

    resolve_bold(blocks, bold_mode)
    if expected:
        snap_to_expected(blocks, expected)
    return blocks


def snap_to_expected(blocks, expected):
    """Correct near-miss transcriptions against known copy, e.g. PPTX XML text.

    Only exact-length near matches are replaced. The known copy is more
    reliable than reading pixels, but it must never introduce text that is not
    on the page.
    """
    pool = [line.strip() for line in expected if line and line.strip()]
    for block in blocks:
        current = block.text.strip()
        if not current or current in pool:
            continue
        for candidate in pool:
            if len(candidate) != len(current):
                continue
            differences = sum(1 for a, b in zip(candidate, current) if a != b)
            if differences and differences <= max(1, len(current) // 8):
                block.text = candidate
                break


def colour_distance(left, right):
    def channels(value):
        value = value.lstrip("#")
        return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)

    try:
        a, b = channels(left), channels(right)
    except (ValueError, IndexError):
        return 255
    return sum(abs(x - y) for x, y in zip(a, b))


def continues(previous, block):
    """Is `block` the next line of the paragraph `previous` starts?"""
    line_height = previous.bbox[3]
    if line_height <= 0:
        return False

    gap = block.bbox[1] - (previous.bbox[1] + previous.bbox[3])
    if not -line_height * 0.25 <= gap <= line_height * 1.5:
        return False
    if abs(block.bbox[0] - previous.bbox[0]) > max(0.006, previous.bbox[2] * 0.15):
        return False

    return (
        abs(block.font_size_pt - previous.font_size_pt) <= max(1.0, previous.font_size_pt * 0.12)
        and colour_distance(block.color, previous.color) <= MERGE_COLOUR_TOLERANCE
        and block.bold == previous.bold
        and block.bullet == previous.bullet
    )


def merge_lines(blocks):
    """Join consecutive OCR lines that belong to one paragraph.

    OCR reports one box per line, so a four-line paragraph becomes four text
    boxes and editing it means editing four things.

    Lines are chained by looking downward for each block's own successor,
    rather than by scanning in reading order. Reading order interleaves
    side-by-side columns, which severs every paragraph on a two-column page.
    """
    if not blocks:
        return blocks

    ordered = sorted(blocks, key=lambda b: (b.bbox[1], b.bbox[0]))
    successor = {}
    claimed = set()

    for i, block in enumerate(ordered):
        best = None
        for j in range(i + 1, len(ordered)):
            if j in claimed or not continues(block, ordered[j]):
                continue
            if best is None or ordered[j].bbox[1] < ordered[best].bbox[1]:
                best = j
        if best is not None:
            successor[i] = best
            claimed.add(best)

    merged = []
    for i, head in enumerate(ordered):
        if i in claimed:
            continue

        chain = [head]
        cursor = i
        while cursor in successor:
            cursor = successor[cursor]
            chain.append(ordered[cursor])

        if len(chain) == 1:
            merged.append(head)
            continue

        left = min(b.bbox[0] for b in chain)
        top = min(b.bbox[1] for b in chain)
        right = max(b.bbox[0] + b.bbox[2] for b in chain)
        bottom = max(b.bbox[1] + b.bbox[3] for b in chain)
        # Bottoms rather than tops: a line of all-lowercase or punctuation has
        # a lower top, but every line sits on its baseline.
        pitches = [
            (b.bbox[1] + b.bbox[3]) - (a.bbox[1] + a.bbox[3])
            for a, b in zip(chain, chain[1:])
        ]
        merged.append(
            TextBlock(
                id=head.id,
                text="\n".join(b.text for b in chain),
                bbox=clamp_bbox(left, top, right - left, bottom - top),
                font_size_pt=head.font_size_pt,
                color=head.color,
                bold=head.bold,
                italic=head.italic,
                script=head.script,
                align=head.align,
                bullet=head.bullet,
                mark_x=min(b.mark_x for b in chain),
                line_pitch=float(np.median(pitches)),
                conf=min(b.conf for b in chain),
                metrics=head.metrics,
            )
        )

    return sorted(merged, key=lambda b: (b.bbox[1], b.bbox[0]))


def text_frame(block, slide_width_pt, slide_height_pt):
    """The text box to compose, in page fractions.

    The measured ink bounds are too tight to compose into: the opening machine
    substitutes fonts, and PowerPoint draws leading above the first baseline.
    The frame starts at the bullet mark, sits a little above the ink, and
    leaves width slack so the text does not wrap.
    """
    x, y, w, h = block.bbox
    if block.bullet:
        w += x - block.mark_x
        x = block.mark_x
    lift_pt = block.font_size_pt * BASELINE_LIFT
    if block.line_pitch > 0:
        spacing_pt = block.line_pitch * slide_height_pt
        added_pt = spacing_pt - block.font_size_pt * SINGLE_SPACING_EM
        lift_pt += max(0.0, added_pt) * EXACT_SPACING_LIFT
    lift = lift_pt / slide_height_pt
    extra_w = TEXT_WIDTH_EXTRA_PT / slide_width_pt
    extra_h = TEXT_HEIGHT_EXTRA_PT / slide_height_pt
    top = max(0.0, y - lift)
    return clamp_bbox(x, top, w * TEXT_WIDTH_SLACK + extra_w, h + lift + extra_h)


def slide_number(path, index):
    digits = re.findall(r"\d+", Path(path).stem)
    return int(digits[-1]) if digits else index + 1


def to_px(bbox, page_w, page_h):
    x, y, w, h = bbox
    return [round(x * page_w), round(y * page_h), round(w * page_w), round(h * page_h)]


def to_frac(bbox):
    return [round(v, 6) for v in bbox]


def block_record(block, page_w, page_h, slide_width_pt):
    slide_height_pt = slide_width_pt * page_h / page_w
    frame = text_frame(block, slide_width_pt, slide_height_pt)
    text = block.text
    if block.bullet:
        # The bullet glyph was stripped from the OCR text and measured as a
        # mark; write it back so the composed box shows it.
        text = "\n".join(f"• {line}" for line in text.split("\n"))
    record = {
        "id": block.id,
        "text": text,
        "bbox_px": to_px(frame, page_w, page_h),
        "bbox_frac": to_frac(frame),
        "ink_bbox_px": to_px(block.bbox, page_w, page_h),
        "ink_bbox_frac": to_frac(block.bbox),
        "font_size_pt": block.font_size_pt,
        "color": block.color,
        "bold": block.bold,
        "italic": block.italic,
        "align": block.align,
        "font_family": "Microsoft YaHei",
        "bullet": block.bullet,
        "script": block.script,
        "conf": block.conf,
        "metrics": {
            "stroke_px": block.metrics.stroke_px,
            "stroke_ratio": block.metrics.stroke_ratio,
            "stroke_ratio_area": block.metrics.stroke_ratio_area,
            "em_ref_px": block.metrics.em_ref_px,
            "stroke_cv": block.metrics.stroke_cv,
            "slant": block.metrics.slant,
        },
    }
    if block.line_pitch > 0:
        # Merged lines keep the page's own spacing; PowerPoint's default
        # single spacing packs them much tighter than most slide designs.
        record["line_spacing_pt"] = round(block.line_pitch * slide_height_pt, 2)
    return record


def build_layout(image_paths, bold_mode="auto", merge=True, expected=None,
                 slide_width_in=DEFAULT_SLIDE_WIDTH_IN):
    slide_width_pt = slide_width_in * 72
    slides = []
    ref_w = ref_h = None

    seen = {}
    pages = []
    for index, path in enumerate(image_paths):
        page_h, page_w = read_image(path).shape[:2]
        if ref_w is None:
            ref_w, ref_h = page_w, page_h

        number = slide_number(path, index)
        if number in seen:
            raise SystemExit(
                f"{Path(path).name} and {Path(seen[number]).name} both map to slide {number}; "
                "name the pages slide_001.png, slide_002.png, ..."
            )
        seen[number] = path
        blocks = extract_text(path, f"s{number}", bold_mode, expected, slide_width_pt)
        pages.append((path, number, page_w, page_h, blocks))

    # Weight is decided across the deck, before lines merge, since merging
    # keeps bold and regular lines apart.
    offset = 0.0
    if (bold_mode or "auto").strip().lower() == "auto":
        offset = deck_weight_offset([block for *_, blocks in pages for block in blocks])
        for *_, blocks in pages:
            resolve_bold(blocks, "auto", offset)

    for path, number, page_w, page_h, blocks in pages:
        line_count = len(blocks)
        if merge:
            blocks = merge_lines(blocks)
        print(f"{Path(path).name}: {line_count} lines -> {len(blocks)} text boxes")

        slides.append({
            "slide": number,
            "source": Path(path).name,
            "width": page_w,
            "height": page_h,
            "texts": [block_record(b, page_w, page_h, slide_width_pt) for b in blocks],
        })

    return {
        "method": "ocr",
        "ocr_engine": _engine_name,
        "bold_mode": bold_mode,
        "bold_offset": round(offset, 4),
        "slide_width_in": slide_width_in,
        "ref_width": ref_w,
        "ref_height": ref_h,
        "slides": slides,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("images", nargs="+", help="Source slide images, e.g. source/slide_*.png")
    ap.add_argument("--out", default="analysis/texts_layout.json")
    ap.add_argument(
        "--bold-mode",
        default="auto",
        help="auto | off | on | ratio:<stroke_ratio_area threshold>, e.g. ratio:0.1",
    )
    ap.add_argument("--no-merge-lines", action="store_true",
                    help="Keep one text box per OCR line instead of merging paragraphs")
    ap.add_argument("--expected", help="UTF-8 file of known text, one string per line "
                                       "(e.g. text from PPTX XML) to correct near-miss OCR")
    ap.add_argument("--slide-width-in", type=float, default=DEFAULT_SLIDE_WIDTH_IN,
                    help="Composed slide width; must match slide_width_in in the compose spec")
    args = ap.parse_args()

    if args.slide_width_in <= 0:
        raise SystemExit("--slide-width-in must be positive")
    expected = None
    if args.expected:
        expected = Path(args.expected).read_text(encoding="utf-8-sig").splitlines()

    layout = build_layout(
        args.images,
        bold_mode=args.bold_mode,
        merge=not args.no_merge_lines,
        expected=expected,
        slide_width_in=args.slide_width_in,
    )
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
