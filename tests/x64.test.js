import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Emu64 } from '../src/x64/emu64.js';
import { loadElf64 } from '../src/x64/elf.js';
import { SparseMemory } from '../src/x64/mem64.js';

const GCC = '/usr/bin/gcc';
const bins = { hello: '/tmp/x64-test-hello', loop: '/tmp/x64-test-loop' };

function build() {
  if (!existsSync(GCC)) return false;
  execFileSync(GCC, ['-nostdlib', '-static', '-o', bins.hello, 'src/x64/asm/hello.S']);
  execFileSync(GCC, ['-nostdlib', '-static', '-o', bins.loop, 'src/x64/asm/loop.S']);
  return true;
}
const ok = build();

test('x64 hello: sortie + exit identiques au natif', { skip: !ok && 'gcc absent' }, () => {
  const nativeOut = execFileSync(bins.hello, { encoding: 'utf8' });
  const e = new Emu64(); e.load(bins.hello); const r = e.run();
  assert.equal(r.out, nativeOut);
  assert.equal(r.out, 'hello x86-64\n');
  assert.equal(r.exitCode, 0);
});

test('x64 loop: exit 6 comme le natif (1+2+3)', { skip: !ok && 'gcc absent' }, () => {
  let nativeCode = 0;
  try { execFileSync(bins.loop); } catch (e) { nativeCode = e.status; }
  const e = new Emu64(); e.load(bins.loop); const r = e.run();
  assert.equal(r.exitCode, nativeCode);
  assert.equal(r.exitCode, 6);
});

test('x64 loader: refuse non-ELF et ELF 32-bit', () => {
  const m = new SparseMemory();
  assert.throws(() => loadElf64(m, 'package.json'), /pas un ELF/);
});
