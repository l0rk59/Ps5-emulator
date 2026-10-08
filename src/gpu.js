// GPU logiciel simplifié.
// Vrai PS5 : RDNA 2 custom, ray-tracing, 10,3 TFLOPS, command buffers AMD.
// Ici : framebuffer 320x180 RGBA + primitives CLEAR/RECT, rendu CPU.
// En CI : SwiftShader (CPU). Ne pas prétendre à une accélération matérielle.

export const GPU_WIDTH = 320;
export const GPU_HEIGHT = 180;

export function unpackColor(c) {
  return [(c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff];
}

export class Gpu {
  constructor(width = GPU_WIDTH, height = GPU_HEIGHT) {
    this.width = width;
    this.height = height;
    this.fb = new Uint8ClampedArray(width * height * 4);
    this.clear(0x0b0e14);
    this.presentCount = 0;
  }

  clear(color = 0x000000) {
    const [r, g, b] = unpackColor(color >>> 0);
    for (let i = 0; i < this.fb.length; i += 4) {
      this.fb[i] = r; this.fb[i + 1] = g; this.fb[i + 2] = b; this.fb[i + 3] = 255;
    }
  }

  rect(x, y, w, h, color) {
    const [r, g, b] = unpackColor(color >>> 0);
    const x0 = Math.max(0, x), y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const o = (py * this.width + px) * 4;
        this.fb[o] = r; this.fb[o + 1] = g; this.fb[o + 2] = b; this.fb[o + 3] = 255;
      }
    }
  }

  present() {
    this.presentCount++;
  }

  isMostlyBlack() {
    let lit = 0;
    for (let i = 0; i < this.fb.length; i += 4) {
      if (this.fb[i] > 12 || this.fb[i + 1] > 12 || this.fb[i + 2] > 12) lit++;
    }
    return lit < this.fb.length / 4 / 100; // < 1% de pixels allumés
  }

  toPPM() {
    const head = `P6\n${this.width} ${this.height}\n255\n`;
    const rgb = Buffer.alloc(this.width * this.height * 3);
    for (let i = 0, j = 0; i < this.fb.length; i += 4, j += 3) {
      rgb[j] = this.fb[i]; rgb[j + 1] = this.fb[i + 1]; rgb[j + 2] = this.fb[i + 2];
    }
    return Buffer.concat([Buffer.from(head), rgb]);
  }

  toAscii(cols = 64, rows = 24) {
    const chars = ' .:-=+*#%@';
    let out = '';
    const sx = this.width / cols, sy = this.height / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = Math.floor(x * sx), py = Math.floor(y * sy);
        const o = (py * this.width + px) * 4;
        const lum = (this.fb[o] * 0.299 + this.fb[o + 1] * 0.587 + this.fb[o + 2] * 0.114) / 255;
        out += chars[Math.min(chars.length - 1, Math.floor(lum * chars.length))];
      }
      out += '\n';
    }
    return out;
  }
}
