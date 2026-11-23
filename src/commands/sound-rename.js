const { SlashCommandBuilder } = require('discord.js');
const { renameSound, searchSounds } = require('../utils/sounds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sound-rename')
    .setDescription('Rename a saved sound.')
    .addStringOption((option) =>
      option
        .setName('sound')
        .setDescription('Sound to rename')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('New sound name')
        .setMaxLength(80)
        .setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('sound', true);
    const name = interaction.options.getString('name', true).trim();
    const sound = renameSound(id, name, interaction.guildId);
    if (!sound) {
      await interaction.reply({ content: 'That sound was not found.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: `Renamed sound to **${sound.name}**.`, ephemeral: true });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(searchSounds({ guildId: interaction.guildId, query: focused })
      .slice(0, 25)
      .map((sound) => ({ name: sound.name.slice(0, 100), value: sound.id })));
  }
};
