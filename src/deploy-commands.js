import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  logger.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const { default: command } = await import(pathToFileURL(filePath).href);

  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
    logger.info(`✓ Loaded command: ${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    logger.info(`🔄 Registering ${commands.length} slash command(s)...`);

    if (guildId) {
      // Register guild-specific commands (faster, for testing)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      logger.info(`✅ Successfully registered ${commands.length} command(s) to guild ${guildId}`);
    } else {
      // Register global commands (takes up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.info(`✅ Successfully registered ${commands.length} global command(s) (may take up to 1 hour to propagate)`);
    }
  } catch (error) {
    logger.error('Error deploying commands:', error);
    process.exit(1);
  }
})();
