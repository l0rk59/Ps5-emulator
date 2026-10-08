// Noyau HLE etendu : process + fichiers + alloc + pad + compute/dma + audio + threads cooperatifs.
// Vraie PS5 : Orbis OS, ~1000+ syscalls. Ici : 24 syscalls documentees pour homebrew.

import { Vfs } from './vfs.js';
import { Pad } from './pad.js';
import { Audio } from './audio.js';

export const SYSCALL = {
  EXIT: 0, PRINT: 1, CLEAR: 2, DRAW_RECT: 3,
  OPEN: 4, READ: 5, WRITE: 6, CLOSE: 7,
  MALLOC: 8, GET_TICKS: 9, PAD_READ: 10,
  GRADIENT: 11, DMA_FILL: 12, YIELD: 13, BLIT_CHECKER: 14,
  AUDIO_TONE: 15, THREAD_SPAWN: 16, THREAD_JOIN: 17,
  MUTEX_CREATE: 18, MUTEX_LOCK: 19, MUTEX_UNLOCK: 20,
  EFLAG_CREATE: 21, EFLAG_SET: 22, EFLAG_WAIT: 23,
};

export class Kernel {
  constructor(memory, gpu) {
    this.memory = memory;
    this.gpu = gpu;
    this.vfs = new Vfs();
    this.pad = new Pad();
    this.audio = new Audio();
    this.exited = false;
    this.exitCode = 0;
    this.logs = [];
    this.heap = 0x8000;
    this.ticks = 0;
    this.yields = 0;
    // Modele cooperatif mono-contexte (pas de vrai parallelisme) : bookkeeping verifiable.
    this.threads = new Map(); // id -> { entry, status }
    this.nextThread = 1;
    this.mutexes = new Map(); // id -> { locked }
    this.nextMutex = 1;
    this.eflags = new Map(); // id -> { bits }
    this.nextEflag = 1;
  }
  cstr(addr, maxLen = 256) {
    const bytes = [];
    for (let i = 0; i < maxLen; i++) {
      const b = this.memory.load8(addr + i);
      if (b === 0) break;
      bytes.push(b);
    }
    return Buffer.from(bytes).toString('utf8');
  }
  syscall(n, a0, a1, a2, a3, a4, a5) {
    this.ticks++;
    switch (n) {
      case SYSCALL.EXIT: this.exited = true; this.exitCode = a0 | 0; return 0;
      case SYSCALL.PRINT: {
        const bytes = this.memory.loadBytes(a0, a1);
        this.logs.push(Buffer.from(bytes).toString('utf8'));
        return a1;
      }
      case SYSCALL.CLEAR:
        this.gpu.submit('gfx', { op: 'clear', r: a0 & 0xff, g: a1 & 0xff, b: a2 & 0xff });
        return 0;
      case SYSCALL.DRAW_RECT:
        this.gpu.submit('gfx', { op: 'rect', x: a0 | 0, y: a1 | 0, w: a2 | 0, h: a3 | 0, r: a4 & 0xff, g: a5 & 0xff, b: 30 });
        return 0;
      case SYSCALL.OPEN: {
        const path = this.cstr(a0);
        return this.vfs.open(path, a1 === 1 ? 'w' : 'r');
      }
      case SYSCALL.READ: {
        const chunk = this.vfs.read(a0, a2);
        if (!chunk) return -1;
        this.memory.storeBytes(a1, chunk);
        return chunk.length;
      }
      case SYSCALL.WRITE: {
        const bytes = this.memory.loadBytes(a1, a2);
        return this.vfs.write(a0, bytes);
      }
      case SYSCALL.CLOSE: return this.vfs.close(a0);
      case SYSCALL.MALLOC: {
        const addr = this.heap;
        this.heap = (this.heap + (a0 | 0) + 15) & ~15;
        if (this.heap >= this.memory.size) throw new Error('heap epuise');
        return addr;
      }
      case SYSCALL.GET_TICKS: return this.ticks;
      case SYSCALL.PAD_READ: return this.pad.read();
      case SYSCALL.GRADIENT:
        this.gpu.submit('compute', { op: 'gradient', r0: a0 & 0xff, g0: a1 & 0xff, b0: a2 & 0xff, r1: a3 & 0xff, g1: a4 & 0xff, b1: a5 & 0xff });
        return 0;
      case SYSCALL.DMA_FILL:
        this.gpu.submit('dma', { op: 'fill', addr: a0 >>> 0, value: a1 & 0xff, len: a2 | 0 });
        return 0;
      case SYSCALL.YIELD: this.yields++; return 0;
      case SYSCALL.AUDIO_TONE:
        return this.audio.tone(a0 | 0, a1 | 0, a2 | 0);
      case SYSCALL.THREAD_SPAWN: {
        const id = this.nextThread++;
        this.threads.set(id, { entry: a0 >>> 0, status: 'ready' });
        return id;
      }
      case SYSCALL.THREAD_JOIN: {
        const t = this.threads.get(a0);
        if (!t) return -1;
        t.status = 'joined';
        this.yields++;
        return 0;
      }
      case SYSCALL.MUTEX_CREATE: {
        const id = this.nextMutex++;
        this.mutexes.set(id, { locked: false });
        return id;
      }
      case SYSCALL.MUTEX_LOCK: {
        const m = this.mutexes.get(a0);
        if (!m) return -1;
        if (m.locked) return -1; // mono-contexte : re-lock = echec, pas de deadlock
        m.locked = true;
        return 0;
      }
      case SYSCALL.MUTEX_UNLOCK: {
        const m = this.mutexes.get(a0);
        if (!m || !m.locked) return -1;
        m.locked = false;
        return 0;
      }
      case SYSCALL.EFLAG_CREATE: {
        const id = this.nextEflag++;
        this.eflags.set(id, { bits: 0 });
        return id;
      }
      case SYSCALL.EFLAG_SET: {
        const e = this.eflags.get(a0);
        if (!e) return -1;
        e.bits = (e.bits | (a1 >>> 0)) >>> 0;
        return e.bits | 0;
      }
      case SYSCALL.EFLAG_WAIT: {
        const e = this.eflags.get(a0);
        if (!e) return -1;
        return (e.bits & (a1 >>> 0)) >>> 0; // immediat en mono-contexte
      }
      case SYSCALL.BLIT_CHECKER: {
        // Genere un damier 32x32 via cache texture puis blit en (x,y)
        const s = 32, data = new Uint8Array(s * s * 3);
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
          const c = ((x >> 3) + (y >> 3)) % 2 ? 230 : 20;
          const o = (y * s + x) * 3;
          data[o] = (c + (a4 & 0xff)) & 0xff; data[o + 1] = c; data[o + 2] = (c + (a5 & 0xff)) & 0xff;
        }
        const tex = this.gpu.uploadTexture(data, s, s);
        this.gpu.submit('gfx', { op: 'blit', x: a0 | 0, y: a1 | 0, tex });
        return tex.hash | 0;
      }
      default: throw new Error(`syscall non implemente: ${n}`);
    }
  }
}
