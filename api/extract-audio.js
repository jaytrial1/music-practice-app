// YouTube Audio Extraction — pure fetch, no binaries
// Handles signatureCipher decryption for Vercel serverless

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url);
}

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// --- Signature Cipher Decryption ---
function extractNTransformFunction(jsSource) {
  const match = jsSource.match(
    /\b([a-zA-Z0-9$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*var\s+b\s*=\s*a\.split\(\s*""\s*\)/
  );
  if (!match) return null;

  const funcName = match[1];
  const funcBody = jsSource.substring(
    jsSource.indexOf(`${funcName}=`),
    jsSource.indexOf(`};`, jsSource.indexOf(`${funcName}=`)) + 2
  );

  const helperMatch = funcBody.match(
    /var\s+b\s*=.*?;\s*var\s+([a-zA-Z0-9$]+)\s*=\s*\{[\s\S]*?\}\s*\)\s*;/
  );
  if (!helperMatch) return null;

  const helperName = helperMatch[1];
  const helperBlock = jsSource.substring(
    jsSource.indexOf(`${helperName}={`),
    jsSource.indexOf(`}`, jsSource.indexOf(`${helperName}={`)) + 1
  );

  const objectMatch = helperBlock.match(
    /([a-zA-Z0-9$]+)\s*:\s*function\(\s*a(?:\s*,\s*b)?\s*\)\s*\{\s*(?:a\s*=\s*(?:a\.split\(\s*""\s*\)|\[.*?\])[\s\S]*?return\s+a\.join\(\s*""\s*\))\s*\}/g
  );
  if (!objectMatch) return null;

  const transformMap = {};
  for (const fn of objectMatch) {
    const key = fn.split(":")[0].trim();
    const transformType = fn.includes("reverse") ? "reverse" :
      fn.includes("splice") ? "splice" : "swap";
    const swapMatch = fn.match(/var\s+c\s*=\s*a\.(\w+)\s*;\s*a\.\1\s*=\s*a\.(\w+)\s*;\s*a\.\2\s*=\s*c/);
    const swapIndex = transformType === "swap" && swapMatch ? parseInt(swapMatch[1].replace(/\D/g, "")) || 0 : 0;
    transformMap[key] = { type: transformType, index: swapIndex };
  }

  return (sig) => {
    let arr = sig.split("");
    for (const key of funcName.match(/\$[a-zA-Z0-9]+/g) || []) {
      const op = transformMap[key];
      if (!op) continue;
      if (op.type === "reverse") arr.reverse();
      else if (op.type === "splice") arr.splice(0, op.index);
      else if (op.type === "swap") {
        const idx = op.index % arr.length;
        [arr[0], arr[idx]] = [arr[idx], arr[0]];
      }
    }
    return arr.join("");
  };
}

function extractDecipherFunction(jsSource) {
  const funcMatch = jsSource.match(
    /\b([a-zA-Z0-9$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)\s*;\s*([a-zA-Z0-9$]+)\.[a-zA-Z0-9$]+\s*\(/
  );
  if (!funcMatch) return null;

  const mainFuncName = funcMatch[1];
  const helperName = funcMatch[2];

  const helperBlockMatch = jsSource.match(
    new RegExp(
      `var\\s+${helperName.replace(/\$/g, "\\$")}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*\\]\\s*;`
    )
  );
  if (!helperBlockMatch) return null;

  const block = helperBlockMatch[1];
  const funcRegex = /([a-zA-Z0-9$]+)\s*:\s*function\(\s*a(?:\s*,\s*b)?\s*\)\s*\{[^}]*\}/g;
  const transformMap = {};
  let m;

  while ((m = funcRegex.exec(block)) !== null) {
    const key = m[1];
    const body = m[0];
    if (body.includes("reverse")) transformMap[key] = "reverse";
    else if (body.includes("splice")) transformMap[key] = "splice";
    else if (body.includes("var c=") || body.includes("var c =")) transformMap[key] = "swap";
  }

  const mainFuncMatch = jsSource.match(
    new RegExp(
      `function\\s+${mainFuncName.replace(/\$/g, "\\$")}\\s*\\(\\s*a\\s*\\)\\s*\\{[^}]*var\\s+c\\s*=\\s*a\\.split\\(\\s*""\\s*\\)\\s*;\\s*([\\s\\S]*?)return\\s+c\\.join\\(\\s*""\\s*\\)\\s*\\}`
    )
  );
  if (!mainFuncMatch) return null;

  const steps = [];
  const stepRegex = /([a-zA-Z0-9$]+)\.[a-zA-Z0-9$]+\s*\(c\s*,\s*(\d+)\)/g;
  let sm;
  while ((sm = stepRegex.exec(mainFuncMatch[1])) !== null) {
    steps.push({ fn: sm[1], arg: parseInt(sm[2]) });
  }

  return (sig) => {
    let arr = sig.split("");
    for (const step of steps) {
      const op = transformMap[step.fn];
      if (op === "reverse") arr.reverse();
      else if (op === "splice") arr.splice(0, step.arg);
      else if (op === "swap") {
        const idx = step.arg % arr.length;
        [arr[0], arr[idx]] = [arr[idx], arr[0]];
      }
    }
    return arr.join("");
  };
}

function decipherSignature(signatureCipher, decipherFn) {
  const params = new URLSearchParams(signatureCipher);
  const sig = params.get("s");
  if (!sig || !decipherFn) return null;
  const deciphered = decipherFn(sig);
  const url = params.get("url");
  if (!url) return null;
  return url + "&sig=" + encodeURIComponent(deciphered);
}

function applyNTransform(url, transformFn) {
  if (!transformFn) return url;
  try {
    const parsed = new URL(url);
    const n = parsed.searchParams.get("n");
    if (!n) return url;
    parsed.searchParams.set("n", transformFn(n));
    return parsed.toString();
  } catch {
    return url;
  }
}

// --- Player JS Caching ---
let cachedPlayerJsUrl = null;
let cachedDecipherFn = null;
let cachedNTransformFn = null;

async function getPlayerJsUrl() {
  const res = await fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();
  const match = html.match(/"jsUrl"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error("Could not find player JS URL");
  return match[1].startsWith("http")
    ? match[1]
    : `https://www.youtube.com${match[1]}`;
}

async function getPlayerFunctions() {
  if (cachedDecipherFn && cachedNTransformFn) {
    return { decipherFn: cachedDecipherFn, nTransformFn: cachedNTransformFn };
  }

  const jsUrl = await getPlayerJsUrl();
  const res = await fetch(jsUrl);
  const jsSource = await res.text();

  cachedPlayerJsUrl = jsUrl;
  cachedDecipherFn = extractDecipherFunction(jsSource);
  cachedNTransformFn = extractNTransformFunction(jsSource);

  return { decipherFn: cachedDecipherFn, nTransformFn: cachedNTransformFn };
}

// --- Video Info Fetching ---
async function getVideoInfo(videoId) {
  const res = await fetch(
    `https://www.youtube.com/watch?v=${videoId}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: "CONSENT=YES+1",
      },
    }
  );

  const html = await res.text();

  // Extract ytInitialPlayerResponse
  const match = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<)/s);
  if (!match) {
    throw new Error("Could not parse YouTube page");
  }

  return JSON.parse(match[1]);
}

function chooseAudioFormat(formats) {
  const audioFormats = formats.filter(
    (f) => f.mimeType && f.mimeType.startsWith("audio/")
  );
  if (audioFormats.length === 0) return null;
  audioFormats.sort((a, b) => (b.averageBitrate || 0) - (a.averageBitrate || 0));
  return audioFormats[0];
}

// --- Main Extraction ---
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

  // Try direct URL first
  if (audioFormat.url) {
    return { audioUrl: audioFormat.url, title, contentType: audioFormat.mimeType || "audio/webm", ext: audioFormat.mimeType?.includes("mp4") ? "mp4" : "webm" };
  }

  // Need to decipher signatureCipher
  if (audioFormat.signatureCipher) {
    const { decipherFn, nTransformFn } = await getPlayerFunctions();
    let audioUrl = decipherSignature(audioFormat.signatureCipher, decipherFn);
    if (!audioUrl) throw new Error("Failed to decipher audio URL");
    audioUrl = applyNTransform(audioUrl, nTransformFn);
    return { audioUrl, title, contentType: audioFormat.mimeType || "audio/webm", ext: audioFormat.mimeType?.includes("mp4") ? "mp4" : "webm" };
  }

  throw new Error("No audio format available for this video");
}

// --- Vercel Handler ---
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
    const { audioUrl, title, contentType, ext } = await extractAudio(url);

    const audioRes = await fetch(audioUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
        Origin: "https://www.youtube.com",
      },
    });

    if (!audioRes.ok) {
      throw new Error(`Failed to fetch audio stream (${audioRes.status})`);
    }

    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "audio";
    const filename = `${safeTitle}.${ext}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);

    const reader = audioRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error("YouTube extraction failed:", err.message);
    console.error("Full error:", err.stack);

    let message = "Failed to extract audio. Please check the URL and try again.";
    if (err.message.includes("unavailable")) {
      message = "This video is unavailable or region-restricted";
    } else if (err.message.includes("private")) {
      message = "This video is private";
    } else if (err.message.includes("No audio format")) {
      message = "No audio stream available for this video";
    } else if (err.message.includes("decipher")) {
      message = "Could not decode audio stream. YouTube may have changed their player.";
    }

    // In debug mode, return full error details
    return res.status(500).json({ error: message, debug: err.message });
  }
}
