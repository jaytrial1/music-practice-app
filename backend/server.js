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
  console.log("[BACKEND] Health check OK");
  res.json({ status: "ok", service: "Vocal Practice Pro - YouTube Extraction Backend" });
});

app.post("/api/extract-audio", async (req, res) => {
  const { url } = req.body || {};
  console.log("[BACKEND] Request received. URL:", url);

  if (!url || typeof url !== "string") {
    console.log("[BACKEND] Error: URL is required");
    return res.status(400).json({ error: "URL is required" });
  }

  if (!isValidYouTubeUrl(url)) {
    console.log("[BACKEND] Error: Invalid YouTube URL");
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
    console.log("[BACKEND] Running yt-dlp with args:", args.join(" "));
    const startTime = Date.now();
    const { stdout, stderr } = await execFileAsync("yt-dlp", args, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const elapsed = Date.now() - startTime;

    console.log("[BACKEND] yt-dlp completed in", elapsed + "ms");
    console.log("[BACKEND] yt-dlp stdout length:", stdout.length);
    console.log("[BACKEND] yt-dlp stderr:", stderr ? stderr.substring(0, 500) : "(empty)");

    const audioUrl = stdout.trim().split("\n").pop();
    console.log("[BACKEND] Audio URL starts with:", audioUrl ? audioUrl.substring(0, 80) : "(empty)");

    if (!audioUrl || !audioUrl.startsWith("http")) {
      console.error("[BACKEND] Error: No valid audio URL returned");
      throw new Error("No audio URL returned");
    }

    // Get video title for filename
    let title = "youtube-audio";
    try {
      console.log("[BACKEND] Fetching video title...");
      const { stdout: titleStdout } = await execFileAsync("yt-dlp", [
        "--get-title", "--no-playlist", "--no-warnings", url,
      ], { timeout: 10000 });
      title = titleStdout.trim() || "youtube-audio";
      console.log("[BACKEND] Video title:", title);
    } catch (e) {
      console.log("[BACKEND] Title fetch failed, using default:", e.message);
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "youtube-audio";

    console.log("[BACKEND] Fetching audio stream from CDN...");
    const audioRes = await fetch(audioUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    console.log("[BACKEND] CDN response status:", audioRes.status);
    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio (${audioRes.status})`);
    }

    const contentType = audioRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = audioRes.headers.get("Content-Length");
    console.log("[BACKEND] Streaming audio. Content-Type:", contentType, "Content-Length:", contentLength);

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    res.setHeader("Content-Disposition", `inline; filename="${safeTitle}.mp3"`);

    const reader = audioRes.body.getReader();
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      res.write(value);
    }
    console.log("[BACKEND] Done. Total bytes:", totalBytes);
    res.end();
  } catch (err) {
    console.error("[BACKEND] Exception:", err.message);
    console.error("[BACKEND] Stack:", err.stack);

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

    console.log("[BACKEND] Returning error:", message);
    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log("[BACKEND] YouTube extraction backend running on port", PORT);
});
