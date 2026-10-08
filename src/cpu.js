// CPU educatif (ISA jouet 32-bit, pas x86-64) + JIT par blocs + desassembleur + stats.
// Vraie PS5 : Zen 2 x86-64 + dynarec. Ici : interprete + JIT-naif vers closures JS (cache par bloc).

export const OP = {
  NOP: 0x00, LDI: 0x01, ADD: 0x02, SUB: 0x03,
  LOAD: 0x04, STORE: 0x05, JMP: 0x06, JZ: 0x07,
  SYSCALL: 0x08, LDIH: 0x09, HALT: 0xff,
};
export const OP_NAME = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

export function enc(op, rd = 0, rs = 0, imm = 0) {
  return ((op & 0xff) << 24 | (rd & 0xff) << 16 | (rs & 0xff) << 8 | (imm & 0xff)) >>> 0;
}
export function dec(w) {
  return { op: (w >>> 24) & 0xff, rd: (w >>> 16) & 7, rs: (w >>> 8) & 7, imm: w & 0xff };
}
export function disasmOne(w, addr) {
  const { op, rd, rs, imm } = dec(w);
  const n = OP_NAME[op] ?? `DB 0x${op.toString(16)}`;
  return `0x${addr.toString(16).padStart(4, '0')}: ${n} R${rd},R${rs},${imm}`;
}

export class Cpu {
  constructor(memory, kernel) {
    this.memory = memory;
    this.kernel = kernel;
    this.regs = new Uint32Array(8);
    this.pc = 0;
    this.steps = 0;
    this.blockCache = new Map(); // pc -> { fn, size, hits }
    this.stats = { blocksCompiled: 0, jitHits: 0, interpSteps: 0 };
    this.breakpoints = new Set();
    this.useJit = true;
  }
  reset(entry = 0) {
    this.regs.fill(0);
    this.pc = entry >>> 0;
    this.steps = 0;
    this.blockCache.clear();
    this.stats = { blocksCompiled: 0, jitHits: 0, interpSteps: 0 };
  }
  setReg(r, v) { if (r !== 0) this.regs[r & 7] = v >>> 0; }
  getReg(r) { return r === 0 ? 0 : this.regs[r & 7] >>> 0; }

  execOne(op, rd, rs, imm) {
    const off = imm & 0x80 ? imm - 256 : imm; // offset signe pour JMP/JZ uniquement
    switch (op) {
      case OP.NOP: break;
      case OP.LDI: this.setReg(rd, imm); break;
      case OP.LDIH: this.setReg(rd, this.getReg(rd) | ((imm & 0xff) << 8)); break;
      case OP.ADD: this.setReg(rd, this.getReg(rd) + this.getReg(rs)); break;
      case OP.SUB: this.setReg(rd, this.getReg(rd) - this.getReg(rs)); break;
      case OP.LOAD: this.setReg(rd, this.memory.load32(this.getReg(rs) + imm)); break;
      case OP.STORE: this.memory.store32(this.getReg(rs) + imm, this.getReg(rd)); break;
      case OP.JMP: this.pc = (this.pc + off * 4) >>> 0; return 'jump';
      case OP.JZ: if (this.getReg(rd) === 0) { this.pc = (this.pc + off * 4) >>> 0; return 'jump'; } break;
      case OP.SYSCALL: {
        const ret = this.kernel.syscall(this.getReg(rd), this.getReg(1), this.getReg(2), this.getReg(3), this.getReg(4), this.getReg(5), this.getReg(6));
        this.setReg(1, ret >>> 0); // valeur retour en R1 (convention demo)
        break;
      }
      case OP.HALT: return 'halt';
      default: throw new Error(`opcode inconnu 0x${op.toString(16)} pc=0x${(this.pc - 4).toString(16)}`);
    }
    return 'next';
  }

  step() {
    const pc0 = this.pc;
    const w = this.memory.load32(pc0);
    const { op, rd, rs, imm } = dec(w);
    this.pc = (this.pc + 4) >>> 0;
    this.steps++;
    this.stats.interpSteps++;
    return this.execOne(op, rd, rs, imm);
  }

  // Compile un bloc droit (max 32 instr, stoppe a JMP/JZ/SYSCALL/HALT).
  compileBlock(startPc) {
    const instrs = [];
    let pc = startPc;
    for (let i = 0; i < 32; i++) {
      const w = this.memory.load32(pc);
      const d = dec(w);
      instrs.push(d);
      pc = (pc + 4) >>> 0;
      if ([OP.JMP, OP.JZ, OP.SYSCALL, OP.HALT].includes(d.op)) break;
    }
    const fn = () => {
      for (const { op, rd, rs, imm } of instrs) {
        this.steps++;
        const r = this.execOne(op, rd, rs, imm);
        if (r !== 'next') return r;
        // execOne n'avance pas pc pour le lineaire : on le fait ici
        if (![OP.JMP, OP.JZ].includes(op)) this.pc = (this.pc + 4) >>> 0;
        // NOTE: step() avait deja avance pc ; ici on gere manuellement.
      }
      return 'next';
    };
    // Approche simple et correcte : la closure ci-dessus double-avance.
    // On utilise plutot une version explicite sans execOne pour le lineaire :
    const regs = this.regs, mem = this.memory, kern = this.kernel;
    const body = instrs.map(({ op, rd, rs, imm }) => {
      switch (op) {
        case OP.NOP: return '';
        case OP.LDI: return rd === 0 ? '' : `R[${rd}]=${imm}>>>0;`;
        case OP.LDIH: return rd === 0 ? '' : `R[${rd}]=(R[${rd}]|(${imm}<<8))>>>0;`;
        case OP.ADD: return rd === 0 ? '' : `R[${rd}]=(R[${rd}]+R[${rs}])>>>0;`;
        case OP.SUB: return rd === 0 ? '' : `R[${rd}]=(R[${rd}]-R[${rs}])>>>0;`;
        case OP.LOAD: return rd === 0 ? `mem.load32((R[${rs}]+${imm})>>>0);` : `R[${rd}]=mem.load32((R[${rs}]+${imm})>>>0);`;
        case OP.STORE: return `mem.store32((R[${rs}]+${imm})>>>0,R[${rd}]>>>0);`;
        default: return null; // controle -> fallback interprete
      }
    });
    let compiled = null;
    if (!body.includes(null)) {
      const src = `"use strict";let s=0;${body.join(`s++;`)}return s;`;
      try { compiled = new Function('R', 'mem', src); } catch { compiled = null; }
    }
    const entry = { instrs, size: instrs.length, hits: 0, compiled, linear: !body.includes(null) };
    this.blockCache.set(startPc, entry);
    this.stats.blocksCompiled++;
    return entry;
  }

  runBlock() {
    const start = this.pc;
    let e = this.blockCache.get(start);
    if (!e) e = this.compileBlock(start);
    else this.stats.jitHits++;
    e.hits++;
    if (e.linear && e.compiled) {
      // Execute lineaire d'un coup (pas de controle dedans par construction)
      const n = e.compiled(this.regs, this.memory);
      this.steps += n;
      this.pc = (start + e.size * 4) >>> 0;
      return 'next';
    }
    // Bloc avec controle : interprete instruction par instruction (avec cache hit comptabilise)
    for (const { op, rd, rs, imm } of e.instrs) {
      const pc0 = this.pc;
      const w = this.memory.load32(pc0);
      this.pc = (this.pc + 4) >>> 0;
      this.steps++;
      const r = this.execOne(op, rd, rs, imm);
      void w;
      if (r !== 'next') return r;
    }
    return 'next';
  }

  run(maxSteps = 200000) {
    for (;;) {
      if (this.kernel.exited) return { halted: true, steps: this.steps };
      if (this.breakpoints.has(this.pc)) return { halted: false, breakpoint: true, steps: this.steps, pc: this.pc };
      if (this.steps >= maxSteps) throw new Error(`timeout: ${maxSteps} steps depassees`);
      let r;
      if (this.useJit) r = this.runBlock();
      else { r = this.step(); if (r === 'jump' || r === 'next') r = 'next'; }
      if (r === 'halt') return { halted: true, steps: this.steps };
    }
  }

  disasm(addr, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      try { out.push(disasmOne(this.memory.load32(addr), addr)); }
      catch { out.push(`0x${addr.toString(16)}: <faute>`); break; }
      addr = (addr + 4) >>> 0;
    }
    return out;
  }
  dumpRegs() {
    return `PC=0x${this.pc.toString(16)} STEPS=${this.steps} ` + [...this.regs].map((v, i) => `R${i}=${v}`).join(' ');
  }
}
