"""Floorplan recognition: the house designer's recognition scripts (skill/cad-skill/designer/scripts, MIT),
routed by input as the designer's GUIDE section 1 does. The Node server runs this script for each upload
(server/routes/cad-recognize.ts); there is no separate service.

python recognize.py --file plan.jpg [--file2 layout.jpg] [--route R] [--total-width mm] [--total-height mm]
                    [--scale mm/px] [--names a,b]
  route (picked from the input when not given):
  image       bitmap plan, screenshot, scan, bitmap-only PDF (rendered at 200 dpi)   -> analyze.py
  cadshot     black CAD screenshot (model space, coloured lines)                    -> cadshot.py + analyze.py --wall-color cyan
  cad         vector PDF / DXF                                                      -> cadvec.py (fallback cadpair.py / cadsplit.py)
  cadpair     multi-page vector PDF (one floor per page)                            -> cadpair.py
  building    several floors side by side on one sheet, outlined walls (SVG / DXF / PDF) -> cadsplit.py
  dxf-layout  a decoration company's furniture-layout DXF (blocks in blocks)       -> cadvec.py + dxfinventory.py
  dual        original plan + furnished layout plan (file2)                         -> the plan's route + dimticks.py on file2
Prints one JSON line: {route, draft, underlay, underlays, overlayPng, warnings, notes, inventory?, layoutImage?},
or {error, status} when the drawing cannot be read. `draft` is a HouseSpec (walls with openings, a building has
floors); `underlay` / `underlays` (one per floor) are ready for the designer preset.
"""
import argparse, base64, io, json, os, subprocess, sys, tempfile
from typing import Optional

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS = os.environ.get('HPD_SCRIPTS') or os.path.join(ROOT, 'skill', 'cad-skill', 'designer', 'scripts')
sys.path.insert(0, SCRIPTS)
from imgio import open_upright  # noqa: E402  (the designer's EXIF-aware image reader)


class RecognizeError(Exception):
    """A drawing that cannot be read; `status` is the HTTP status the server answers with."""
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


BITMAP = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
VECTOR = {'.pdf', '.dxf', '.svg'}
ROUTES = {'image', 'cadshot', 'cad', 'cadpair', 'building', 'dxf-layout', 'dual'}
TIMEOUT = int(os.environ.get('RECOGNIZE_TIMEOUT', '180'))


def jpeg_url(path: str, longest: int = 1600, rotate: int = 0):
    """The image upright, as a JPEG data URL no longer than `longest` px (as the designer's build.py packs underlays)."""
    im = open_upright(path, rotate=rotate).convert('RGB')
    w, h = im.size
    k = min(1, longest / max(w, h))
    if k < 1:
        im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=85)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode(), im.size, k


def pack_underlay(ul: dict, folder: str, fallback: str):
    """A script's underlay ({image, mmPerPx, x, y}) as the designer preset takes it."""
    image = ul.get('image')
    path = image if image and os.path.isabs(image) else os.path.join(folder, image) if image else fallback
    if not os.path.exists(path):
        path = fallback
    src, (w, h), k = jpeg_url(path, rotate=ul.get('rotate', 0))
    return {'src': src, 'imgW': w, 'imgH': h, 'mmPerPx': ul['mmPerPx'] / k, 'x': ul.get('x', 0), 'y': ul.get('y', 0),
            'opacity': 0.5, 'visible': True, 'locked': True}


def last_json(text: str):
    """The last JSON object a script printed (its summary)."""
    at = text.rfind('\n{')
    for start in ([at + 1] if at >= 0 else []) + [text.find('{')]:
        if start < 0:
            continue
        try:
            return json.loads(text[start:])
        except ValueError:
            continue
    return None


class Run:
    def __init__(self, tmp: str):
        self.tmp = tmp
        self.steps = []
        self.notes = []
        self.warnings = []
        self.inventory = None

    def script(self, name: str, *args, check=True):
        cmd = [sys.executable, os.path.join(SCRIPTS, name), *[str(a) for a in args]]
        env = {**os.environ, 'PYTHONPATH': SCRIPTS, 'PYTHONIOENCODING': 'utf-8', 'MPLBACKEND': 'Agg'}
        try:
            proc = subprocess.run(cmd, cwd=SCRIPTS, env=env, capture_output=True, text=True,
                                  encoding='utf-8', errors='replace', timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            raise RecognizeError(504, f'识别超时（{name}）')
        self.steps.append({'script': name, 'exit': proc.returncode})
        self.warnings += [line for line in (proc.stderr or '').splitlines() if line.strip() and 'Traceback' not in line][-5:]
        if check and proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or '').strip().splitlines()[-5:]
            raise RecognizeError(422, f'识别失败（{name} exit {proc.returncode}）：' + (' | '.join(tail) or '没有识别到墙体'))
        return proc


def is_dark(path: str) -> bool:
    """A black CAD screenshot: most of the picture is near black."""
    with Image.open(path) as im:
        small = im.convert('L').resize((160, 160))
    pixels = small.tobytes()
    return sum(1 for p in pixels if p < 40) > len(pixels) * 0.55


def pdf_info(path: str):
    import fitz
    with fitz.open(path) as doc:
        return doc.page_count, len(doc[0].get_drawings()) if doc.page_count else 0


def render_pdf(path: str, target: str) -> str:
    import fitz
    with fitz.open(path) as doc:
        page = doc[0]
        # 200 dpi as the GUIDE says, but never more than 6000 px on the long side (a 1:1 sheet would not fit in memory).
        zoom = min(200 / 72, 6000 / max(page.rect.width, page.rect.height))
        page.get_pixmap(matrix=fitz.Matrix(zoom, zoom)).save(target)
    return target


def dxf_info(path: str):
    import ezdxf
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    inserts = len(msp.query('INSERT'))
    lo, hi = doc.header.get('$EXTMIN'), doc.header.get('$EXTMAX')
    box = None
    if lo and hi and hi[0] > lo[0] and hi[1] > lo[1] and hi[0] - lo[0] < 1e7:
        box = [lo[0], lo[1], hi[0], hi[1]]
    else:
        from ezdxf import bbox
        ext = bbox.extents(msp)
        if ext.has_data:
            box = [ext.extmin.x, ext.extmin.y, ext.extmax.x, ext.extmax.y]
    return inserts, box


def pick_route(ext: str, path: str, second: bool) -> str:
    """GUIDE section 1, from what the file itself shows."""
    if second:
        return 'dual'
    if ext in BITMAP:
        return 'cadshot' if is_dark(path) else 'image'
    if ext == '.svg':
        return 'building'
    if ext == '.pdf':
        pages, drawings = pdf_info(path)
        # A scan or a bitmap export has (almost) no vector paths; a CAD PDF has hundreds or thousands.
        if drawings < 30:
            return 'image'
        return 'cadpair' if pages > 1 else 'cad'
    if ext == '.dxf':
        inserts, _ = dxf_info(path)
        return 'dxf-layout' if inserts > 80 else 'cad'
    return 'image'


def scale_args(totalWidth, totalHeight, scale):
    args = []
    if totalWidth: args += ['--total-width', totalWidth]
    if totalHeight: args += ['--total-height', totalHeight]
    if scale: args += ['--scale', scale]
    return args


def read_draft(out: str):
    for name in ('draft.json', 'building_draft.json'):
        path = os.path.join(out, name)
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                return json.load(f)
    raise RecognizeError(422, '识别失败：没有生成户型初稿')


def recognize_plan(run: Run, route: str, src: str, ext: str, sizes: dict, names: Optional[str]):
    """One plan through its route; returns (draft, out folder, overlay path, underlay fallback image)."""
    tmp = run.tmp
    if route == 'image':
        image = render_pdf(src, os.path.join(tmp, 'page.png')) if ext == '.pdf' else src
        if ext == '.pdf':
            run.notes.append('PDF 里只有位图：按 200dpi 渲成图片走位图路线')
        out = os.path.join(tmp, 'analysis')
        proc = run.script('analyze.py', image, '--out', out, *scale_args(**sizes))
        summary = last_json(proc.stdout or '')
        if summary and summary.get('scale_from'):
            run.notes.append(f"比例来源：{summary['scale_from']}（{summary.get('mmPerPx')} mm/px）")
        return read_draft(out), out, os.path.join(out, 'analysis.png'), image
    if route == 'cadshot':
        shot = os.path.join(tmp, 'shot')
        proc = run.script('cadshot.py', src, '--out', shot, check=False)
        info = last_json(proc.stdout or '') or {}
        out = os.path.join(tmp, 'analysis')
        args = ['--wall-color', 'cyan']
        if sizes.get('scale'):
            args += ['--scale', sizes['scale']]
        elif info.get('mmPerPx'):
            args += ['--scale', info['mmPerPx']]
            run.notes.append(f"黑底 CAD 截图：按轴网定比例 {info['mmPerPx']} mm/px")
        else:
            args += scale_args(sizes.get('totalWidth'), sizes.get('totalHeight'), None)
            run.notes.append('黑底 CAD 截图：没有轴网尺寸，比例按总尺寸 / 估算；墙按青色双线识别')
        run.script('analyze.py', src, '--out', out, *args)
        return read_draft(out), out, os.path.join(out, 'analysis.png'), src
    if route == 'cad':
        out = os.path.join(tmp, 'cad')
        proc = run.script('cadvec.py', src, '--out', out, *scale_args(**sizes), check=False)
        text = (proc.stdout or '') + (proc.stderr or '')
        if proc.returncode == 0 and os.path.exists(os.path.join(out, 'draft.json')) and '没认出墙厚' not in text:
            summary = last_json(proc.stdout or '') or {}
            if summary.get('scale_from'):
                run.notes.append(f"比例来源：{summary['scale_from']}")
            return read_draft(out), out, os.path.join(out, 'cad.png'), os.path.join(out, 'underlay.png')
        # GUIDE section 1: cadvec could not find the wall thickness → cadpair (PDF) / cadsplit (DXF).
        run.notes.append('cadvec 没认出墙：改用兜底路线 ' + ('cadpair' if ext == '.pdf' else 'cadsplit'))
        return recognize_plan(run, 'cadpair' if ext == '.pdf' else 'building', src, ext, sizes, names)
    if route == 'cadpair':
        if ext != '.pdf':
            raise RecognizeError(422, 'cadpair 路线只接受矢量 PDF')
        out = os.path.join(tmp, 'pair')
        args = ['--out', out]
        if sizes.get('scale'): args += ['--scale', sizes['scale']]
        elif sizes.get('totalWidth'): args += ['--total-width', sizes['totalWidth']]
        else: raise RecognizeError(422, '这份 PDF 要走 cadpair 路线，需要外墙外皮总宽（mm）定比例')
        if names: args += ['--names', names]
        run.script('cadpair.py', src, *args)
        return read_draft(out), out, os.path.join(out, 'pair0.png'), src
    if route == 'building':
        out = os.path.join(tmp, 'split')
        args = ['--out', out]
        if ext == '.pdf':
            if sizes.get('scale'): args += ['--scale', sizes['scale']]
            elif sizes.get('totalWidth'): args += ['--ref-dim', sizes['totalWidth']]
            else: raise RecognizeError(422, '多层 PDF 要走 cadsplit 路线，需要第一张平面最外道总尺寸（mm）')
        if names: args += ['--names', names]
        run.script('cadsplit.py', src, *args)
        return read_draft(out), out, os.path.join(out, 'check0.png'), os.path.join(out, 'floor0.png')
    if route == 'dxf-layout':
        draft, out, overlay, fallback = recognize_plan(run, 'cad', src, ext, sizes, names)
        inserts, box = dxf_info(src)
        inventory = None
        if box:
            inv = os.path.join(tmp, 'inv')
            proc = run.script('dxfinventory.py', src, '--box', *box, '--out', inv, check=False)
            if proc.returncode == 0:
                inventory = summarize_inventory(inv)
                run.notes.append(f'家具布置图 DXF：{inserts} 个块，块清单随初稿给 AI 读（对应 key、位置、朝向）')
        run.inventory = inventory
        return draft, out, overlay, fallback
    raise RecognizeError(400, f'未知路线：{route}')


def summarize_inventory(folder: str):
    """dxfinventory.py's blocks and texts, short enough for the model: block name, count, size, insert points."""
    def load(name):
        try:
            with open(os.path.join(folder, name), encoding='utf-8') as f:
                return json.load(f)
        except (OSError, ValueError):
            return None
    blocks = load('blocks.json') or []
    texts = load('texts.json') or []
    items = blocks if isinstance(blocks, list) else [dict(name=k, **v) if isinstance(v, dict) else {'name': k} for k, v in blocks.items()]
    return {'blocks': items[:80], 'texts': texts[:200] if isinstance(texts, list) else texts}


def recognize(file: str, file2: Optional[str] = None, route: Optional[str] = None, totalWidth: Optional[float] = None,
              totalHeight: Optional[float] = None, scale: Optional[float] = None, names: Optional[str] = None):
    ext = os.path.splitext(file)[1].lower()
    if ext == '.dwg':
        raise RecognizeError(415, 'DWG 暂不支持，请在 CAD 里另存为 DXF（最准）或导出 PDF / SVG 后上传')
    if ext not in BITMAP | VECTOR:
        raise RecognizeError(415, f'不支持的文件类型：{ext or "未知"}')
    if route and route not in ROUTES:
        raise RecognizeError(400, f'路线只能是 {"、".join(sorted(ROUTES))}')
    ext2 = os.path.splitext(file2)[1].lower() if file2 else ''
    if file2 and ext2 not in BITMAP | {'.pdf'}:
        raise RecognizeError(415, '第二张图（装修平面布置图）请用图片或 PDF')
    second = bool(file2)

    # The scripts' working files go to a temporary folder; the uploads themselves are the caller's.
    with tempfile.TemporaryDirectory() as tmp:
        src = file
        run = Run(tmp)
        chosen = route or pick_route(ext, src, second)
        plan_route = pick_route(ext, src, False) if chosen == 'dual' else chosen
        sizes = {'totalWidth': totalWidth, 'totalHeight': totalHeight, 'scale': scale}
        draft, out, overlay, fallback = recognize_plan(run, plan_route, src, ext, sizes, names)

        layout_image = None
        if chosen == 'dual' and second:
            # route-dual.md: walls from the original, furniture from the layout plan; its dimension chains
            # (dimticks.py) let the model place what it reads there in the original's coordinates.
            src2 = file2
            image2 = render_pdf(src2, os.path.join(tmp, 'layout.png')) if ext2 == '.pdf' else src2
            ticks = os.path.join(tmp, 'ticksB')
            run.script('dimticks.py', image2, '--out', ticks, check=False)
            layout_image = jpeg_url(image2)[0]
            run.notes.append('两张图：墙按原图，家具按装修平面布置图（随初稿给 AI 读）')

        warnings = run.warnings[-10:]
        if not totalWidth and not totalHeight and not scale and plan_route in ('image', 'cadshot'):
            warnings.append('未提供总尺寸，比例为自动估算，请核对墙长')

        underlay, underlays = None, None
        if isinstance(draft.get('floors'), list) and len(draft['floors']) == 1:
            # One floor found: an ordinary single-floor spec.
            floor = draft.pop('floors')[0]
            floor.pop('name', None)
            draft = {**draft, **floor}
        if isinstance(draft.get('floors'), list):
            underlays = []
            for floor in draft['floors']:
                ul = floor.pop('underlay', None)
                underlays.append(pack_underlay(ul, out, fallback) if ul and ul.get('mmPerPx') else None)
            if not any(underlays):
                underlays = None
        ul = draft.pop('underlay', None)
        if ul and ul.get('mmPerPx'):
            underlay = pack_underlay(ul, out, fallback)
        overlay_path = overlay if overlay and os.path.exists(overlay) else None
        return {'route': chosen, 'planRoute': plan_route, 'draft': draft, 'underlay': underlay, 'underlays': underlays,
                'overlayPng': jpeg_url(overlay_path, 1400)[0] if overlay_path else None,
                'warnings': warnings, 'notes': run.notes, 'steps': run.steps,
                **({'inventory': run.inventory} if run.inventory else {}),
                **({'layoutImage': layout_image} if layout_image else {})}


def main():
    parser = argparse.ArgumentParser(description='Read a floor plan into a HouseSpec draft (one JSON line on stdout).')
    parser.add_argument('--file', required=True)
    parser.add_argument('--file2')
    parser.add_argument('--route')
    parser.add_argument('--total-width', type=float)
    parser.add_argument('--total-height', type=float)
    parser.add_argument('--scale', type=float)
    parser.add_argument('--names')
    a = parser.parse_args()
    try:
        result = recognize(a.file, a.file2, a.route, a.total_width, a.total_height, a.scale, a.names)
    except RecognizeError as error:
        result = {'error': str(error), 'status': error.status}
    # UTF-8 bytes whatever the console code page is (the server parses the last line).
    sys.stdout.flush()
    sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False) + '\n').encode('utf-8'))
    sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
