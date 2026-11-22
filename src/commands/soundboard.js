import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { joinVoice, playSound, stopSound, leaveVoice, isConnectedToVoice } from '../utils/voice.js';
import { getAllSounds, getSound, addSound, deleteSound, getGuildSettings } from '../utils/database.js';
import { createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Validates that a URL is safe from SSRF and local loopback access
 */
function isSafeRemoteUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    
    const hostname = parsed.hostname.toLowerCase();
    // Block local / private IP ranges and localhost
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('169.254.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes a sound name to avoid path traversal
 */
function getSafeFileName(soundName) {
  const sanitized = soundName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return `${sanitized}.mp3`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('soundboard')
    .setDescription('Control the soundboard system')
    .addSubcommand(subcommand => subcommand.setName('play').setDescription('Display available sounds and play one'))
    .addSubcommand(subcommand => subcommand.setName('stop').setDescription('Stop the current sound'))
    .addSubcommand(subcommand => subcommand.setName('list').setDescription('List all available sounds'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('upload')
        .setDescription('Upload a custom sound to the soundboard')
        .addAttachmentOption(option => option.setName('sound_file').setDescription('MP3, WAV, or OGG file').setRequired(true))
        .addStringOption(option => option.setName('name').setDescription('Name for the sound').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('link')
        .setDescription('Download and add a sound from a direct MP3 link')
        .addStringOption(option => option.setName('url').setDescription('Direct URL to audio file').setRequired(true))
        .addStringOption(option => option.setName('name').setDescription('Name for the sound').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a custom sound (Admin only)')
        .addStringOption(option => option.setName('sound_name').setDescription('Name of the sound to remove').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('youtube')
        .setDescription('Download and add a sound from YouTube')
        .addStringOption(option => option.setName('url').setDescription('YouTube video URL').setRequired(true))
        .addStringOption(option => option.setName('name').setDescription('Name for the sound').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const customSoundsDir = path.resolve('./data/custom_sounds');
    
    if (!fs.existsSync(customSoundsDir)) {
      fs.mkdirSync(customSoundsDir, { recursive: true });
    }

    try {
      switch (subcommand) {
        case 'play': await handlePlaySubcommand(interaction); break;
        case 'stop': await handleStopSubcommand(interaction); break;
        case 'list': await handleListSubcommand(interaction); break;
        case 'upload': await handleUploadSubcommand(interaction, customSoundsDir); break;
        case 'link': await handleLinkSubcommand(interaction, customSoundsDir); break;
        case 'remove': await handleRemoveSubcommand(interaction, customSoundsDir); break;
        case 'youtube': await handleYoutubeSubcommand(interaction, customSoundsDir); break;
      }
    } catch (error) {
      logger.error(`Error in soundboard command (${subcommand}):`, error);
      const errorEmbed = createErrorEmbed('Soundboard Error', error.message);
      if (interaction.replied || interaction.deferred) await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      else await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};

export async function handleSoundboardButtons(interaction) {
  const customId = interaction.customId;
  if (customId.startsWith('sb_page_')) {
    const page = parseInt(customId.split('_')[2], 10);
    await handlePlayPagination(interaction, page, true);
  } else if (customId.startsWith('sb_play_')) {
    const soundName = customId.substring(8);
    await playSoundboardSound(interaction, soundName);
  }
}

async function handlePlaySubcommand(interaction) {
  await handlePlayPagination(interaction, 0, false);
}

async function handlePlayPagination(interaction, page, isUpdate) {
  const sounds = await getAllSounds(interaction.guildId);

  if (sounds.length === 0) {
    const embed = createErrorEmbed('No Sounds Available', 'No sounds found in the soundboard.');
    if (isUpdate) return await interaction.update({ embeds: [embed], components: [] });
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const itemsPerPage = 10;
  const maxPage = Math.ceil(sounds.length / itemsPerPage) - 1;
  const currentPage = Math.max(0, Math.min(page, maxPage));
  
  const startIdx = currentPage * itemsPerPage;
  const currentSounds = sounds.slice(startIdx, startIdx + itemsPerPage);

  const rows = [];
  let currentRow = new ActionRowBuilder();

  currentSounds.forEach((sound, index) => {
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`sb_play_${sound.name}`)
        .setLabel(sound.name.length > 80 ? sound.name.substring(0, 77) + '...' : sound.name)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(sound.is_default ? '📌' : '📁')
    );
    if (currentRow.components.length === 5 || index === currentSounds.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  const paginationRow = new ActionRowBuilder();
  paginationRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`sb_page_${currentPage - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0),
    new ButtonBuilder()
      .setCustomId(`sb_page_${currentPage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === maxPage)
  );
  rows.push(paginationRow);

  const embed = createInfoEmbed(
    'Soundboard',
    `Select a sound to play. (Page ${currentPage + 1}/${maxPage + 1})\nTotal Sounds: ${sounds.length}`
  );

  if (isUpdate) {
    await interaction.update({ embeds: [embed], components: rows });
  } else {
    await interaction.reply({ embeds: [embed], components: rows, ephemeral: false });
  }
}

async function playSoundboardSound(interaction, soundName) {
  if (!interaction.member?.voice?.channel) {
    const embed = createErrorEmbed('Not in Voice Channel', 'You must be in a voice channel to play sounds.');
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const voiceChannel = interaction.member.voice.channel;
  const sound = await getSound(soundName);
  
  if (!sound) {
    const embed = createErrorEmbed('Sound Not Found', `Sound "${soundName}" not found.`);
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  if (!isConnectedToVoice(interaction.guildId)) {
    await joinVoice(voiceChannel);
  }

  await playSound(interaction.guildId, sound.file_path, 0.5);

  const embed = createSuccessEmbed('Soundboard', `🔊 Now playing: **${soundName}**`);
  await interaction.editReply({ embeds: [embed] });
  logger.info(`Sound played: ${soundName} by ${interaction.user.tag}`);
}

async function handleStopSubcommand(interaction) {
  if (!isConnectedToVoice(interaction.guildId)) {
    return await interaction.reply({ embeds: [createErrorEmbed('Not Connected', 'Bot is not connected to a voice channel.')], ephemeral: true });
  }
  const stopped = stopSound(interaction.guildId);
  if (stopped) await interaction.reply({ embeds: [createSuccessEmbed('Soundboard', '⏹️ Playback stopped')], ephemeral: true });
  else await interaction.reply({ embeds: [createErrorEmbed('Playback Error', 'Nothing is currently playing.')], ephemeral: true });
}

async function handleListSubcommand(interaction) {
  const sounds = await getAllSounds(interaction.guildId);
  if (sounds.length === 0) return await interaction.reply({ embeds: [createErrorEmbed('No Sounds', 'The soundboard is empty.')], ephemeral: true });

  const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📋 Available Sounds').setTimestamp();
  
  const defaultSounds = sounds.filter(s => s.is_default);
  const customSounds = sounds.filter(s => !s.is_default);

  if (defaultSounds.length > 0) embed.addFields({ name: '📌 Default Sounds', value: defaultSounds.map(s => `\`${s.name}\``).join(', ') });
  if (customSounds.length > 0) embed.addFields({ name: '📁 Custom Sounds', value: customSounds.map(s => `\`${s.name}\``).join(', ') });

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

async function handleLinkSubcommand(interaction, customSoundsDir) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need Manage Messages permission to upload sounds.')], ephemeral: true });
  }
  
  await interaction.deferReply({ ephemeral: true });
  const url = interaction.options.getString('url');
  const soundName = interaction.options.getString('name');

  if (!isSafeRemoteUrl(url)) {
    return await interaction.editReply({ embeds: [createErrorEmbed('Security Error', 'Invalid or restricted URL provided.')] });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error('Downloaded file exceeds maximum permitted size of 5 MB.');
    }

    const fileName = getSafeFileName(soundName);
    const filePath = path.join(customSoundsDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(buffer));
    await addSound(soundName, filePath, interaction.guildId, interaction.user.id, false, null, url);

    const embed = createSuccessEmbed('Sound Added', `✅ **${soundName}** has been added to the soundboard from URL!`);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Link Upload error:`, error);
    await interaction.editReply({ embeds: [createErrorEmbed('Upload Failed', error.message)] });
  }
}

async function handleUploadSubcommand(interaction, customSoundsDir) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need Manage Messages permission to upload sounds.')], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const attachment = interaction.options.getAttachment('sound_file');
  const soundName = interaction.options.getString('name');

  const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3'];
  if (!validTypes.includes(attachment.contentType) && !attachment.name.endsWith('.mp3')) {
    return await interaction.editReply({ embeds: [createErrorEmbed('Invalid File Type', 'Only MP3, WAV, and OGG files are supported.')] });
  }
  if (attachment.size > 5 * 1024 * 1024) {
    return await interaction.editReply({ embeds: [createErrorEmbed('File Too Large', 'Maximum file size is 5 MB.')] });
  }

  try {
    const response = await fetch(attachment.url);
    const buffer = await response.arrayBuffer();
    const fileName = getSafeFileName(soundName);
    const filePath = path.join(customSoundsDir, fileName);

    fs.writeFileSync(filePath, Buffer.from(buffer));
    await addSound(soundName, filePath, interaction.guildId, interaction.user.id, false, null, null);

    const embed = createSuccessEmbed('Sound Uploaded', `✅ **${soundName}** has been added to the soundboard!`);
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error(`Upload error:`, error);
    await interaction.editReply({ embeds: [createErrorEmbed('Upload Failed', error.message)] });
  }
}

async function handleRemoveSubcommand(interaction, customSoundsDir) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'Only administrators can remove sounds.')], ephemeral: true });
  }
  
  const soundName = interaction.options.getString('sound_name');
  const sound = await getSound(soundName);

  if (!sound) return await interaction.reply({ embeds: [createErrorEmbed('Not Found', `Sound "${soundName}" not found.`)], ephemeral: true });
  if (sound.is_default) return await interaction.reply({ embeds: [createErrorEmbed('Cannot Delete', 'Default sounds cannot be removed.')], ephemeral: true });

  try {
    if (fs.existsSync(sound.file_path)) fs.unlinkSync(sound.file_path);
    await deleteSound(soundName);
    await interaction.reply({ embeds: [createSuccessEmbed('Sound Removed', `✅ **${soundName}** has been removed from the soundboard.`)], ephemeral: true });
  } catch (error) {
    logger.error(`Remove error:`, error);
    await interaction.reply({ embeds: [createErrorEmbed('Removal Failed', error.message)], ephemeral: true });
  }
}

async function handleYoutubeSubcommand(interaction, customSoundsDir) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return await interaction.reply({ embeds: [createErrorEmbed('Permission Denied', 'You need Manage Messages permission to add sounds.')], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const url = interaction.options.getString('url');
  const soundName = interaction.options.getString('name');

  try {
    const { downloadYoutubeAudio } = await import('../utils/voice.js');
    const fileName = getSafeFileName(soundName);
    const filePath = path.join(customSoundsDir, fileName);

    await downloadYoutubeAudio(url, filePath);
    await addSound(soundName, filePath, interaction.guildId, interaction.user.id, false, null, url);
    await interaction.editReply({ embeds: [createSuccessEmbed('YouTube Sound Added', `✅ **${soundName}** has been added to the soundboard!`)] });
  } catch (error) {
    logger.error(`YouTube download error:`, error);
    await interaction.editReply({ embeds: [createErrorEmbed('Download Failed', error.message || 'Failed to download audio.')] });
  }
}
