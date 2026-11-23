const { SlashCommandBuilder } = require('discord.js');
const { addSound, readSounds } = require('../utils/sounds');
const { downloadAttachmentSound, downloadSound } = require('../utils/soundDownloader');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sound-add')
    .setDescription('Save a YouTube link, direct MP3 URL, or uploaded MP3 as a soundboard clip.')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Sound name')
        .setMaxLength(80)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('YouTube video URL or direct MP3 URL')
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option
        .setName('mp3')
        .setDescription('Upload an MP3 file')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Soundboard category')
        .addChoices(
          { name: 'Memes', value: 'memes' },
          { name: 'Music', value: 'music' },
          { name: 'Effects', value: 'effects' },
          { name: 'Favorites', value: 'favorites' }
        )
        .setRequired(false)
    ),

  async execute(interaction) {
    const name = interaction.options.getString('name', true).trim();
    const url = interaction.options.getString('url')?.trim();
    const attachment = interaction.options.getAttachment('mp3');
    const category = interaction.options.getString('category') ?? 'favorites';

    if (!url && !attachment) {
      await interaction.reply({ content: 'Add either a YouTube/direct MP3 URL or an MP3 upload.', ephemeral: true });
      return;
    }

    if (url && attachment) {
      await interaction.reply({ content: 'Use either a URL or an MP3 upload, not both.', ephemeral: true });
      return;
    }

    const sounds = readSounds();
    if (sounds.some((sound) => sound.name.toLowerCase() === name.toLowerCase())) {
      await interaction.reply({ content: 'A sound with that name already exists.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const filePath = attachment
        ? await downloadAttachmentSound(attachment, name)
        : await downloadSound(url, name);

      addSound({
        name,
        category,
        guildId: interaction.guildId,
        sourceType: attachment ? 'mp3-upload' : 'url',
        url: url ?? attachment.url,
        filePath,
        addedBy: interaction.user.id,
        addedAt: new Date().toISOString()
      });

      await interaction.editReply(`Saved **${name}** to the local soundboard.`);
    } catch (error) {
      console.error('Sound download failed:', error);
      await interaction.editReply(error.message || 'I could not download that sound.');
    }
  }
};
