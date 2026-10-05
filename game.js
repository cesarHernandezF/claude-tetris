'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins visuales: colores propios + función de dibujo de bloque ----
// índice 1–8 = I, O, T, S, Z, J, L, N (tuerca)
function pathRound(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#9fb8f0', '#ffb74d', '#b0bec5'],
    block(context, px, py, s, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, s - 2, s - 2);
      context.fillStyle = highlightColor;
      context.fillRect(px + 1, py + 1, s - 2, 4);
    },
  },
  neon: {
    name: 'Neón',
    colors: [null, '#00f0ff', '#fff200', '#d500f9', '#39ff14', '#ff1744', '#448aff', '#ff9100', '#e0e0e0'],
    block(context, px, py, s, color) {
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      const a = context.globalAlpha;
      context.globalAlpha = a * 0.35;
      context.fillRect(px + 2, py + 2, s - 4, s - 4);
      context.globalAlpha = a;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 2, py + 2, s - 4, s - 4);
    },
    hole(context, color) { context.shadowColor = color; context.shadowBlur = 12; },
  },
  pastel: {
    name: 'Pastel',
    colors: [null, '#a8e6ef', '#fff1b8', '#d9b8ec', '#b9e8c0', '#f5b7b7', '#bcd0f7', '#ffd6a5', '#d5dde2'],
    block(context, px, py, s, color) {
      pathRound(context, px + 1.5, py + 1.5, s - 3, s - 3, s * 0.28);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      context.lineWidth = 1.5;
      context.stroke();
      // brillo suave
      pathRound(context, px + s * 0.2, py + s * 0.18, s * 0.45, s * 0.14, s * 0.07);
      context.fillStyle = 'rgba(255, 255, 255, 0.55)';
      context.fill();
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [null, '#29b6f6', '#fbc02d', '#8e24aa', '#43a047', '#e53935', '#3949ab', '#fb8c00', '#78909c'],
    block(context, px, py, s, color) {
      const u = Math.floor(s / 6); // "píxel" del bloque
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, s - 2, s - 2);
      // luz arriba/izquierda, sombra abajo/derecha
      context.fillStyle = 'rgba(255, 255, 255, 0.45)';
      context.fillRect(px + 1, py + 1, s - 2, u);
      context.fillRect(px + 1, py + 1, u, s - 2);
      context.fillStyle = 'rgba(0, 0, 0, 0.35)';
      context.fillRect(px + 1, py + s - 1 - u, s - 2, u);
      context.fillRect(px + s - 1 - u, py + 1, u, s - 2);
      // textura de damero interior
      context.fillStyle = 'rgba(0, 0, 0, 0.18)';
      for (let i = 1; i < 5; i++)
        for (let j = 1; j < 5; j++)
          if ((i + j) % 2 === 0) context.fillRect(px + i * u + 1, py + j * u + 1, u, u);
    },
  },
};

let skinName = 'retro';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = 'dark', gridColor, highlightColor;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[skinName];
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.block(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.restore(); // limpia shadowBlur, alpha y estilos
}

// dibuja el agujero redondo de la tuerca en la celda central de la pieza
// (x, y = esquina superior izquierda de la pieza, en celdas)
function drawNutHole(context, x, y, size, alpha) {
  const skin = SKINS[skinName];
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = skin.colors[8];
  if (skin.hole) skin.hole(context, skin.colors[8]);
  context.lineWidth = 3;
  context.beginPath();
  context.arc((x + 1.5) * size, (y + 1.5) * size, size * 0.35, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === 8) drawNutHole(ctx, current.x, gy, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === 8) drawNutHole(ctx, current.x, current.y, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === 8) drawNutHole(nextCtx, offX, offY, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // no reprogramar el loop si el juego ya terminó
  animId = requestAnimationFrame(loop);
}

function applyTheme(t) {
  theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (e) { /* almacenamiento no disponible */ }
  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim();
  highlightColor = styles.getPropertyValue('--highlight').trim();
  themeToggle.setAttribute('aria-pressed', String(theme === 'light'));
  themeToggle.textContent = theme === 'light' ? '☀ Claro' : '🌙 Oscuro';
  // redibuja al instante (el loop está detenido en pausa / game over)
  if (board && current && next) { draw(); drawNext(); }
}

function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('theme') || 'dark'; } catch (e) { /* ignorar */ }
  applyTheme(saved);
}

function applySkin(name) {
  skinName = SKINS[name] ? name : 'retro';
  document.documentElement.dataset.skin = skinName;
  skinSelect.value = skinName;
  try { localStorage.setItem('skin', skinName); } catch (e) { /* almacenamiento no disponible */ }
  applyTheme(theme); // recachea --grid/--highlight (el skin puede sobrescribirlos) y redibuja
}

function initSkin() {
  for (const key of Object.keys(SKINS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = SKINS[key].name;
    skinSelect.appendChild(opt);
  }
  let saved = 'retro';
  try { saved = localStorage.getItem('skin') || 'retro'; } catch (e) { /* ignorar */ }
  applySkin(saved);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { applyTheme(theme === 'dark' ? 'light' : 'dark'); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'dark' ? 'light' : 'dark');
  themeToggle.blur(); // evita que Space accione el botón en vez de hardDrop()
});

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // devuelve las flechas / Space al juego
});
// si el select quedó con foco (menú cerrado sin cambiar), las teclas de juego no deben operarlo
skinSelect.addEventListener('keydown', e => {
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  }
});

initTheme();
initSkin();
init();
