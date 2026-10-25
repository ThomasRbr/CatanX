#!/usr/bin/env node
/**
 * Lance le serveur multijoueur prêt pour LAN / tunnel Internet.
 * Usage : npm run server:online
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.CATANX_PORT ?? '4000';

process.env.CATANX_HOST = process.env.CATANX_HOST || '0.0.0.0';
process.env.CATANX_CORS_ORIGIN = process.env.CATANX_CORS_ORIGIN || '*';
process.env.CATANX_PORT = port;

console.log('');
console.log('  CatanX — serveur multijoueur');
console.log(`  → http://127.0.0.1:${port}  (local)`);
console.log(`  → écoute sur toutes les interfaces (${process.env.CATANX_HOST})`);
console.log('  → CORS ouvert (*)');
console.log('');
console.log('  Pour un ami sur Internet, dans un autre terminal :');
console.log(`    cloudflared tunnel --url http://127.0.0.1:${port}`);
console.log('  Puis colle l’URL https://… dans le lobby (champ Serveur).');
console.log('');

const child = spawn(
  'npx',
  ['tsx', 'src/index.ts'],
  {
    cwd: path.join(root, 'apps', 'server'),
    env: process.env,
    stdio: 'inherit',
    shell: true,
  },
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
