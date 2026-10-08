// GPU logiciel : 3 anneaux (gfx/compute/dma) + cache textures + stats + export PPM.
// Vraie PS5 : RDNA2 + Vulkan/SPIR-V. Ici : rasterisation CPU naive mais architecture en anneaux.

import { writeFileSync } from 'node:fs';

function hashBytes(b) {
  let h = 2166136261;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class Gpu {
  constructor(width = 256, height = 144) {
    this.width = width;
    this.height = height;
    this.fb = new Uint8Array(width * height * 3);
    this.rings = { gfx: [], compute: [], dma: [] };
    this.presentCount = 0;
    this.texCache = new Map(); // hash -> { w,h,data,hits }
    this.stats = { draws: 0, blits: 0, computes: 0, dmas: 0, texHits: 0, texMiss: 0 };
  }
  submit(ring, cmd) {
    if (!this.rings[ring]) throw new Error(`gpu ring inconnu: ${ring}`);
    this.rings[ring].push(cmd);
  }
  // Compat ancienne API : submit(cmd) -> gfx
  submitLegacy(cmd) { this.rings.gfx.push(cmd); }

  clear(r, g, b) {
    for (let i = 0; i < this.fb.length; i += 3) { this.fb[i] = r; this.fb[i + 1] = g; this.fb[i + 2] = b; }
  }
  rect(x, y, w, h, r, g, b) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = x + i, py = y + j;
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      const o = (py * this.width + px) * 3;
      this.fb[o] = r; this.fb[o + 1] = g; this.fb[o + 2] = b;
    }
    this.stats.draws++;
  }
  blitTexture(x, y, tex) {
    const { w, h, data } = tex;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = x + i, py = y + j;
      if (px < 0 || py < 0 || px >= this.width || py >= this.height) continue;
      const s = (j * w + i) * 3, o = (py * this.width + px) * 3;
      this.fb[o] = data[s]; this.fb[o + 1] = data[s + 1]; this.fb[o + 2] = data[s + 2];
    }
    this.stats.blits++;
  }
  uploadTexture(data, w, h) {
    const hash = hashBytes(data);
    const hit = this.texCache.get(hash);
    if (hit) { hit.hits++; this.stats.texHits++; return hit; }
    const e = { w, h, data: Uint8Array.from(data), hits: 1, hash };
    this.texCache.set(hash, e);
    this.stats.texMiss++;
    return e;
  }
  // Pseudo "compute shader" : degrade horizontal entre deux couleurs.
  computeGradient(r0, g0, b0, r1, g1, b1) {
    for (let x = 0; x < this.width; x++) {
      const t = x / Math.max(1, this.width - 1);
      const r = Math.round(r0 + (r1 - r0) * t), g = Math.round(g0 + (g1 - g0) * t), b = Math.round(b0 + (b1 - b0) * t);
      for (let y = 0; y < this.height; y++) {
        const o = (y * this.width + x) * 3;
        this.fb[o] = r; this.fb[o + 1] = g; this.fb[o + 2] = b;
      }
    }
    this.stats.computes++;
  }
  dmaFill(memory, addr, value, len) {
    for (let i = 0; i < len; i++) memory.store8(addr + i, value);
    this.stats.dmas++;
  }

  flush(memory = null) {
    for (const c of this.rings.gfx) {
      if (c.op === 'clear') this.clear(c.r, c.g, c.b);
      else if (c.op === 'rect') this.rect(c.x, c.y, c.w, c.h, c.r, c.g, c.b);
      else if (c.op === 'blit') this.blitTexture(c.x, c.y, c.tex);
      else if (c.op === 'present') this.presentCount++;
      else throw new Error(`gpu/gfx op inconnue ${c.op}`);
    }
    for (const c of this.rings.compute) {
      if (c.op === 'gradient') this.computeGradient(c.r0, c.g0, c.b0, c.r1, c.g1, c.b1);
      else throw new Error(`gpu/compute op inconnue ${c.op}`);
    }
    for (const c of this.rings.dma) {
      if (!memory) throw new Error('dma sans memoire');
      if (c.op === 'fill') this.dmaFill(memory, c.addr, c.value, c.len);
      else throw new Error(`gpu/dma op inconnue ${c.op}`);
    }
    this.rings.gfx.length = 0; this.rings.compute.length = 0; this.rings.dma.length = 0;
  }

  toPpm() {
    return `P6\n${this.width} ${this.height}\n255\n`;
  }
  savePpm(path) {
    const head = Buffer.from(this.toPpm(), 'ascii');
    writeFileSync(path, Buffer.concat([head, Buffer.from(this.fb)]));
  }
  toAscii(cols = 64, rows = 18) {
    const sx = Math.max(1, Math.floor(this.width / cols)), sy = Math.max(1, Math.floor(this.height / rows));
    const chars = ' .:-=+*#%@';
    let out = '';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = Math.min(this.width - 1, x * sx), py = Math.min(this.height - 1, y * sy);
        const o = (py * this.width + px) * 3;
        const lum = (this.fb[o] + this.fb[o + 1] + this.fb[o + 2]) / (3 * 255);
        out += chars[Math.min(chars.length - 1, Math.floor(lum * chars.length))];
      }
      out += '\n';
    }
    return out;
  }
}
