// Chargeur homebrew démo. REFUSE tout binaire Sony.
// Format accepté : JSON { magic:"PS5-DEMO-1", name, program:[...], data:[...] }
// Aucun SELF/ELF PS5, aucun firmware, aucune clé : homebrew IR uniquement.

const MAGIC = 'PS5-DEMO-1';
const OPS = new Set(['NOP', 'MOV', 'ADD', 'SUB', 'MUL', 'JMP', 'JZ', 'JNZ', 'LOAD', 'STORE', 'SYSCALL', 'HALT']);

export function validateDemo(obj) {
  if (!obj || obj.magic !== MAGIC) {
    throw new Error('Chargeur: magic invalide — homebrew PS5-DEMO-1 attendu, binaires Sony refusés.');
  }
  if (!Array.isArray(obj.program) || obj.program.length === 0) {
    throw new Error('Chargeur: programme vide');
  }
  if (obj.program.length > 65536) throw new Error('Chargeur: programme trop grand');
  for (let i = 0; i < obj.program.length; i++) {
    const ins = obj.program[i];
    if (!ins || !OPS.has(ins.op)) throw new Error(`Chargeur: opcode invalide à ${i}: ${JSON.stringify(ins)}`);
  }
  if (obj.data && !Array.isArray(obj.data)) throw new Error('Chargeur: champ data invalide');
  return true;
}

export function loadDemo(memory, obj) {
  validateDemo(obj);
  memory.buf.fill(0);
  if (obj.data) {
    for (const seg of obj.data) {
      if (!Number.isInteger(seg.addr) || !Array.isArray(seg.bytes)) {
        throw new Error('Chargeur: segment data invalide');
      }
      memory.writeBytes(seg.addr, Uint8Array.from(seg.bytes));
    }
  }
  return { name: obj.name || 'homebrew', program: obj.program };
}
