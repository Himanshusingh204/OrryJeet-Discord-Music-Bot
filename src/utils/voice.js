const {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const fs = require('node:fs');
const path = require('node:path');
const { getQueue } = require('./music');
const { soundFilesDir } = require('./sounds');

const latestSoundPlayers = new Map();
const latestSoundResources = new Map();
const soundVolumes = new Map();

async function playSound(interaction, sound) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    await interaction.reply({ content: 'Join a voice channel first.', ephemeral: true });
    return;
  }

  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    await interaction.update({ components: interaction.message.components });
  } else {
    await interaction.deferReply({ ephemeral: true });
  }

  const filePath = resolveSoundFilePath(sound.filePath);
  if (!filePath) {
    const errorMsg = 'That sound file is missing. Add it again with `/sound-add`.';
    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
      await interaction.followUp({ content: errorMsg, ephemeral: true });
    } else {
      await interaction.editReply(errorMsg);
    }
    return;
  }

  const resource = createAudioResource(filePath, { inlineVolume: true });
  resource.volume?.setVolume(getSoundVolume(interaction.guildId));

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: interaction.guildId,
    adapterCreator: interaction.guild.voiceAdapterCreator,
    selfDeaf: true
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const queue = getQueue(interaction.guildId);
  if (queue && queue.player.state.status === AudioPlayerStatus.Playing) {
    queue.player.pause();
  }

  const player = createAudioPlayer();
  latestSoundPlayers.set(interaction.guildId, player);
  latestSoundResources.set(interaction.guildId, resource);

  connection.subscribe(player);
  player.play(resource);

  if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
    await interaction.followUp({ content: 'Playing sound.', ephemeral: true });
  } else {
    await interaction.editReply('Playing sound.');
  }

  const onEnd = () => {
    player.stop();
    if (latestSoundPlayers.get(interaction.guildId) === player) {
      latestSoundPlayers.delete(interaction.guildId);
      latestSoundResources.delete(interaction.guildId);
      if (queue) {
        connection.subscribe(queue.player);
        queue.player.unpause();
      }
    }
  };

  player.once(AudioPlayerStatus.Idle, onEnd);

  player.on('error', (error) => {
    console.error('Soundboard playback error:', error);
    onEnd();
  });
}

module.exports = {
  getSoundVolume,
  setSoundVolume,
  playSound
};

function getSoundVolume(guildId) {
  return soundVolumes.get(guildId) ?? 0.8;
}

function setSoundVolume(guildId, volume) {
  const next = Math.min(1.5, Math.max(0, volume));
  soundVolumes.set(guildId, next);
  latestSoundResources.get(guildId)?.volume?.setVolume(next);
  return next;
}

function resolveSoundFilePath(filePath) {
  if (!filePath) return null;
  if (fs.existsSync(filePath)) return filePath;

  const localPath = path.join(soundFilesDir, path.basename(filePath));
  return fs.existsSync(localPath) ? localPath : null;
}
