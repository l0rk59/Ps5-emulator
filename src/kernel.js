// Noyau Orbis simplifié — stubs de syscalls pour homebrew démo uniquement.
// Vrai Orbis OS : FreeBSD dérivé, centaines de syscalls, sandbox, DRM.
// Ici : 6 syscalls documentés. Tout appel inconnu => erreur explicite.

export const SYSCALL = {
  EXIT: 0,
  PUTCHAR: 1,
  WRITE_STRING: 16,
  CLEAR: 17,
  RECT: 18,
  GET_TIME: 19,
};

export class Kernel {
  constructor({ memory, gpu }) {
    this.memory = memory;
    this.gpu = gpu;
    this.stdout = '';
    this.log = [];
    this.exited = false;
    this.exitCode = 0;
    this.startTime = Date.now();
  }

  reset() {
    this.stdout = '';
    this.log = [];
    this.exited = false;
    this.exitCode = 0;
    this.startTime = Date.now();
  }

  syscall(id, regs) {
    switch (id) {
      case SYSCALL.EXIT:
        this.exited = true;
        this.exitCode = regs[0] >>> 0;
        this.log.push(`exit(${this.exitCode})`);
        break;
      case SYSCALL.PUTCHAR:
        this.stdout += String.fromCharCode(regs[0] & 0xff);
        break;
      case SYSCALL.WRITE_STRING: {
        const addr = regs[0] >>> 0;
        const len = regs[1] >>> 0;
        if (len > 8192) throw new Error('WRITE_STRING: len trop grande');
        this.stdout += this.memory.readString(addr, len);
        break;
      }
      case SYSCALL.CLEAR:
        this.gpu.clear(regs[0] >>> 0);
        this.log.push(`gpu.clear(0x${(regs[0] >>> 0).toString(16)})`);
        break;
      case SYSCALL.RECT:
        this.gpu.rect(regs[0] >>> 0, regs[1] >>> 0, regs[2] >>> 0, regs[3] >>> 0, regs[4] >>> 0);
        this.log.push(`gpu.rect(${regs[0]},${regs[1]},${regs[2]},${regs[3]})`);
        break;
      case SYSCALL.GET_TIME:
        regs[0] = (Date.now() - this.startTime) >>> 0;
        break;
      default:
        throw new Error(`Syscall non implémenté: ${id} (stub éducatif)`);
    }
  }
}
