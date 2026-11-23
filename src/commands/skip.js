const { SlashCommandBuilder } = require('discord.js');
const { skip } = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song.'),

  async execute(interaction) {
    if (!skip(interaction.guildId)) {
      await interaction.reply({ content: 'Nothing is playing right now.', ephemeral: true });
      return;
    }

    await interaction.reply('Skipped the current track.');
  }
};
