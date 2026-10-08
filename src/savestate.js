// Savestates : capture/restaure memoire + CPU + GPU + kernel (heap, ticks).
// Format JSON + base64 (pas de compression).

export function saveState(emu) {
  return {
    v: 1,
    regs: [...emu.cpu.regs],
    pc: emu.cpu.pc >>> 0,
    steps: emu.cpu.steps,
    mem: Buffer.from(emu.memory.buf).toString('base64'),
    fb: Buffer.from(emu.gpu.fb).toString('base64'),
    heap: emu.kernel.heap,
    ticks: emu.kernel.ticks,
    yields: emu.kernel.yields,
  };
}

export function loadState(emu, s) {
  if (s.v !== 1) throw new Error(`savestate version inconnue: ${s.v}`);
  emu.cpu.regs.set(s.regs);
  emu.cpu.pc = s.pc >>> 0;
  emu.cpu.steps = s.steps | 0;
  emu.memory.buf.set(Buffer.from(s.mem, 'base64'));
  emu.gpu.fb.set(Buffer.from(s.fb, 'base64'));
  emu.kernel.heap = s.heap;
  emu.kernel.ticks = s.ticks;
  emu.kernel.yields = s.yields;
  emu.cpu.blockCache.clear(); // le code a pu changer
}
