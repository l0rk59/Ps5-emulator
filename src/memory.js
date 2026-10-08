// Bus memoire simplifie.
// Vraie PS5 : 16 Go GDDR6 unifiee + mapping complexe + MMIO + securite.
// Ici : 64 Ko contigus pour prototype educatif.

export class Memory {
  constructor(size = 64 * 1024) {
    this.size = size;
    this.buf = new Uint8Array(size);
  }
  check(addr, len = 1) {
    if (addr < 0 || addr + len > this.size) {
      throw new Error(`memory fault: addr=0x${addr.toString(16)} len=${len}`);
    }
  }
  load8(addr) { this.check(addr); return this.buf[addr]; }
  store8(addr, v) { this.check(addr); this.buf[addr] = v & 0xff; }
  load32(addr) {
    this.check(addr, 4);
    return (this.buf[addr] | (this.buf[addr + 1] << 8) | (this.buf[addr + 2] << 16) | (this.buf[addr + 3] << 24)) >>> 0;
  }
  store32(addr, v) {
    this.check(addr, 4);
    this.buf[addr] = v & 0xff;
    this.buf[addr + 1] = (v >>> 8) & 0xff;
    this.buf[addr + 2] = (v >>> 16) & 0xff;
    this.buf[addr + 3] = (v >>> 24) & 0xff;
  }
  loadBytes(addr, len) { this.check(addr, len); return this.buf.slice(addr, addr + len); }
  storeBytes(addr, data) { this.check(addr, data.length); this.buf.set(data, addr); }
}
