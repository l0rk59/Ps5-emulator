// Mémoire unifiée simplifiée (pédagogique).
// La vraie PS5 = 16 Go GDDR6 unifiés, bus 256-bit, MMU + IOMMU complexes.
// Ici : 16 Mio plats pour rester exécutable partout, avec contrôle MMU de base.

export class Memory {
  constructor(size = 16 * 1024 * 1024) {
    this.size = size;
    this.buf = new Uint8Array(size);
  }

  check(addr, len = 1) {
    if (!Number.isInteger(addr) || addr < 0 || addr + len > this.size) {
      throw new Error(`MMU fault: addr=0x${(addr >>> 0).toString(16)} len=${len}`);
    }
  }

  readU8(addr) {
    this.check(addr, 1);
    return this.buf[addr];
  }

  writeU8(addr, v) {
    this.check(addr, 1);
    this.buf[addr] = v & 0xff;
  }

  readU32(addr) {
    this.check(addr, 4);
    return (
      this.buf[addr] |
      (this.buf[addr + 1] << 8) |
      (this.buf[addr + 2] << 16) |
      (this.buf[addr + 3] << 24)
    ) >>> 0;
  }

  writeU32(addr, v) {
    this.check(addr, 4);
    v >>>= 0;
    this.buf[addr] = v & 0xff;
    this.buf[addr + 1] = (v >>> 8) & 0xff;
    this.buf[addr + 2] = (v >>> 16) & 0xff;
    this.buf[addr + 3] = (v >>> 24) & 0xff;
  }

  writeBytes(addr, bytes) {
    this.check(addr, bytes.length);
    this.buf.set(bytes, addr);
  }

  readBytes(addr, len) {
    this.check(addr, len);
    return this.buf.slice(addr, addr + len);
  }

  readString(addr, len, maxLen = 4096) {
    const n = Math.min(len, maxLen);
    this.check(addr, n);
    return Buffer.from(this.buf.slice(addr, addr + n)).toString('utf8');
  }
}
