const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder
} = require('discord.js');
const { findSound, searchSounds } = require('../utils/sounds');
const { getSoundVolume, playSound, setSoundVolume } = require('../utils/voice');

const PAGE_SIZE = 20;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('soundboard')
    .setDescription('Open the saved soundboard.')
    .addStringOption((option) =>
      option
        .setName('search')
        .setDescription('Search sound names or source URLs')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Filter by category')
        .addChoices(...categoryChoices())
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('public')
        .setDescription('Show the soundboard for everyone to click')
        .setRequired(false)
    ),

  async execute(interaction) {
    const search = interaction.options.getString('search') ?? '';
    const category = interaction.options.getString('category') ?? 'all';
    const isPublic = interaction.options.getBoolean('public') ?? false;
    const sounds = searchSounds({ guildId: interaction.guildId, query: search, category });

    if (!sounds.length) {
      await interaction.reply({ content: 'No matching sounds found.', ephemeral: true });
      return;
    }

    await interaction.reply({
      ...buildSoundboardUi(interaction.guildId, sounds, 0, { search, category }),
      ephemeral: !isPublic
    });
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith('soundboard:play:')) {
      const sound = findSound(interaction.customId.slice('soundboard:play:'.length), interaction.guildId);
      if (!sound) {
        await interaction.reply({ content: 'That sound no longer exists.', ephemeral: true });
        return;
      }

      await playSound(interaction, sound);
      return;
    }

    if (interaction.customId.startsWith('soundboard:vol:')) {
      const direction = interaction.customId.slice('soundboard:vol:'.length);
      const current = getSoundVolume(interaction.guildId);
      const next = direction === 'up' ? current + 0.1 : current - 0.1;
      setSoundVolume(interaction.guildId, next);
      await interaction.deferUpdate();
      return;
    }

    if (interaction.customId.startsWith('soundboard:page:')) {
      const [, , pageText, category, search = ''] = interaction.customId.split(':');
      const sounds = searchSounds({ guildId: interaction.guildId, query: decodeURIComponent(search), category });
      await interaction.update(buildSoundboardUi(interaction.guildId, sounds, Number(pageText), {
        search: decodeURIComponent(search),
        category
      }));
    }
  },

  async handleSelect(interaction) {
    const sound = findSound(interaction.values[0], interaction.guildId);

    if (!sound) {
      await interaction.reply({ content: 'That sound no longer exists.', ephemeral: true });
      return;
    }

    await playSound(interaction, sound);
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(searchSounds({ guildId: interaction.guildId, query: focused })
      .slice(0, 25)
      .map((sound) => ({ name: sound.name.slice(0, 100), value: sound.name.slice(0, 100) })));
  }
};

function buildSoundboardUi(guildId, sounds, requestedPage, filters) {
  const pageCount = Math.max(1, Math.ceil(sounds.length / PAGE_SIZE));
  const page = Math.min(Math.max(requestedPage, 0), pageCount - 1);
  const pageSounds = sounds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const encodedSearch = encodeURIComponent(filters.search ?? '').slice(0, 50);
  const category = filters.category ?? 'all';

  const embed = new EmbedBuilder()
    .setTitle('Soundboard')
    .setDescription(buildSoundList(pageSounds, page))
    .setFooter({ text: `${sounds.length} sounds - Page ${page + 1} of ${pageCount} - Volume ${Math.round(getSoundVolume(guildId) * 100)}%` });

  const rows = [];
  for (let index = 0; index < pageSounds.length; index += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        pageSounds.slice(index, index + 5).map((sound, offset) =>
          new ButtonBuilder()
            .setCustomId(`soundboard:play:${sound.id}`)
            .setLabel(shortLabel(sound.name, page * PAGE_SIZE + index + offset + 1))
            .setStyle(ButtonStyle.Primary)
        )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`soundboard:page:${page - 1}:${category}:${encodedSearch}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('soundboard:vol:down')
        .setLabel('Vol -')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('soundboard:vol:up')
        .setLabel('Vol +')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`soundboard:page:${page + 1}:${category}:${encodedSearch}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pageCount - 1)
    )
  );

  return { embeds: [embed], components: rows };
}

function buildSoundList(sounds, page) {
  return sounds.map((sound, index) => {
    const number = String(page * PAGE_SIZE + index + 1).padStart(2, '0');
    return `**${number}.** ${sound.name}`;
  }).join('\n');
}

function shortLabel(name, number) {
  return `${number}. ${name}`.slice(0, 80);
}

function categoryChoices() {
  return [
    { name: 'All', value: 'all' },
    { name: 'Memes', value: 'memes' },
    { name: 'Music', value: 'music' },
    { name: 'Effects', value: 'effects' },
    { name: 'Favorites', value: 'favorites' }
  ];
}
