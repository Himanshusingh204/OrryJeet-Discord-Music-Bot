import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
      if (!me) return;

      // Find system channel or first text channel where bot can send messages
      const channel = member.guild.systemChannel || member.guild.channels.cache.find(c => 
        c.type === ChannelType.GuildText && 
        c.permissionsFor(me)?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
      );
      
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`👋 Welcome to ${member.guild.name}!`)
        .setDescription(`Hello <@${member.user.id}>, welcome to our server! Type \`/music play\` or \`/soundboard play\` to test our audio experience.`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();

      await channel.send({ content: `Welcome <@${member.user.id}>!`, embeds: [embed] });
      logger.info(`Dispatched welcome message for ${member.user.tag} in ${member.guild.name}`);
    } catch (error) {
      logger.error('Error sending welcome message:', error);
    }
  },
};
