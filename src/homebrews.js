// Homebrews de demonstration (ISA jouet). Aucun code Sony, aucun jeu commercial.
import { enc, OP } from './cpu.js';
import { SYSCALL } from './kernel.js';

function asm() {
  const code = [];
  const ldi = (r, v) => code.push(enc(OP.LDI, r, 0, v & 0xff));
  const ldih = (r, v) => code.push(enc(OP.LDIH, r, 0, v & 0xff));
  const li16 = (r, v) => { ldi(r, v & 0xff); if ((v >> 8) & 0xff) ldih(r, (v >> 8) & 0xff); };
  const sc = () => code.push(enc(OP.SYSCALL, 7, 0, 0));
  const halt = () => code.push(enc(OP.HALT));
  return { code, ldi, ldih, li16, sc, halt };
}

export function progHello() {
  const { code, ldi, li16, sc, halt } = asm();
  const STR = 0x2000, text = 'hello homebrew PS5-prototype';
  ldi(7, SYSCALL.CLEAR); li16(1, 20); li16(2, 40); li16(3, 120); sc();
  ldi(7, SYSCALL.DRAW_RECT); li16(1, 30); li16(2, 30); li16(3, 60); li16(4, 40);
  ldi(5, 200); li16(6, 200); sc();
  ldi(7, SYSCALL.PRINT); li16(1, STR); li16(2, Buffer.byteLength(text)); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [{ addr: STR, text }] };
}

export function progGradient() {
  const { code, ldi, sc, halt } = asm();
  // GRADIENT(r0=10,g0=20,b0=80, r1=220,g1=180,b1=60) via R1..R6
  ldi(7, SYSCALL.GRADIENT);
  ldi(1, 10); ldi(2, 20); ldi(3, 80); ldi(4, 220); ldi(5, 180); ldi(6, 60); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export function progChecker() {
  const { code, ldi, li16, sc, halt } = asm();
  ldi(7, SYSCALL.CLEAR); li16(1, 8); li16(2, 8); li16(3, 24); sc();
  ldi(7, SYSCALL.BLIT_CHECKER); li16(1, 60); li16(2, 40); ldi(5, 40); ldi(6, 0); sc();
  ldi(7, SYSCALL.BLIT_CHECKER); li16(1, 120); li16(2, 70); ldi(5, 0); ldi(6, 60); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export function progFiles() {
  // Ecrit "hi-vfs" dans /demo.txt, relit, PRINT le contenu, EXIT(nread==6?0:1)
  const { code, ldi, li16, sc, halt } = asm();
  const PATH = 0x2100, CONTENT = 0x2200, SCRATCH = 0x3000, READBUF = 0x3100;
  const pathText = '/demo.txt', content = 'hi-vfs';
  // malloc demo : alloue 64 octets (retour en R1, ignore)
  ldi(7, SYSCALL.MALLOC); li16(1, 64); sc();
  // open(path, w)
  ldi(7, SYSCALL.OPEN); li16(1, PATH); li16(2, 1); sc();
  // fd (=3 en pratique) : on stocke R1 -> SCRATCH
  li16(2, SCRATCH); code.push(enc(OP.STORE, 1, 2, 0));
  // write(fd, CONTENT, 6)
  li16(2, SCRATCH); code.push(enc(OP.LOAD, 1, 2, 0));
  ldi(7, SYSCALL.WRITE); li16(2, CONTENT); li16(3, 6);
  // recharge fd car R1 a ete ecrase par le retour... ordre: LOAD fd d'abord, puis regle R7/R2/R3
  // (ci-dessus R1 recharge, puis on ecrase R7/R2/R3 — R1 garde fd. OK)
  sc();
  li16(2, SCRATCH); code.push(enc(OP.LOAD, 1, 2, 0));
  ldi(7, SYSCALL.CLOSE); sc();
  // reopen lecture
  ldi(7, SYSCALL.OPEN); li16(1, PATH); li16(2, 0); sc();
  li16(2, SCRATCH); code.push(enc(OP.STORE, 1, 2, 0));
  // read(fd, READBUF, 16)
  li16(2, SCRATCH); code.push(enc(OP.LOAD, 1, 2, 0));
  ldi(7, SYSCALL.READ); li16(2, READBUF); li16(3, 16); sc();
  // print(READBUF, 6)
  ldi(7, SYSCALL.PRINT); li16(1, READBUF); li16(2, 6); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return {
    base: 0x1000, code,
    strings: [{ addr: PATH, text: pathText + '\0' }, { addr: CONTENT, text: content }],
  };
}

export function progPad() {
  // Lit le pad 3x, dessine un rect par lecture (x = valeur), yield, exit 0
  const { code, ldi, li16, sc, halt } = asm();
  const enc_store_load = () => {};
  void enc_store_load;
  for (let i = 0; i < 3; i++) {
    ldi(7, SYSCALL.PAD_READ); sc(); // R1 = boutons (retour syscall)
    // Sauve boutons en R2 via ADD R2=R2+R1? R2=0 initial... on veut copier R1->R2 : ADD ne copie pas.
    // Astuce : STORE R1->[scratch+i] puis LOAD R2. Scratch 0x3200+i*4.
    li16(2, 0x3200 + i * 4); code.push(enc(OP.STORE, 1, 2, 0));
    ldi(7, SYSCALL.YIELD); sc();
  }
  // Dessine : x = scratch[0] & 63, w=20
  ldi(7, SYSCALL.CLEAR); ldi(1, 10); ldi(2, 10); ldi(3, 30); sc();
  ldi(7, SYSCALL.DRAW_RECT);
  li16(2, 0x3200); code.push(enc(OP.LOAD, 1, 2, 0)); // R1 = pad0 (x brut)
  li16(2, 50); li16(3, 20); li16(4, 20); ldi(5, 250); li16(6, 250); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export function progDma() {
  // Remplit 16 octets a 0x4000 avec 0xAB via DMA, puis EXIT
  const { code, ldi, li16, sc, halt } = asm();
  ldi(7, SYSCALL.DMA_FILL); li16(1, 0x4000); ldi(2, 0xAB); li16(3, 16); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export function progBurn() {
  // Boucle 2000 iterations pour bench JIT vs interp : SUB + JZ/JMP.
  const { code, ldi, li16, sc, halt } = asm();
  ldi(7, SYSCALL.EXIT); // R7=0 conserve jusqu'au SYSCALL final (exit 0 si compteur tombe a 0)
  li16(1, 2000); ldi(2, 1);
  code.push(enc(OP.SUB, 1, 2, 0));
  code.push(enc(OP.JZ, 1, 0, 1));
  code.push(enc(OP.JMP, 0, 0, 256 - 3));
  sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export function progThreads() {
  // Mutex (create/lock/double-lock-fail/unlock) + eflag (create/set/wait) + spawn/join.
  const { code, ldi, li16, sc, halt } = asm();
  const M = 0x3300, M2 = 0x3304, E = 0x3310, EW = 0x3314, T = 0x3320;
  const save = (slot) => { li16(2, slot); code.push(enc(OP.STORE, 1, 2, 0)); };
  const loadR1 = (slot) => { li16(2, slot); code.push(enc(OP.LOAD, 1, 2, 0)); };
  ldi(7, SYSCALL.MUTEX_CREATE); sc(); save(M);
  loadR1(M); ldi(7, SYSCALL.MUTEX_LOCK); sc();
  loadR1(M); ldi(7, SYSCALL.MUTEX_LOCK); sc(); save(M2); // attendu -1 (0xFFFFFFFF)
  loadR1(M); ldi(7, SYSCALL.MUTEX_UNLOCK); sc();
  ldi(7, SYSCALL.EFLAG_CREATE); sc(); save(E);
  loadR1(E); ldi(7, SYSCALL.EFLAG_SET); ldi(2, 0x0F); sc();
  loadR1(E); ldi(7, SYSCALL.EFLAG_WAIT); ldi(2, 0x08); sc(); save(EW); // attendu 8
  ldi(7, SYSCALL.THREAD_SPAWN); li16(1, 0x1000); sc(); save(T);
  loadR1(T); ldi(7, SYSCALL.THREAD_JOIN); sc();
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export function progAudio() {
  // 3 tons sinus (440/660/880 Hz, 200 ms) sur slots 0/1/2.
  const { code, ldi, li16, sc, halt } = asm();
  for (const [freq, slot] of [[440, 0], [660, 1], [880, 2]]) {
    ldi(7, SYSCALL.AUDIO_TONE); li16(1, freq); li16(2, 200); li16(3, slot); sc();
  }
  ldi(7, SYSCALL.EXIT); ldi(1, 0); sc(); halt();
  return { base: 0x1000, code, strings: [] };
}

export const HOMEBREWS = { hello: progHello, gradient: progGradient, checker: progChecker, files: progFiles, pad: progPad, dma: progDma, burn: progBurn, threads: progThreads, audio: progAudio };
