Create 6 interior render prompts (multiple angles) for the same interior renovation.
Use realistic interior design language (lighting, materials, style, camera lens).

Inputs:
Plan (may be empty):
{{planJson}}

2D SVG (may be empty):
```svg
{{svg2d}}
```

Preset render requirements (must be reflected in the prompts):
- photorealistic interior render, ultra realistic materials, high quality lighting
- clean composition, no watermark, no text overlay
- include camera details (lens, angle, shot distance), and lighting (time of day / HDRI / softbox)

Return ONLY this JSON code block (no extra text):
```json
{ "type": "cad_images", "prompts": [ { "title": "客厅-广角", "prompt": "..." } ] }
```
