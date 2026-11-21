# FAQ

The questions asked most often. If yours is not here, you are welcome to open an issue on GitHub.

## Do I need my own model API?

Yes. Enter your own model service's address and key in Settings → Models; any OpenAI-compatible endpoint works. CanvasAnvil itself is free and never handles your key. See [Connecting a model](/docs/models).

## Where is my data kept?

Works and conversations are kept in your own computer's browser (IndexedDB) and are never uploaded to CanvasAnvil's servers. Before clearing your browser's data, export a copy from Settings → Data.

## Are works saved automatically?

Yes. What is on screen is what is kept: every change is written to your browser, so a reload loses nothing, and a work appears in My works once it has content. There is no Save to press. See [Works and saving](/docs/works).

## Can other software open the exported files?

Yes. Diagrams export `.drawio` files that keep editing in any draw.io; interior design exports DXF drawings, a drawing set PDF and a quote; slides can export an editable `.pptx` where every word can be changed.

## How do I use it with Claude Code or Codex?

CanvasAnvil is also a plugin. Two commands add its marketplace and install it, and the canvases open right from your chat. See [Canvases in coding agents](/docs/skills).

## Why did the spot I circled come out wrong?

First look at the "AI read the edit as: …" line in the conversation. If that sentence is already wrong, the marks were misread: circle more tightly, or write a few words beside them. If the sentence is right but the picture is not, try another image model. See [Editing by annotation](/docs/canvas-edit).

## After tidying, I prefer the model's original layout. What now?

The "Layout correction" step in the conversation switches between "Corrected" and "Model's layout". Once you switch back, the background relayout will not overwrite it.

## Why is there no button to upload a floor plan?

Recognising a floor plan needs Python on the server with its dependencies (`pip install -r server/recognizer/requirements.txt`). Without them the button does not appear. The Docker image includes them.

## Can I use it commercially?

Yes. The project is open source under the MIT licence, for personal and commercial use alike; just keep the copyright notice.
