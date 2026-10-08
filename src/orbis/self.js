// Inspection LECTURE-SEULE de fichiers Sony (PUP / SELF chiffré / module déchiffré).
// - PUP (magic SCEUF) : detecte et REFUSE (aucune extraction, aucun dechiffrement ici).
// - Non-ELF (ex: SELF chiffré) : detecte et REFUSE avec message explicite.
// - ELF64 valide : metadata (type, machine, entry, segments) + chargement via loader existant.
// Aucune cle n'est lue, ecriture ou utilisee par ce module.

import { readFileSync } from 'node:fs';
import { loadElf64 } from '../x64/elf.js';

export function sniff(path) {
  const b = readFileSync(path);
  const head = b.subarray(0, 8);
  if (head.subarray(0, 5).toString() === 'SCEUF') {
    return { kind: 'PUP', ok: false, reason: 'firmware PUP : extraction refusee (fournis des modules de TA console, jamais de PUP)' };
  }
  if (!(b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46)) {
    return { kind: 'unknown', ok: false, reason: 'non-ELF (probablement chiffré) : seul un module DECHIFFRE issu de TA console est accepte ; aucun dechiffrement ici' };
  }
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    kind: 'ELF64',
    ok: b[4] === 2,
    reason: b[4] === 2 ? null : 'ELF 32-bit refuse',
    type: dv.getUint16(16, true),
    machine: dv.getUint16(18, true),
    entry: Number(dv.getBigUint64(24, true)),
    phnum: dv.getUint16(56, true),
    size: b.length,
  };
}

// LLE local : mappe un module DECHIFFRE fourni par l'utilisateur (chemin explicite
// hors depot) dans la memoire de l'emulateur. Le fichier n'est jamais copie ni commit.
export function lleLoad(emu64, path) {
  const info = sniff(path);
  if (!info.ok) {
    const err = new Error(`LLE refuse (${info.kind}) : ${info.reason} [${path}]`);
    err.code = 'ORBIS_LLE_REFUSED';
    throw err;
  }
  return loadModule(emu64, path, info);
}

import { STACK_TOP } from '../x64/emu64.js';
function loadModule(emu64, path, info) {
  const { entry, bytes } = loadElf64(emu64.mem, path);
  emu64.cpu.rip = entry >>> 0;
  emu64.cpu.set(4, BigInt(STACK_TOP));
  return { ...info, mappedBytes: bytes, entry };
}
