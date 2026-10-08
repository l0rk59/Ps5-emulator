import { Memory } from './memory.js';
import { Cpu } from './cpu.js';
import { Gpu } from './gpu.js';
import { Kernel } from './kernel.js';
import { loadProgram } from './loader.js';

export class Emulator {
  constructor() {
    this.memory = new Memory();
    this.gpu = new Gpu();
    this.kernel = new Kernel(this.memory, this.gpu);
    // Kernel a besoin de la memoire partagee ; gpu.flush aussi (dma).
    this.cpu = new Cpu(this.memory, this.kernel);
  }
  load(program) {
    const entry = loadProgram(this.memory, program);
    this.cpu.reset(entry);
    return entry;
  }
  run(maxSteps = 200000) {
    const r = this.cpu.run(maxSteps);
    this.gpu.flush(this.memory);
    return {
      ...r,
      exitCode: this.kernel.exitCode,
      logs: [...this.kernel.logs],
      presents: this.gpu.presentCount,
      cpuStats: { ...this.cpu.stats, cacheSize: this.cpu.blockCache.size },
      gpuStats: { ...this.gpu.stats, texCached: this.gpu.texCache.size },
      ticks: this.kernel.ticks,
      yields: this.kernel.yields,
    };
  }
}
