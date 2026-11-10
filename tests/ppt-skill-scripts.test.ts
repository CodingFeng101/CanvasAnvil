import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

/**
 * ppt-skill's slide scripts against a local stand-in for an OpenAI-compatible image API: slides are drawn
 * several at a time, a rate-limited request is retried, reference images (template, materials, the current
 * slide for an edit) are really sent, and a slide that keeps failing is reported and redrawn with --only.
 */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const skill = path.resolve("skill/ppt-skill");

type Seen = { route: string; images: number; prompt: string };

function run(script: string, args: string[]) {
  return new Promise<{ code: number; stdout: string }>((resolve) => {
    execFile(process.execPath, [path.join(skill, "scripts", script), ...args], (error, stdout) => {
      resolve({ code: error ? Number((error as { code?: number }).code ?? 1) : 0, stdout });
    });
  });
}

test("generate-slides draws concurrently with retries and references; edit-slide edits on the current image", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ppt-skill-"));
  const seen: Seen[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let limited = false;
  let failSlide3 = true;
  let rejectLarge = false;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const body = Buffer.concat(chunks).toString("utf8");
      const images = (body.match(/name="image(\[\])?"/g) || []).length;
      const prompt = body.match(/name="prompt"\r\n\r\n([\s\S]*?)\r\n--/)?.[1] ?? "";
      seen.push({ route: req.url!, images, prompt });
      setTimeout(() => {
        inFlight -= 1;
        if (prompt.includes("Title: 第二页") && !limited) {
          limited = true;
          res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "rate limit" } }));
          return;
        }
        const chatImages = (body.match(/data:image/g) || []).length;
        if (rejectLarge && (images >= 4 || chatImages >= 4)) {
          res.writeHead(413, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "payload too large" } }));
          return;
        }
        if (prompt.includes("Title: 第三页") && failSlide3) {
          res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "bad prompt" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [{ b64_json: PNG }] }));
      }, 80);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const config = path.join(dir, "image.json");
    await writeFile(config, JSON.stringify({ apiKey: "test", model: "gpt-image-1", baseUrl: `http://127.0.0.1:${port}/v1` }));
    await writeFile(path.join(dir, "template.png"), Buffer.from(PNG, "base64"));
    await writeFile(path.join(dir, "logo.png"), Buffer.from(PNG, "base64"));
    const titles = ["第一页", "第二页", "第三页", "第四页", "第五页"];
    await writeFile(path.join(dir, "plan.json"), JSON.stringify({
      language: "zh", template: "template.png", materials: { 标志: "logo.png" },
      slides: titles.map((title, i) => ({
        id: `slide-${i + 1}`, title, content: ["要点"], layout: "", note: "",
        description: i === 0 ? "封面，放 {{image:标志}}" : "示意图",
      })),
    }));
    const plan = path.join(dir, "plan.json");

    const first = await run("generate-slides.mjs", ["--plan", plan, "--concurrency", "2", "--config-file", config]);
    assert.equal(first.code, 2, first.stdout);
    assert.match(first.stdout, /--only slide-3/);
    assert.ok(maxInFlight <= 2 && maxInFlight === 2, `in flight ${maxInFlight}`);
    const edits = seen.filter((s) => s.route === "/v1/images/edits");
    // A template means the edits route; a failed edit falls back to chat, as on the website.
    assert.ok(seen.every((s) => s.route === "/v1/images/edits" || s.route === "/v1/chat/completions"));
    assert.equal(edits.find((s) => s.prompt.includes("Title: 第一页"))!.images, 2, "template + material");
    assert.equal(edits.find((s) => s.prompt.includes("Title: 第四页"))!.images, 1, "template only");
    assert.equal(edits.filter((s) => s.prompt.includes("Title: 第二页")).length, 2, "the 429 was retried");
    let manifest = JSON.parse(await readFile(path.join(dir, "slides.manifest.json"), "utf8"));
    assert.deepEqual(manifest.slides.map((s: { status: string }) => s.status), ["ok", "ok", "failed", "ok", "ok"]);

    failSlide3 = false;
    const retry = await run("generate-slides.mjs", ["--plan", plan, "--only", "slide-3", "--config-file", config]);
    assert.equal(retry.code, 0, retry.stdout);
    manifest = JSON.parse(await readFile(path.join(dir, "slides.manifest.json"), "utf8"));
    assert.deepEqual(manifest.slides.map((s: { slideId: string; status: string }) => `${s.slideId}:${s.status}`),
      ["slide-1:ok", "slide-2:ok", "slide-3:ok", "slide-4:ok", "slide-5:ok"]);

    seen.length = 0;
    const edit = await run("edit-slide.mjs", ["--plan", plan, "--slide", "slide-4", "--mode", "edit", "--instruction", "标题改成红色", "--config-file", config]);
    assert.equal(edit.code, 0, edit.stdout);
    assert.equal(seen.length, 1);
    assert.match(seen[0].prompt, /Edit the current slide image/);
    assert.match(seen[0].prompt, /标题改成红色/);
    assert.equal(seen[0].images, 2, "current slide + template");

    // A style reference and a chat picture go along with the website's wording; when that request is
    // rejected, the edit is tried again with the current slide and the template alone.
    seen.length = 0;
    rejectLarge = true;
    // A different picture from the drawn slides (all mock images are the same bytes and would be de-duplicated).
    await writeFile(path.join(dir, "chat.png"), Buffer.concat([Buffer.from(PNG, "base64"), Buffer.from([0])]));
    await writeFile(path.join(dir, "edits.json"), JSON.stringify([
      { slideId: "slide-5", mode: "edit", instruction: "换成蓝色", refs: ["chat.png"], styleRefs: ["slide-2"] },
    ]));
    const styled = await run("edit-slide.mjs", ["--plan", plan, "--edits", path.join(dir, "edits.json"), "--config-file", config]);
    assert.equal(styled.code, 0, styled.stdout);
    const large = seen.filter((s) => s.images === 4);
    assert.ok(large.length >= 1, "base + style ref + chat picture + template");
    assert.match(large[0].prompt, /STYLE_REF_SLIDE_slide-2 => slide-2[\s\S]*仅参考风格/);
    assert.match(large[0].prompt, /对话图1。请把它们放进画面并保持原貌/);
    assert.equal(seen.at(-1)!.images, 2, "fallback: current slide + template");
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the skill's bundled prompts are the website's current ones (run scripts/sync-ppt-skill.mjs if not)", async () => {
  const website = await import("../client/workspaces/ppt/lib/slide-prompts.ts");
  const bundled = (await import("../skill/ppt-skill/scripts/lib/website-prompts.mjs" as string)) as typeof website;
  const page = { id: "slide-1", title: "标题", content: ["一", "二"], description: "封面 {{image:标志}}" };
  for (const hasTemplate of [true, false]) {
    const draw = { page, uiLanguage: "zh" as const, hasTemplate, materialLabels: ["标志"], extraRequirements: "更大" };
    assert.equal(bundled.buildPageImagePrompt(draw), website.buildPageImagePrompt(draw));
    const edit = { page, instruction: "改红", hasTemplate, hasAdditional: true };
    assert.equal(bundled.buildEditPagePrompt(edit), website.buildEditPagePrompt(edit));
    for (const mode of ["idea", "outline"] as const) {
      const plan = { mode, input: "主题", uiLanguage: "zh" as const, hasTemplate, referenceText: "r", imageAssetText: "a" };
      assert.equal(bundled.buildPlanPrompt(plan), website.buildPlanPrompt(plan));
    }
  }
});

test("extract-figures takes MinerU's figures in markdown order with their captions, and skips without a token", async () => {
  const JSZip = (await import("jszip")).default;
  const dir = await mkdtemp(path.join(os.tmpdir(), "ppt-mineru-"));
  const zip = new JSZip();
  zip.file("out/full.md", "# 论文\n\n![图1 系统架构](images/arch.png)\n\n正文\n\n![](images/result.jpg)\n");
  zip.file("out/images/arch.png", Buffer.from(PNG, "base64"));
  zip.file("out/images/result.jpg", Buffer.from(PNG, "base64"));
  zip.file("out/images/unused.png", Buffer.from(PNG, "base64"));
  const zipBytes = await zip.generateAsync({ type: "nodebuffer" });
  let uploaded = 0;
  let polls = 0;
  const server = http.createServer((req, res) => {
    const json = (body: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    req.resume();
    req.on("end", () => {
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      if (req.method === "POST" && req.url === "/api/v4/file-urls/batch") {
        assert.equal(req.headers.authorization, "Bearer mtoken");
        json({ code: 0, data: { batch_id: "b1", file_urls: [`${base}/upload`] } });
      } else if (req.method === "PUT" && req.url === "/upload") {
        uploaded += 1;
        res.writeHead(200).end();
      } else if (req.url === "/api/v4/extract-results/batch/b1") {
        polls += 1;
        json({ code: 0, data: { extract_result: [polls < 2 ? { state: "running" } : { state: "done", full_zip_url: `${base}/result.zip` }] } });
      } else if (req.url === "/result.zip") {
        res.writeHead(200, { "content-type": "application/zip" }).end(zipBytes);
      } else res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    await writeFile(path.join(dir, "paper.pdf"), "%PDF-1.4 test");
    const none = await run("extract-figures.mjs", ["--config-file", path.join(dir, "missing.json"), "--out-dir", path.join(dir, "m0"), path.join(dir, "paper.pdf")]);
    assert.equal(none.code, 0);
    assert.match(none.stdout, /not configured/);
    await writeFile(path.join(dir, "fp.json"), JSON.stringify({ mineruToken: "mtoken", baseUrl: `http://127.0.0.1:${port}` }));
    const done = await run("extract-figures.mjs", ["--config-file", path.join(dir, "fp.json"), "--out-dir", path.join(dir, "m"), path.join(dir, "paper.pdf")]);
    assert.equal(done.code, 0, done.stdout);
    assert.equal(uploaded, 1);
    const figures = JSON.parse(await readFile(path.join(dir, "m", "figures.json"), "utf8"));
    assert.deepEqual(figures.map((f: { label: string; file: string; textHint: string }) => [f.label, f.file, f.textHint]),
      [["FIG_1", "FIG_1.png", "图1 系统架构"], ["FIG_2", "FIG_2.jpg", ""], ["FIG_3", "FIG_3.png", ""]]);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
