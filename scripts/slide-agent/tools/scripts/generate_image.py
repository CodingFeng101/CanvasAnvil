#!/usr/bin/env python3
"""Generate or edit one image through an OpenAI-compatible Images API.

Use this when the agent runtime has no image tool of its own (Claude Code, for
example). Codex can keep using its built-in image generation instead.

A reference image makes the request an edit (`/images/edits`), which is what
clean bases and style-matched asset sheets need. Without one it is a fresh
generation (`/images/generations`). Some OpenAI-compatible gateways serve images
only through `/chat/completions`; `--route auto` falls back to that when the
images endpoint does not exist.

Configuration comes from the environment, so keys never appear on the command
line:

  SLIDE_AGENT_IMAGE_API_KEY   (falls back to OPENAI_API_KEY)
  SLIDE_AGENT_IMAGE_BASE_URL  (falls back to OPENAI_BASE_URL, then https://api.openai.com/v1)
  SLIDE_AGENT_IMAGE_MODEL     (default gpt-image-2)
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image


DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-image-2"
# Status codes that mean "this gateway has no such endpoint", not "the request failed".
MISSING_ENDPOINT = {404, 405, 501}


class ImageApiError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(f"HTTP {status}: {message}" if status else message)
        self.status = status


def load_config(model_override=None):
    key = os.environ.get("SLIDE_AGENT_IMAGE_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise ImageApiError(None, "set SLIDE_AGENT_IMAGE_API_KEY (or OPENAI_API_KEY) before generating images")
    base_url = (
        os.environ.get("SLIDE_AGENT_IMAGE_BASE_URL")
        or os.environ.get("OPENAI_BASE_URL")
        or DEFAULT_BASE_URL
    ).rstrip("/")
    model = model_override or os.environ.get("SLIDE_AGENT_IMAGE_MODEL") or DEFAULT_MODEL
    return {"key": key, "base_url": base_url, "model": model}


def read_prompt(value):
    """`@path` reads the prompt from a UTF-8 file; anything else is the prompt itself."""
    if value.startswith("@"):
        return Path(value[1:]).read_text(encoding="utf-8-sig").strip()
    return value


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    body = BytesIO()
    for name, value in fields.items():
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n".encode())
        body.write(str(value).encode("utf-8") + b"\r\n")
    for name, path in files:
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        body.write(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{path.name}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n".encode()
        )
        body.write(path.read_bytes() + b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())
    return body.getvalue(), f"multipart/form-data; boundary={boundary}"


def send(config, path, body, content_type, timeout):
    request = urllib.request.Request(
        config["base_url"] + path,
        data=body,
        headers={"Authorization": f"Bearer {config['key']}", "Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("error", detail)
            if isinstance(detail, dict):
                detail = detail.get("message", detail)
        except (ValueError, AttributeError):
            pass
        raise ImageApiError(error.code, str(detail)[:500]) from None


def fetch(url, timeout):
    if url.startswith("data:image"):
        return base64.b64decode(url.split(",", 1)[1])
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


def images_route(config, prompt, references, size, timeout):
    if references:
        fields = {"model": config["model"], "prompt": prompt}
        if size:
            fields["size"] = size
        name = "image" if len(references) == 1 else "image[]"
        body, content_type = multipart(fields, [(name, path) for path in references])
        result = send(config, "/images/edits", body, content_type, timeout)
    else:
        payload = {"model": config["model"], "prompt": prompt}
        if size:
            payload["size"] = size
        result = send(config, "/images/generations", json.dumps(payload).encode(), "application/json", timeout)
    item = (result.get("data") or [{}])[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"])
    if item.get("url"):
        return fetch(item["url"], timeout)
    raise ImageApiError(None, "the images endpoint returned no image")


def chat_route(config, prompt, references, timeout):
    content = [{"type": "text", "text": prompt}]
    for path in references:
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        data = base64.b64encode(path.read_bytes()).decode()
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}})
    payload = {"model": config["model"], "messages": [{"role": "user", "content": content}], "stream": False}
    result = send(config, "/chat/completions", json.dumps(payload).encode(), "application/json", timeout)
    message = (result.get("choices") or [{}])[0].get("message", {}).get("content")
    parts = message if isinstance(message, list) else [{"type": "text", "text": message or ""}]
    for part in parts:
        if part.get("type") == "image_url":
            return fetch(part["image_url"]["url"], timeout)
    for part in parts:
        text = part.get("text") or ""
        match = re.search(r"!\[[^\]]*\]\(([^)\s]+)\)", text) or re.search(r"(data:image/[^\s)]+|https?://\S+)", text)
        if match:
            return fetch(match.group(1), timeout)
    raise ImageApiError(None, "the chat endpoint returned no image")


def generate(prompt, references=(), route="auto", size=None, model=None, timeout=600):
    """Return (png_bytes, route_used)."""
    config = load_config(model)
    references = [Path(path) for path in references]
    for path in references:
        if not path.is_file():
            raise ImageApiError(None, f"reference image not found: {path}")
    if route in ("auto", "images"):
        try:
            return images_route(config, prompt, references, size, timeout), "images"
        except ImageApiError as error:
            if route == "images" or error.status not in MISSING_ENDPOINT:
                raise
    return chat_route(config, prompt, references, timeout), "chat"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("prompt", help="Prompt text, or @path to read it from a UTF-8 file")
    ap.add_argument("output_png")
    ap.add_argument("--reference", action="append", default=[], help="Image to edit; repeat for more references")
    ap.add_argument("--route", choices=("auto", "images", "chat"), default="auto")
    ap.add_argument("--size", help="Pass an explicit size such as 1536x1024; omitted by default")
    ap.add_argument("--model", help="Override SLIDE_AGENT_IMAGE_MODEL")
    ap.add_argument("--timeout", type=float, default=600)
    args = ap.parse_args()

    started = time.time()
    try:
        data, route = generate(read_prompt(args.prompt), args.reference, args.route, args.size, args.model, args.timeout)
    except ImageApiError as error:
        sys.exit(f"image generation failed: {error}")
    try:
        image = Image.open(BytesIO(data))
        image.load()
    except Exception:
        sys.exit("image generation failed: the response was not a readable image")

    out = Path(args.output_png)
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, format="PNG")
    print(json.dumps({
        "output": str(out),
        "size": list(image.size),
        "route": route,
        "edit": bool(args.reference),
        "seconds": round(time.time() - started, 1),
    }))


if __name__ == "__main__":
    main()
