// YouTube Audio Extraction — pure fetch, no binaries
// Works on Vercel serverless functions

const YOUTUBE_CLIENTS = {
  WEB: {
    clientName: "WEB",
    clientVersion: "2.20241201.00.00",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  },
  ANDROID: {
    clientName: "ANDROID",
    clientVersion: "19.29.37",
    androidSdkVersion: 33,
    apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
    userAgent:
      "com.google.android.youtube/19.29.37 (Linux; U; Android 13; en_US) gzip",
  },
  IOS: {
    clientName: "IOS",
    clientVersion: "19.29.1",
    deviceMake: "Apple",
    deviceModel: "iPhone16,2",
    userAgent:
      "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
  },
  TVHTML5_SIMPLY_EMBEDDED: {
    clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
    clientVersion: "2.0",
    apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
  },
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
  // Try ANDROID first (fewer restrictions), then IOS, TV, then WEB
  const clients = [
    YOUTUBE_CLIENTS.ANDROID,
    YOUTUBE_CLIENTS.TVHTML5_SIMPLY_EMBEDDED,
    YOUTUBE_CLIENTS.IOS,
    YOUTUBE_CLIENTS.WEB,
  ];

  for (const client of clients) {
    try {
      const url = `https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}`;

      const body = {
        context: {
          client: {
            clientName: client.clientName,
            clientVersion: client.clientVersion,
            ...(client.androidSdkVersion && { androidSdkVersion: client.androidSdkVersion }),
            ...(client.deviceMake && { deviceMake: client.deviceMake }),
            ...(client.deviceModel && { deviceModel: client.deviceModel }),
          },
        },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      };

      const headers = {
        "Content-Type": "application/json",
      };
      if (client.userAgent) {
        headers["User-Agent"] = client.userAgent;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) continue;

      const data = await res.json();

      // If this client got playable data, use it
      if (
        data.playabilityStatus?.status === "OK" &&
        (data.streamingData?.formats?.length > 0 ||
          data.streamingData?.adaptiveFormats?.length > 0)
      ) {
        return data;
      }

      // If LOGIN_REQUIRED or UNPLAYABLE from this client, try next
      if (
        data.playabilityStatus?.status === "LOGIN_REQUIRED" ||
        data.playabilityStatus?.status === "UNPLAYABLE"
      ) {
        continue;
      }

      // Other errors — still return the data for error handling
      return data;
    } catch (e) {
      continue;
    }
  }

  throw new Error("All extraction methods failed");
}

function chooseAudioFormat(formats) {
  // Only use formats with direct URLs (not signatureCipher which requires decryption)
  const audioFormats = formats.filter(
    (f) => f.mimeType && f.mimeType.startsWith("audio/") && f.url
  );

  if (audioFormats.length === 0) {
    // Fallback: try all audio formats including those with signatureCipher
    const cipherFormats = formats.filter(
      (f) => f.mimeType && f.mimeType.startsWith("audio/")
    );
    if (cipherFormats.length > 0) {
      return cipherFormats[0]; // Return first one, might still work
    }
    return null;
  }

  // Sort by bitrate (highest first)
  audioFormats.sort((a, b) => (b.averageBitrate || 0) - (a.averageBitrate || 0));
  return audioFormats[0];
}

async function extractAudio(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not extract video ID from URL");

  const info = await getVideoInfo(videoId);

  const title = info.videoDetails?.title || "audio";
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
