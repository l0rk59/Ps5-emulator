// Audio logiciel : synthese sinus + export WAV 16-bit mono.
// Vraie PS5 : ADPCM/Opus + sortie multicanal. Ici : 3 slots mixables, 8 kHz.

import { writeFileSync } from 'node:fs';

export class Audio {
  constructor(sampleRate = 8000) {
    this.sampleRate = sampleRate;
    this.slots = new Map(); // slot -> Int16Array
  }
  tone(freqHz, durMs, slot = 0) {
    const n = Math.max(1, Math.floor(this.sampleRate * (durMs / 1000)));
    const buf = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      buf[i] = Math.round(12000 * Math.sin((2 * Math.PI * freqHz * i) / this.sampleRate));
    }
    this.slots.set(slot, buf);
    return n;
  }
  mix() {
    if (this.slots.size === 0) return new Int16Array(0);
    const len = Math.max(...[...this.slots.values()].map((b) => b.length));
    const out = new Int32Array(len);
    for (const b of this.slots.values()) for (let i = 0; i < b.length; i++) out[i] += b[i];
    return Int16Array.from(out.map((v) => Math.max(-32768, Math.min(32767, v))));
  }
  saveWav(path) {
    const pcm = this.mix();
    const data = Buffer.alloc(44 + pcm.length * 2);
    data.write('RIFF', 0); data.writeUInt32LE(36 + pcm.length * 2, 4); data.write('WAVE', 8);
    data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20);
    data.writeUInt16LE(1, 22); data.writeUInt32LE(this.sampleRate, 24);
    data.writeUInt32LE(this.sampleRate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
    data.write('data', 36); data.writeUInt32LE(pcm.length * 2, 40);
    for (let i = 0; i < pcm.length; i++) data.writeInt16LE(pcm[i], 44 + i * 2);
    writeFileSync(path, data);
    return pcm.length;
  }
}
