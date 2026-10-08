#!/usr/bin/env node
// CLI : --list | --compat | --all | --bench | --demo | --run <nom> [--interp] [--ppm f.ppm] [--wav f.wav] [--stats] [--debug] [--steps N] | --x64 <elf> [--debug] | --orbis-status | --orbis-load <module>
import { readFileSync } from 'node:fs';
import { Emulator } from './src/emulator.js';
import { HOMEBREWS } from './src/homebrews.js';
import { buildDemoProgram } from './src/loader.js';

const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(n);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const has = (n) => args.includes(n);

function fbHash(emu) {
  let h = 2166136261;
  for (const b of emu.gpu.fb) { h ^= b; h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function runOnce(builder, jit) {
  const emu = new Emulator();
  emu.cpu.useJit = jit;
  emu.load(builder());
  const t0 = Date.now();
  const res = emu.run(has('--steps') ? Number(opt('--steps', '200000')) : 200000);
  const ms = Date.now() - t0;
  emu.gpu.flush(emu.memory);
  return { emu, res, ms };
}

if (has('--list')) { console.log(Object.keys(HOMEBREWS).join('\n')); process.exit(0); }
if (has('--compat')) {
  const c = JSON.parse(readFileSync('./compat.json', 'utf8'));
  for (const [k, v] of Object.entries(c)) console.log(`${k}\t${v.status}\t${v.desc}`);
  process.exit(0);
}
if (has('--all')) {
  // Matrice compat : chaque homebrew en JIT + interp, compare exit/logs/framebuffer.
  let fail = 0;
  for (const [name, builder] of Object.entries(HOMEBREWS)) {
    try {
      const j = runOnce(builder, true), i = runOnce(builder, false);
      const same = j.res.exitCode === i.res.exitCode
        && JSON.stringify(j.res.logs) === JSON.stringify(i.res.logs)
        && fbHash(j.emu) === fbHash(i.emu);
      console.log(`${same ? 'PASS' : 'FAIL'}\t${name}\texit=${j.res.exitCode}\tsteps=${j.res.steps}\tjitHits=${j.res.cpuStats.jitHits}`);
      if (!same || j.res.exitCode !== 0) fail++;
    } catch (e) { console.log(`FAIL\t${name}\t${e.message}`); fail++; }
  }
  process.exit(fail ? 1 : 0);
}
if (has('--bench')) {
  // Bench JIT vs interp sur burn (boucle 2000 it).
  const b = HOMEBREWS.burn;
  const j = runOnce(b, true), i = runOnce(b, false);
  const rate = (r, ms) => Math.round(r.res.steps / Math.max(1, ms) * 1000);
  console.log(`jit:   steps=${j.res.steps} ms=${j.ms} steps/s=${rate(j, j.ms)} blocks=${j.res.cpuStats.blocksCompiled} hits=${j.res.cpuStats.jitHits}`);
  console.log(`interp: steps=${i.res.steps} ms=${i.ms} steps/s=${rate(i, i.ms)}`);
  process.exit(0);
}
if (has('--orbis-status')) {
  // Vault local : dit ce qui est present (noms+tailles, jamais de contenu), sans rien exiger.
  const { vaultStatus } = await import('./src/orbis/vault.js');
  const s = vaultStatus();
  console.log(`vault dir=${s.dir} ok=${s.ok}${s.reason ? ` (${s.reason})` : ''}`);
  for (const f of s.files) console.log(`  ${f.name}\t${f.size} o`);
  process.exit(s.ok ? 0 : 2);
}
if (has('--orbis-load')) {
  // LLE local : mappe un module DECHIFFRE de TA console (chemin hors depot).
  // PUP et fichiers chiffres sont refuses proprement. Rien n'est copie ni commit.
  const { lleLoad } = await import('./src/orbis/self.js');
  const { Emu64 } = await import('./src/x64/emu64.js');
  try {
    const r = lleLoad(new Emu64(), opt('--orbis-load'));
    console.log(`[orbis] ELF64 mappe: entry=0x${r.entry.toString(16)} segments=${r.phnum} octets=${r.mappedBytes}`);
  } catch (e) { console.error(`[orbis] ${e.message}`); process.exit(3); }
  process.exit(0);
}
if (has('--x64')) {
  // Vrai ELF64 x86-64 statique (-nostdlib) : write/exit mappes. Ex: --x64 /tmp/x64-hello
  const { Emu64 } = await import('./src/x64/emu64.js');
  const emu = new Emu64();
  const entry = emu.load(opt('--x64'));
  const r = emu.run(has('--steps') ? Number(opt('--steps', '1000000')) : 1000000);
  process.stdout.write(r.out);
  console.log(`[x64] entry=0x${entry.toString(16)} exit=${r.exitCode} instrs=${r.instrs}`);
  if (has('--debug')) console.log(emu.cpu.dump());
  process.exit(0);
}

let prog, name = 'hello';
if (has('--demo')) prog = buildDemoProgram();
else if (has('--run')) { name = opt('--run'); prog = HOMEBREWS[name]?.(); }
else { console.log('Usage: node cli.js --demo | --run <nom> [--interp] [--ppm f.ppm] [--wav f.wav] [--stats] [--debug] | --x64 <elf> | --orbis-status | --orbis-load <module> | --list | --compat | --all | --bench'); process.exit(1); }
if (!prog) { console.error(`homebrew inconnu: ${name}`); process.exit(2); }

const emu = new Emulator();
if (has('--interp')) emu.cpu.useJit = false;
const entry = emu.load(prog);

if (has('--debug')) {
  console.log(`entry=0x${entry.toString(16)}`);
  console.log(emu.cpu.disasm(entry, Math.min(24, prog.code.length)).join('\n'));
}
const maxSteps = has('--steps') ? Number(opt('--steps', '200000')) : 200000;
const res = emu.run(maxSteps);
emu.gpu.submit('gfx', { op: 'present' });
emu.gpu.flush(emu.memory);

console.log(`[${name}] exit=${res.exitCode} steps=${res.steps} jitBlocks=${res.cpuStats.blocksCompiled} jitHits=${res.cpuStats.jitHits}`);
for (const l of res.logs) console.log(`[guest] ${l}`);
if (has('--stats')) console.log(JSON.stringify({ cpu: res.cpuStats, gpu: res.gpuStats, ticks: res.ticks, yields: res.yields }));
if (has('--debug')) console.log(emu.cpu.dumpRegs());
if (has('--ppm')) { emu.gpu.savePpm(opt('--ppm')); console.log(`ppm: ${opt('--ppm')}`); }
else console.log(emu.gpu.toAscii());
if (has('--wav')) { const n = emu.kernel.audio.saveWav(opt('--wav')); console.log(`wav: ${opt('--wav')} samples=${n}`); }
