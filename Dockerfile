FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
ENV YOUTUBE_DL_SKIP_PYTHON_CHECK=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates python3 curl unzip \
  && curl -fsSL -o /tmp/deno.zip https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
  && unzip -o /tmp/deno.zip -d /usr/local/bin \
  && chmod +x /usr/local/bin/deno \
  && rm /tmp/deno.zip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY data/.gitkeep ./data/.gitkeep

#RUN chown -R node:node /app

#USER node

CMD ["npm", "start"]
