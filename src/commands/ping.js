import { SlashCommandBuilder } from 'discord.js';
import { createInfoEmbed } from '../utils/embeds.js';
import os from 'os';
import { getAllConnections } from '../utils/voice.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency, system metrics, and connection diagnostics'),

  async execute(interaction) {
    const reply = await interaction.reply({
      content: '🏓 Running system diagnostics...',
      fetchReply: true,
    });

    const latency = reply.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = Math.round(interaction.client.ws.ping);
    const memory = process.memoryUsage();
    const heapUsedMb = (memory.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMb = (memory.heapTotal / 1024 / 1024).toFixed(2);
    const activeStreams = getAllConnections().size;

    const embed = createInfoEmbed(
      'System Diagnostics & Status 🚀',
      'OrryJeet Audio Engine is fully operational.',
      [
        {
          name: '📡 Round-Trip Latency',
          value: `\`${latency}ms\``,
          inline: true,
        },
        {
          name: '💓 WebSocket Heartbeat',
          value: `\`${wsLatency}ms\``,
          inline: true,
        },
        {
          name: '⏱️ Process Uptime',
          value: `\`${formatUptime(interaction.client.uptime)}\``,
          inline: true,
        },
        {
          name: '🧠 Heap Memory',
          value: `\`${heapUsedMb} MB / ${heapTotalMb} MB\``,
          inline: true,
        },
        {
          name: '🔊 Voice Channels Active',
          value: `\`${activeStreams} connection(s)\``,
          inline: true,
        },
        {
          name: '🌐 Shard & Platform',
          value: `\`Node ${process.version} | ${os.platform()} (${os.arch()})\``,
          inline: true,
        },
      ]
    );

    await interaction.editReply({
      content: '',
      embeds: [embed],
    });
  },
};

function formatUptime(ms) {
  if (!ms) return '0s';
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}
