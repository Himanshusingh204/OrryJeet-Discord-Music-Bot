import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { initializeDatabase, closeDatabaseConnection } from './utils/database.js';
import { getAllConnections } from './utils/voice.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Validate environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
});

// Create Discord client with optimized gateway intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialize collections
client.commands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();
client.cooldowns = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const { default: command } = await import(pathToFileURL(filePath).href);

    if (command && 'data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      logger.info(`✓ Loaded command: /${command.data.name}`);
    } else {
      logger.warn(`⚠ Command file ${file} is missing required data or execute properties`);
    }
  }
}

// Load events
const eventsPath = join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  for (const file of eventFiles) {
    const filePath = join(eventsPath, file);
    const { default: event } = await import(pathToFileURL(filePath).href);

    if (event && 'name' in event && 'execute' in event) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      logger.info(`✓ Loaded event listener: ${event.name}`);
    }
  }
}

// Initialize database
try {
  await initializeDatabase();
  logger.info('✓ SQLite WAL database initialized successfully');
} catch (error) {
  logger.error('Failed to initialize database:', error);
  process.exit(1);
}

// Connect client
client.login(process.env.DISCORD_TOKEN);

// Graceful shutdown handler
async function handleShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  try {
    // Clean up voice connections
    const activeVoice = getAllConnections();
    for (const [guildId, connection] of activeVoice.entries()) {
      try {
        connection.destroy();
      } catch (err) {
        logger.error(`Error closing voice in ${guildId}:`, err);
      }
    }
    activeVoice.clear();

    // Close SQLite
    await closeDatabaseConnection();

    // Destroy client
    client.destroy();
    logger.info('Graceful shutdown completed successfully. Exiting.');
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception occurred:', error);
  process.exit(1);
});
