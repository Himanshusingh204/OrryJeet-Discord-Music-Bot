const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const { Buffer } = require('node:buffer');
const { getSoundsForGuild } = require('../utils/sounds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sound-export')
    .setDescription('Export this server soundboard JSON backup.'),

  async execute(interaction) {
    const sounds = getSoundsForGuild(interaction.guildId);
    const backup = Buffer.from(`${JSON.stringify(sounds, null, 2)}\n`, 'utf8');
    const file = new AttachmentBuilder(backup, { name: `soundboard-${interaction.guildId}.json` });
    await interaction.reply({ content: `Exported ${sounds.length} sounds.`, files: [file], ephemeral: true });
  }
};
