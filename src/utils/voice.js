import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  VoiceConnectionStatus,
  AudioPlayerStatus,
} from '@discordjs/voice';
import { createReadStream, existsSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

// Unified global registry for active voice connections and players
const activeConnections = new Map();
const players = new Map();

/**
 * Connects the bot to a specified Discord Voice Channel
 */
export async function joinVoice(voiceChannel) {
  try {
    const existing = activeConnections.get(voiceChannel.guild.id);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      return existing;
    }

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // Wait up to 30 seconds for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    activeConnections.set(voiceChannel.guild.id, connection);
    logger.info(`Joined voice channel: ${voiceChannel.name} in guild: ${voiceChannel.guild.name}`);

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Reconnection successful
      } catch {
        // Disconnected permanently
        leaveVoice(voiceChannel.guild.id);
      }
    });

    connection.on('error', error => {
      logger.error(`Voice connection error in ${voiceChannel.guild.name}:`, error);
    });

    return connection;
  } catch (error) {
    logger.error(`Failed to join voice channel ${voiceChannel.name}:`, error);
    throw error;
  }
}

/**
 * Leaves the voice channel in a given guild and cleans up resources
 */
export async function leaveVoice(guildId) {
  try {
    const player = players.get(guildId);
    if (player) {
      player.stop(true);
      players.delete(guildId);
    }

    const connection = activeConnections.get(guildId);
    if (connection) {
      if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
      activeConnections.delete(guildId);
      logger.info(`Cleaned up and left voice channel in guild: ${guildId}`);
    }
  } catch (error) {
    logger.error(`Failed to leave voice channel in guild ${guildId}:`, error);
  }
}

/**
 * Plays a local sound file in a guild's voice connection
 */
export async function playSound(guildId, soundPath, volume = 0.5) {
  try {
    const connection = activeConnections.get(guildId);
    if (!connection) {
      throw new Error('Bot is not connected to a voice channel.');
    }

    if (!existsSync(soundPath)) {
      throw new Error('Audio asset file was not found on disk.');
    }

    // Get or create dedicated guild player
    let player = players.get(guildId);
    if (!player) {
      player = createAudioPlayer();
      players.set(guildId, player);
      connection.subscribe(player);

      player.on('error', error => {
        logger.error(`Audio player error in guild ${guildId}:`, error);
      });
    }

    const resource = createAudioResource(createReadStream(soundPath), {
      inlineVolume: true,
    });

    if (resource.volume) {
      resource.volume.setVolume(Math.max(0, Math.min(1, volume)));
    }

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 5_000).catch(() => null);

    logger.info(`Playing sound: ${soundPath} in guild ${guildId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to play sound in guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Stops any current playback in a guild
 */
export function stopSound(guildId) {
  try {
    const player = players.get(guildId);
    if (player) {
      player.stop(true);
      logger.info(`Stopped playback in guild ${guildId}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Failed to stop playback in guild ${guildId}:`, error);
    throw error;
  }
}

/**
 * Safely downloads YouTube audio using yt-dlp with argument array to prevent command injection
 */
export async function downloadYoutubeAudio(url, outputPath) {
  // Validate URL protocol and format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL protocol. Only HTTP and HTTPS are permitted.');
    }
  } catch (err) {
    throw new Error(`Invalid URL provided: ${err.message}`);
  }

  // Ensure output directory exists and output path is valid
  const resolvedOutput = path.resolve(outputPath);

  try {
    await execFileAsync('yt-dlp', [
      '--no-playlist',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--max-filesize', '15M',
      '-o', resolvedOutput,
      '--',
      url
    ], { timeout: 180000 }); // 3-minute hard timeout

    logger.info(`Successfully downloaded YouTube audio: ${url}`);
    return true;
  } catch (error) {
    logger.error(`yt-dlp execution error for ${url}:`, error);
    throw new Error('Failed to process YouTube audio stream. Ensure yt-dlp is installed and the video is public.');
  }
}

export function isConnectedToVoice(guildId) {
  const connection = activeConnections.get(guildId);
  return connection && connection.state.status !== VoiceConnectionStatus.Destroyed;
}

export function getConnection(guildId) {
  return activeConnections.get(guildId);
}

export function getPlayer(guildId) {
  return players.get(guildId);
}

export function getAllConnections() {
  return activeConnections;
}
