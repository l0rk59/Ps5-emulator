// Génère firmware/demo_boot.json (homebrew IR, pas de code Sony).
import { writeFileSync } from 'node:fs';

const MSG = 'HELLO PS5 - homebrew demo OK\nGPU rect drawn - CPU IR running\n';
const bytes = Array.from(Buffer.from(MSG, 'utf8'));
const ADDR = 0x1000;

const program = [
  { op: 'MOV', dst: 0, imm: ADDR },
  { op: 'MOV', dst: 1, imm: bytes.length },
  { op: 'SYSCALL', id: 16 },
  { op: 'MOV', dst: 0, imm: 0x141a26 },
  { op: 'SYSCALL', id: 17 },
  { op: 'MOV', dst: 0, imm: 40 },
  { op: 'MOV', dst: 1, imm: 50 },
  { op: 'MOV', dst: 2, imm: 240 },
  { op: 'MOV', dst: 3, imm: 80 },
  { op: 'MOV', dst: 4, imm: 0x2e6db4 },
  { op: 'SYSCALL', id: 18 },
  { op: 'MOV', dst: 0, imm: 0 },
  { op: 'SYSCALL', id: 0 },
  { op: 'HALT', code: 0 },
];

const demo = {
  magic: 'PS5-DEMO-1',
  name: 'demo_boot — hello + gpu rect',
  program,
  data: [{ addr: ADDR, bytes }],
};

writeFileSync(new URL('../firmware/demo_boot.json', import.meta.url), JSON.stringify(demo, null, 2) + '\n');
console.log(`demo_boot.json ecrit: msg_len=${bytes.length} instr=${program.length}`);
