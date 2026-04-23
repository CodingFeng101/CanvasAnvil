# Product Fields

Collect these fields before generation.

## Required

- `product_name`
- `size` or `aspect_ratio`
- `style_direction`
- `color_direction`
- `selling_points`
- `product_image_status`

## Optional

- `headline`
- `subtitle`
- `body_copy`
- `cta`
- `background_type`
- `lighting_direction`
- `composition`
- `focal_area`
- `reference_image_status`
- `reference_image_url`
- `product_image_url`
- `export_format`

## Rule

If any required field is missing, ask follow-up questions before generation.

If `reference_image_status` is positive, request `reference_image_url` before generation.

If `product_image_status` is positive, request `product_image_url` before generation.
