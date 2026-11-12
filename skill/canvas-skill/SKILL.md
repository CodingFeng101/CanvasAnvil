---
name: canvas-skill
description: Open and use CanvasAnvil's native Excalidraw canvas, generate images with the host image tool (or the configured image API when the host has none), and revise selected images from drawn annotations.
---

# Canvas Skill

Use the `canvasanvil_canvas` MCP tools and the native widget. The widget reuses CanvasAnvil's Excalidraw CanvasBoard, annotation compositor, image placement and version strip.

## Open

Call `render_canvas_widget` once with the absolute active user workspace as `projectDir`. Reuse the current canvas for subsequent requests. Showing it to the user is your job, in this order: (1) a host that renders MCP App widgets shows the canvas in the conversation; (2) otherwise open the returned `browserUrl` yourself, right away, in the host's built-in browser or preview pane where the user can see it; (3) if you have no such tool, call `render_canvas_widget` again with `launch: true` to open the user's default browser; (4) hand the URL to the user only if all of that fails. The result's `next` repeats this. If the MCP tools are not loaded (a newly installed plugin may need a host restart), use the command line instead (Node 20+): `node <cli> open canvas <projectDir>` prints the canvas URL (open it yourself in the built-in browser, or add `--launch` to open the user's default browser), and `node <cli> call <tool> @args.json` runs any tool below with the same arguments. `<cli>` is `<plugin-dir>/scripts/canvas.mjs` in the plugin, or `<skill-dir>/runtime/scripts/canvas.mjs` when this skill folder is used on its own. The canvas page must stay open: it captures annotations, places images and saves the user's edits.

## Generate and edit

The user gives generation and editing instructions directly in the Codex conversation. For a new image, use the host image tool (or `generate_canvas_image`, see below), inspect its local output, then call `insert_canvas_image` with a new stable `operationId` to place it on the open canvas.

For edits to a canvas image, keep the widget open and use the same `projectDir` that opened it.

1. Call `get_canvas_selection` to identify the current image. Call `get_canvas_request` with a new stable `requestId` and the user's chat instruction as `prompt` to capture that selection and its nearby annotations. Read the same request ID until `status` is `pending`. While `capturing`, allow the open widget time to prepare the snapshot. If it stays `capturing`, report that the widget needs to be open and responsive. If it is `failed`, report its error and resolve the selection issue before creating a new request. A ready request includes absolute reference-image paths and verbatim annotation text.
2. For edits, inspect the clean original and annotated preview. Apply only the requested change, preserving other content and the image's aspect ratio. Quote requested replacement text exactly. The output should be a clean image with the annotations removed.
3. Use the host's image generation/editing tool. Respect its access checks. Without one, call `generate_canvas_image` with the `requestId` and, as `prompt`, the change in plain words; it sends the clean original as the reference with the website's edit prompt. Use the newly generated local image path, inspect the result, and report any observed unintended changes.
4. Call `insert_canvas_image` with `projectDir`, `requestId`, `imagePath`, a brief `note` and a stable `operationId`. Use the request ID as the operation ID for that request. Reuse the same operation ID when retrying.
5. The open widget inserts the image using the website's existing placement logic, links the version family and removes the consumed annotations. Check `get_canvas_selection` for the operation's `applied` status. A pending operation needs the existing widget open to finish placement. Reopen it only when the user asks or it has been closed.

If generation fails, call `fail_canvas_request` with the request ID and the actual error, then report that failure in chat. A failed request leaves the source image and scene intact.

For an image supplied directly in chat, call `insert_canvas_image` with a new stable operation ID. Add `sourceElementId` for a revision of an existing image when a canvas annotation snapshot is unnecessary. Use `get_canvas_selection` to identify that source. Keep each user's request separate, and preserve original image files.

## Hosts without an image tool

`generate_canvas_image` draws through the image API the user configured, with the website's own image routes: a new image goes to `/images/generations`, an edit to `/images/edits` with the captured original, each falling back to chat completions. Pass `size` (`auto`, `1024x1024`, `1536x1024`, `1024x1536`, ...) and `quality` (`auto`, `low`, `medium`, `high`) when the user asks for them. It returns `imagePath`; place it with `insert_canvas_image` as above.

The API is configured in `config/image-provider.json` (`{"apiKey","model","baseUrl"}`, copy `config/image-provider.example.json`), in the plugin or this skill folder, or the file named by `CANVAS_IMAGE_CONFIG`. The user fills it in themselves; never ask for the key in chat. When neither a host image tool nor this config exists, tell the user which file to fill in.

## Persistence

The MCP server saves the authoritative Excalidraw scene, selection, requests and operation status in `<projectDir>/canvas/canvas.json`, with image files under `canvas/assets/`. The widget reads and writes through MCP. Scene writes use revision checks to prevent overwriting another widget's updates. If a revision conflict occurs, tell the user and reopen to load the saved version.

The website canvas code remains the source of truth. Maintainers rebuild the plugin with `node scripts/sync-canvas-skill.mjs` in the CanvasAnvil checkout. The installed plugin needs Node 20+ and includes its runtime dependencies and UI assets.
