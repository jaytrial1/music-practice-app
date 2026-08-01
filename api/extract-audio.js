// YouTube Audio Extraction - Proxies to Render backend (yt-dlp)

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
  console.log("[VERCEL] Request received. YouTube URL:", url);

  if (!url || typeof url !== "string") return res.status(400).json({ error: "URL is required" });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL" });

  const BACKEND_URL = process.env.RENDER_BACKEND_URL || process.env.YOUTUBE_BACKEND_URL;
  console.log("[VERCEL] RENDER_BACKEND_URL:", BACKEND_URL);

  if (!BACKEND_URL) {
    console.error("[VERCEL] RENDER_BACKEND_URL is not set!");
    return res.status(500).json({
      error: "Backend not configured. Please set RENDER_BACKEND_URL in Vercel environment variables."
    });
  }

  // Step 1: Wake up backend
  const extractUrl = `${BACKEND_URL}/api/extract-audio`;
  console.log("[VERCEL] Calling backend:", extractUrl);

  try {
    const startTime = Date.now();
    const backendRes = await fetch(extractUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const elapsed = Date.now() - startTime;

    console.log("[VERCEL] Backend responded. Status:", backendRes.status, "Time:", elapsed + "ms");

    if (!backendRes.ok) {
      const errorText = await backendRes.text().catch(() => "could not read body");
      console.error("[VERCEL] Backend error response:", errorText);
      return res.status(backendRes.status).json({ error: `Backend error (${backendRes.status}): ${errorText}` });
    }

    const contentType = backendRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = backendRes.headers.get("Content-Length");
    const contentDisposition = backendRes.headers.get("Content-Disposition");
    console.log("[VERCEL] Streaming audio. Content-Type:", contentType, "Size:", contentLength);

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);

    const reader = backendRes.body.getReader();
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      res.write(value);
    }
    console.log("[VERCEL] Done. Total bytes streamed:", totalBytes);
    res.end();
  } catch (err) {
    console.error("[VERCEL] Exception:", err.message, err.stack);
    return res.status(500).json({ error: `Extraction failed: ${err.message}` });
  }
}
