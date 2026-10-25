/**
 * Vérifie les budgets gzip du build client (Phase 7).
 * Usage : npm run build && npm run budget
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_ASSETS = join(process.cwd(), 'apps/client/dist/assets');

/** Entrée principale (index-*.js) gzip max — menu / shell. */
const ENTRY_GZIP_MAX = 280_000;
/** Somme de tous les .js gzip max. */
const TOTAL_JS_GZIP_MAX = 420_000;

/** Chunks attendus via manualChunks Vite. */
const REQUIRED_CHUNK_PREFIXES = ['pixi-', 'engine-', 'motion-', 'socket-'];

function fail(message) {
  console.error(`[budget] FAIL: ${message}`);
  process.exit(1);
}

function main() {
  let entries;
  try {
    entries = readdirSync(DIST_ASSETS).filter((name) => name.endsWith('.js'));
  } catch {
    fail(`Dossier introuvable : ${DIST_ASSETS} (lancez npm run build d'abord).`);
  }

  if (entries.length === 0) {
    fail('Aucun fichier JS dans dist/assets.');
  }

  const entryFile = entries.find((name) => name.startsWith('index-'));
  if (!entryFile) {
    fail('Aucun chunk d’entrée index-*.js trouvé (build invalide ou chemin incorrect).');
  }

  let totalGzip = 0;
  let entryGzip = 0;
  const rows = [];

  for (const name of entries) {
    const full = join(DIST_ASSETS, name);
    const raw = readFileSync(full);
    const gzip = gzipSync(raw).byteLength;
    totalGzip += gzip;
    rows.push({ name, raw: raw.byteLength, gzip });
    if (name === entryFile) {
      entryGzip = gzip;
    }
  }

  for (const prefix of REQUIRED_CHUNK_PREFIXES) {
    if (!entries.some((name) => name.startsWith(prefix))) {
      fail(`Chunk attendu manquant : ${prefix}*.js (vérifiez vite.config manualChunks).`);
    }
  }

  rows.sort((a, b) => b.gzip - a.gzip);
  console.log('[budget] Chunks JS (gzip) :');
  for (const row of rows.slice(0, 12)) {
    console.log(
      `  ${row.name.padEnd(42)} raw=${String(row.raw).padStart(8)}  gzip=${String(row.gzip).padStart(8)}`,
    );
  }
  console.log(`[budget] entry(index) gzip=${entryGzip}  (max ${ENTRY_GZIP_MAX})`);
  console.log(`[budget] total JS gzip=${totalGzip}  (max ${TOTAL_JS_GZIP_MAX})`);

  if (entryGzip > ENTRY_GZIP_MAX) {
    fail(`Entrée index trop lourde : ${entryGzip} > ${ENTRY_GZIP_MAX}`);
  }
  if (totalGzip > TOTAL_JS_GZIP_MAX) {
    fail(`Total JS trop lourd : ${totalGzip} > ${TOTAL_JS_GZIP_MAX}`);
  }

  const rawSize = statSync(join(DIST_ASSETS, entryFile)).size;
  if (rawSize > 900_000) {
    fail(`Entrée index brute trop lourde : ${rawSize} > 900000`);
  }

  console.log('[budget] OK');
}

main();
