// Chargeur homebrew : format { base, code:[u32], strings:[{addr,text}] }.
// Ne lit NI ELF PS5, NI PKG, NI firmware Sony (volontairement, pour rester legal).
export function loadProgram(memory, program) {
  const base = program.base ?? 0x1000;
  program.code.forEach((w, i) => memory.store32(base + i * 4, w >>> 0));
  for (const s of program.strings ?? []) {
    memory.storeBytes(s.addr, Buffer.from(s.text, 'utf8'));
  }
  return base;
}

import { progHello } from './homebrews.js';
export function buildDemoProgram() { return progHello(); }
