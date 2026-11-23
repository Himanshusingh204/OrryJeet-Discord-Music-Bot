const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', '..', 'data');
const soundsFile = path.join(dataDir, 'sounds.json');
const soundFilesDir = path.join(dataDir, 'sounds');

function ensureStore() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(soundFilesDir)) {
    fs.mkdirSync(soundFilesDir, { recursive: true });
  }

  if (!fs.existsSync(soundsFile)) {
    fs.writeFileSync(soundsFile, '[]\n', 'utf8');
  }
}

function readSounds() {
  ensureStore();
  try {
    const sounds = JSON.parse(fs.readFileSync(soundsFile, 'utf8'));
    if (!Array.isArray(sounds)) return [];

    let changed = false;
    const normalizedSounds = sounds.map((sound) => {
      if (sound.id && sound.category) return sound;

      changed = true;
      return {
        id: createSoundId(),
        category: 'favorites',
        ...sound
      };
    });

    if (changed) {
      writeSounds(normalizedSounds);
    }

    return normalizedSounds;
  } catch {
    return [];
  }
}

function getSoundsForGuild(guildId) {
  return readSounds().filter((sound) => !sound.guildId || sound.guildId === guildId);
}

function searchSounds({ guildId, query = '', category = 'all' } = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  return getSoundsForGuild(guildId)
    .filter((sound) => {
      const matchesCategory = category === 'all' || sound.category === category;
      const matchesQuery = !normalizedQuery ||
        sound.name.toLowerCase().includes(normalizedQuery) ||
        sound.url?.toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    })
    .sort((first, second) => first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base',
      numeric: true
    }));
}

function writeSounds(sounds) {
  ensureStore();
  fs.writeFileSync(soundsFile, `${JSON.stringify(sounds, null, 2)}\n`, 'utf8');
}

function addSound(sound) {
  const sounds = readSounds();
  sounds.push({
    id: sound.id ?? createSoundId(),
    category: sound.category ?? 'favorites',
    ...sound
  });
  writeSounds(sounds);
  return sounds;
}

function findSound(id, guildId) {
  return getSoundsForGuild(guildId).find((sound) => sound.id === id);
}

function removeSound(id, guildId) {
  const sounds = readSounds();
  const sound = sounds.find((entry) => entry.id === id && (!entry.guildId || entry.guildId === guildId));
  if (!sound) return null;

  writeSounds(sounds.filter((entry) => entry.id !== id));
  return sound;
}

function renameSound(id, name, guildId) {
  const sounds = readSounds();
  const sound = sounds.find((entry) => entry.id === id && (!entry.guildId || entry.guildId === guildId));
  if (!sound) return null;

  sound.name = name;
  writeSounds(sounds);
  return sound;
}

function importSounds(importedSounds, guildId, addedBy) {
  const sounds = readSounds();
  const saved = importedSounds
    .filter((sound) => sound?.name && (sound.url || sound.filePath))
    .map((sound) => ({
      id: createSoundId(),
      name: String(sound.name).slice(0, 80),
      category: normalizeCategory(sound.category),
      url: sound.url,
      filePath: sound.filePath,
      sourceType: sound.sourceType ?? 'url',
      guildId,
      addedBy,
      addedAt: new Date().toISOString()
    }));

  writeSounds([...sounds, ...saved]);
  return saved;
}

function normalizeCategory(category) {
  const allowed = new Set(['memes', 'music', 'effects', 'favorites']);
  return allowed.has(category) ? category : 'favorites';
}

function createSoundId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = {
  addSound,
  dataDir,
  findSound,
  getSoundsForGuild,
  importSounds,
  readSounds,
  removeSound,
  renameSound,
  searchSounds,
  soundFilesDir
};
