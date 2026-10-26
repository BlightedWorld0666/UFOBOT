import path from 'node:path';

// Preserve the historical ./data default; for processes started from different
// working directories, set the same absolute BLIGHTED_BOT_DATA_DIR for each.
export function resolveBotDataDir() {
  return path.resolve(process.env.BLIGHTED_BOT_DATA_DIR || 'data');
}
