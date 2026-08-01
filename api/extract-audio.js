// YouTube Audio Extraction — works on Vercel serverless

function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch|shorts)|youtu\.be\/)/.test(url);
}

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// --- Signature Decipher ---
function extractDecipherAndNTransform(jsSource) {
  // Extract the main decipher function name
  const mainMatch = jsSource.match(
    /\b([a-zA-Z0-9$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)\s*;\s*[a-zA-Z0-9$]+\.[a-zA-Z0-9$]+\s*\(/
  );
  if (!mainMatch) return { decipherFn: null, nTransformFn: null };
  const mainName = mainMatch[1];

  // Find helper object
  const helperMatch = jsSource.match(
    new RegExp(`var\\s+([a-zA-Z0-9$]+)\\s*=\\s*\\{`)
  );
  if (!helperMatch) return { decipherFn: null, nTransformFn: null };
  const helperName = helperMatch[1];

  // Extract all methods from the helper object
  const helperStart = jsSource.indexOf(`${helperName}={`);
  if (helperStart === -1) return { decipherFn: null, nTransformFn: null };

  let braceCount = 0;
  let helperEnd = helperStart;
  for (let i = helperStart; i < jsSource.length; i++) {
    if (jsSource[i] === "{") braceCount++;
    if (jsSource[i] === "}") braceCount--;
    if (braceCount === 0) { helperEnd = i + 1; break; }
  }
  const helperBlock = jsSource.substring(helperStart, helperEnd);

  // Parse each method: reverse, splice, swap
  const methods = {};
  const methodRegex = /([a-zA-Z0-9$]+)\s*:\s*function\(\s*a(?:\s*,\s*b)?\s*\)\s*\{([^}]+)\}/g;
  let mm;
  while ((mm = methodRegex.exec(helperBlock)) !== null) {
    const body = mm[2];
    if (body.includes(".reverse()")) methods[mm[1]] = "reverse";
    else if (body.includes(".splice(")) methods[mm[1]] = "splice";
    else if (body.includes("var c=") || body.includes("var c =")) methods[mm[1]] = "swap";
  }

  // Extract the main function body (the one that chains calls)
  const mainFuncRegex = new RegExp(
    `function\\s+${mainName.replace(/\$/g, "\\$")}\\s*\\(\\s*a\\s*\\)\\s*\\{[^}]*a\\.split\\(\\s*""\\s*\\)[^}]*\\}`
  );
  const mainBodyMatch = jsSource.match(mainFuncRegex);
  if (!mainBodyMatch) return { decipherFn: null, nTransformFn: null };

  const body = mainBodyMatch[0];
  const steps = [];
  const stepRegex = /([a-zA-Z0-9$]+)\.[a-zA-Z0-9$]+\s*\(\s*a\s*,\s*(\d+)\s*\)/g;
  let sm;
  while ((sm = stepRegex.exec(body)) !== null) {
    steps.push({ method: sm[1], arg: parseInt(sm[2]) });
  }

  const decipherFn = (sig) => {
    let arr = sig.split("");
    for (const step of steps) {
      const op = methods[step.method];
      if (op === "reverse") arr.reverse();
      else if (op === "splice") arr.splice(0, step.arg);
      else if (op === "swap") {
        const idx = step.arg % arr.length;
        [arr[0], arr[idx]] = [arr[idx], arr[0]];
      }
    }
    return arr.join("");
  };

  // N-transform function (throttle bypass)
  const nMatch = jsSource.match(
    /\b([a-zA-Z0-9$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*var\s+b\s*=\s*a\.split\(\s*""\s*\)/
  );
  let nTransformFn = null;
  if (nMatch) {
    const nName = nMatch[1];
    // Find the object with transform methods
    const nObjRegex = new RegExp(
      `var\\s+([a-zA-Z0-9$]+)\\s*=\\s*\\{[\\s\\S]*?${nName.replace(/\$/g, "\\$")}[\\s\\S]*?\\}\\s*\\]\\s*;`
    );
    const nObjMatch = jsSource.match(nObjRegex);
    if (nObjMatch) {
      const nObjBlock = nObjMatch[0];
      const nMethods = {};
      let nm;
      const nMethodRegex = /([a-zA-Z0-9$]+)\s*:\s*function\(\s*a(?:\s*,\s*b)?\s*\)\s*\{([^}]+)\}/g;
      while ((nm = nMethodRegex.exec(nObjBlock)) !== null) {
        const body = nm[2];
        if (body.includes(".reverse()")) nMethods[nm[1]] = "reverse";
        else if (body.includes(".splice(")) nMethods[nm[1]] = "splice";
        else if (body.includes("var c=")) nMethods[nm[1]] = "swap";
      }

      const nFuncRegex = new RegExp(
        `function\\s+${nName.replace(/\$/g, "\\$")}\\s*\\(\\s*a\\s*\\)\\s*\\{[\\s\\S]*?return\\s+a\\.join\\(\\s*""\\s*\\)\\s*\\}`
      );
      const nFuncMatch = jsSource.match(nFuncRegex);
      if (nFuncMatch) {
        const nSteps = [];
        const nStepRegex = /([a-zA-Z0-9$]+)\.[a-zA-Z0-9$]+\s*\(\s*a\s*,\s*(\d+)\s*\)/g;
        let nsm;
        while ((nsm = nStepRegex.exec(nFuncMatch[0])) !== null) {
          nSteps.push({ method: nsm[1], arg: parseInt(nsm[2]) });
        }

        nTransformFn = (n) => {
          let arr = n.split("");
          for (const step of nSteps) {
            const op = nMethods[step.method];
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
    }
  }

  return { decipherFn, nTransformFn };
}

let cachedDecipherFn = null;
let cachedNTransformFn = null;

async function ensureDecipherFunctions() {
  if (cachedDecipherFn) return;
  const res = await fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+1",
    },
  });
  const html = await res.text();
  const jsMatch = html.match(/"jsUrl"\s*:\s*"([^"]+)"/);
  if (!jsMatch) throw new Error("Could not find player JS URL");
  const jsUrl = jsMatch[1].startsWith("http") ? jsMatch[1] : `https://www.youtube.com${jsMatch[1]}`;
  const jsRes = await fetch(jsUrl);
  const jsSource = await jsRes.text();
  const { decipherFn, nTransformFn } = extractDecipherAndNTransform(jsSource);
  cachedDecipherFn = decipherFn;
  cachedNTransformFn = nTransformFn;
}

function decipherUrl(signatureCipher) {
  const params = new URLSearchParams(signatureCipher);
  const sig = params.get("s");
  const url = params.get("url");
  if (!sig || !url || !cachedDecipherFn) return null;
  const deciphered = cachedDecipherFn(sig);
  return url + "&sig=" + encodeURIComponent(deciphered);
}

function applyNTransform(url) {
  if (!cachedNTransformFn || !url) return url;
  try {
    const parsed = new URL(url);
    const n = parsed.searchParams.get("n");
    if (n) parsed.searchParams.set("n", cachedNTransformFn(n));
    return parsed.toString();
  } catch { return url; }
}

// --- Fetch video info via innertube API ---
async function fetchViaInnertube(videoId) {
  const clients = [
    { name: "ANDROID", version: "19.29.37", apiKey: "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w", ua: "com.google.android.youtube/19.29.37 (Linux; U; Android 13; en_US) gzip" },
    { name: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", version: "2.0", apiKey: "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8" },
    { name: "IOS", version: "19.29.1", apiKey: "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc", ua: "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)" },
  ];

  for (const client of clients) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${client.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(client.ua ? { "User-Agent": client.ua } : {}),
        },
        body: JSON.stringify({
          context: { client: { clientName: client.name, clientVersion: client.version } },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data.playabilityStatus?.status === "OK") return data;
    } catch { continue; }
  }
  return null;
}

// --- Fetch video info via watch page scraping ---
async function fetchViaWatchPage(videoId) {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+1",
    },
  });
  const html = await res.text();

  // Try multiple regex patterns for ytInitialPlayerResponse
  const patterns = [
    /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*var\s/s,
    /var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*</,
    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed?.streamingData) return parsed;
      } catch { continue; }
    }
  }
  return null;
}

// --- Choose best audio format ---
function getAudioFormats(info) {
  const formats = [
    ...(info.streamingData?.formats || []),
    ...(info.streamingData?.adaptiveFormats || []),
  ];
  return formats.filter((f) => f.mimeType && f.mimeType.startsWith("audio/"));
}

async function extractAudio(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error("Could not extract video ID from URL");

  // Ensure we have decipher functions ready
  await ensureDecipherFunctions();

  // Try innertube API first
  const innertubeData = await fetchViaInnertube(videoId);
  if (innertubeData) {
    const audioFormats = getAudioFormats(innertubeData);
    const title = innertubeData.videoDetails?.title || "audio";

    for (const fmt of audioFormats.sort((a, b) => (b.averageBitrate || 0) - (a.averageBitrate || 0))) {
      if (fmt.url) {
        return { audioUrl: applyNTransform(fmt.url), title, contentType: fmt.mimeType, ext: fmt.mimeType?.includes("mp4") ? "mp4" : "webm" };
      }
      if (fmt.signatureCipher) {
        let audioUrl = decipherUrl(fmt.signatureCipher);
        if (audioUrl) {
          audioUrl = applyNTransform(audioUrl);
          return { audioUrl, title, contentType: fmt.mimeType, ext: fmt.mimeType?.includes("mp4") ? "mp4" : "webm" };
        }
      }
    }
  }

  // Fallback: watch page scraping
  const watchData = await fetchViaWatchPage(videoId);
  if (watchData) {
    const audioFormats = getAudioFormats(watchData);
    const title = watchData.videoDetails?.title || "audio";

    for (const fmt of audioFormats.sort((a, b) => (b.averageBitrate || 0) - (a.averageBitrate || 0))) {
      if (fmt.url) {
        return { audioUrl: applyNTransform(fmt.url), title, contentType: fmt.mimeType, ext: fmt.mimeType?.includes("mp4") ? "mp4" : "webm" };
      }
      if (fmt.signatureCipher) {
        let audioUrl = decipherUrl(fmt.signatureCipher);
        if (audioUrl) {
          audioUrl = applyNTransform(audioUrl);
          return { audioUrl, title, contentType: fmt.mimeType, ext: fmt.mimeType?.includes("mp4") ? "mp4" : "webm" };
        }
      }
    }
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
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.youtube.com/",
        Origin: "https://www.youtube.com",
      },
    });

    if (!audioRes.ok) throw new Error(`Failed to fetch audio stream (${audioRes.status})`);

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
    return res.status(500).json({ error: "Failed to extract audio. Please check the URL and try again.", debug: err.message });
  }
}
