from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "demos"
SIZE = (640, 360)
FPS = 10


def ensure_out_dir() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "arial.ttf",
        "segoeui.ttf",
        "Calibri.ttf",
    ]
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


FONT_TITLE = load_font(28)
FONT_BODY = load_font(18)
FONT_SMALL = load_font(15)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def fit_cover(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def quantize_frames(frames: Iterable[Image.Image]) -> list[Image.Image]:
    out: list[Image.Image] = []
    for frame in frames:
        out.append(frame.convert("P", palette=Image.Palette.ADAPTIVE, colors=96))
    return out


def save_gif(path: Path, frames: list[Image.Image], duration_ms: int) -> None:
    pal = quantize_frames(frames)
    pal[0].save(
        path,
        save_all=True,
        append_images=pal[1:],
        duration=duration_ms,
        loop=0,
        optimize=True,
        disposal=2,
    )


def draw_rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width: int = 1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def point_on_path(path: list[tuple[float, float]], t: float) -> tuple[float, float]:
    if len(path) < 2:
        return path[0]
    seg_lens = []
    total = 0.0
    for i in range(len(path) - 1):
        ax, ay = path[i]
        bx, by = path[i + 1]
        length = math.hypot(bx - ax, by - ay)
        seg_lens.append(length)
        total += length
    dist = t * total
    for i, seg in enumerate(seg_lens):
        if dist <= seg or i == len(seg_lens) - 1:
            ratio = 0.0 if seg == 0 else dist / seg
            ax, ay = path[i]
            bx, by = path[i + 1]
            return (lerp(ax, bx, ratio), lerp(ay, by, ratio))
        dist -= seg
    return path[-1]


def gen_flow_demo() -> None:
    w, h = SIZE
    frames: list[Image.Image] = []
    nodes = [
        (70, 70, 250, 130, "Input"),
        (280, 70, 460, 130, "Analyze"),
        (490, 70, 670, 130, "Generate"),
        (280, 190, 460, 250, "Patch / Replace"),
        (280, 310, 460, 370, "Canvas Applied"),
    ]
    edges = [
        ((250, 100), (280, 100)),
        ((460, 100), (490, 100)),
        ((370, 130), (370, 190)),
        ((370, 250), (370, 310)),
    ]
    dot_path = [(95, 100), (640, 100), (370, 100), (370, 340)]

    for i in range(72):
        img = Image.new("RGB", SIZE, "#0B1020")
        draw = ImageDraw.Draw(img)

        for y in range(h):
            c = int(15 + 25 * (y / h))
            draw.line([(0, y), (w, y)], fill=(6 + c // 4, 10 + c // 3, 25 + c))

        for gx in range(0, w, 30):
            draw.line([(gx, 0), (gx, h)], fill=(255, 255, 255, 16), width=1)
        for gy in range(0, h, 30):
            draw.line([(0, gy), (w, gy)], fill=(255, 255, 255, 16), width=1)

        draw.text((24, 18), "Flow Workspace Demo", fill="#D7E3FF", font=FONT_TITLE)

        pulse = 0.5 + 0.5 * math.sin(i / 8)
        edge_color = (90, int(160 + 80 * pulse), 255)
        for (a, b) in edges:
            draw.line([a, b], fill=edge_color, width=4)

        for x1, y1, x2, y2, label in nodes:
            active = ((i // 14) % len(nodes)) == nodes.index((x1, y1, x2, y2, label))
            fill = (24, 38, 74) if not active else (34, 68, 132)
            outline = (110, 175, 255) if active else (82, 116, 180)
            draw_rounded(draw, (x1, y1, x2, y2), 14, fill=fill, outline=outline, width=2)
            tx = x1 + (x2 - x1) // 2
            ty = y1 + (y2 - y1) // 2
            bbox = draw.textbbox((0, 0), label, font=FONT_BODY)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text((tx - tw // 2, ty - th // 2), label, fill="#EAF2FF", font=FONT_BODY)

        t = (i % 36) / 36.0
        px, py = point_on_path(dot_path, t)
        for r, a in [(18, 70), (12, 120), (7, 255)]:
            color = (100, 220, 255) if a == 255 else (100, 220, 255, a)
            if a == 255:
                draw.ellipse((px - r, py - r, px + r, py + r), fill=color)
            else:
                glow = Image.new("RGBA", SIZE, (0, 0, 0, 0))
                gdraw = ImageDraw.Draw(glow)
                gdraw.ellipse((px - r, py - r, px + r, py + r), fill=(100, 220, 255, a))
                img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")

        hint = "Chat -> XML patch -> One-click apply"
        bbox = draw.textbbox((0, 0), hint, font=FONT_SMALL)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw_rounded(draw, (24, h - 44, 24 + tw + 18, h - 18), 10, fill=(20, 30, 56), outline=(88, 120, 178))
        draw.text((34, h - 38), hint, fill="#C8D7FF", font=FONT_SMALL)

        frames.append(img)

    save_gif(OUT_DIR / "flow-demo.gif", frames, int(1000 / FPS))


def blend(a: Image.Image, b: Image.Image, t: float) -> Image.Image:
    return Image.blend(a, b, t)


def add_badge(base: Image.Image, title: str, subtitle: str) -> Image.Image:
    img = base.copy().convert("RGB")
    draw = ImageDraw.Draw(img)
    draw_rounded(draw, (18, 16, 290, 92), 14, fill=(12, 16, 24), outline=(70, 90, 120), width=2)
    draw.text((32, 31), title, fill="#F3F7FF", font=FONT_BODY)
    draw.text((32, 58), subtitle, fill="#B8C4DA", font=FONT_SMALL)
    return img


def gen_cad_demo() -> None:
    source = [
        (ROOT / "public" / "cad" / "2D.png", "CAD", "2D Floor Plan"),
        (ROOT / "public" / "cad" / "render.png", "CAD", "Render Preview"),
        (ROOT / "public" / "cad" / "bom.png", "CAD", "BOM Export"),
    ]
    prepared: list[Image.Image] = []
    for p, t, s in source:
        img = fit_cover(Image.open(p).convert("RGB"), SIZE)
        prepared.append(add_badge(img, t, s))

    frames: list[Image.Image] = []
    hold = 12
    trans = 6
    for idx in range(len(prepared)):
        cur = prepared[idx]
        nxt = prepared[(idx + 1) % len(prepared)]
        for _ in range(hold):
            frames.append(cur)
        for i in range(1, trans + 1):
            t = i / (trans + 1)
            frames.append(blend(cur, nxt, t))

    save_gif(OUT_DIR / "cad-demo.gif", frames, int(1000 / FPS))


def gen_ppt_demo() -> None:
    source = [
        ROOT / "public" / "templates" / "template_b.png",
        ROOT / "public" / "templates" / "template_glass.png",
        ROOT / "public" / "templates" / "template_vector_illustration.png",
    ]
    prepared = [fit_cover(Image.open(p).convert("RGB"), SIZE) for p in source]
    frames: list[Image.Image] = []

    for idx, img in enumerate(prepared):
        for i in range(14):
            t = i / 13
            scale = 1.0 + 0.06 * t
            nw, nh = int(SIZE[0] * scale), int(SIZE[1] * scale)
            zoomed = img.resize((nw, nh), Image.Resampling.LANCZOS)
            left = (nw - SIZE[0]) // 2
            top = (nh - SIZE[1]) // 2
            frame = zoomed.crop((left, top, left + SIZE[0], top + SIZE[1]))
            overlay = Image.new("RGBA", SIZE, (8, 12, 20, 72))
            frame = Image.alpha_composite(frame.convert("RGBA"), overlay).convert("RGB")
            draw = ImageDraw.Draw(frame)
            draw_rounded(draw, (18, 16, 318, 90), 14, fill=(12, 16, 24), outline=(70, 90, 120), width=2)
            draw.text((32, 31), "PPT", fill="#F3F7FF", font=FONT_BODY)
            draw.text((32, 58), f"Slide Generation #{idx + 1}", fill="#B8C4DA", font=FONT_SMALL)
            frames.append(frame)

        nxt = prepared[(idx + 1) % len(prepared)]
        for j in range(4):
            t = (j + 1) / 5
            frames.append(blend(prepared[idx], nxt, t))

    save_gif(OUT_DIR / "ppt-demo.gif", frames, int(1000 / FPS))


def main() -> None:
    ensure_out_dir()
    gen_flow_demo()
    gen_cad_demo()
    gen_ppt_demo()
    print("Generated GIFs in", OUT_DIR)


if __name__ == "__main__":
    main()
