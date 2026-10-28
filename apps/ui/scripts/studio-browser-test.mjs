import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const origin = process.env.STUDIO_TEST_URL || "http://127.0.0.1:4331";
const artifacts = path.resolve(
  process.env.STUDIO_ARTIFACT_DIR || "work/studio-browser",
);
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.STUDIO_BROWSER_CHANNEL
    ? { channel: process.env.STUDIO_BROWSER_CHANNEL }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const assertOk = async (response) =>
  assert(response.ok(), `${response.status()} ${await response.text()}`);
let id;
const ids = new Set();
try {
  await page.goto(origin + "/studio?lang=zh");
  await page.getByRole("heading", { name: /我的作品/ }).waitFor();
  await page.screenshot({
    path: path.join(artifacts, "studio-home.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /产品介绍 把功能/ }).click();
  await page.getByRole("textbox", { name: "作品名称", exact: true }).waitFor();
  id = new URL(page.url()).searchParams.get("project");
  assert(id);
  ids.add(id);
  await page
    .getByRole("textbox", { name: "主标题", exact: true })
    .fill("经过验证的产品故事");
  await page
    .getByRole("textbox", { name: "旁白与字幕" })
    .fill("这是一条测试旁白。每一个画面都可以继续修改。");
  for (let index = 0; index < 4; index++) {
    await page.locator(".st-scene").nth(index).click();
    await page.getByRole("spinbutton", { name: "时长（秒）" }).fill("1");
  }
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "所有修改已保存。" })
    .waitFor();
  const snapshot = await page.request.get(
    `${origin}/api/studio/projects/${id}`,
  );
  await assertOk(snapshot);
  let project = (await snapshot.json()).project;
  assert.equal(project.revision, 2);
  assert.equal(project.document.scenes[0].title, "经过验证的产品故事");
  assert.equal(
    project.document.scenes.reduce((n, s) => n + s.durationFrames, 0),
    120,
  );
  await page.getByRole("tab", { name: "素材", exact: true }).click();
  const png = Buffer.from(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#a7c5ff";
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#223344";
      ctx.font = "30px sans-serif";
      ctx.fillText("Verified asset", 30, 100);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
    "base64",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "verified.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page
    .getByRole("status")
    .filter({ hasText: "素材已上传，可在素材面板中使用。" })
    .waitFor();
  const sampleRate = 48000,
    samples = sampleRate * 4,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++)
    wav.writeInt16LE(
      Math.round(Math.sin((n / sampleRate) * Math.PI * 2 * 440) * 2000),
      44 + n * 2,
    );
  await page.locator("input[type=file]").setInputFiles({
    name: "verified-audio.wav",
    mimeType: "audio/wav",
    buffer: wav,
  });
  await page
    .getByRole("combobox", { name: "整片配音" })
    .getByRole("option", { name: "verified-audio.wav" })
    .waitFor({ state: "attached" });
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "所有修改已保存。" })
    .waitFor();
  await page.reload();
  await page.getByRole("textbox", { name: "作品名称", exact: true }).waitFor();
  await page.locator(".st-scene").first().click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "主标题", exact: true })
      .inputValue(),
    "经过验证的产品故事",
  );
  await page.getByRole("button", { name: "版本", exact: true }).click();
  await page.getByRole("dialog", { name: "版本历史" }).waitFor();
  assert(await page.getByText("v1 · 创建项目").count());
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.screenshot({
    path: path.join(artifacts, "studio-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "导出 ↗", exact: true }).click();
  await page.getByRole("combobox", { name: "视频清晰度" }).selectOption("720");
  const downloadPromise = page.waitForEvent("download", { timeout: 180000 });
  await page.getByRole("button", { name: "导出 MP4 ↗", exact: true }).click();
  const download = await Promise.race([
    downloadPromise,
    page
      .getByRole("alert")
      .waitFor({ timeout: 180000 })
      .then(async () => {
        throw Error(await page.getByRole("alert").innerText());
      }),
  ]);
  const video = path.join(artifacts, "studio-verified.mp4");
  await download.saveAs(video);
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", video],
      { encoding: "utf8" },
    ),
  );
  const track = metadata.streams.find(
    (stream) => stream.codec_type === "video",
  );
  assert.equal(track.codec_name, "h264");
  assert.equal(track.width, 1280);
  assert.equal(track.height, 720);
  assert(Math.abs(Number(metadata.format.duration) - 4) < 0.12);
  assert(
    metadata.streams.some((stream) => stream.codec_type === "audio"),
    "Uploaded audio is encoded into the MP4",
  );
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], {
    stdio: "pipe",
  });
  const archiveDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "↓ 下载项目备份", exact: true })
    .click();
  const archive = await archiveDownload,
    archivePath = path.join(artifacts, "studio-project.arcvideo");
  await archive.saveAs(archivePath);
  await page.getByRole("button", { name: "返回作品列表" }).click();
  await page.getByRole("heading", { name: /我的作品/ }).waitFor();
  await page.locator("input[type=file]").setInputFiles(archivePath);
  await page.getByRole("textbox", { name: "作品名称", exact: true }).waitFor();
  const importedId = new URL(page.url()).searchParams.get("project");
  assert(importedId && importedId !== id);
  ids.add(importedId);
  const imported = (
    await (
      await page.request.get(`${origin}/api/studio/projects/${importedId}`)
    ).json()
  ).project;
  assert.equal(imported.document.scenes[0].title, "经过验证的产品故事");
  assert(imported.document.voice.assetId);
  assert.equal(
    (
      await (
        await page.request.get(
          `${origin}/api/studio/projects/${importedId}/assets`,
        )
      ).json()
    ).assets.length,
    2,
    "Portable backup restores original media bytes",
  );
  const clipResponse = await page.request.post(
    `${origin}/api/studio/projects/${id}/assets`,
    {
      headers: {
        origin,
        "content-type": "video/mp4",
        "x-file-name": "verified-clip.mp4",
      },
      data: readFileSync(video),
    },
  );
  await assertOk(clipResponse);
  const clip = (await clipResponse.json()).asset;
  const quality = await page.evaluate(async () => {
    const { studioTemplate } = await import("/src/studio/templates.ts");
    const { inspectStudioVideo, assertStudioPublishable } = await import(
      "/src/studio/quality.ts"
    );
    const { paintStudioFrame } = await import("/src/studio/frame.ts");
    const { prepareStudioFonts } = await import("/src/studio/layout.ts");
    const { studioCaptionCues } = await import("/src/studio/captions.ts");
    const { exportStudioCaptions } = await import("/src/studio/export.ts");
    await prepareStudioFonts();
    const failures = [];
    for (const locale of ["en", "zh"])
      for (const kind of ["product", "explainer", "report"])
        for (const format of ["landscape", "portrait", "square"]) {
          const doc = studioTemplate(kind, locale);
          doc.format = format;
          const errors = inspectStudioVideo(doc, []).filter(
            (issue) => issue.severity === "error",
          );
          if (errors.length) failures.push({ locale, kind, format, errors });
        }
    const doc = studioTemplate("product", "en");
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    paintStudioFrame(canvas, doc, 65);
    const before = canvas.toDataURL();
    paintStudioFrame(canvas, doc, 500);
    paintStudioFrame(canvas, doc, 65);
    const deterministic = before === canvas.toDataURL();
    doc.scenes[0].title = "A long headline ".repeat(7);
    doc.scenes[0].body = "A very long description ".repeat(25);
    doc.scenes[0].points = Array(6).fill(
      "An excessively detailed point ".repeat(5),
    );
    const overflow = inspectStudioVideo(doc, []).some(
      (issue) => issue.code === "text-overflow" && issue.severity === "error",
    );
    let blocked = false;
    try {
      await assertStudioPublishable(doc, []);
    } catch {
      blocked = true;
    }
    const captions = studioTemplate("product", "en");
    captions.scenes = [captions.scenes[0]];
    captions.scenes[0].narration =
      "A longer sentence with enough words to need several readable caption chunks without relying on punctuation. 保持中英文字幕清楚易读，并与下载的字幕文件使用同一份时间信息。";
    const cues = studioCaptionCues(captions.scenes[0]);
    const srt = exportStudioCaptions(captions);
    return {
      failures,
      deterministic,
      overflow,
      blocked,
      captionsMatch: cues.every((cue) => srt.includes(cue.text)),
      cueCount: cues.length,
    };
  });
  assert.deepEqual(
    quality.failures,
    [],
    "Every template fits both languages and all formats",
  );
  assert(
    quality.deterministic,
    "Seeking back to a frame produces identical pixels",
  );
  assert(
    quality.overflow && quality.blocked,
    "Measured text overflow blocks publication",
  );
  assert(
    quality.captionsMatch && quality.cueCount > 2,
    "Burnt-in captions and SRT share timing and segmentation",
  );
  for (const format of ["portrait", "square"]) {
    const result = await page.evaluate(
      async ({ id, format, clip }) => {
        const { exportStudioVideo } = await import("/src/studio/export.ts");
        const snapshot = await (
          await fetch(`/api/studio/projects/${id}`)
        ).json();
        const document = {
          ...snapshot.project.document,
          format,
          scenes: [
            {
              ...snapshot.project.document.scenes[0],
              durationFrames: 30,
              mediaAssetId: clip.id,
            },
          ],
          voice: { assetId: null, volume: 1 },
          music: { assetId: null, volume: 0 },
        };
        const result = await exportStudioVideo(id, document, [clip], {
          height: 720,
          signal: new AbortController().signal,
          onProgress: () => {},
        });
        return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
      },
      { id, format, clip },
    );
    const file = path.join(artifacts, `studio-${format}.mp4`);
    writeFileSync(file, Buffer.from(result));
    const info = JSON.parse(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_streams", "-of", "json", file],
        { encoding: "utf8" },
      ),
    );
    const stream = info.streams.find((stream) => stream.codec_type === "video");
    assert.equal(stream.width, 720);
    assert.equal(stream.height, format === "portrait" ? 1280 : 720);
    execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "null", "-"], {
      stdio: "pipe",
    });
  }
  const hdBytes = await page.evaluate(
    async ({ id }) => {
      const { exportStudioVideo } = await import("/src/studio/export.ts");
      const { studioTemplate } = await import("/src/studio/templates.ts");
      const doc = studioTemplate("product", "en");
      doc.scenes = [{ ...doc.scenes[0], durationFrames: 30 }];
      const result = await exportStudioVideo(id, doc, [], {
        height: 1080,
        signal: new AbortController().signal,
        onProgress: () => {},
      });
      return Array.from(new Uint8Array(await result.blob.arrayBuffer()));
    },
    { id },
  );
  const hdPath = path.join(artifacts, "studio-1080p.mp4");
  writeFileSync(hdPath, Buffer.from(hdBytes));
  const hdInfo = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", hdPath],
      { encoding: "utf8" },
    ),
  );
  assert.equal(hdInfo.streams[0].width, 1920);
  assert.equal(hdInfo.streams[0].height, 1080);
  assert.equal(hdInfo.streams[0].r_frame_rate, "30/1");
  execFileSync("ffmpeg", ["-v", "error", "-i", hdPath, "-f", "null", "-"], {
    stdio: "pipe",
  });
  await page
    .getByRole("textbox", { name: "主标题", exact: true })
    .fill("语言切换保留这段修改");
  await page
    .getByRole("button", { name: "Switch website language to English" })
    .click();
  await page.getByRole("button", { name: "Export ↗", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Headline", exact: true })
      .inputValue(),
    "语言切换保留这段修改",
    "Language switching preserves unsaved edits",
  );
  await page.getByRole("button", { name: "切换网站语言为简体中文" }).click();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "主标题", exact: true })
      .inputValue(),
    "经过验证的产品故事",
  );
  await page
    .getByRole("button", { name: "Switch website language to English" })
    .click();
  await page
    .getByRole("button", { name: "Back to projects", exact: true })
    .click();
  await page.getByRole("heading", { name: /My projects/ }).waitFor();
  await page
    .getByRole("button", { name: /Product story Turn features/ })
    .click();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .waitFor();
  const englishId = new URL(page.url()).searchParams.get("project");
  assert(englishId);
  ids.add(englishId);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Project name", exact: true })
      .inputValue(),
    "Give your product a story",
  );
  const englishProject = (
    await (
      await page.request.get(`${origin}/api/studio/projects/${englishId}`)
    ).json()
  ).project;
  assert(
    !/[\u3400-\u9fff]/.test(JSON.stringify(englishProject.document.scenes)),
    "English templates are fully localized",
  );
  await page.getByRole("button", { name: "+ Add scene", exact: true }).click();
  assert.equal(
    await page
      .getByRole("textbox", { name: "Headline", exact: true })
      .inputValue(),
    "New scene",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "All changes saved." })
    .waitFor();
  await page.locator(".st-scene").first().click();
  await page.screenshot({
    path: path.join(artifacts, "rearc-studio-dark-en.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Switch to light theme", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "light",
  );
  await page.screenshot({
    path: path.join(artifacts, "rearc-studio-light-en.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换网站语言为简体中文" }).click();
  await page.getByRole("button", { name: "切换到深色", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "dark",
  );
  await page.screenshot({
    path: path.join(artifacts, "rearc-studio-dark-zh.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByRole("textbox", { name: "作品名称", exact: true }).waitFor();
  await page.screenshot({
    path: path.join(artifacts, "studio-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
    false,
    "No horizontal overflow on mobile",
  );
  assert.deepEqual(errors, [], "No uncaught browser errors");
  writeFileSync(
    path.join(artifacts, "verification.json"),
    JSON.stringify(
      {
        projectId: id,
        video,
        codec: track.codec_name,
        width: track.width,
        height: track.height,
        duration: metadata.format.duration,
        audio: true,
        quality,
        hd: { width: 1920, height: 1080, fps: 30, decoded: true },
        decoded: true,
        browserErrors: errors,
        checks: [
          "template creation",
          "scene edits",
          "private image and audio upload",
          "save and reload",
          "version history",
          "real MP4 download",
          "ffprobe",
          "complete ffmpeg decode",
          "portable backup and media restoration",
          "portrait and square exports with uploaded video",
          "mobile layout",
          "English and Chinese with draft preservation",
          "Remote Arc dark and light themes",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS Studio browser: real create/edit/upload/save/reload/version/export flows; H.264 1280x720, 4s with audio; complete decode; mobile layout; no page errors.",
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true })
    .catch(() => {});
  writeFileSync(
    path.join(artifacts, "browser-errors.json"),
    JSON.stringify(errors, null, 2),
  );
  writeFileSync(
    path.join(artifacts, "failure.txt"),
    await page.locator("body").innerText(),
  );
  throw error;
} finally {
  for (const projectId of ids)
    await page.request
      .delete(`${origin}/api/studio/projects/${projectId}`, {
        headers: { origin },
      })
      .catch(() => {});
  await browser.close();
}
