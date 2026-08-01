import express from "express";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3001;
const TEMP_DIR = path.join(process.cwd(), "server", "temp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Auto-cleanup: delete files older than 30 minutes
setInterval(() => {
  const now = Date.now();
  try {
    const files = fs.readdirSync(TEMP_DIR);
    files.forEach((file) => {
      const filePath = path.join(TEMP_DIR, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 30 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (_) {}
}, 5 * 60 * 1000);

app.post("/api/extract-audio", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL is required" });
  }

  if (!ytdl.validateURL(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  let tmpFile = null;

  try {
    const info = await ytdl.getInfo(url, { lang: "en" });
    const title =
      info.videoDetails.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() ||
      "audio";

    const format = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
      filter: "audioonly",
    });

    if (!format) {
      return res
        .status(400)
        .json({ error: "No audio format found for this video" });
    }

    const ext = format.mimeType?.includes("mp4") ? "mp4" : "webm";
    const filename = `${title}.${ext}`;
    const contentType = format.mimeType || `audio/${ext}`;

    tmpFile = path.join(TEMP_DIR, `${Date.now()}-${filename}`);

    const stream = ytdl(url, { format, quality: "highestaudio" });
    const writeStream = fs.createWriteStream(tmpFile);

    await new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
      stream.on("error", reject);
    });

    const stat = fs.statSync(tmpFile);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const readStream = fs.createReadStream(tmpFile);
    readStream.pipe(res);

    readStream.on("end", () => {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {}
    });
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);

    if (tmpFile) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {}
    }

    const message =
      err.message?.includes("Video unavailable")
        ? "This video is unavailable or region-restricted"
        : err.message?.includes("Private video")
          ? "This video is private"
          : "Failed to extract audio. Please check the URL and try again.";

    return res.status(500).json({ error: message });
  }
});

app.delete("/api/cleanup", (req, res) => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    files.forEach((file) => {
      try {
        fs.unlinkSync(path.join(TEMP_DIR, file));
      } catch (_) {}
    });
    res.json({ ok: true, deleted: files.length });
  } catch (err) {
    res.json({ ok: true, deleted: 0 });
  }
});

app.listen(PORT, () => {
  console.log(`YouTube extraction server running on http://localhost:${PORT}`);
});
