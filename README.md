# Discord Music + Soundboard Bot

Discord.js v14 bot with slash commands, a JSON-backed YouTube soundboard, and a YouTube music queue powered by `discord-player`.

## Setup

1. Install Node.js 18+ and FFmpeg.
2. Run `npm install`.
3. Copy `config.example.json` to `config.json`.
4. Fill in your bot token and application client ID.
5. Enable the `Guild Voice States` intent in the Discord Developer Portal.
6. Deploy slash commands:

```bash
npm run deploy
```

7. Start the bot:

```bash
npm start
```

For faster slash command updates during testing, set `guildId` in `config.json`. Without it, commands deploy globally and may take a while to appear.

## Commands

- `/sound-add name url` saves a YouTube link or direct MP3 URL as a local sound.
- `/sound-add name mp3` saves an uploaded MP3 as a local sound.
- `/soundboard` opens a paged button soundboard for all saved sounds, with search, category filters, public mode, and soundboard volume buttons.
- `/sound-list` shows a paginated searchable list with category and source info.
- `/sound-remove` deletes a saved sound.
- `/sound-rename` renames a saved sound.
- `/sound-export` exports a JSON backup.
- `/sound-import` imports a JSON backup.
- `/orryplay query` plays a YouTube link or searches YouTube and queues the first result.
- `/radio seed` starts a YouTube radio automix from one song link or search result. It builds the `RD + videoId` radio playlist and keeps adding tracks as the queue runs low.
- `/dj mode type` remixes the current music queue. It does not search YouTube, use radio, or use the soundboard. Modes: `party`, `chill`, `meme`.
- `/dj off` turns DJ mode off.
- `/player` opens the music player controls.
- `/queue` shows the music player UI with pause, resume, skip, stop, refresh, volume, loop, shuffle, and clear buttons.
- `/skip` skips the current track.
- `/stop` stops playback and clears the queue.

Saved sounds are stored in `data/sounds.json`, and downloaded audio is stored in `data/sounds`. Both are created automatically at runtime.

## Docker

The Docker image includes FFmpeg.

1. Copy `.env.example` to `.env`.
2. Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and optionally `DISCORD_GUILD_ID`.
   If YouTube blocks playback from your host, set `YOUTUBE_COOKIE` to an exported YouTube cookie string.
3. Build and start the bot:

```bash
docker compose up -d --build
```

The Compose service deploys slash commands before starting the bot. You can also deploy manually from the same image:

```bash
docker compose run --rm musicbot npm run deploy
```

View logs:

```bash
docker compose logs -f musicbot
```

Soundboard data is persisted through the `./data:/app/data` volume.
