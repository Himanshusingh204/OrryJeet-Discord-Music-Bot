const { SlashCommandBuilder } = require('discord.js');
const { removeSound, searchSounds } = require('../utils/sounds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sound-remove')
    .setDescription('Delete a sound from this server soundboard.')
    .addStringOption((option) =>
      option
        .setName('sound')
        .setDescription('Sound to delete')
        .setAutocomplete(true)
        .setRequired(true)
    ),

  async execute(interaction) {
    const id = interaction.options.getString('sound', true);
    const sound = removeSound(id, interaction.guildId);
    if (!sound) {
      await interaction.reply({ content: 'That sound was not found.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: `Deleted **${sound.name}** from the soundboard.`, ephemeral: true });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(searchSounds({ guildId: interaction.guildId, query: focused })
      .slice(0, 25)
      .map((sound) => ({ name: sound.name.slice(0, 100), value: sound.id })));
  }
};
