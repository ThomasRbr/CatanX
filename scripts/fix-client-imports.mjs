import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const clientSrc = path.resolve('apps/client/src');

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) fixFile(full);
  }
}

function fixFile(file) {
  let content = readFileSync(file, 'utf8');
  const before = content;
  content = content.replace(
    /from ['"](?:\.\.\/)+(?:types|engine)\/[^'"]+['"]/g,
    "from '@catanx/engine'",
  );
  if (content !== before) {
    writeFileSync(file, content, 'utf8');
    console.log('fixed', file);
  }
}

walk(clientSrc);
