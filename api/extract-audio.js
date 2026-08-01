// YouTube Audio Extraction via cobalt.tools API
// Works on Vercel — cobalt handles the YouTube anti-bot protection

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.body || {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "URL is required" });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

  try {
    // Step 1: Request audio extraction from cobalt
    const cobaltRes = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        url: url,
        downloadMode: "audio",
        audioFormat: "mp3",
      }),
    });

    const cobaltData = await cobaltRes.json();

    if (cobaltData.status === "error" || cobaltData.error) {
      const msg = cobaltData.error?.code || cobaltData.error || "Extraction service error";
      throw new Error(msg);
    }

    if (!cobaltData.url) {
      throw new Error("No download URL returned from extraction service");
    }

    // Step 2: Fetch the actual audio from cobalt's CDN
    const audioRes = await fetch(cobaltData.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio (${audioRes.status})`);
    }

    const contentType = audioRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = audioRes.headers.get("Content-Length");

    // Generate filename from cobalt response or URL
    const title = cobaltData.filename
      ? cobaltData.filename.replace(/\.[^.]+$/, "")
      : "youtube-audio";
    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "youtube-audio";
    const ext = contentType.includes("webm") ? "webm" : "mp3";
    const filename = `${safeTitle}.${ext}`;

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    // Stream the audio to the client
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
    if (err.message.includes("Unsupported site")) {
      message = "This video URL is not supported";
    } else if (err.message.includes("Could not get info")) {
      message = "Could not process this video. It may be private or region-restricted.";
    } else if (err.message.includes("No download URL")) {
      message = "Extraction service could not process this video";
    }

    return res.status(500).json({ error: message });
  }
}
