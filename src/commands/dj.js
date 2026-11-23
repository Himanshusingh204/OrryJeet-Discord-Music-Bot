const { SlashCommandBuilder } = require('discord.js');
const { startDjMode, stopDjMode } = require('../utils/music');
const { buildMusicControls } = require('../utils/musicControls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dj')
    .setDescription('Control DJ automix mode.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('mode')
        .setDescription('Start DJ mode')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('DJ vibe')
            .addChoices(
              { name: 'Party', value: 'party' },
              { name: 'Chill', value: 'chill' },
              { name: 'Meme', value: 'meme' }
            )
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('off')
        .setDescription('Turn DJ mode off')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'off') {
      const stopped = stopDjMode(interaction.guildId);
      await interaction.reply({
        content: stopped ? 'DJ mode is off.' : 'DJ mode is not active.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();
    const mode = interaction.options.getString('type', true);

    try {
      const result = await startDjMode(interaction, mode);
      if (!result.ok) {
        await interaction.editReply(result.message);
        return;
      }

      await interaction.editReply({
        content: `DJ mode **${mode}** remixed ${result.remixed} upcoming queue tracks.`,
        ...buildMusicControls(interaction.guildId)
      });
    } catch (error) {
      console.error('DJ command failed:', error);
      await interaction.editReply('I could not start DJ mode.');
    }
  }
};
