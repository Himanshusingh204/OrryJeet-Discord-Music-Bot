import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { chunkedArray, createSuccessEmbed, createErrorEmbed, createInfoEmbed } from '../src/utils/embeds.js';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

describe('Utility & Embed Functions', () => {
  test('chunkedArray divides array into uniform segments', () => {
    const list = [1, 2, 3, 4, 5, 6, 7];
    const chunked = chunkedArray(list, 3);
    assert.strictEqual(chunked.length, 3);
    assert.deepStrictEqual(chunked[0], [1, 2, 3]);
    assert.deepStrictEqual(chunked[1], [4, 5, 6]);
    assert.deepStrictEqual(chunked[2], [7]);
  });

  test('createSuccessEmbed builds valid Discord EmbedBuilder', () => {
    const embed = createSuccessEmbed('Success Title', 'Operation finished successfully');
    assert.strictEqual(embed.data.title, 'Success Title');
    assert.strictEqual(embed.data.description, 'Operation finished successfully');
    assert.strictEqual(embed.data.color, 43520); // 0x00aa00
  });

  test('createErrorEmbed prefixes title with error marker', () => {
    const embed = createErrorEmbed('Not Found', 'The requested resource does not exist');
    assert.strictEqual(embed.data.title, '❌ Not Found');
    assert.strictEqual(embed.data.description, 'The requested resource does not exist');
    assert.strictEqual(embed.data.color, 16711680); // 0xff0000
  });

  test('createInfoEmbed adds optional fields correctly', () => {
    const fields = [
      { name: 'Uptime', value: '10m', inline: true },
      { name: 'Memory', value: '80MB', inline: true }
    ];
    const embed = createInfoEmbed('Stats', 'Current Status', fields);
    assert.strictEqual(embed.data.title, 'ℹ️ Stats');
    assert.strictEqual(embed.data.fields.length, 2);
    assert.strictEqual(embed.data.fields[0].name, 'Uptime');
  });
});

describe('Database Schema & In-Memory Operations', () => {
  let memDb;

  before(async () => {
    memDb = await open({
      filename: ':memory:',
      driver: sqlite3.Database,
    });

    await memDb.exec(`
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

      CREATE TABLE IF NOT EXISTS guild_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL UNIQUE,
        prefix TEXT DEFAULT '!',
        soundboard_enabled BOOLEAN DEFAULT 1,
        max_custom_sounds INTEGER DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  after(async () => {
    if (memDb) await memDb.close();
  });

  test('can insert and retrieve a sound entry', async () => {
    await memDb.run(
      'INSERT INTO sounds (name, file_path, guild_id, is_default) VALUES (?, ?, ?, ?)',
      ['airhorn', './data/airhorn.mp3', 'guild-123', 1]
    );

    const sound = await memDb.get('SELECT * FROM sounds WHERE name = ?', ['airhorn']);
    assert.ok(sound);
    assert.strictEqual(sound.name, 'airhorn');
    assert.strictEqual(sound.is_default, 1);
  });

  test('enforces UNIQUE constraint on sound names', async () => {
    await assert.rejects(async () => {
      await memDb.run(
        'INSERT INTO sounds (name, file_path, guild_id) VALUES (?, ?, ?)',
        ['airhorn', './data/airhorn2.mp3', 'guild-123']
      );
    });
  });
});
