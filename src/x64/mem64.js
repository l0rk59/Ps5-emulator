// Memoire sparse 64-bit par pages 4K. Les binaires charges a 0x401000,
// la pile vers 0x7ffffff000 : impossible avec un ArrayBuffer contigu.

export class SparseMemory {
  constructor() { this.pages = new Map(); } // high28 -> Uint8Array(4096)
  page(off) {
    const k = Math.floor(off / 4096);
    let p = this.pages.get(k);
    if (!p) { p = new Uint8Array(4096); this.pages.set(k, p); }
    return { p, i: off % 4096 };
  }
  load8(off) {
    const k = Math.floor(off / 4096);
    return this.pages.get(k)?.[off % 4096] ?? 0; // lecture non mappee = 0
  }
  store8(off, v) { const { p, i } = this.page(off); p[i] = v & 0xff; }
  loadBytes(off, len) {
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) out[i] = this.load8(off + i);
    return out;
  }
  storeBytes(off, data) { for (let i = 0; i < data.length; i++) this.store8(off + i, data[i]); }
  has(off) { return this.pages.has(Math.floor(off / 4096)); }
}
