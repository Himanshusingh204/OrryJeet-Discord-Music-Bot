const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { config, requireConfig } = require('./config');
const { handleMusicButton } = require('./utils/musicControls');

requireConfig(['token']);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((entry) => entry.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction, client);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction, client);
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'soundboard-select') {
      const soundboard = client.commands.get('soundboard');
      await soundboard.handleSelect(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('soundboard:')) {
      const soundboard = client.commands.get('soundboard');
      await soundboard.handleButton(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('music:')) {
      await handleMusicButton(interaction);
    }
  } catch (error) {
    console.error(error);

    const message = 'Sorry, that action failed. Please try again in a moment.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(config.token);
