import { EmbedBuilder } from 'discord.js';

export function createSuccessEmbed(title, description, thumbnail = null) {
  const embed = new EmbedBuilder()
    .setColor('#00aa00')
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (thumbnail) embed.setThumbnail(thumbnail);
  return embed;
}

export function createErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function createInfoEmbed(title, description, fields = null) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description)
    .setTimestamp();

  if (fields && Array.isArray(fields)) {
    fields.forEach(field => {
      embed.addFields({ name: field.name, value: field.value, inline: field.inline || false });
    });
  }

  return embed;
}

export function createWarningEmbed(title, description) {
  return new EmbedBuilder()
    .setColor('#ffaa00')
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

export function chunkedArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
