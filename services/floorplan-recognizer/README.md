# floorplan-recognizer

Turns an existing floorplan (PNG/JPG photo or screenshot, vector PDF, DXF) into a HouseSpec draft for the house designer.
`vendor/hpd_scripts` holds `analyze.py`, `cadvec.py`, `imgio.py` and `dimtext.py` from the house designer's tools (MIT, see LICENSE there).

```bash
pip install -r requirements.txt
uvicorn app:app --port 8090
```

Then start CanvasAnvil with `RECOGNIZER_URL=http://127.0.0.1:8090`. Without it the upload button stays hidden.
