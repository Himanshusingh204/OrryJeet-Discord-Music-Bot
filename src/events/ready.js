import { ActivityType } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'ready',
  once: true,
  execute(client) {
    logger.info(`✅ Bot logged in as ${client.user.tag}`);
    logger.info(`📊 Serving ${client.guilds.cache.size} guild(s)`);

    // Set bot status
    client.user.setActivity('/soundboard - Press / to see commands', {
      type: ActivityType.Playing,
    });

    logger.info('Bot is ready and online!');
  },
};
