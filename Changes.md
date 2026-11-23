# Changes

## 2026-04-30

- Added button-based soundboard UI with pagination.
- Added local sound storage using `data/sounds.json` and `data/sounds`.
- Added support for YouTube links, direct MP3 URLs, and uploaded MP3 files in `/sound-add`.
- Added stable sound IDs and automatic migration for older sound entries.
- Added per-server soundboard support for new sounds.
- Added sound categories: `memes`, `music`, `effects`, and `favorites`.
- Added `/sound-remove` to delete saved sounds.
- Added `/sound-rename` to rename saved sounds.
- Added `/sound-list` with search, category filter, and pagination.
- Added `/sound-export` and `/sound-import` for JSON soundboard backups.
- Added autocomplete for sound search, remove, and rename flows.
- Added public/private soundboard display option.
- Sorted soundboard results alphabetically.
- Simplified `/soundboard` display from table format to a clean numbered list.
- Added soundboard volume controls and immediate volume updates for currently playing sounds.
- Added music player buttons for pause, resume, skip, stop, refresh, volume, loop, shuffle, and clear queue.
- Removed noisy follow-up messages from player and volume buttons.
- Added `/player` command for opening the music control panel.
- Added YouTube thumbnail display in the music player when available.
- Added `/radio` command that builds YouTube radio URLs using `RD + videoId`.
- Added radio automix refill behavior while the queue runs low.
- Added `/dj mode type` and `/dj off`.
- Reworked DJ mode so it remixes only the current music queue instead of using YouTube search, radio, or soundboard entries.
- Added DJ modes: `party`, `chill`, and `meme`.
- Added DJ status and Stop DJ button to the music player UI.
- Fixed music volume buttons so they affect the currently playing track immediately.
- Fixed Windows playback for Docker-style `/app/data/sounds/...` saved paths.
- Removed the web dashboard feature and dashboard startup code.
