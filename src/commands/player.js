const { SlashCommandBuilder } = require('discord.js');
const { buildMusicControls } = require('../utils/musicControls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('Open the music player control panel.'),

  async execute(interaction) {
    await interaction.reply(buildMusicControls(interaction.guildId));
  }
};
