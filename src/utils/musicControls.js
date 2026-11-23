const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const { clearQueue, cycleLoop, getQueue, pause, resume, setVolume, shuffleQueue, skip, stop, stopDjMode, stopRadio } = require('./music');

function buildMusicControls(guildId) {
  const queue = getQueue(guildId);
  const current = queue?.current;
  const upcoming = queue?.tracks ?? [];

  const embed = new EmbedBuilder()
    .setTitle('Music Player')
    .setDescription(current ? nowPlayingText(queue) : 'Nothing is playing right now.')
    .addFields({
      name: `Up next (${upcoming.length})`,
      value: upcoming.length
        ? upcoming.slice(0, 5).map((track, index) => `${index + 1}. ${track.title}`).join('\n')
        : 'No upcoming tracks.'
    })
    .addFields({
      name: 'Radio',
      value: queue?.radio?.active
        ? `On - ${queue.radio.seedTitle}\n${queue.radio.playlistUrl}`
        : 'Off'
    })
    .addFields({
      name: 'DJ',
      value: queue?.dj?.active ? `On - ${queue.dj.mode}` : 'Off'
    })
    .setFooter({ text: `Volume ${Math.round((queue?.volume ?? 0.8) * 100)}% - Loop ${queue?.loop ?? 'off'}` });

  if (current?.thumbnail) {
    embed.setThumbnail(current.thumbnail);
  }

  const playbackRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:pause')
      .setLabel('Pause')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!current),
    new ButtonBuilder()
      .setCustomId('music:resume')
      .setLabel('Resume')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!current),
    new ButtonBuilder()
      .setCustomId('music:skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!current),
    new ButtonBuilder()
      .setCustomId('music:stop')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!queue),
    new ButtonBuilder()
      .setCustomId('music:refresh')
      .setLabel('Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  const queueRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:vol-down')
      .setLabel('Vol -')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue),
    new ButtonBuilder()
      .setCustomId('music:vol-up')
      .setLabel('Vol +')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue),
    new ButtonBuilder()
      .setCustomId('music:loop')
      .setLabel('Loop')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue),
    new ButtonBuilder()
      .setCustomId('music:shuffle')
      .setLabel('Shuffle')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!upcoming.length),
    new ButtonBuilder()
      .setCustomId('music:clear')
      .setLabel('Clear')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!upcoming.length)
  );

  const radioRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:radio-stop')
      .setLabel('Stop Radio')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!queue?.radio?.active),
    new ButtonBuilder()
      .setCustomId('music:dj-stop')
      .setLabel('Stop DJ')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!queue?.dj?.active)
  );

  return {
    embeds: [embed],
    components: [playbackRow, queueRow, radioRow]
  };
}

async function handleMusicButton(interaction) {
  const action = interaction.customId.slice('music:'.length);

  if (action === 'pause') {
    pause(interaction.guildId);
  } else if (action === 'resume') {
    resume(interaction.guildId);
  } else if (action === 'skip') {
    skip(interaction.guildId);
  } else if (action === 'stop') {
    stop(interaction.guildId);
  } else if (action === 'vol-down' || action === 'vol-up') {
    const queue = getQueue(interaction.guildId);
    setVolume(interaction.guildId, (queue?.volume ?? 0.8) + (action === 'vol-up' ? 0.1 : -0.1));
  } else if (action === 'loop') {
    cycleLoop(interaction.guildId);
  } else if (action === 'shuffle') {
    shuffleQueue(interaction.guildId);
  } else if (action === 'clear') {
    clearQueue(interaction.guildId);
  } else if (action === 'radio-stop') {
    stopRadio(interaction.guildId);
  } else if (action === 'dj-stop') {
    stopDjMode(interaction.guildId);
  }

  await interaction.update(buildMusicControls(interaction.guildId));
}

module.exports = {
  buildMusicControls,
  handleMusicButton
};

function nowPlayingText(queue) {
  const track = queue.current;
  const requester = track.requestedBy ? `\nRequested by: ${track.requestedBy}` : '';
  const duration = track.duration ? `\nDuration: ${track.duration}` : '';
  return `Now playing: **${track.title}**${duration}${requester}`;
}
