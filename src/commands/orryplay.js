const { SlashCommandBuilder } = require('discord.js');
const { enqueue } = require('../utils/music');
const { buildMusicControls } = require('../utils/musicControls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('orryplay')
    .setDescription('Play a YouTube song or add it to the queue.')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('YouTube link or search keywords')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const queryText = interaction.options.getString('query', true).trim();
    try {
      const result = await enqueue(interaction, queryText);
      if (!result.ok) {
        await interaction.editReply(result.message);
        return;
      }

      if (result.queued) {
        await interaction.editReply({
          content: `Queued: **${result.track.title}**`,
          ...buildMusicControls(interaction.guildId)
        });
      } else {
        await interaction.editReply({
          content: `Playing: **${result.track.title}**`,
          ...buildMusicControls(interaction.guildId)
        });
      }
    } catch (error) {
      console.error('Play command failed:', error);
      await interaction.editReply('I could not start playback. Try another YouTube link or search.');
    }
  }
};
