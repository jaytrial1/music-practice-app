import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url);
}

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "Vocal Practice Pro - YouTube Extraction Backend" });
});

app.post("/api/extract-audio", async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "URL is required" });
  }

  if (!isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const args = [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--no-playlist",
    "--no-warnings",
    "--get-url",
    "--extractor-args", "youtube:player_client=tv_embedded,web",
    url,
  ];

  try {
    const { stdout } = await execFileAsync("yt-dlp", args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const audioUrl = stdout.trim().split("\n").pop();

    if (!audioUrl || !audioUrl.startsWith("http")) {
      throw new Error("No audio URL returned");
    }

    // Get video title for filename
    const titleArgs = [
      "--get-title",
      "--no-playlist",
      "--no-warnings",
      url,
    ];

    let title = "youtube-audio";
    try {
      const { stdout: titleStdout } = await execFileAsync("yt-dlp", titleArgs, {
        timeout: 10000,
      });
      title = titleStdout.trim() || "youtube-audio";
    } catch (e) {
      // Title fetch failed, use default
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "youtube-audio";

    // Fetch the audio and stream it back
    const audioRes = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio (${audioRes.status})`);
    }

    const contentType = audioRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = audioRes.headers.get("Content-Length");

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    res.setHeader("Content-Disposition", `inline; filename="${safeTitle}.mp3"`);

    const reader = audioRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);

    let message = "Failed to extract audio. Please check the URL and try again.";

    if (err.message.includes("Video unavailable") || err.message.includes("Video not available")) {
      message = "This video is unavailable or region-restricted";
    } else if (err.message.includes("Private video")) {
      message = "This video is private";
    } else if (err.killed || err.message.includes("timeout")) {
      message = "Extraction timed out. The video might be too long.";
    } else if (err.message.includes("Sign in")) {
      message = "YouTube is requiring authentication. Please try a different video.";
    }

    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`YouTube extraction backend running on port ${PORT}`);
});
