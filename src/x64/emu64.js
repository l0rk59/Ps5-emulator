// Emulateur user-mode x86-64 : ELF statique -nostdlib + syscalls Linux
// write(1/2) et exit() mappes sur l'hote. Le reste leve une erreur explicite.

import { SparseMemory } from './mem64.js';
import { Cpu64 } from './cpu64.js';
import { loadElf64 } from './elf.js';

export const STACK_TOP = 0x7ffffff000;

export class Emu64 {
  constructor() {
    this.mem = new SparseMemory();
    this.cpu = new Cpu64(this.mem);
    this.stdout = [];
    this.exited = false;
    this.exitCode = 0;
    this.cpu.onSyscall = (rax, rdi, rsi, rdx) => this.linux(Number(rax), Number(rdi), Number(rsi), Number(rdx));
  }
  load(path) {
    const { entry } = loadElf64(this.mem, path);
    this.cpu.rip = entry >>> 0;
    this.cpu.set(4, BigInt(STACK_TOP)); // rsp
    return entry;
  }
  linux(rax, rdi, rsi, rdx) {
    if (rax === 1) { // write
      if (rdi !== 1 && rdi !== 2) throw new Error(`write: fd ${rdi} non supporte (stdout/stderr uniquement)`);
      this.stdout.push(Buffer.from(this.mem.loadBytes(rsi, rdx)).toString('utf8'));
      return BigInt(rdx);
    }
    if (rax === 60) { this.exited = true; this.exitCode = rdi & 0xff; throw HALT; } // exit
    throw new Error(`syscall Linux ${rax} non supporte (seuls write=1, exit=60)`);
  }
  run(maxInstr = 1000000) {
    try { this.cpu.run(maxInstr); }
    catch (e) { if (e !== HALT) throw e; }
    return { exited: this.exited, exitCode: this.exitCode, instrs: this.cpu.instrs, out: this.stdout.join('') };
  }
}
const HALT = Symbol('halt');
