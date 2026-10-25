/**
 * Validates premium 3D assets produced by the Blender pipeline (H1+H2+H3+C&K).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const modelsRoot = join(repoRoot, 'apps/client/public/assets/models');
const licenses = [
  join(repoRoot, 'apps/client/public/assets/licenses/H1_ASSETS.md'),
  join(repoRoot, 'apps/client/public/assets/licenses/H2_ASSETS.md'),
  join(repoRoot, 'apps/client/public/assets/licenses/H3_ASSETS.md'),
  join(repoRoot, 'apps/client/public/assets/licenses/CK_ASSETS.md'),
  join(repoRoot, 'apps/client/public/assets/licenses/REALISTIC_SURFACE_ASSETS.md'),
];
const manifestPaths = [
  join(modelsRoot, 'h1-manifest.json'),
  join(modelsRoot, 'h2-manifest.json'),
  join(modelsRoot, 'h3-manifest.json'),
  join(modelsRoot, 'ck-manifest.json'),
  join(modelsRoot, 'realistic/realistic-surface-manifest.json'),
];

const LEGACY_MAX_BYTES = 512 * 1024;
const REALISTIC_MAX_BYTES = 12 * 1024 * 1024;
const MIN_BYTES = 200;

function walkGlbs(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkGlbs(full, acc);
    else if (entry.name.endsWith('.glb')) acc.push(full);
  }
  return acc;
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

for (const licensePath of licenses) {
  if (!existsSync(licensePath)) fail(`Missing license file: ${licensePath}`);
}

let manifest = [];
for (const manifestPath of manifestPaths) {
  if (!existsSync(manifestPath)) {
    fail(`Missing manifest: ${manifestPath}`);
    continue;
  }
  try {
    const part = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(part)) fail(`Manifest is not an array: ${manifestPath}`);
    else manifest = manifest.concat(part);
  } catch (err) {
    fail(`Invalid manifest JSON (${manifestPath}): ${err.message}`);
  }
}

if (manifest.length < 38) {
  fail(`Combined manifests must list ≥38 assets (got ${manifest.length})`);
}

const glbs = walkGlbs(modelsRoot);
console.log(`Found ${glbs.length} GLB files under public/assets/models`);

for (const entry of manifest) {
  const rel = String(entry.url || '').replace(/^\/assets\/models\//, '');
  const file = join(modelsRoot, rel);
  if (!existsSync(file)) {
    fail(`Manifest asset missing on disk: ${entry.id} -> ${file}`);
    continue;
  }
  const size = statSync(file).size;
  if (size < MIN_BYTES) fail(`${entry.id}: file too small (${size} B)`);
  const maxBytes = entry.visualTier === 'realistic' ? REALISTIC_MAX_BYTES : LEGACY_MAX_BYTES;
  if (size > maxBytes) fail(`${entry.id}: file too large (${size} B, max ${maxBytes} B)`);
  if (!entry.license) fail(`${entry.id}: missing license`);
  if (!entry.author) fail(`${entry.id}: missing author`);
  if (typeof entry.triangles !== 'number') fail(`${entry.id}: missing triangles`);
  const fallbackTriangleBudget = entry.visualTier === 'realistic' ? 25_000 : 2_500;
  if (entry.triangles > (entry.budgetMax ?? fallbackTriangleBudget)) {
    fail(`${entry.id}: ${entry.triangles} tris over budget`);
  }
  const materialLimit = entry.visualTier === 'realistic'
    ? 12
    : String(entry.id).startsWith('ck_')
      ? 4
      : 3;
  if ((entry.materials ?? 99) > materialLimit) fail(`${entry.id}: too many materials`);
}

const byId = new Set(manifest.map((e) => e.id));
for (const required of [
  'tree_group_a',
  'hill_a',
  'beach_strip_a',
  'field_row_b',
  'mine_entrance_a',
]) {
  if (!byId.has(required)) fail(`H3 required asset missing from manifests: ${required}`);
}

for (const required of [
  'ck_knight_basic',
  'ck_knight_strong',
  'ck_knight_mighty',
  'ck_wall_segment',
  'ck_wall_gate',
  'ck_wall_tower',
  'ck_barbarian_ship',
]) {
  if (!byId.has(required)) fail(`Cities & Knights asset missing from manifests: ${required}`);
}

if (!process.exitCode) {
  console.log(`OK — validated ${manifest.length} manifest assets / ${glbs.length} GLB files`);
}
