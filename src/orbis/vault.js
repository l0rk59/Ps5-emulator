// Vault : repertoire LOCAL et PRIVE des dumps de TA console.
// - Chemin via PS5_DUMP_DIR, sinon ./dumps (gitignore : jamais commit).
// - N'affiche JAMAIS le contenu des cles, seulement noms + tailles.
// - Sans dumps : erreur propre expliquant quoi fournir, sans contournement.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MISSING_MSG =
  'dumps PS5 absents. Place TES propres dumps (de TA console) dans $PS5_DUMP_DIR ' +
  '(jamais sur GitHub). Aucun firmware/cle n\'est fourni ni telechargeable ici.';

export function vaultDir() {
  return process.env.PS5_DUMP_DIR ?? './dumps';
}

export function vaultStatus() {
  const dir = vaultDir();
  if (!existsSync(dir)) return { ok: false, dir, reason: 'dossier inexistant', files: [] };
  const files = [];
  for (const name of readdirSync(dir)) {
    let size = -1;
    try { size = statSync(join(dir, name)).size; } catch { /* ignore */ }
    files.push({ name, size }); // noms + tailles uniquement, jamais de contenu
  }
  return { ok: files.length > 0, dir, reason: files.length ? null : 'dossier vide', files };
}

export function requireVault() {
  const s = vaultStatus();
  if (!s.ok) {
    const err = new Error(`${MISSING_MSG} (dir=${s.dir}, cause=${s.reason})`);
    err.code = 'ORBIS_NO_DUMP';
    throw err;
  }
  return s;
}
