// Interprete x86-64, sous-ensemble documente (pas de r8-r15, pas de SIB,
// pas de FPU/SIMD) : mov/lea/add/sub/xor/cmp/inc/dec/push/pop/call/ret/
// jmp/jcc/syscall. Registres en BigInt (justesse 64-bit), flags ZF/SF/CF/OF.

const M64 = (1n << 64n) - 1n, M32 = (1n << 32n) - 1n;
const REGN = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi'];
const CC = ['o', 'no', 'b', 'ae', 'e', 'ne', 'be', 'a', 's', 'ns', 'p', 'np', 'l', 'ge', 'le', 'g'];

export class Cpu64 {
  constructor(mem) {
    this.mem = mem;
    this.regs = Array(8).fill(0n); // BigInt masques 64-bit
    this.rip = 0;
    this.ZF = false; this.SF = false; this.CF = false; this.OF = false;
    this.instrs = 0;
    this.onSyscall = () => { throw new Error('syscall sans handler'); };
  }
  get(r) { return this.regs[r] & M64; }
  set(r, v) { if (r !== -1) this.regs[r] = BigInt(v) & M64; }
  set32(r, v) { this.regs[r] = BigInt(v) & M32; } // zero-extend

  fetchU8() { return this.mem.load8(this.rip++); }
  fetchI8() { const v = this.fetchU8(); return v & 0x80 ? v - 256 : v; }
  fetchU32() { let v = 0; for (let i = 0; i < 4; i++) v |= this.fetchU8() << (8 * i); return v >>> 0; }
  fetchI32() { const v = this.fetchU32(); return v & 0x80000000 ? v - 0x100000000 : v; }

  flagsAdd(a, b, res, w) {
    const mask = w === 64 ? M64 : M32, sign = w === 64 ? 1n << 63n : 1n << 31n;
    this.ZF = (res & mask) === 0n;
    this.SF = (res & sign) !== 0n;
    this.CF = res > mask;
    this.OF = ((~(a ^ b)) & (a ^ (res & mask)) & sign) !== 0n;
  }
  flagsSub(a, b, w) {
    const mask = w === 64 ? M64 : M32, sign = w === 64 ? 1n << 63n : 1n << 31n;
    const r = (a - b) & mask;
    this.ZF = r === 0n;
    this.SF = (r & sign) !== 0n;
    this.CF = (a & mask) < (b & mask);
    this.OF = (((a ^ b) & (a ^ r)) & sign) !== 0n;
    return r;
  }
  cond(cc) {
    switch (cc) {
      case 0: return this.OF; case 1: return !this.OF;
      case 2: return this.CF; case 3: return !this.CF;
      case 4: return this.ZF; case 5: return !this.ZF;
      case 6: return this.CF || this.ZF; case 7: return !this.CF && !this.ZF;
      case 8: return this.SF; case 9: return !this.SF;
      case 12: return this.SF !== this.OF; case 13: return this.SF === this.OF;
      case 14: return this.ZF || this.SF !== this.OF; case 15: return !this.ZF && this.SF === this.OF;
      default: throw new Error(`condition ${CC[cc]} (p/pf) non supportee`);
    }
  }
  loadMem(addr, w) {
    const b = this.mem.loadBytes(addr, w === 64 ? 8 : 4);
    let v = 0n;
    for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]);
    return v;
  }
  storeMem(addr, v, w) {
    const n = w === 64 ? 8 : 4;
    const b = new Uint8Array(n);
    let x = BigInt(v);
    for (let i = 0; i < n; i++) { b[i] = Number(x & 0xffn); x >>= 8n; }
    this.mem.storeBytes(addr, b);
  }
  push(v) { this.regs[4] = (this.regs[4] - 8n) & M64; this.storeMem(Number(this.regs[4]), v, 64); }
  pop() { const v = this.loadMem(Number(this.regs[4]), 64); this.regs[4] = (this.regs[4] + 8n) & M64; return v; }

  // Parse ModRM (+disp). Rend { mod, reg, addr } ou { mod:3, reg, rm }.
  modrm() {
    const m = this.fetchU8();
    const mod = m >> 6, reg = (m >> 3) & 7, rm = m & 7;
    if (mod === 3) return { mod, reg, rm };
    if (rm === 4) throw new Error('SIB non supporte (pile RSP adressable uniquement via push/pop)');
    let addr;
    if (mod === 0 && rm === 5) addr = (this.rip + 4 + this.fetchI32()) >>> 0; // RIP-relatif
    else {
      const base = Number(this.get(rm));
      if (mod === 0) addr = base >>> 0;
      else if (mod === 1) addr = (base + this.fetchI8()) >>> 0;
      else addr = (base + this.fetchI32()) >>> 0;
    }
    return { mod, reg, addr };
  }

  alu(op, dst, src, w) {
    const mask = w === 64 ? M64 : M32;
    const a = dst & mask, b = src & mask;
    if (op === 'add') { const r = a + b; this.flagsAdd(a, b, r, w); return r & mask; }
    if (op === 'sub' || op === 'cmp') return this.flagsSub(a, b, w);
    const r = (a ^ b) & mask; // xor : CF=OF=0
    this.ZF = r === 0n;
    this.SF = (r & (w === 64 ? 1n << 63n : 1n << 31n)) !== 0n;
    this.CF = false; this.OF = false;
    return r;
  }

  step() {
    const start = this.rip;
    let w = 32, b = this.mem.load8(this.rip);
    if (b >= 0x40 && b <= 0x4f) { // REX
      this.rip++;
      if (b & 0x07) throw new Error(`REX.R/X/B (r8-r15) non supporte @0x${start.toString(16)}`);
      if (b & 0x08) w = 64;
      b = this.mem.load8(this.rip);
    }
    const op = b; this.rip++;
    const hex = () => `opcode 0x${op.toString(16)} @0x${start.toString(16)}`;
    this.instrs++;

    if (op >= 0xb8 && op <= 0xbf) { this.set32(op - 0xb8, this.fetchU32()); return; } // mov r32,imm32
    if (op >= 0x50 && op <= 0x57) { this.push(this.get(op - 0x50)); return; } // push r64
    if (op >= 0x58 && op <= 0x5f) { this.set(op - 0x58, this.pop()); return; } // pop r64
    if (op === 0xe8) { const rel = this.fetchI32(); this.push(BigInt(this.rip)); this.rip = (this.rip + rel) >>> 0; return; }
    if (op === 0xc3) { this.rip = Number(this.pop()) >>> 0; return; }
    if (op === 0xeb) { this.rip = (this.rip + 1 + this.fetchI8()) >>> 0; return; }
    if (op === 0xe9) { this.rip = (this.rip + 4 + this.fetchI32()) >>> 0; return; }
    if (op >= 0x70 && op <= 0x7f) { const rel = this.fetchI8(); if (this.cond(op - 0x70)) this.rip = (this.rip + rel) >>> 0; return; }
    if (op === 0x0f) {
      const op2 = this.fetchU8();
      if (op2 === 0x05) { // syscall
        const rax = this.get(0);
        const ret = this.onSyscall(rax, this.get(7), this.get(6), this.get(2), this.get(1));
        this.set(0, ret);
        return;
      }
      if (op2 >= 0x80 && op2 <= 0x8f) { const rel = this.fetchI32(); if (this.cond(op2 - 0x80)) this.rip = (this.rip + rel) >>> 0; return; }
      throw new Error(`0F ${hex()}`);
    }
    if ([0x89, 0x8b, 0x8d, 0x01, 0x03, 0x29, 0x2b, 0x31, 0x33, 0x39, 0x3b, 0xff].includes(op)) {
      const { mod, reg, rm, addr } = this.modrm();
      const getR = () => w === 64 ? this.get(reg) : this.get(reg) & M32;
      if (op === 0x89 || op === 0x8b || op === 0x8d || [0x01, 0x03, 0x29, 0x2b, 0x31, 0x33, 0x39, 0x3b].includes(op)) {
        const name = { 0x89: 'mov', 0x8b: 'mov', 0x8d: 'lea', 0x01: 'add', 0x03: 'add', 0x29: 'sub', 0x2b: 'sub', 0x31: 'xor', 0x33: 'xor', 0x39: 'cmp', 0x3b: 'cmp' }[op];
        const rmIsReg = mod === 3;
        if (op === 0x8d) { // lea r64, m
          if (rmIsReg) throw new Error('lea sur registre ' + hex());
          this.set(reg, BigInt(addr >>> 0));
          return;
        }
        const dirToRm = (op === 0x89 || op === 0x01 || op === 0x29 || op === 0x31 || op === 0x39); // r -> r/m
        if (name === 'mov') {
          if (dirToRm) { if (rmIsReg) { w === 64 ? this.set(rm, getR()) : this.set32(rm, getR()); } else this.storeMem(addr, getR(), w); }
          else { const v = rmIsReg ? (w === 64 ? this.get(rm) : this.get(rm) & M32) : this.loadMem(addr, w); w === 64 ? this.set(reg, v) : this.set32(reg, v); }
          return;
        }
        const src = dirToRm ? getR() : null;
        const dst = dirToRm ? (rmIsReg ? (w === 64 ? this.get(rm) : this.get(rm) & M32) : this.loadMem(addr, w)) : getR();
        const s = dirToRm ? src : (rmIsReg ? (w === 64 ? this.get(rm) : this.get(rm) & M32) : this.loadMem(addr, w));
        const r = this.alu(name, dst, s, w);
        if (dirToRm) { if (rmIsReg) { w === 64 ? this.set(rm, r) : this.set32(rm, r); } else if (name !== 'cmp') this.storeMem(addr, r, w); }
        else if (name !== 'cmp') { w === 64 ? this.set(reg, r) : this.set32(reg, r); }
        return;
      }
      // 0xFF groupes /0 inc /1 dec
      const grp = reg;
      if (grp !== 0 && grp !== 1) throw new Error(`FF /${grp} (call/jmp indirect) non supporte ${hex()}`);
      const cur = mod === 3 ? (w === 64 ? this.get(rm) : this.get(rm) & M32) : this.loadMem(addr, w);
      const mask = w === 64 ? M64 : M32;
      const r = grp === 0 ? (cur + 1n) & mask : (cur - 1n) & mask;
      const sign = w === 64 ? 1n << 63n : 1n << 31n;
      // INC/DEC : CF preserve, OF = overflow signe
      this.ZF = r === 0n; this.SF = (r & sign) !== 0n;
      this.OF = grp === 0 ? r === sign : (cur & mask) === sign;
      if (mod === 3) { w === 64 ? this.set(rm, r) : this.set32(rm, r); } else this.storeMem(addr, r, w);
      return;
    }
    throw new Error(hex());
  }

  run(maxInstr = 1000000) {
    for (let i = 0; i < maxInstr; i++) this.step();
    throw new Error(`timeout x64: ${maxInstr} instr depassees @0x${this.rip.toString(16)}`);
  }
  dump() {
    return `RIP=0x${this.rip.toString(16)} ` + this.regs.map((v, i) => `${REGN[i]}=${v}`).join(' ')
      + ` ZF=${+this.ZF} SF=${+this.SF} CF=${+this.CF} OF=${+this.OF}`;
  }
}
