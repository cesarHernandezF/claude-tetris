'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#9fb8f0', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

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
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const startScoresEl = document.getElementById('start-scores');
const startStatsEl = document.getElementById('start-stats');
const gameoverExtra = document.getElementById('gameover-extra');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const overlayScoresEl = document.getElementById('overlay-scores');
const overlayStatsEl = document.getElementById('overlay-stats');

const SCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';
const MAX_SCORES = 5;
const NAME_MAX = 12;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let theme = 'dark', gridColor, highlightColor;
let started = false, combo = 0, highscores = [], stats = { bestCombo: 0, maxLines: 0 };
let pendingScore = null; // puntuación de la partida actual pendiente de guardar

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
    combo++;
    stats.bestCombo = Math.max(stats.bestCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// dibuja el agujero redondo de la tuerca en la celda central de la pieza
// (x, y = esquina superior izquierda de la pieza, en celdas)
function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = COLORS[8];
  context.lineWidth = 3;
  context.beginPath();
  context.arc((x + 1.5) * size, (y + 1.5) * size, size * 0.35, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
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
  showGameOverScores();
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
  else if (!started) drawIdle();
}

function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('theme') || 'dark'; } catch (e) { /* ignorar */ }
  applyTheme(saved);
}

// ---- Records locales ----
function loadHighscores() {
  try {
    const data = JSON.parse(localStorage.getItem(SCORES_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(e => e && typeof e.score === 'number' && isFinite(e.score))
      .map(e => ({
        name: String(e.name ?? '').slice(0, NAME_MAX) || 'Jugador',
        score: e.score,
        lines: Number(e.lines) || 0,
        level: Number(e.level) || 1,
        date: String(e.date ?? ''),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch (e) { return []; /* JSON corrupto o almacenamiento no disponible */ }
}

function saveHighscores() {
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(highscores)); } catch (e) { /* almacenamiento no disponible */ }
}

function loadStats() {
  try {
    const d = JSON.parse(localStorage.getItem(STATS_KEY));
    return { bestCombo: Number(d && d.bestCombo) || 0, maxLines: Number(d && d.maxLines) || 0 };
  } catch (e) { return { bestCombo: 0, maxLines: 0 }; /* ignorar */ }
}

function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* almacenamiento no disponible */ }
}

function qualifies(s) {
  return s > 0 && (highscores.length < MAX_SCORES || s > highscores[highscores.length - 1].score);
}

// pinta la tabla en `el`; `highlight` es la entrada a resaltar (si hay)
function renderScores(el, highlight) {
  el.replaceChildren();
  const title = document.createElement('div');
  title.className = 'scores-title';
  title.textContent = 'MEJORES PUNTUACIONES';
  el.appendChild(title);
  if (!highscores.length) {
    const empty = document.createElement('div');
    empty.className = 'scores-empty';
    empty.textContent = 'Aún no hay records';
    el.appendChild(empty);
    return;
  }
  highscores.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'score-row' + (entry === highlight ? ' highlight' : '');
    row.title = `${entry.lines} líneas, nivel ${entry.level}`;
    for (const [cls, text] of [['pos', `${i + 1}.`], ['nm', entry.name], ['pts', entry.score.toLocaleString()]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      row.appendChild(span);
    }
    el.appendChild(row);
  });
}

function renderStats(el) {
  el.replaceChildren();
  for (const text of [`Mejor combo: ${stats.bestCombo}`, `Máx. líneas en una partida: ${stats.maxLines}`]) {
    const d = document.createElement('div');
    d.textContent = text;
    el.appendChild(d);
  }
}

function showStartScreen() {
  highscores = loadHighscores();
  stats = loadStats();
  renderScores(startScoresEl);
  renderStats(startStatsEl);
  startScreen.classList.remove('hidden');
  drawIdle();
}

function drawIdle() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

function showGameOverScores() {
  stats.maxLines = Math.max(stats.maxLines, lines);
  saveStats();
  pendingScore = qualifies(score) ? score : null;
  renderScores(overlayScoresEl);
  renderStats(overlayStatsEl);
  nameEntry.classList.toggle('hidden', pendingScore === null);
  gameoverExtra.classList.remove('hidden');
  if (pendingScore !== null) { nameInput.value = ''; nameInput.focus(); }
}

function submitScore() {
  if (pendingScore === null) return;
  const entry = {
    name: nameInput.value.trim().slice(0, NAME_MAX) || 'Jugador',
    score: pendingScore,
    lines,
    level,
    date: new Date().toISOString(),
  };
  pendingScore = null;
  highscores.push(entry);
  highscores.sort((a, b) => b.score - a.score);
  highscores = highscores.slice(0, MAX_SCORES);
  saveHighscores();
  nameEntry.classList.add('hidden');
  renderScores(overlayScoresEl, entry);
  restartBtn.focus();
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records?')) return;
  highscores = [];
  stats = { bestCombo: 0, maxLines: 0 };
  try { localStorage.removeItem(SCORES_KEY); localStorage.removeItem(STATS_KEY); } catch (e) { /* almacenamiento no disponible */ }
  renderScores(startScoresEl);
  renderStats(startStatsEl);
  resetScoresBtn.blur();
}

function init() {
  started = true;
  combo = 0;
  startScreen.classList.add('hidden');
  gameoverExtra.classList.add('hidden');
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

nameInput.addEventListener('keydown', e => e.stopPropagation()); // que P, T, Space... no actúen al escribir
nameEntry.addEventListener('submit', e => { e.preventDefault(); submitScore(); });
restartBtn.addEventListener('click', submitScore); // no perder el record si se reinicia sin pulsar Guardar (corre antes que init)
startBtn.addEventListener('click', () => { startBtn.blur(); init(); });
resetScoresBtn.addEventListener('click', resetRecords);

document.addEventListener('keydown', e => {
  if (!started) return; // pantalla de inicio: sin controles de juego
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

initTheme();
showStartScreen();
