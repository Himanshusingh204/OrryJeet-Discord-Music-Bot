const { SlashCommandBuilder } = require('discord.js');
const { stop } = require('../utils/music');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback and clear the queue.'),

  async execute(interaction) {
    if (!stop(interaction.guildId)) {
      await interaction.reply({ content: 'There is no active queue.', ephemeral: true });
      return;
    }

    await interaction.reply('Stopped playback and cleared the queue.');
  }
};
