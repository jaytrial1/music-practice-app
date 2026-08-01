# Vocal Practice Pro - YouTube Extraction Backend

This is the backend service for YouTube audio extraction. It runs on Render free tier and uses yt-dlp to extract audio from YouTube videos.

## Deployment Instructions

### Step 1: Deploy Backend to Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository: `jaytrial1/music-practice-app`
4. Configure the service:
   - **Name**: `vocal-practice-backend` (or any name you prefer)
   - **Runtime**: Docker
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Instance Type**: Free
5. Click **Create Web Service**
6. Wait for deployment (~2-3 minutes)
7. Copy your backend URL (e.g., `https://vocal-practice-backend.onrender.com`)

### Step 2: Configure Vercel Frontend

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add a new variable:
   - **Key**: `RENDER_BACKEND_URL`
   - **Value**: Your backend URL from Step 1 (e.g., `https://vocal-practice-backend.onrender.com`)
4. Save and redeploy

### Step 3: Test

1. Open your Vercel app
2. Click the YouTube tab
3. Paste a YouTube link
4. Click Extract - it should work!

## How It Works

- **Vercel frontend** → Calls `/api/extract-audio` endpoint
- **Vercel serverless function** → Proxies request to Render backend
- **Render backend** → Uses yt-dlp to extract audio, streams it back
- **User's browser** → Receives audio and plays it

## Free Tier Limitations

- Render free tier spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Subsequent requests are fast (~2-5 seconds)

## Troubleshooting

If extraction fails:
1. Check if Render backend is running (visit your backend URL)
2. Verify `RENDER_BACKEND_URL` is set correctly in Vercel
3. Check Render logs for errors
