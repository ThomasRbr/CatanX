/**
 * Batch headless Villes & Chevaliers.
 *
 * Usage :
 *   npm run sim:ck              # 1000 parties
 *   npm run sim:ck -- --games=50
 *   CK_BATCH_SIZE=200 npm run sim:ck
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseGames(argv) {
  const flag = argv.find((a) => a.startsWith('--games='));
  if (flag) return Number(flag.slice('--games='.length));
  const idx = argv.indexOf('--games');
  if (idx >= 0 && argv[idx + 1]) return Number(argv[idx + 1]);
  if (process.env.CK_BATCH_SIZE) return Number(process.env.CK_BATCH_SIZE);
  return 1000;
}

const games = Math.max(1, parseGames(process.argv.slice(2)) || 1000);
const testFile = 'packages/engine/src/sim/__tests__/cities-knights-batch.test.ts';

console.log(`[sim:ck] Lancement de ${games} parties IA C&K…`);

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', testFile],
  {
    cwd: root,
    env: {
      ...process.env,
      CK_BATCH_SIZE: String(games),
      CK_BATCH_CLI: '1',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);

process.exit(result.status ?? 1);
