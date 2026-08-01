import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
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
  } catch (e) { void e; }
}, 5 * 60 * 1000);

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url);
}

app.post("/api/extract-audio", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL is required" });
  }

  if (!isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const outputTemplate = path.join(TEMP_DIR, `${Date.now()}-%(title)s.%(ext)s`);
  const args = [
    "-x",                          // extract audio
    "--audio-format", "mp3",       // convert to mp3
    "--audio-quality", "0",        // best quality
    "--no-playlist",               // ignore playlists
    "--no-warnings",
    "--print", "after_move:filepath",
    "-o", outputTemplate,
    url,
  ];

  try {
    const { stdout } = await execFileAsync("yt-dlp", args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const filePath = stdout.trim().split("\n").pop();

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(500).json({ error: "Extraction succeeded but output file not found" });
    }

    const stat = fs.statSync(filePath);
    const filename = path.basename(filePath);

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);

    readStream.on("end", () => {
      try { fs.unlinkSync(filePath); } catch (e) { void e; }
    });

    readStream.on("error", () => {
      try { fs.unlinkSync(filePath); } catch (e) { void e; }
    });
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);

    const stderr = err.stderr || "";
    let message = "Failed to extract audio. Please check the URL and try again.";

    if (stderr.includes("Video unavailable") || err.message.includes("Video unavailable")) {
      message = "This video is unavailable or region-restricted";
    } else if (stderr.includes("Private video") || err.message.includes("Private video")) {
      message = "This video is private";
    } else if (err.killed || err.message.includes("timeout")) {
      message = "Extraction timed out. The video might be too long.";
    }

    return res.status(500).json({ error: message });
  }
});

app.delete("/api/cleanup", (req, res) => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    let deleted = 0;
    files.forEach((file) => {
      try {
        fs.unlinkSync(path.join(TEMP_DIR, file));
        deleted++;
      } catch (e) { void e; }
    });
    res.json({ ok: true, deleted });
  } catch (err) {
    res.json({ ok: true, deleted: 0 });
  }
});

app.listen(PORT, () => {
  console.log(`YouTube extraction server running on http://localhost:${PORT}`);
});
