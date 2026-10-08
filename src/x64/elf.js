// Loader ELF64 LE réel : verifie magic/classe/machine, mappe PT_LOAD,
// zero le BSS, rend e_entry. Refuse : 32-bit, big-endian, dynamique
// (INTERP), chiffré/SELF Sony (pas de contournement ici).

import { readFileSync } from 'node:fs';

export function loadElf64(mem, path) {
  const b = readFileSync(path);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = [0x7f, 0x45, 0x4c, 0x46];
  magic.forEach((m, i) => { if (b[i] !== m) throw new Error(`${path}: pas un ELF (magic)`); });
  if (b[4] !== 2) throw new Error(`${path}: ELF 32-bit refuse (attendu 64-bit)`);
  if (b[5] !== 1) throw new Error(`${path}: endianness non-LE refusee`);
  if (dv.getUint16(18, true) !== 62) throw new Error(`${path}: e_machine != EM_X86_64`);
  if (dv.getUint16(16, true) !== 2 && dv.getUint16(16, true) !== 3) throw new Error(`${path}: type non EXEC/DYN`);
  const phoff = Number(dv.getBigUint64(32, true));
  const phentsize = dv.getUint16(54, true), phnum = dv.getUint16(56, true);
  const entry = Number(dv.getBigUint64(24, true));
  for (let i = 0; i < phnum; i++) {
    const o = phoff + i * phentsize;
    const type = dv.getUint32(o, true);
    if (type === 3) throw new Error(`${path}: binaire dynamique (INTERP) refuse — recompile avec -static -nostdlib`);
    if (type !== 1) continue; // PT_LOAD uniquement
    const offset = Number(dv.getBigUint64(o + 8, true));
    const vaddr = Number(dv.getBigUint64(o + 16, true));
    const filesz = Number(dv.getBigUint64(o + 32, true));
    const memsz = Number(dv.getBigUint64(o + 40, true));
    mem.storeBytes(vaddr, b.subarray(offset, offset + filesz));
    for (let k = filesz; k < memsz; k++) mem.store8(vaddr + k, 0); // BSS
  }
  return { entry, bytes: b.length };
}
