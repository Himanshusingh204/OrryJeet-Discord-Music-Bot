const { spawn } = require('node:child_process');
const {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const play = require('play-dl');
const ytdl = require('youtube-dl-exec');
const { config } = require('../config');

const queues = new Map();
const thumbnailCache = new Map();
const THUMBNAIL_CACHE_MAX = 200;
const RADIO_REFILL_AT = 3;
const RADIO_BATCH_SIZE = 12;

function getQueue(guildId) {
  return queues.get(guildId);
}

function createQueue(interaction, voiceChannel) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const queue = {
    guildId: interaction.guildId,
    textChannel: interaction.channel,
    connection,
    player,
    tracks: [],
    current: null,
    resource: null,
    process: null,
    volume: 0.8,
    loop: 'off',
    radio: null,
    dj: null,
    stopped: false
  };

  player.on(AudioPlayerStatus.Idle, () => {
    if (queue.process) {
      queue.process.kill('SIGKILL');
      queue.process = null;
    }
    if (queue.current && queue.loop === 'track') {
      queue.tracks.unshift(queue.current);
    } else if (queue.current && queue.loop === 'queue') {
      queue.tracks.push(queue.current);
    }
    queue.current = null;
    playNext(queue).catch((error) => handlePlaybackError(queue, error));
  });

  player.on('error', (error) => {
    handlePlaybackError(queue, error);
  });

  connection.on('error', (error) => {
    handlePlaybackError(queue, error);
  });

  queues.set(interaction.guildId, queue);
  return queue;
}

async function resolveTrack(query, requestedBy) {
  const trimmed = query.trim();
  const validation = play.yt_validate(trimmed);
  let url = trimmed;
  let title = trimmed;
  let duration = null;
  let thumbnail = null;

  if (validation !== 'video') {
    const results = await play.search(trimmed, {
      limit: 1,
      source: { youtube: 'video' }
    });

    if (!results.length) return null;
    const result = results[0];
    url = result.url;
    title = result.title;
    duration = result.durationRaw;
    thumbnail = normalizeThumbnail(result.thumbnail, url);
  } else {
    try {
      const info = await ytdl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        skipDownload: true,
        noPlaylist: true,
        extractorArgs: 'youtube:player-client=web_embedded',
        remoteComponents: 'ejs:npm',
        addHeader: config.youtubeCookie ? [`Cookie:${config.youtubeCookie}`] : undefined
      });
      title = info.title || title;
      duration = formatDuration(info.duration);
      thumbnail = normalizeThumbnail(info.thumbnail ?? info.thumbnails, url);
    } catch {
      title = url;
      thumbnail = getYouTubeThumbnail(url);
    }
  }

  return {
    url,
    title,
    duration,
    thumbnail,
    requestedBy
  };
}

async function enqueue(interaction, queryText) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return { ok: false, message: 'Join a voice channel first.' };
  }

  const track = await resolveTrack(queryText, interaction.user);
  if (!track) {
    return { ok: false, message: 'No YouTube results found.' };
  }

  const queue = getQueue(interaction.guildId) ?? createQueue(interaction, voiceChannel);
  queue.textChannel = interaction.channel;
  queue.tracks.push(track);

  if (!queue.current && queue.player.state.status !== AudioPlayerStatus.Playing) {
    await playNext(queue);
    return { ok: true, queued: false, track };
  }

  return { ok: true, queued: true, track };
}

async function startRadio(interaction, queryText) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    return { ok: false, message: 'Join a voice channel first.' };
  }

  const seedTrack = await resolveTrack(queryText, interaction.user);
  if (!seedTrack) {
    return { ok: false, message: 'No YouTube video found for that radio seed.' };
  }

  const videoId = extractYouTubeVideoId(seedTrack.url);
  if (!videoId) {
    return { ok: false, message: 'Radio needs a YouTube video link or searchable YouTube result.' };
  }

  const queue = getQueue(interaction.guildId) ?? createQueue(interaction, voiceChannel);
  queue.textChannel = interaction.channel;
  queue.radio = {
    active: true,
    seedUrl: seedTrack.url,
    seedTitle: seedTrack.title,
    videoId,
    playlistId: `RD${videoId}`,
    playlistUrl: buildRadioUrl(videoId),
    seenUrls: new Set([
      seedTrack.url,
      queue.current?.url,
      ...queue.tracks.map((track) => track.url)
    ].filter(Boolean)),
    requestedBy: interaction.user
  };

  const tracks = await fetchRadioTracks(queue.radio, interaction.user);
  queue.tracks.push(...tracks);

  if (!queue.current && queue.player.state.status !== AudioPlayerStatus.Playing) {
    await playNext(queue);
  }

  return {
    ok: true,
    seedTrack,
    queued: tracks.length,
    radioUrl: queue.radio.playlistUrl
  };
}

async function startDjMode(interaction, mode) {
  const queue = getQueue(interaction.guildId);
  if (!queue?.current && !queue?.tracks.length) {
    return {
      ok: false,
      message: 'Start music first with `/orryplay`, then add a few tracks to the queue before using DJ mode.'
    };
  }

  queue.textChannel = interaction.channel;
  queue.radio = null;
  queue.dj = {
    active: true,
    mode,
    startedBy: interaction.user.id,
    startedAt: new Date().toISOString()
  };
  queue.loop = 'off';

  // DJ mode remixes only the existing music queue. It never pulls from radio,
  // YouTube search, or the soundboard; it just changes how queued songs flow.
  remixQueue(queue, mode);
  if (mode === 'party') {
    queue.volume = Math.max(queue.volume, 0.9);
    queue.resource?.volume?.setVolume(queue.volume);
  } else if (mode === 'chill') {
    queue.volume = Math.min(queue.volume, 0.7);
    queue.resource?.volume?.setVolume(queue.volume);
  } else if (mode === 'meme') {
    queue.volume = Math.max(queue.volume, 0.85);
    queue.resource?.volume?.setVolume(queue.volume);
  }

  return {
    ok: true,
    remixed: queue.tracks.length,
    mode
  };
}

async function playNext(queue) {
  if (queue.stopped) return;
  await ensureRadioTracks(queue);

  const nextTrack = queue.tracks.shift();
  if (!nextTrack) {
    setTimeout(() => {
      if (!queue.current && !queue.tracks.length) {
        queue.connection.destroy();
        queues.delete(queue.guildId);
      }
    }, 60_000);
    return;
  }

  queue.current = nextTrack;
  if (!queue.current.thumbnail) {
    queue.current.thumbnail = getYouTubeThumbnail(queue.current.url);
  }
  await entersState(queue.connection, VoiceConnectionStatus.Ready, 20_000);

  const child = spawn(ytdl.constants.YOUTUBE_DL_PATH, [
    nextTrack.url,
    '--output',
    '-',
    '--format',
    'bestaudio',
    '--no-warnings',
    '--no-playlist',
    '--quiet',
    ...getCookieArgs()
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  queue.process = child;

  child.stderr.on('data', (chunk) => {
    const message = chunk.toString().trim();
    if (message) console.error(`yt-dlp: ${message}`);
  });

  child.on('error', (error) => handlePlaybackError(queue, error));

  const resource = createAudioResource(child.stdout, {
    inputType: StreamType.Arbitrary,
    inlineVolume: true
  });

  resource.volume?.setVolume(queue.volume);
  queue.resource = resource;
  queue.player.play(resource);
  queue.textChannel?.send(`Now playing: **${nextTrack.title}**`).catch(() => {});
}

async function ensureRadioTracks(queue) {
  if (!queue.radio?.active || queue.tracks.length > RADIO_REFILL_AT || queue.radio.loading) return;
  queue.radio.loading = true;

  try {
    const tracks = await fetchRadioTracks(queue.radio, queue.radio.requestedBy);
    queue.tracks.push(...tracks);
    if (tracks.length) {
      queue.textChannel?.send(`Radio added ${tracks.length} more tracks from **${queue.radio.seedTitle}**.`).catch(() => {});
    }
  } finally {
    queue.radio.loading = false;
  }
}

async function fetchRadioTracks(radio, requestedBy) {
  const info = await ytdl(radio.playlistUrl, {
    dumpSingleJson: true,
    flatPlaylist: true,
    playlistEnd: RADIO_BATCH_SIZE + 8,
    noWarnings: true,
    skipDownload: true,
    extractorArgs: 'youtube:player-client=web_embedded',
    remoteComponents: 'ejs:npm',
    addHeader: config.youtubeCookie ? [`Cookie:${config.youtubeCookie}`] : undefined
  });

  const entries = Array.isArray(info.entries) ? info.entries : [];
  const tracks = [];

  for (const entry of entries) {
    const url = entry.url?.startsWith('http')
      ? entry.url
      : `https://www.youtube.com/watch?v=${entry.id ?? entry.url}`;
    if (!entry.id || radio.seenUrls.has(url)) continue;

    radio.seenUrls.add(url);
    tracks.push({
      url,
      title: entry.title || url,
      duration: formatDuration(entry.duration),
      thumbnail: normalizeThumbnail(entry.thumbnail ?? entry.thumbnails, url),
      requestedBy,
      radio: true
    });

    if (tracks.length >= RADIO_BATCH_SIZE) break;
  }

  return tracks;
}

function getCookieArgs() {
  const args = [
    '--extractor-args', 'youtube:player-client=web_embedded',
    '--remote-components', 'ejs:npm'
  ];
  if (config.youtubeCookie) {
    args.push('--add-header', `Cookie:${config.youtubeCookie}`);
  }
  return args;
}

function pause(guildId) {
  const queue = getQueue(guildId);
  if (!queue?.current) return false;
  return queue.player.pause();
}

function resume(guildId) {
  const queue = getQueue(guildId);
  if (!queue?.current) return false;
  return queue.player.unpause();
}

function skip(guildId) {
  const queue = getQueue(guildId);
  if (!queue?.current) return false;
  queue.process?.kill('SIGKILL');
  queue.player.stop(true);
  return true;
}

function stop(guildId) {
  const queue = getQueue(guildId);
  if (!queue) return false;

  queue.stopped = true;
  queue.tracks = [];
  queue.process?.kill('SIGKILL');
  queue.player.stop(true);
  queue.connection.destroy();
  queues.delete(guildId);
  return true;
}

function stopRadio(guildId) {
  const queue = getQueue(guildId);
  if (!queue?.radio?.active) return false;
  queue.radio.active = false;
  return true;
}

function stopDjMode(guildId) {
  const queue = getQueue(guildId);
  if (!queue?.dj?.active) return false;
  queue.dj.active = false;
  if (queue.radio?.active) {
    queue.radio.active = false;
  }
  return true;
}

function remixQueue(queue, mode) {
  if (!queue.tracks.length) return;

  if (mode === 'chill') {
    // Chill mode keeps the user's rough queue order, but alternates longer and
    // shorter tracks where duration metadata exists so the flow feels calmer.
    queue.tracks = weaveTracksByDuration(queue.tracks);
    return;
  }

  // Party and meme modes are more energetic: randomize upcoming tracks and
  // avoid leaving obvious duplicates next to each other when possible.
  queue.tracks = spreadSimilarTracks(shuffleItems(queue.tracks));
}

function clearQueue(guildId) {
  const queue = getQueue(guildId);
  if (!queue) return false;
  queue.tracks = [];
  return true;
}

function shuffleQueue(guildId) {
  const queue = getQueue(guildId);
  if (!queue?.tracks.length) return false;

  for (let index = queue.tracks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [queue.tracks[index], queue.tracks[swapIndex]] = [queue.tracks[swapIndex], queue.tracks[index]];
  }

  return true;
}

function setVolume(guildId, volume) {
  const queue = getQueue(guildId);
  if (!queue) return null;
  queue.volume = Math.min(1.5, Math.max(0, volume));
  queue.resource?.volume?.setVolume(queue.volume);
  return queue.volume;
}

function cycleLoop(guildId) {
  const queue = getQueue(guildId);
  if (!queue) return null;

  const next = {
    off: 'track',
    track: 'queue',
    queue: 'off'
  };
  queue.loop = next[queue.loop] ?? 'off';
  return queue.loop;
}

function handlePlaybackError(queue, error) {
  console.error('Music playback error:', error);
  queue.process?.kill('SIGKILL');
  queue.process = null;
  queue.current = null;
  queue.textChannel?.send('I could not play that track. Try another link or search.').catch(() => {});
  playNext(queue).catch((nextError) => console.error('Failed to continue queue:', nextError));
}

function buildRadioUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}&list=RD${videoId}`;
}

function normalizeThumbnail(thumbnail, url) {
  if (typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
    return thumbnail;
  }

  if (Array.isArray(thumbnail)) {
    const best = thumbnail
      .filter((entry) => entry?.url)
      .sort((first, second) => (second.width ?? 0) - (first.width ?? 0))[0];
    if (best?.url) return best.url;
  }

  if (thumbnail?.url) {
    return thumbnail.url;
  }

  return getYouTubeThumbnail(url);
}

function getYouTubeThumbnail(url) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  if (thumbnailCache.has(videoId)) {
    return thumbnailCache.get(videoId);
  }

  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (thumbnailCache.size >= THUMBNAIL_CACHE_MAX) {
    const firstKey = thumbnailCache.keys().next().value;
    thumbnailCache.delete(firstKey);
  }
  thumbnailCache.set(videoId, thumbnailUrl);

  return thumbnailUrl;
}

function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function weaveTracksByDuration(tracks) {
  const withSeconds = tracks.map((track) => ({
    track,
    seconds: parseDuration(track.duration)
  }));
  const known = withSeconds.filter((entry) => entry.seconds !== null)
    .sort((first, second) => first.seconds - second.seconds);
  const unknown = withSeconds.filter((entry) => entry.seconds === null).map((entry) => entry.track);
  const woven = [];

  while (known.length) {
    woven.push(known.shift().track);
    if (known.length) woven.push(known.pop().track);
  }

  return [...woven, ...unknown];
}

function spreadSimilarTracks(tracks) {
  const result = [];
  const pending = [...tracks];

  while (pending.length) {
    const last = result.at(-1);
    const index = pending.findIndex((track) => !last || getTitleKey(track.title) !== getTitleKey(last.title));
    result.push(pending.splice(index === -1 ? 0 : index, 1)[0]);
  }

  return result;
}

function getTitleKey(title) {
  return String(title ?? '').toLowerCase().split(/[-(|]/)[0].trim();
}

function parseDuration(duration) {
  if (!duration || typeof duration !== 'string') return null;
  const parts = duration.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function extractYouTubeVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1) || null;
    if (url.searchParams.get('v')) return url.searchParams.get('v');
    if (url.pathname.includes('/shorts/')) return url.pathname.split('/shorts/')[1]?.split('/')[0] ?? null;
  } catch {
    return null;
  }

  return null;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

module.exports = {
  enqueue,
  clearQueue,
  cycleLoop,
  getQueue,
  pause,
  resume,
  startDjMode,
  startRadio,
  setVolume,
  shuffleQueue,
  skip,
  stop,
  stopRadio,
  stopDjMode
};
