# floorplan-recognizer

Turns an existing floorplan (PNG/JPG photo or screenshot, vector PDF, DXF) into a HouseSpec draft for the house designer.
`vendor/hpd_scripts` holds every recognition script of the house designer (MIT, see LICENSE there), synced from `skill/cad-skill/designer/scripts` by `node scripts/sync-cad-skill.mjs`; do not edit them here.

The route follows the designer's GUIDE section 1, picked from the input (or forced with the `route` form field):

| Input | Route | Scripts |
|---|---|---|
| plan image, screenshot, scan, bitmap-only PDF | `image` | `analyze.py` |
| black CAD screenshot | `cadshot` | `cadshot.py` (axes → scale) + `analyze.py --wall-color cyan` |
| vector PDF, DXF | `cad` | `cadvec.py`; when it finds no wall thickness, `cadpair.py` (PDF) / `cadsplit.py` (DXF) |
| multi-page vector PDF (a floor per page) | `cadpair` | `cadpair.py` (needs `totalWidth` or `scale`) |
| several floors on one sheet, SVG, outlined walls | `building` | `cadsplit.py` (PDF needs `totalWidth` = the first plan's outer dimension) |
| furniture-layout DXF (many blocks) | `dxf-layout` | `cadvec.py` + `dxfinventory.py` (block list for the model) |
| original + layout plan (`file2`) | `dual` | the original's route + `dimticks.py` on the layout plan (returned as `layoutImage`) |

The response carries `route`, `draft` (HouseSpec; a building has `floors`), `underlay` or `underlays` (one per floor), `overlayPng`, `notes`, `warnings`, `steps` and, by route, `inventory` / `layoutImage`.

```bash
pip install -r requirements.txt
uvicorn app:app --port 8090
```

Then start CanvasAnvil with `RECOGNIZER_URL=http://127.0.0.1:8090`. Without it the upload button stays hidden.
