const { SlashCommandBuilder } = require('discord.js');
const { pause } = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the currently playing track.'),

  async execute(interaction) {
    if (!pause(interaction.guildId)) {
      await interaction.reply({ content: 'There is no track currently playing or it could not be paused.', ephemeral: true });
      return;
    }

    await interaction.reply('Playback has been paused.');
  }
};