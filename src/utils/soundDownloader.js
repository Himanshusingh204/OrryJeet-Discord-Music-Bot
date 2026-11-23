const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const play = require('play-dl');
const ytdl = require('youtube-dl-exec');
const { soundFilesDir } = require('./sounds');
const { config } = require('../config');

async function downloadSound(url, name) {
  const parsedUrl = parseUrl(url);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeName = sanitizeFileName(name);
  const basePath = path.join(soundFilesDir, `${safeName}-${id}`);

  if (isDirectMp3(parsedUrl)) {
    const filePath = `${basePath}.mp3`;
    await downloadDirectMp3(parsedUrl.href, filePath);
    return filePath;
  }

  if (play.yt_validate(parsedUrl.href) === 'video') {
    const outputTemplate = `${basePath}.%(ext)s`;
    await ytdl(parsedUrl.href, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 5,
      output: outputTemplate,
      noPlaylist: true,
      noWarnings: true,
      extractorArgs: 'youtube:player-client=web_embedded',
      remoteComponents: 'ejs:npm',
      addHeader: config.youtubeCookie ? [`Cookie:${config.youtubeCookie}`] : undefined
    });

    const filePath = `${basePath}.mp3`;
    if (!fs.existsSync(filePath)) {
      throw new Error('Downloaded YouTube audio file was not created.');
    }

    return filePath;
  }

  throw new Error('Unsupported URL. Use a YouTube video link or a direct MP3 link.');
}

async function downloadAttachmentSound(attachment, name) {
  if (!attachment?.url) {
    throw new Error('Please attach a valid MP3 file.');
  }

  const fileName = attachment.name?.toLowerCase() ?? '';
  const contentType = attachment.contentType ?? '';
  if (!fileName.endsWith('.mp3') && contentType !== 'audio/mpeg') {
    throw new Error('Only MP3 attachments are supported.');
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safeName = sanitizeFileName(name);
  const filePath = path.join(soundFilesDir, `${safeName}-${id}.mp3`);
  await downloadDirectMp3(attachment.url, filePath);
  return filePath;
}

function parseUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported URL protocol.');
    }
    return parsed;
  } catch {
    throw new Error('Please provide a valid URL.');
  }
}

function isDirectMp3(url) {
  return url.pathname.toLowerCase().endsWith('.mp3');
}

async function downloadDirectMp3(url, filePath) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: config.youtubeCookie ? { cookie: config.youtubeCookie } : undefined
  });

  if (!response.ok) {
    throw new Error(`MP3 download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.includes('audio') && !contentType.includes('octet-stream')) {
    throw new Error('That direct link did not return an audio file.');
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath));
}

function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'sound';
}

module.exports = {
  downloadAttachmentSound,
  downloadSound
};
