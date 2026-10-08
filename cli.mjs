// CLI : node cli.mjs [demo.json] [--ppm sortie.ppm]
import { readFileSync, writeFileSync } from 'node:fs';
import { Emulator } from './src/emulator.js';

const file = process.argv[2] || 'firmware/demo_boot.json';
const ppmIdx = process.argv.indexOf('--ppm');
const ppmOut = ppmIdx >= 0 ? process.argv[ppmIdx + 1] : 'framebuffer.ppm';

const demo = JSON.parse(readFileSync(file, 'utf8'));
const emu = new Emulator({});
emu.boot(demo);
const res = emu.run(100000);
const snap = emu.snapshot();

console.log(snap.bootLog.join('\n'));
console.log(`[RUN] cycles=${res.cycles} exit=${res.exitCode} pc=${snap.pc}`);
console.log(`[STDOUT]\n${snap.stdout}`);
console.log(`[KLOG] ${snap.klog.join(' | ')}`);
console.log(`[REGS] ${snap.regs.map((v, i) => `R${i}=${v}`).join(' ')}`);
writeFileSync(ppmOut, emu.gpu.toPPM());
console.log(`[GPU] framebuffer -> ${ppmOut} (${emu.gpu.width}x${emu.gpu.height})`);
console.log('[GPU] apercu ASCII:');
console.log(emu.gpu.toAscii());
