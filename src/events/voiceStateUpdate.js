import { leaveVoice } from '../utils/voice.js';
import { logger } from '../utils/logger.js';
import musicCommand from '../commands/music.js';

export default {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    try {
      const me = oldState.guild.members.me || await oldState.guild.members.fetchMe().catch(() => null);
      if (!me?.voice?.channelId) return;

      // Ignore when other bots or external entities trigger state
      if (oldState.id === client.user.id) {
        return;
      }

      const botChannelId = me.voice.channelId;
      
      if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
        const channel = oldState.channel;
        if (!channel) return;

        // Check if real users (non-bots) remain in the voice channel
        const humanMembers = channel.members.filter(m => !m.user.bot);
        if (humanMembers.size === 0) {
          logger.info(`Channel empty in guild "${oldState.guild.name}". Auto-disconnecting to preserve resources.`);
          
          // Clear music queue for guild
          if (musicCommand.queues && musicCommand.queues.has(oldState.guild.id)) {
            musicCommand.queues.delete(oldState.guild.id);
          }
          
          await leaveVoice(oldState.guild.id);
        }
      }
    } catch (error) {
      logger.error('Error in voiceStateUpdate listener:', error);
    }
  },
};
