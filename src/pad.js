// Pad virtuel scriptable (bits boutons). Pas de DualSense.

export class Pad {
  constructor() { this.frame = 0; this.script = null; }
  setScript(seq) { this.script = seq; this.frame = 0; }
  read() {
    let v;
    if (this.script && this.script.length) v = this.script[this.frame % this.script.length];
    else v = this.frame % 256; // compteur par defaut
    this.frame++;
    return v >>> 0;
  }
}
