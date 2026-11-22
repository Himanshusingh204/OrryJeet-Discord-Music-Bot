FROM node:18-alpine

# Install system audio and compilation tools
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    git \
    yt-dlp

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code and config
COPY src ./src
COPY ecosystem.config.json ./

# Ensure data and logs directories exist with correct permissions
RUN mkdir -p ./data/custom_sounds ./logs && chown -R node:node /app

# Non-root user for security compliance
USER node

# Container healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "process.exit(0)"

# Start bot process
CMD ["node", "src/bot.js"]
