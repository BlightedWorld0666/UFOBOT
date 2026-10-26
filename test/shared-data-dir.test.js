import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveBotDataDir } from '../src/data-dir.js';

test('default remains relative to working directory for existing installations', () => {
  const original = process.env.BLIGHTED_BOT_DATA_DIR;
  try {
    delete process.env.BLIGHTED_BOT_DATA_DIR;
    assert.equal(resolveBotDataDir(), path.resolve('data'));
  } finally {
    if (original === undefined) delete process.env.BLIGHTED_BOT_DATA_DIR;
    else process.env.BLIGHTED_BOT_DATA_DIR = original;
  }
});

test('bot loads nonsecret dashboard settings from shared external data directory', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ufobot-settings-'));
  const original = process.env.BLIGHTED_BOT_DATA_DIR;
  try {
    process.env.BLIGHTED_BOT_DATA_DIR = folder;
    assert.equal(resolveBotDataDir(), folder);
    const file = path.join(folder, 'dashboard.json');
    fs.writeFileSync(file, JSON.stringify({
      settings: { xpPerMessage: 23, lfgEnabled: false },
      secrets: { DISCORD_TOKEN: 'placeholder-not-a-real-token' }
    }));
    const { setting } = await import('../src/runtime-settings.js?shared-path-test');
    assert.equal(setting('xpPerMessage', 15), 23);
    assert.equal(setting('lfgEnabled', true), false);
    assert.equal(setting('DISCORD_TOKEN', 'not-exposed'), 'not-exposed');
    fs.writeFileSync(file, JSON.stringify({ settings: { xpPerMessage: 37 } }));
    const future = new Date(Date.now() + 3000);
    fs.utimesSync(file, future, future);
    assert.equal(setting('xpPerMessage', 15), 37);
  } finally {
    if (original === undefined) delete process.env.BLIGHTED_BOT_DATA_DIR;
    else process.env.BLIGHTED_BOT_DATA_DIR = original;
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
