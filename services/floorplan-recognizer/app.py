"""Floorplan recognizer: wraps the house designer's recognition scripts (MIT, vendor/hpd_scripts).

POST /recognize  multipart: file, totalWidth?, totalHeight?, scale?
  bitmap (png/jpg/webp)   -> analyze.py
  vector (pdf/dxf)        -> cadvec.py
  dwg                     -> 415 (convert to DXF or PDF first)
Returns {draft, underlay, overlayPng, warnings}. `draft` is a HouseSpec (walls with
openings, no rooms yet); `underlay` is ready for the designer preset.
"""
import base64, json, os, subprocess, sys, tempfile
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image

SCRIPTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor', 'hpd_scripts')
BITMAP = {'.png', '.jpg', '.jpeg', '.webp', '.bmp'}
VECTOR = {'.pdf', '.dxf'}
MAX_BYTES = 25 * 1024 * 1024
TIMEOUT = int(os.environ.get('RECOGNIZE_TIMEOUT', '120'))

app = FastAPI(title='floorplan-recognizer')


def data_url(path: str) -> str:
    ext = os.path.splitext(path)[1].lower().lstrip('.') or 'png'
    mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else f'image/{ext}'
    with open(path, 'rb') as f:
        return f'data:{mime};base64,' + base64.b64encode(f.read()).decode()


@app.get('/healthz')
def healthz():
    return {'ok': True}


@app.post('/recognize')
async def recognize(
    file: UploadFile = File(...),
    totalWidth: Optional[float] = Form(None),
    totalHeight: Optional[float] = Form(None),
    scale: Optional[float] = Form(None),
):
    ext = os.path.splitext(file.filename or '')[1].lower()
    if ext == '.dwg':
        raise HTTPException(415, 'DWG 暂不支持，请在 CAD 里另存为 DXF 或导出 PDF 后上传')
    if ext not in BITMAP | VECTOR:
        raise HTTPException(415, f'不支持的文件类型：{ext or "未知"}')
    body = await file.read()
    if len(body) > MAX_BYTES:
        raise HTTPException(413, '文件超过 25MB')

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'input' + ext)
        out = os.path.join(tmp, 'out')
        with open(src, 'wb') as f:
            f.write(body)
        script = 'analyze.py' if ext in BITMAP else 'cadvec.py'
        args = [sys.executable, os.path.join(SCRIPTS, script), src, '--out', out]
        if totalWidth: args += ['--total-width', str(totalWidth)]
        if totalHeight: args += ['--total-height', str(totalHeight)]
        if scale: args += ['--scale', str(scale)]
        env = {**os.environ, 'PYTHONPATH': SCRIPTS, 'PYTHONIOENCODING': 'utf-8'}
        try:
            proc = subprocess.run(args, cwd=SCRIPTS, env=env, capture_output=True, text=True,
                                  encoding='utf-8', errors='replace', timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            raise HTTPException(504, '识别超时')
        draft_path = os.path.join(out, 'draft.json')
        if proc.returncode != 0 or not os.path.exists(draft_path):
            tail = (proc.stderr or proc.stdout or '').strip().splitlines()[-5:]
            raise HTTPException(422, f'识别失败（exit {proc.returncode}）：' + (' | '.join(tail) or '没有识别到墙体'))
        with open(draft_path, encoding='utf-8') as f:
            draft = json.load(f)

        warnings = [line for line in (proc.stderr or '').splitlines() if line.strip()][-10:]
        if not totalWidth and not totalHeight and not scale:
            warnings.append('未提供总尺寸，比例为自动估算，请核对墙长')

        ul = draft.pop('underlay', None)
        underlay = None
        if ul:
            image_path = os.path.join(out, 'underlay.png') if ext in VECTOR else src
            with Image.open(image_path) as im:
                w, h = im.size
            underlay = {'src': data_url(image_path), 'imgW': w, 'imgH': h,
                        'mmPerPx': ul['mmPerPx'], 'x': ul['x'], 'y': ul['y'],
                        'opacity': 0.5, 'visible': True, 'locked': True}
        overlay = next((os.path.join(out, n) for n in ('analysis.png', 'cad.png') if os.path.exists(os.path.join(out, n))), None)
        return {'draft': draft, 'underlay': underlay,
                'overlayPng': data_url(overlay) if overlay else None, 'warnings': warnings}
