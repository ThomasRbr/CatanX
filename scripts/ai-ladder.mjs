#!/usr/bin/env node
/**
 * AI strength ladder: classic + C&K cross-difficulty self-play.
 * Usage: npm run sim:ai-ladder -- --games=24
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const gamesArg = args.find((a) => a.startsWith('--games='));
const games = gamesArg ? gamesArg.split('=')[1] : process.env.AI_LADDER_GAMES ?? '24';

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'packages/engine/src/sim/__tests__/ai-ladder.test.ts'],
  {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, AI_LADDER_GAMES: String(games) },
    shell: false,
  },
);

process.exit(result.status ?? 1);
