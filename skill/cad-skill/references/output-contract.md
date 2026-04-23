# Output Contract

## `cad_plan`

Expected file:

- `cad_plan.json`

## `2d_svg`

Expected files:

- `floorplan.svg`
- `floorplan.png`

Optional:

- `floorplan.jpg`

## `cad_bom`

Expected file:

- `cad_bom.csv`

## `images`

Expected files:

- generated board or render images
- prompt text files
- metadata JSON

## Rule

Generate one workflow step per turn. Do not merge plan, SVG, BOM, and image generation into one artifact.
