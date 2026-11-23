const { SlashCommandBuilder } = require('discord.js');
const { startRadio } = require('../utils/music');
const { buildMusicControls } = require('../utils/musicControls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Start a YouTube radio automix from one song link or search.')
    .addStringOption((option) =>
      option
        .setName('seed')
        .setDescription('YouTube song link or search keywords')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const seed = interaction.options.getString('seed', true).trim();
    try {
      const result = await startRadio(interaction, seed);
      if (!result.ok) {
        await interaction.editReply(result.message);
        return;
      }

      await interaction.editReply({
        content: `Started radio from **${result.seedTrack.title}** and added ${result.queued} automix tracks.\n${result.radioUrl}`,
        ...buildMusicControls(interaction.guildId)
      });
    } catch (error) {
      console.error('Radio command failed:', error);
      await interaction.editReply('I could not start radio from that YouTube link or search.');
    }
  }
};
