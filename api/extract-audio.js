// YouTube Audio Extraction - Proxies to Render backend (yt-dlp)
// The actual extraction happens on Render free tier where yt-dlp runs

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

  // Backend URL - set this in Vercel environment variables
  // Example: https://your-app-name.onrender.com
  const BACKEND_URL = process.env.RENDER_BACKEND_URL || process.env.YOUTUBE_BACKEND_URL;

  if (!BACKEND_URL) {
    return res.status(500).json({
      error: "Backend not configured. Please set RENDER_BACKEND_URL in Vercel environment variables."
    });
  }

  try {
    // Proxy request to Render backend
    const backendRes = await fetch(`${BACKEND_URL}/api/extract-audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!backendRes.ok) {
      const errorData = await backendRes.json().catch(() => null);
      const message = errorData?.error || `Backend error (${backendRes.status})`;
      return res.status(backendRes.status).json({ error: message });
    }

    // Stream the audio response from backend to client
    const contentType = backendRes.headers.get("Content-Type") || "audio/mpeg";
    const contentLength = backendRes.headers.get("Content-Length");
    const contentDisposition = backendRes.headers.get("Content-Disposition");

    res.setHeader("Content-Type", contentType);
    if (contentLength) res.setHeader("Content-Length", contentLength);
    if (contentDisposition) res.setHeader("Content-Disposition", contentDisposition);

    const reader = backendRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);

    let message = "Failed to extract audio. Please check the URL and try again.";
    if (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED")) {
      message = "Extraction service is temporarily unavailable. Please try again in a moment.";
    } else if (err.message.includes("timeout")) {
      message = "Extraction timed out. The video might be too long.";
    }

    return res.status(500).json({ error: message });
  }
}
