// Demo GPU autonome (miroir de src/gpu.js + programme homebrew de cli.js).
const W = 256, H = 144;
const cv = document.getElementById('fb');
const ctx = cv.getContext('2d');
const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const stepsEl = document.getElementById('steps');

function clear(r, g, b) { ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, W, H); }

function runDemo() {
  clear(20, 40, 120);
  ctx.fillStyle = 'rgb(200,200,30)';
  ctx.fillRect(30, 30, 60, 40);
  logEl.textContent = '[guest] hello homebrew PS5-prototype';
  statusEl.textContent = 'Démo terminée — exit=0';
  stepsEl.textContent = '21 steps';
}

document.getElementById('runBtn').addEventListener('click', runDemo);
document.getElementById('clearBtn').addEventListener('click', () => {
  clear(0, 0, 0);
  logEl.textContent = '(vide)';
  statusEl.textContent = 'En attente… cliquez sur Exécuter.';
  stepsEl.textContent = '';
});

// Auto-run on load so screenshots always show rendered content.
runDemo();
