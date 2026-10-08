// CPU pédagogique — NE PAS confondre avec un Zen 2.
// Vrai Zen 2 : x86-64, 8 coeurs, SMT, SIMD AVX2, MMU à pages 4K, modes noyau.
// Ici : 8 registres 32-bit, ISA IR lisible, programme = tableau d'instructions.
// But : démontrer fetch/decode/execute, syscalls, MMU — pas exécuter du binaire PS5.

const REG_COUNT = 8;

function u32(n) {
  return n >>> 0;
}

export class Cpu {
  constructor({ memory, kernel, program = [] }) {
    this.memory = memory;
    this.kernel = kernel;
    this.program = program;
    this.regs = new Array(REG_COUNT).fill(0);
    this.pc = 0;
    this.halted = false;
    this.exitCode = 0;
    this.cycles = 0;
  }

  reset(program) {
    if (program) this.program = program;
    this.regs.fill(0);
    this.pc = 0;
    this.halted = false;
    this.exitCode = 0;
    this.cycles = 0;
  }

  checkReg(r) {
    if (!Number.isInteger(r) || r < 0 || r >= REG_COUNT) {
      throw new Error(`Registre invalide R${r}`);
    }
  }

  checkPc(addr) {
    if (!Number.isInteger(addr) || addr < 0 || addr >= this.program.length) {
      throw new Error(`PC hors programme: ${addr}`);
    }
  }

  step() {
    if (this.halted) return false;
    if (this.pc < 0 || this.pc >= this.program.length) {
      throw new Error(`PC hors programme: ${this.pc} (programme=${this.program.length})`);
    }
    const ins = this.program[this.pc];
    this.cycles++;
    this.exec(ins);
    return !this.halted;
  }

  exec(ins) {
    switch (ins.op) {
      case 'NOP':
        this.pc++;
        break;
      case 'MOV':
        this.checkReg(ins.dst);
        this.regs[ins.dst] = u32(ins.imm);
        this.pc++;
        break;
      case 'ADD':
        this.checkReg(ins.dst); this.checkReg(ins.a); this.checkReg(ins.b);
        this.regs[ins.dst] = u32(this.regs[ins.a] + this.regs[ins.b]);
        this.pc++;
        break;
      case 'SUB':
        this.checkReg(ins.dst); this.checkReg(ins.a); this.checkReg(ins.b);
        this.regs[ins.dst] = u32(this.regs[ins.a] - this.regs[ins.b]);
        this.pc++;
        break;
      case 'MUL':
        this.checkReg(ins.dst); this.checkReg(ins.a); this.checkReg(ins.b);
        this.regs[ins.dst] = u32(Math.imul(this.regs[ins.a], this.regs[ins.b]));
        this.pc++;
        break;
      case 'JMP':
        this.checkPc(ins.addr);
        this.pc = ins.addr;
        break;
      case 'JZ':
        this.checkReg(ins.reg);
        if (this.regs[ins.reg] === 0) {
          this.checkPc(ins.addr);
          this.pc = ins.addr;
        } else {
          this.pc++;
        }
        break;
      case 'JNZ':
        this.checkReg(ins.reg);
        if (this.regs[ins.reg] !== 0) {
          this.checkPc(ins.addr);
          this.pc = ins.addr;
        } else {
          this.pc++;
        }
        break;
      case 'LOAD':
        this.checkReg(ins.dst);
        this.regs[ins.dst] = u32(this.memory.readU32(ins.addr));
        this.pc++;
        break;
      case 'STORE':
        this.checkReg(ins.src);
        this.memory.writeU32(ins.addr, this.regs[ins.src]);
        this.pc++;
        break;
      case 'SYSCALL':
        this.kernel.syscall(ins.id, this.regs);
        this.pc++;
        if (this.kernel.exited) {
          this.halted = true;
          this.exitCode = this.kernel.exitCode;
        }
        break;
      case 'HALT':
        this.halted = true;
        this.exitCode = ins.code ?? 0;
        this.pc++;
        break;
      default:
        throw new Error(`Opcode inconnu: ${ins.op}`);
    }
  }

  run(maxCycles = 100000) {
    let n = 0;
    while (!this.halted && n < maxCycles) {
      this.step();
      n++;
    }
    if (!this.halted) throw new Error(`Timeout: ${maxCycles} cycles sans HALT/EXIT`);
    return { cycles: this.cycles, exitCode: this.exitCode };
  }
}
