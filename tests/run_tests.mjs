// Tests sans dépendance : node tests/run_tests.mjs
import assert from 'node:assert/strict';
import { Memory } from '../src/memory.js';
import { Cpu } from '../src/cpu.js';
import { Gpu } from '../src/gpu.js';
import { Kernel } from '../src/kernel.js';
import { validateDemo, loadDemo } from '../src/loader.js';
import { Emulator } from '../src/emulator.js';
import { readFileSync } from 'node:fs';

let n = 0;
function ok(name, fn) {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
}

// 1. Mémoire R/W + MMU fault
ok('memory rw u32', () => {
  const m = new Memory(64);
  m.writeU32(0, 0x12345678);
  assert.equal(m.readU32(0), 0x12345678);
});
ok('memory mmu fault', () => {
  const m = new Memory(64);
  assert.throws(() => m.readU32(62));
});

// 2. CPU ADD + HALT
ok('cpu add/halt', () => {
  const m = new Memory(64);
  const g = new Gpu(16, 16);
  const k = new Kernel({ memory: m, gpu: g });
  const cpu = new Cpu({
    memory: m, kernel: k,
    program: [
      { op: 'MOV', dst: 0, imm: 40 },
      { op: 'MOV', dst: 1, imm: 2 },
      { op: 'ADD', dst: 2, a: 0, b: 1 },
      { op: 'HALT', code: 0 },
    ],
  });
  cpu.run(10);
  assert.equal(cpu.regs[2], 42);
});

// 3. CPU JZ
ok('cpu jz', () => {
  const m = new Memory(64);
  const g = new Gpu(16, 16);
  const k = new Kernel({ memory: m, gpu: g });
  const cpu = new Cpu({
    memory: m, kernel: k,
    program: [
      { op: 'MOV', dst: 0, imm: 0 },
      { op: 'JZ', reg: 0, addr: 3 },
      { op: 'MOV', dst: 1, imm: 99 },
      { op: 'MOV', dst: 1, imm: 7 },
      { op: 'HALT', code: 0 },
    ],
  });
  cpu.run(10);
  assert.equal(cpu.regs[1], 7);
});

// 4. Syscall WRITE_STRING
ok('syscall write_string', () => {
  const m = new Memory(1024);
  const g = new Gpu(16, 16);
  const k = new Kernel({ memory: m, gpu: g });
  m.writeBytes(100, Buffer.from('Hi'));
  k.syscall(16, [100, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(k.stdout, 'Hi');
});

// 5. GPU rect non-noir
ok('gpu rect', () => {
  const g = new Gpu(32, 16);
  g.clear(0x000000);
  assert.equal(g.isMostlyBlack(), true);
  g.rect(0, 0, 32, 16, 0xffffff);
  assert.equal(g.isMostlyBlack(), false);
});

// 6. Loader refuse binaire Sony / magic
ok('loader refuse sans magic', () => {
  assert.throws(() => validateDemo({ program: [] }));
});

// 7. Boot démo complète
ok('boot demo_boot.json', () => {
  const demo = JSON.parse(readFileSync(new URL('../firmware/demo_boot.json', import.meta.url), 'utf8'));
  const emu = new Emulator({});
  emu.boot(demo);
  emu.run(1000);
  const s = emu.snapshot();
  assert.match(s.stdout, /HELLO PS5/);
  assert.equal(emu.gpu.isMostlyBlack(), false);
  assert.equal(s.halted, true);
});

console.log(`\n# ${n} tests passes`);
