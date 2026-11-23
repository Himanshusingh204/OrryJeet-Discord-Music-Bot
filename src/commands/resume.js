const { SlashCommandBuilder } = require('discord.js');
const { resume } = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume the paused track.'),

  async execute(interaction) {
    if (!resume(interaction.guildId)) {
      await interaction.reply({ content: 'There is no paused track or it could not be resumed.', ephemeral: true });
      return;
    }

    await interaction.reply('Playback has been resumed.');
  }
};