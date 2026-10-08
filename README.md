# Ps5-emulator

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Remixed using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/l0rk59/Ps5-emulator)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/l0rk59/Ps5-emulator)

- 🎮 [Open the project](https://omgithub.com/l0rk59/Ps5-emulator).
- ✨ [Remix this project](https://omgithub.com/?remix=l0rk59%2FPs5-emulator).
- 💻 [Explore the source](https://github.com/l0rk59/Ps5-emulator).
- 🛠️ [Check build runs](https://github.com/l0rk59/Ps5-emulator/actions).
- 🐛 [Report an issue](https://github.com/l0rk59/Ps5-emulator/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/l0rk59).
- 🌍 [Create with OMGithub](https://omgithub.com).
- 🧬 [Explore the remix source](https://github.com/l0rk59/Ps5-emulator).
<!-- omgithub:readme:end -->

## Avertissement honnête

Ce projet **ne fait pas tourner le système complet de la PS5** et ne le pourra pas sans années de rétro-ingénierie + dumps légaux :

- PS5 = Zen 2 8 cœurs custom + RDNA 2 custom + I/O Kraken + sécurité matérielle, non documentés.
- Firmware Orbis, clés, jeux = chiffrés et propriétaires Sony. Non inclus, non contournés ici.
- Aucun émulateur PS5 actuel ne boote le système commercial de façon jouable.

Ce dépôt fournit un **socle éducatif bootable (homebrew uniquement)** pour comprendre ce qu'un vrai émulateur devrait faire.

## Ce qui est réellement implémenté et vérifié

```
src/memory.js    MMU simplifiée, 16 Mio plats, read/write U8/U32, fault explicite
src/cpu.js       CPU IR 8 registres, 12 opcodes, fetch/decode/execute, cycles
src/gpu.js       GPU logiciel 320x180, CLEAR/RECT, export PPM + ASCII
src/kernel.js    6 syscalls stubs : EXIT/PUTCHAR/WRITE_STRING/CLEAR/RECT/GET_TIME
src/loader.js    Chargeur JSON PS5-DEMO-1, refuse tout binaire Sony
src/emulator.js  Orchestrateur boot()->run()->snapshot()
firmware/demo_boot.json  Homebrew démo généré par tools/build_demo.mjs
cli.mjs          Boot terminal + dump framebuffer.ppm + aperçu ASCII
tests/run_tests.mjs  8 tests (node --test sans dépendance)
dist/index.html + dist/app.js  UI web : canvas + Boot/Step/Run/Reset
```

Preuve d'exécution :

```
node tests/run_tests.mjs   # 8 tests passes
node cli.mjs firmware/demo_boot.json --ppm framebuffer.ppm
# cycles=13 exit=0, stdout "HELLO PS5 - homebrew demo OK", GPU rect dessiné
node static-server.mjs dist  # http://localhost:3000
```

## Utilisation

```bash
npm test
npm start
npm run serve
# puis ouvrir http://localhost:3000
```

Régénérer la démo :

```bash
node tools/build_demo.mjs
```

## Roadmap vers un vrai émulateur (travail restant énorme)

1. CPU x86-64 : décodeur complet, paging 4K, rings 0/3, FPU/AVX2, JIT.
2. GPU RDNA 2 : command buffers AMD, shaders, RT, synchronisation CPU/GPU.
3. Mémoire : 16 Go GDDR6, bus unifié, IOMMU, cache cohérence.
4. Kernel Orbis : centaines de syscalls FreeBSD, threads, VFS, audio, pad, réseau.
5. Loader SELF chiffré : nécessite clés + dump légal de votre propre console.
6. I/O SSD/Kraken : décompression matérielle, timing 5,5 Go/s.
7. Conformité légale : aucun firmware/BIOS/jeu distribué.

## Légalité

Homebrew IR uniquement. N'ajoutez jamais de firmware Sony, clés, SDK ou jeux dumpés dans ce repo. PS5 est une marque de Sony Interactive Entertainment.
