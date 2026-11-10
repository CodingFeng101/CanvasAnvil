---
name: canvas-skill
description: Open and use CanvasAnvil's native Excalidraw widget in Codex, generate images with the host model, and revise selected images from drawn annotations.
---

# Canvas Skill

Use the `canvasanvil_canvas` MCP tools and the native widget. The widget reuses CanvasAnvil's Excalidraw CanvasBoard, annotation compositor, image placement and version strip.

## Open

Call `render_canvas_widget` once with the absolute active user workspace as `projectDir`. Reuse the current canvas for subsequent requests. A host that renders MCP App widgets shows the canvas in the conversation; otherwise open the returned `browserUrl` in the built-in browser, or give that URL to the user. If the MCP tools are not loaded (a newly installed plugin may need a host restart), use the command line instead: `node <plugin-dir>/scripts/canvas.mjs open canvas <projectDir>` prints the canvas URL, and `node <plugin-dir>/scripts/canvas.mjs call <tool> @args.json` runs any tool below with the same arguments. The canvas page must stay open: it captures annotations, places images and saves the user's edits.

## Generate and edit

The user gives generation and editing instructions directly in the Codex conversation. For a new image, use the host image tool, inspect its local output, then call `insert_canvas_image` with a new stable `operationId` to place it on the open canvas.

For edits to a canvas image, keep the widget open and use the same `projectDir` that opened it.

1. Call `get_canvas_selection` to identify the current image. Call `get_canvas_request` with a new stable `requestId` and the user's chat instruction as `prompt` to capture that selection and its nearby annotations. Read the same request ID until `status` is `pending`. While `capturing`, allow the open widget time to prepare the snapshot. If it stays `capturing`, report that the widget needs to be open and responsive. If it is `failed`, report its error and resolve the selection issue before creating a new request. A ready request includes absolute reference-image paths and verbatim annotation text.
2. For edits, inspect the clean original and annotated preview. Apply only the requested change, preserving other content and the image's aspect ratio. Quote requested replacement text exactly. The output should be a clean image with the annotations removed.
3. Use the host's image generation/editing tool. Respect its access checks. Use the newly generated local image path, inspect the result, and report any observed unintended changes.
4. Call `insert_canvas_image` with `projectDir`, `requestId`, `imagePath`, a brief `note` and a stable `operationId`. Use the request ID as the operation ID for that request. Reuse the same operation ID when retrying.
5. The open widget inserts the image using the website's existing placement logic, links the version family and removes the consumed annotations. Check `get_canvas_selection` for the operation's `applied` status. A pending operation needs the existing widget open to finish placement. Reopen it only when the user asks or it has been closed.

If generation fails, call `fail_canvas_request` with the request ID and the actual error, then report that failure in chat. A failed request leaves the source image and scene intact.

For an image supplied directly in chat, call `insert_canvas_image` with a new stable operation ID. Add `sourceElementId` for a revision of an existing image when a canvas annotation snapshot is unnecessary. Use `get_canvas_selection` to identify that source. Keep each user's request separate, and preserve original image files.

## Persistence

The MCP server saves the authoritative Excalidraw scene, selection, requests and operation status in `<projectDir>/canvas/canvas.json`, with image files under `canvas/assets/`. The widget reads and writes through MCP. Scene writes use revision checks to prevent overwriting another widget's updates. If a revision conflict occurs, tell the user and reopen to load the saved version.

The website canvas code remains the source of truth. Maintainers rebuild the plugin with `node scripts/sync-canvas-skill.mjs` in the CanvasAnvil checkout. The installed plugin needs Node 20+ and includes its runtime dependencies and UI assets.
