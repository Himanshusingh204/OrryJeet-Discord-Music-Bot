import { InteractionType } from 'discord.js';
import { joinVoice, playSound, leaveVoice } from '../utils/voice.js';
import { getSound, getCooldown, setCooldown } from '../utils/database.js';
import { createErrorEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'interactionCreate',
  async execute(interaction, client) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        logger.warn(`Command not found: ${interaction.commandName}`);
        return;
      }

      // Check cooldowns
      if (!client.cooldowns.has(command.data.name)) {
        client.cooldowns.set(command.data.name, new Map());
      }

      const now = Date.now();
      const timestamps = client.cooldowns.get(command.data.name);
      const cooldownAmount = (command.cooldown || 3) * 1000;

      if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          const embed = createErrorEmbed(
            'Command on Cooldown',
            `Please wait ${timeLeft.toFixed(1)}s before using this command again.`
          );
          return await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }

      timestamps.set(interaction.user.id, now);
      setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

      try {
        await command.execute(interaction);
      } catch (error) {
        logger.error(`Error executing command ${interaction.commandName}:`, error);
        const embed = createErrorEmbed('Command Error', 'An error occurred while executing the command.');
        if (interaction.replied) {
          await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
    }

    // Handle button interactions
    else if (interaction.isButton()) {
      if (interaction.customId.startsWith('music_')) {
        await handleMusicButtons(interaction);
        return;
      }
      
      if (interaction.customId.startsWith('sb_page_') || interaction.customId.startsWith('sb_play_')) {
          const { handleSoundboardButtons } = await import('../commands/soundboard.js');
          await handleSoundboardButtons(interaction);
          return;
      }

      const button = client.buttons.get(interaction.customId);

      if (button) {
        try {
          await button.execute(interaction);
        } catch (error) {
          logger.error(`Error handling button ${interaction.customId}:`, error);
          const embed = createErrorEmbed('Button Error', 'An error occurred while processing your action.');
          await interaction.reply({ embeds: [embed], ephemeral: true });
        }
      }
    }

    // Handle select menu interactions
    else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'soundboard_select') {
        await handleSoundboardSelect(interaction);
      }
    }
  },
};

// Global music handler for buttons
async function handleMusicButtons(interaction) {
    const { players, handleSkip, handleStop } = await import('../commands/music.js');
    const player = players.get(interaction.guildId);
    
    if (interaction.customId === 'music_pause') {
        if (!player) return interaction.reply({ content: 'Nothing is playing.', ephemeral: true });
        const { AudioPlayerStatus } = await import('@discordjs/voice');
        if (player.state.status === AudioPlayerStatus.Playing) {
            player.pause();
            await interaction.reply({ content: '⏸️ Paused the music.', ephemeral: false });
        } else if (player.state.status === AudioPlayerStatus.Paused || player.state.status === AudioPlayerStatus.AutoPaused) {
            player.unpause();
            await interaction.reply({ content: '▶️ Resumed the music.', ephemeral: false });
        }
    } else if (interaction.customId === 'music_skip') {
        await handleSkip(interaction);
    } else if (interaction.customId === 'music_stop') {
        await handleStop(interaction);
    }
}

async function handleSoundboardSelect(interaction) {
  const soundName = interaction.values[0];

  try {
    // Check if user is in voice channel
    if (!interaction.member.voice.channel) {
      const embed = createErrorEmbed(
        'Not in Voice Channel',
        'You must be in a voice channel to play sounds.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const voiceChannel = interaction.member.voice.channel;

    // Get sound from database
    const sound = await getSound(soundName);
    if (!sound) {
      const embed = createErrorEmbed('Sound Not Found', `Sound "${soundName}" not found.`);
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // Join voice channel if not already connected
    const { isConnectedToVoice, getConnection } = await import('../utils/voice.js');
    if (!isConnectedToVoice(interaction.guildId)) {
      await joinVoice(voiceChannel);
    }

    // Play sound
    await playSound(interaction.guildId, sound.file_path, 0.5);

    const { createSuccessEmbed } = await import('../utils/embeds.js');
    const embed = createSuccessEmbed('Soundboard', `🔊 Now playing: **${soundName}**`);
    await interaction.editReply({ embeds: [embed] });

    logger.info(`Sound played: ${soundName} by ${interaction.user.tag}`);
  } catch (error) {
    logger.error('Error in soundboard select handler:', error);
    const embed = createErrorEmbed('Playback Error', error.message);
    if (interaction.replied) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
