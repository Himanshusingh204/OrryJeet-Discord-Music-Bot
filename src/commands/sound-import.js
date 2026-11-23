const { SlashCommandBuilder } = require('discord.js');
const { importSounds } = require('../utils/sounds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sound-import')
    .setDescription('Import a soundboard JSON backup.')
    .addAttachmentOption((option) =>
      option
        .setName('backup')
        .setDescription('JSON file from /sound-export')
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment('backup', true);
    if (!attachment.name.toLowerCase().endsWith('.json')) {
      await interaction.reply({ content: 'Please upload a JSON backup file.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const response = await fetch(attachment.url);
    if (!response.ok) {
      await interaction.editReply('I could not download that backup file.');
      return;
    }

    let imported;
    try {
      imported = JSON.parse(await response.text());
    } catch {
      await interaction.editReply('That backup file is not valid JSON.');
      return;
    }
    if (!Array.isArray(imported)) {
      await interaction.editReply('That backup file does not contain a sound list.');
      return;
    }

    const saved = importSounds(imported, interaction.guildId, interaction.user.id);
    await interaction.editReply(`Imported ${saved.length} sounds.`);
  }
};
