// YouTube Audio Extraction — pure fetch, no binaries
// Works on Vercel serverless functions

const YOUTUBE_CLIENT = {
  INNERTUBE_API_KEY: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  INNERTUBE_CLIENT_NAME: "WEB",
  INNERTUBE_CLIENT_VERSION: "2.20240101.00.00",
};

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url);
}

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

async function getVideoInfo(videoId) {
  const url = `https://www.youtube.com/youtubei/v1/player?key=${YOUTUBE_CLIENT.INNERTUBE_API_KEY}`;

  const body = {
    context: {
      client: {
        clientName: YOUTUBE_CLIENT.INNERTUBE_CLIENT_NAME,
        clientVersion: YOUTUBE_CLIENT.INNERTUBE_CLIENT_VERSION,
      },
    },
    videoId,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`YouTube API returned ${res.status}`);
  }

  return res.json();
}

function chooseAudioFormat(formats) {
  // Prefer webm/opus audio, then mp4/aac
  const audioFormats = formats.filter(
    (f) => f.mimeType && f.mimeType.startsWith("audio/") && f.url
  );

  if (audioFormats.length === 0) return null;

  // Sort by bitrate (highest first)
  audioFormats.sort((a, b) => (b.averageBitrate || 0) - (a.averageBitrate || 0));
  return audioFormats[0];
}

async function extractAudio(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not extract video ID from URL");

  const info = await getVideoInfo(videoId);

  if (info.playabilityStatus?.status === "ERROR") {
    throw new Error(info.playabilityStatus.reason || "Video unavailable");
  }

  if (info.playabilityStatus?.status === "LOGIN_REQUIRED") {
    throw new Error("This video is age-restricted or private");
  }

  const title = info.videoDetails?.title || "youtube-audio";
  const formats = info.streamingData?.formats || [];
  const adaptiveFormats = info.streamingData?.adaptiveFormats || [];
  const allFormats = [...formats, ...adaptiveFormats];

  const audioFormat = chooseAudioFormat(allFormats);
  if (!audioFormat) {
    throw new Error("No audio format available for this video");
  }

  const audioUrl = audioFormat.url;
  const contentType = audioFormat.mimeType || "audio/webm";
  const ext = contentType.includes("mp4") ? "mp4" : "webm";

  return { audioUrl, title, contentType, ext };
}

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

  if (!isValidYouTubeUrl(url)) {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  try {
    const { audioUrl, title, contentType, ext } = await extractAudio(url);

    // Proxy the audio stream through our server
    const audioRes = await fetch(audioUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
      },
    });

    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio stream (${audioRes.status})`);
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "audio";
    const filename = `${safeTitle}.${ext}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename}"`
    );

    // Stream the response
    const reader = audioRes.body.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    };

    await pump();
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);

    let message = "Failed to extract audio. Please check the URL and try again.";
    if (err.message.includes("unavailable")) {
      message = "This video is unavailable or region-restricted";
    } else if (err.message.includes("private") || err.message.includes("age-restricted")) {
      message = "This video is private or age-restricted";
    } else if (err.message.includes("No audio format")) {
      message = "No audio stream available for this video";
    }

    return res.status(500).json({ error: message });
  }
}
