// Copie site/ -> dist/ (build statique sans dependances).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'site');
const out = resolve(root, 'dist');
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true });
if (!existsSync(resolve(out, 'index.html'))) throw new Error('build: index.html manquant');
console.log(`build ok: ${src} -> ${out}`);
