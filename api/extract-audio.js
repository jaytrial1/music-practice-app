// Vercel Serverless Function
// NOTE: yt-dlp is not available in Vercel's serverless environment.
// YouTube extraction works only on the local dev server (server/index.js).
// For production, deploy the extraction server separately (e.g., Railway, Render)
// or use a third-party YouTube-to-MP3 API.

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

  return res.status(501).json({
    error: "YouTube extraction is not available on Vercel. Please run the app locally with 'npm run dev' for YouTube link support.",
  });
}
