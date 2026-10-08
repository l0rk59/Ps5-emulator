// Orchestrateur : reset -> load -> run -> snapshot.
// Séquence de boot honnête : firmware de DÉMO, pas de firmware Sony.

import { Memory } from './memory.js';
import { Cpu } from './cpu.js';
import { Gpu } from './gpu.js';
import { Kernel } from './kernel.js';
import { loadDemo } from './loader.js';

export class Emulator {
  constructor({ memSize } = {}) {
    this.memory = new Memory(memSize);
    this.gpu = new Gpu();
    this.kernel = new Kernel({ memory: this.memory, gpu: this.gpu });
    this.cpu = new Cpu({ memory: this.memory, kernel: this.kernel, program: [] });
    this.bootLog = [];
    this.title = '';
  }

  boot(demoObj) {
    this.memory.buf.fill(0);
    this.kernel.reset();
    this.gpu.clear(0x0b0e14);
    this.bootLog = [
      '[BOOT] ps5-emulator-educatif v0.1.0 (homebrew uniquement)',
      '[BOOT] memoire unifiee allouee (demo 16 Mio, PS5 reelle 16 Go GDDR6)',
      '[BOOT] cpu IR demarre (Zen 2 reel NON emule — voir README)',
      '[BOOT] gpu logiciel 320x180 (RDNA 2 reelle NON emulee)',
    ];
    const { name, program } = loadDemo(this.memory, demoObj);
    this.title = name;
    this.cpu.reset(program);
    this.bootLog.push(`[BOOT] homebrew charge: "${name}" (${program.length} instr)`);
    return this.bootLog;
  }

  step() {
    return this.cpu.step();
  }

  run(maxCycles = 100000) {
    const res = this.cpu.run(maxCycles);
    this.gpu.present();
    return res;
  }

  snapshot() {
    return {
      title: this.title,
      halted: this.cpu.halted,
      exitCode: this.cpu.exitCode,
      pc: this.cpu.pc,
      cycles: this.cpu.cycles,
      regs: [...this.cpu.regs],
      stdout: this.kernel.stdout,
      klog: [...this.kernel.log],
      bootLog: [...this.bootLog],
    };
  }
}
