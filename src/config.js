const fs = require('node:fs');
const path = require('node:path');

const envPath = path.join(__dirname, '..', '.env');
const configPath = path.join(__dirname, '..', 'config.json');

function loadDotEnv() {
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

const fileConfig = fs.existsSync(configPath) ? require(configPath) : {};

function readConfigValue(envName, fileName) {
  return process.env[envName] || fileConfig[fileName];
}

const config = {
  token: readConfigValue('DISCORD_TOKEN', 'token'),
  clientId: readConfigValue('DISCORD_CLIENT_ID', 'clientId'),
  guildId: readConfigValue('DISCORD_GUILD_ID', 'guildId'),
  youtubeCookie: readConfigValue('YOUTUBE_COOKIE', 'youtubeCookie')
};

function requireConfig(keys) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing required config value(s): ${missing.join(', ')}`);
  }
}

module.exports = {
  config,
  requireConfig
};
