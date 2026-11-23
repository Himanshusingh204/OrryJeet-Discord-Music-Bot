const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../utils/music');
const { buildMusicControls } = require('../utils/musicControls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue.'),

  async execute(interaction) {
    const queue = getQueue(interaction.guildId);
    if (!queue?.current && !queue?.tracks.length) {
      await interaction.reply({ content: 'The queue is empty.', ephemeral: true });
      return;
    }

    await interaction.reply(buildMusicControls(interaction.guildId));
  }
};
