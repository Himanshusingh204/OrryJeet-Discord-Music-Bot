import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

let db = null;

// Ensure data directory exists
const dataDir = './data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'bot.db');

export async function initializeDatabase() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    // Enable foreign keys
    await db.exec('PRAGMA foreign_keys = ON');

    // Create tables
    await db.exec(`
      -- Sounds table
      CREATE TABLE IF NOT EXISTS sounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        file_path TEXT NOT NULL,
        guild_id TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_default BOOLEAN DEFAULT 0,
        duration INTEGER,
        file_size INTEGER,
        youtube_url TEXT
      );

      -- User preferences table
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        volume REAL DEFAULT 0.5,
        default_sound TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Guild settings table
      CREATE TABLE IF NOT EXISTS guild_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL UNIQUE,
        prefix TEXT DEFAULT '!',
        soundboard_enabled BOOLEAN DEFAULT 1,
        max_custom_sounds INTEGER DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Command cooldowns table (optional)
      CREATE TABLE IF NOT EXISTS cooldowns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        command TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        UNIQUE(user_id, command)
      );
    `);

    logger.info('✓ Database initialized successfully');
    return db;
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

// Sound management functions
export async function addSound(name, filePath, guildId = null, createdBy = null, isDefault = false, duration = null, youtubeUrl = null) {
  const db = getDatabase();
  try {
    const result = await db.run(
      `INSERT INTO sounds (name, file_path, guild_id, created_by, is_default, duration, youtube_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, filePath, guildId, createdBy, isDefault ? 1 : 0, duration, youtubeUrl]
    );
    logger.info(`Sound added: ${name}`);
    return result.lastID;
  } catch (error) {
    logger.error(`Failed to add sound ${name}:`, error);
    throw error;
  }
}

export async function getSound(name) {
  const db = getDatabase();
  return await db.get('SELECT * FROM sounds WHERE name = ?', [name]);
}

export async function getAllSounds(guildId = null) {
  const db = getDatabase();
  if (guildId) {
    return await db.all('SELECT * FROM sounds WHERE is_default = 1 OR guild_id = ? ORDER BY name', [guildId]);
  }
  return await db.all('SELECT * FROM sounds WHERE is_default = 1 ORDER BY name');
}

export async function deleteSound(name) {
  const db = getDatabase();
  try {
    await db.run('DELETE FROM sounds WHERE name = ?', [name]);
    logger.info(`Sound deleted: ${name}`);
  } catch (error) {
    logger.error(`Failed to delete sound ${name}:`, error);
    throw error;
  }
}

// User preference functions
export async function getUserPreference(userId) {
  const db = getDatabase();
  return await db.get('SELECT * FROM user_preferences WHERE user_id = ?', [userId]);
}

export async function setUserPreference(userId, volume = null, defaultSound = null) {
  const db = getDatabase();
  const existing = await getUserPreference(userId);

  if (existing) {
    await db.run(
      'UPDATE user_preferences SET volume = ?, default_sound = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [volume !== null ? volume : existing.volume, defaultSound || existing.default_sound, userId]
    );
  } else {
    await db.run(
      'INSERT INTO user_preferences (user_id, volume, default_sound) VALUES (?, ?, ?)',
      [userId, volume || 0.5, defaultSound || null]
    );
  }
}

// Guild settings functions
export async function getGuildSettings(guildId) {
  const db = getDatabase();
  let settings = await db.get('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
  if (!settings) {
    await db.run('INSERT INTO guild_settings (guild_id) VALUES (?)', [guildId]);
    settings = await db.get('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]);
  }
  return settings;
}

export async function updateGuildSettings(guildId, updates) {
  const db = getDatabase();
  const keys = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = keys.map(k => `${k} = ?`).join(', ');

  await db.run(
    `UPDATE guild_settings SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`,
    [...values, guildId]
  );
}

// Cooldown functions
export async function setCooldown(userId, command, seconds) {
  const db = getDatabase();
  const expiresAt = new Date(Date.now() + seconds * 1000);

  try {
    await db.run(
      'INSERT OR REPLACE INTO cooldowns (user_id, command, expires_at) VALUES (?, ?, ?)',
      [userId, command, expiresAt.toISOString()]
    );
  } catch (error) {
    logger.error(`Failed to set cooldown for ${userId} on ${command}:`, error);
  }
}

export async function getCooldown(userId, command) {
  const db = getDatabase();
  const cooldown = await db.get(
    'SELECT * FROM cooldowns WHERE user_id = ? AND command = ? AND expires_at > datetime("now")',
    [userId, command]
  );
  return cooldown;
}

export async function closeDatabaseConnection() {
  if (db) {
    await db.close();
    logger.info('Database connection closed');
  }
}
