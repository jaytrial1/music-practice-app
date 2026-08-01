import ytdl from "@distube/ytdl-core";
import fs from "fs";
import path from "path";
import os from "os";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    // Vercel /tmp is ephemeral — perfect for temp files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-"));
    tmpFile = path.join(tmpDir, filename);

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

    // Cleanup after streaming finishes
    readStream.on("end", () => {
      try {
        fs.unlinkSync(tmpFile);
        fs.rmdirSync(path.dirname(tmpFile));
      } catch (e) { void e; }
    });
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);

    if (tmpFile) {
      try {
        fs.unlinkSync(tmpFile);
        fs.rmdirSync(path.dirname(tmpFile));
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
}
