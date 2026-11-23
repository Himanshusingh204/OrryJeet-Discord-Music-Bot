const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { searchSounds } = require('../utils/sounds');

const PAGE_SIZE = 25;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sound-list')
    .setDescription('List saved sounds with search, category, and source info.')
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('Search sound names or URLs')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Filter by category')
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'Memes', value: 'memes' },
          { name: 'Music', value: 'music' },
          { name: 'Effects', value: 'effects' },
          { name: 'Favorites', value: 'favorites' }
        )
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Page number').setMinValue(1).setRequired(false)
    ),

  async execute(interaction) {
    const search = interaction.options.getString('search') ?? '';
    const category = interaction.options.getString('category') ?? 'all';
    const requestedPage = interaction.options.getInteger('page') ?? 1;
    const sounds = searchSounds({ guildId: interaction.guildId, query: search, category });

    if (!sounds.length) {
      await interaction.reply({ content: 'No matching sounds found.', ephemeral: true });
      return;
    }

    const pageCount = Math.max(1, Math.ceil(sounds.length / PAGE_SIZE));
    const page = Math.min(Math.max(requestedPage, 1), pageCount);
    const pageSounds = sounds.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const embed = new EmbedBuilder()
      .setTitle('Sound List')
      .setDescription(buildSoundTable(pageSounds, page))
      .setFooter({ text: `${sounds.length} sounds - Page ${page} of ${pageCount}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(searchSounds({ guildId: interaction.guildId, query: focused })
      .slice(0, 25)
      .map((sound) => ({ name: sound.name.slice(0, 100), value: sound.name.slice(0, 100) })));
  }
};

function sourceLabel(sound) {
  if (sound.sourceType === 'mp3-upload') return 'Uploaded MP3';
  if (sound.filePath) return 'Local file';
  return sound.url ?? 'Unknown';
}

function buildSoundTable(sounds, page) {
  const rows = sounds.map((sound, index) => {
    const number = String((page - 1) * PAGE_SIZE + index + 1).padStart(2, '0');
    const name = fitCell(sound.name, 42);
    return `${number}  ${name}`;
  });

  return [
    '```',
    'No  Name',
    '--  ------------------------------------------',
    ...rows,
    '```'
  ].join('\n');
}

function fitCell(value, length) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > length) return text.slice(0, length - 1) + '.';
  return text.padEnd(length, ' ');
}
