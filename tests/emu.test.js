import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { Emulator } from '../src/emulator.js';
import { HOMEBREWS } from '../src/homebrews.js';
import { buildDemoProgram } from '../src/loader.js';
import { Memory } from '../src/memory.js';
import { enc, OP } from '../src/cpu.js';
import { saveState, loadState } from '../src/savestate.js';

function fbHash(emu) {
  let h = 2166136261;
  for (const b of emu.gpu.fb) { h ^= b; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function runBoth(builder) {
  const a = new Emulator(); a.load(builder()); const ra = a.run();
  const b = new Emulator(); b.cpu.useJit = false; b.load(builder()); const rb = b.run();
  return { a, ra, b, rb };
}

test('memoire: faute hors limites', () => {
  const m = new Memory(16);
  assert.throws(() => m.load32(14));
});

test('demo hello: exit 0 + log + fb non vide', () => {
  const emu = new Emulator();
  emu.load(buildDemoProgram());
  const res = emu.run();
  assert.equal(res.exitCode, 0);
  assert.match(res.logs.join('\n'), /hello homebrew/);
  assert.equal(emu.gpu.fb.some((v) => v !== 0), true);
});

test('jit == interp sur les 6 homebrews (exit, logs, framebuffer)', () => {
  for (const [name, builder] of Object.entries(HOMEBREWS)) {
    const { a, ra, b, rb } = runBoth(builder);
    assert.equal(ra.exitCode, 0, `${name}/jit exit`);
    assert.equal(rb.exitCode, 0, `${name}/interp exit`);
    assert.deepEqual(ra.logs, rb.logs, `${name} logs`);
    assert.equal(fbHash(a), fbHash(b), `${name} framebuffer`);
  }
});

test('boucle JMP/JZ arriere : jitHits > 0 et resultat correct', () => {
  // R7=EXIT(0); R1=3; R2=1; loop: SUB R1,R2; JZ R1,+1; JMP -3; SYSCALL; HALT
  const code = [
    enc(OP.LDI, 7, 0, 0), enc(OP.LDI, 1, 0, 3), enc(OP.LDI, 2, 0, 1),
    enc(OP.SUB, 1, 2, 0), enc(OP.JZ, 1, 0, 1), enc(OP.JMP, 0, 0, 256 - 3),
    enc(OP.SYSCALL, 7, 0, 0), enc(OP.HALT),
  ];
  const emu = new Emulator();
  emu.load({ base: 0x1000, code, strings: [] });
  const r = emu.run();
  assert.equal(r.exitCode, 0);
  assert.equal(emu.cpu.getReg(1), 0);
  assert.ok(r.cpuStats.jitHits > 0, `jitHits=${r.cpuStats.jitHits}`);
});

test('files: ecrit puis relit hi-vfs', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.files());
  const r = emu.run();
  assert.equal(r.exitCode, 0);
  assert.match(r.logs.join('\n'), /hi-vfs/);
  assert.deepEqual([...emu.kernel.vfs.readFile('/demo.txt').slice(0, 6)], [...Buffer.from('hi-vfs')]);
});

test('dma: remplit 16 octets a 0xAB', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.dma());
  emu.run();
  // flush deja fait dans run (dma execute au flush)
  for (let i = 0; i < 16; i++) assert.equal(emu.memory.load8(0x4000 + i), 0xAB);
});

test('textures: cache hit au 2e blit identique, miss sinon', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.checker());
  const r = emu.run();
  assert.equal(r.gpuStats.blits, 2);
  // Les 2 damiers ont des teintes differentes -> 2 miss ; re-upload identique -> hit
  const before = r.gpuStats.texHits;
  const tex = emu.gpu.uploadTexture(emu.gpu.texCache.values().next().value.data, 32, 32);
  assert.ok(tex.hits >= 2);
  assert.ok(emu.gpu.stats.texHits > before);
});

test('pad + ticks + disasm + ppm', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.pad());
  const entry = 0x1000;
  assert.match(emu.cpu.disasm(entry, 2).join('\n'), /LDI/);
  const r = emu.run();
  assert.equal(r.exitCode, 0);
  assert.ok(r.ticks >= 9);
  assert.equal(r.yields, 3);
  const p = '/tmp/test-emu.ppm';
  emu.gpu.savePpm(p);
  assert.equal(readFileSync(p).subarray(0, 2).toString(), 'P6');
  rmSync(p);
});

test('burn: boucle 2000 it, jitHits > 0, jit == interp', () => {
  const a = new Emulator(); a.load(HOMEBREWS.burn()); const ra = a.run();
  const b = new Emulator(); b.cpu.useJit = false; b.load(HOMEBREWS.burn()); const rb = b.run();
  assert.equal(ra.exitCode, 0);
  assert.equal(ra.steps, rb.steps);
  assert.ok(ra.cpuStats.jitHits > 1000, `jitHits=${ra.cpuStats.jitHits}`);
});

test('threads: mutex double-lock echoue, eflag wait=8, join ok', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.threads());
  const r = emu.run();
  assert.equal(r.exitCode, 0);
  assert.equal(emu.memory.load32(0x3304), 0xFFFFFFFF); // 2e lock refuse
  assert.equal(emu.memory.load32(0x3314), 8); // eflag wait
  assert.equal([...emu.kernel.threads.values()].every((t) => t.status === 'joined'), true);
  assert.equal([...emu.kernel.mutexes.values()].every((m) => !m.locked), true);
});

test('audio: 3 tons + wav RIFF valide', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.audio());
  const r = emu.run();
  assert.equal(r.exitCode, 0);
  assert.equal(emu.kernel.audio.slots.size, 3);
  const p = '/tmp/test-emu.wav';
  const n = emu.kernel.audio.saveWav(p);
  assert.ok(n > 1000);
  const head = readFileSync(p);
  assert.equal(head.subarray(0, 4).toString(), 'RIFF');
  assert.equal(head.subarray(8, 12).toString(), 'WAVE');
  rmSync(p);
});

test('savestate: roundtrip memoire + regs + fb', () => {
  const emu = new Emulator();
  emu.load(HOMEBREWS.hello());
  emu.run();
  const s = saveState(emu);
  const emu2 = new Emulator();
  emu2.load(HOMEBREWS.gradient());
  emu2.run();
  loadState(emu2, s);
  assert.deepEqual([...emu2.cpu.regs], [...emu.cpu.regs]);
  assert.deepEqual([...emu2.memory.buf], [...emu.memory.buf]);
  assert.deepEqual([...emu2.gpu.fb], [...emu.gpu.fb]);
  assert.throws(() => loadState(emu2, { v: 999 }));
});
