import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { vaultStatus, requireVault } from '../src/orbis/vault.js';
import { sniff, lleLoad } from '../src/orbis/self.js';
import { Emu64 } from '../src/x64/emu64.js';

const D = '/tmp/orbis-vault-test';

test('vault absent -> erreur propre ORBIS_NO_DUMP', () => {
  process.env.PS5_DUMP_DIR = '/tmp/orbis-vault-inexistant-xyz';
  const s = vaultStatus();
  assert.equal(s.ok, false);
  assert.throws(() => requireVault(), (e) => e.code === 'ORBIS_NO_DUMP');
  delete process.env.PS5_DUMP_DIR;
});

test('vault local -> noms+tailles uniquement, jamais de contenu', () => {
  rmSync(D, { recursive: true, force: true });
  mkdirSync(D, { recursive: true });
  writeFileSync(`${D}/inventaire.txt`, 'contenu-prive-xyz');
  process.env.PS5_DUMP_DIR = D;
  const s = vaultStatus();
  assert.equal(s.ok, true);
  assert.deepEqual(Object.keys(s.files[0]).sort(), ['name', 'size']);
  assert.ok(!JSON.stringify(s).includes('contenu-prive-xyz'));
  delete process.env.PS5_DUMP_DIR;
  rmSync(D, { recursive: true, force: true });
});

test('sniff refuse PUP et non-ELF, accepte ELF64', () => {
  writeFileSync('/tmp/orbis-faux.pup', Buffer.concat([Buffer.from('SCEUF'), Buffer.alloc(64)]));
  assert.equal(sniff('/tmp/orbis-faux.pup').kind, 'PUP');
  writeFileSync('/tmp/orbis-chiffre.bin', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  const u = sniff('/tmp/orbis-chiffre.bin');
  assert.equal(u.ok, false);
  assert.match(u.reason, /chiffré/);
  const elf = sniff(process.execPath); // vrai ELF64 du systeme (node lui-meme)
  assert.equal(elf.kind, 'ELF64');
  assert.equal(elf.machine, 62);
  // LLE d'un dynamique -> refuse propre (INTERP), pas de crash obscur
  assert.throws(() => lleLoad(new Emu64(), process.execPath), /dynamique/);
  rmSync('/tmp/orbis-faux.pup'); rmSync('/tmp/orbis-chiffre.bin');
});

test('lleLoad module statique perso -> mappe + tourne', { skip: !existsSync('/usr/bin/gcc') && 'gcc absent' }, () => {
  execFileSync('/usr/bin/gcc', ['-nostdlib', '-static', '-o', '/tmp/x64-hello', 'src/x64/asm/hello.S']);
  const emu = new Emu64();
  const r = lleLoad(emu, '/tmp/x64-hello');
  assert.equal(r.kind, 'ELF64');
  assert.ok(r.entry > 0 && r.phnum > 0);
  assert.equal(emu.run().exitCode, 0);
});
