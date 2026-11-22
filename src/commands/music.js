import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import play from 'play-dl';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  entersState, 
  VoiceConnectionStatus, 
  AudioPlayerStatus 
} from '@discordjs/voice';
import { logger } from '../utils/logger.js';
import { createErrorEmbed, createSuccessEmbed } from '../utils/embeds.js';

// Global maps for music
const queues = new Map();
const players = new Map();
const connections = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Advanced Music Player System')
    .addSubcommand(subcommand =>
      subcommand
        .setName('play')
        .setDescription('Play a song from YouTube, Spotify, or SoundCloud')
        .addStringOption(option =>
          option.setName('query').setDescription('URL or search query').setRequired(true)
        )
    )
    .addSubcommand(subcommand => subcommand.setName('stop').setDescription('Stop music and clear queue'))
    .addSubcommand(subcommand => subcommand.setName('skip').setDescription('Skip the current song'))
    .addSubcommand(subcommand => subcommand.setName('queue').setDescription('Show the current music queue')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      return await interaction.reply({ embeds: [createErrorEmbed('Error', 'You must be in a voice channel!')], ephemeral: true });
    }

    try {
      if (subcommand === 'play') await handlePlay(interaction);
      else if (subcommand === 'stop') await handleStop(interaction);
      else if (subcommand === 'skip') await handleSkip(interaction);
      else if (subcommand === 'queue') await handleQueue(interaction);
    } catch (error) {
      logger.error('Music command error:', error);
      const errEmbed = createErrorEmbed('Error', error.message || 'Something went wrong.');
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errEmbed], ephemeral: true });
      }
    }
  },
  
  // Expose these for button handlers
  queues,
  players,
  handleSkip,
  handleStop
};

async function handlePlay(interaction) {
  await interaction.deferReply();
  const query = interaction.options.getString('query');
  const guildId = interaction.guildId;
  const voiceChannel = interaction.member.voice.channel;

  // Search and get video info
  let videoInfo;
  try {
    if (play.sp_validate(query) !== false) {
      if (play.is_expired()) await play.refreshToken();
      const sp_data = await play.spotify(query);
      if (sp_data.type === 'track') {
        const searched = await play.search(`${sp_data.name} ${sp_data.artists[0].name}`, { limit: 1 });
        videoInfo = searched[0];
      } else {
        throw new Error('Spotify playlists not fully supported in this demo. Try a track link!');
      }
    } else {
      const searched = await play.search(query, { limit: 1 });
      if (!searched || searched.length === 0) throw new Error('No results found.');
      videoInfo = searched[0];
    }
  } catch (err) {
    return await interaction.editReply({ embeds: [createErrorEmbed('Search Failed', err.message)] });
  }

  // Manage Queue
  if (!queues.has(guildId)) queues.set(guildId, []);
  const queue = queues.get(guildId);
  queue.push({ title: videoInfo.title, url: videoInfo.url, thumbnail: videoInfo.thumbnails?.[0]?.url, user: interaction.user.tag });

  // Connect to VC
  let connection = connections.get(guildId);
  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });
    connections.set(guildId, connection);
    
    const player = createAudioPlayer();
    players.set(guildId, player);
    connection.subscribe(player);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (q && q.length > 0) q.shift(); // remove finished song
      
      if (q && q.length > 0) {
        playNext(guildId, interaction.channel);
      } else {
        setTimeout(() => {
           const currentQ = queues.get(guildId);
           if (!currentQ || currentQ.length === 0) {
             const c = connections.get(guildId);
             if (c) c.destroy();
             connections.delete(guildId);
             players.delete(guildId);
           }
        }, 60000); // leave after 1 min of silence
      }
    });
  }

  if (players.get(guildId).state.status !== AudioPlayerStatus.Playing) {
    await playNext(guildId, interaction.channel);
    await interaction.editReply({ embeds: [createSuccessEmbed('Started Playing', `Added **${videoInfo.title}** to queue and started playback.`)] });
  } else {
    await interaction.editReply({ embeds: [createSuccessEmbed('Added to Queue', `Added **${videoInfo.title}** to queue at position #${queue.length - 1}.`)] });
  }
}

async function playNext(guildId, textChannel) {
  const queue = queues.get(guildId);
  if (!queue || queue.length === 0) return;
  const song = queue[0];
  const player = players.get(guildId);

  try {
    const stream = await play.stream(song.url);
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    player.play(resource);
    
    // UI for Music Player
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🎶 Now Playing')
      .setDescription(`[${song.title}](${song.url})`)
      .setThumbnail(song.thumbnail)
      .setFooter({ text: `Requested by ${song.user}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
    );

    await textChannel.send({ embeds: [embed], components: [row] });
  } catch (err) {
    logger.error('Play loop error:', err);
    queue.shift();
    if (queue.length > 0) playNext(guildId, textChannel);
  }
}

async function handleStop(interaction) {
  const guildId = interaction.guildId;
  const queue = queues.get(guildId);
  const player = players.get(guildId);

  if (queue) queue.length = 0; // clear
  if (player) player.stop();
  
  if (interaction.isButton()) {
      await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Music stopped and queue cleared.')], ephemeral: false });
  } else {
      await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Music stopped and queue cleared.')] });
  }
}

async function handleSkip(interaction) {
  const guildId = interaction.guildId;
  const player = players.get(guildId);
  if (player) {
    player.stop(); // Triggers Idle event, which plays next
    if (interaction.isButton()) {
        await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Song skipped!')], ephemeral: false });
    } else {
        await interaction.reply({ embeds: [createSuccessEmbed('Music', 'Song skipped!')] });
    }
  } else {
      const err = createErrorEmbed('Music', 'Nothing is playing right now.');
      if (interaction.isButton()) await interaction.reply({ embeds: [err], ephemeral: true });
      else await interaction.reply({ embeds: [err], ephemeral: true });
  }
}

async function handleQueue(interaction) {
  const queue = queues.get(interaction.guildId);
  if (!queue || queue.length === 0) {
    return await interaction.reply({ embeds: [createInfoEmbed('Queue', 'The queue is currently empty.')] });
  }
  
  const qString = queue.map((s, i) => `${i === 0 ? '**[Playing]**' : `${i}.`} ${s.title}`).join('\n');
  const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📜 Music Queue').setDescription(qString.substring(0, 4000));
  await interaction.reply({ embeds: [embed] });
}
