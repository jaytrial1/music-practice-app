FROM node:20-slim

# Install Python, yt-dlp, and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install --break-system-packages -U yt-dlp

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install --production

# Copy server code
COPY backend/ ./

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server.js"]
