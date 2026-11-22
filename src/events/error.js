import { logger } from '../utils/logger.js';

export default {
  name: 'error',
  execute(error) {
    logger.error('Discord.js error:', error);
  },
};
