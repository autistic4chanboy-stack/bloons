// Mini-jeux jouables : bornes d'arcade, consoles de démo, PocketBoy, machine à pinces.
// Chaque jeu = une « spec » { id, title, init(G), step(G), draw(G, g), ai?(G), drawTitle?(G, g) } exécutée par runGame :
// logique à pas fixe (60 Hz, accumulation de dt), écran titre « APPUYEZ SUR ENTRÉE », démo automatique quand
// personne ne joue (bornes en attente), record gardé en mémoire, fin de partie → ctx.emit('highscore', { game, score }).
import { drawText, drawTextS, textWidth } from './font.js';
import { rect, frame, circle, ellipse, poly, grad, rng, hash, clamp, makeCanvas, drawNoise } from './util.js';

export const GAMES = [
  { id: 'glouton', title: 'Glouton', desc: 'Labyrinthe, pastilles et trois fantômes qui alternent poursuite et dispersion. Une super-pastille, et ce sont eux qui fuient.', controls: 'Flèches / ZQSD : diriger', secret: 'Il paraît qu\'à 10 000 points la machine affiche un message…' },
  { id: 'invaders', title: 'Envahisseurs', desc: 'Repoussez les vagues d\'envahisseurs avant qu\'ils n\'atteignent le sol, à l\'abri de vos bunkers. Une soucoupe passe parfois.', controls: '← → / Q D : déplacer · Espace : tirer' },
  { id: 'pong', title: 'Pong', desc: 'Le tennis électronique : contre l\'ordinateur ou à deux sur le même clavier. Premier à 7 points.', controls: '1 joueur : ↑ ↓ ou Z S · 2 joueurs : Z S (gauche) et ↑ ↓ (droite)' },
  { id: 'breakout', title: 'Casse-Briques', desc: 'Renvoyez la balle avec la raquette et détruisez tous les murs de briques, niveau après niveau.', controls: '← → / Q D : raquette · Espace : lancer la balle' },
  { id: 'snake', title: 'Serpent', desc: 'Mangez les pommes, grandissez, attrapez les pièces d\'or… et ne vous mordez pas la queue.', controls: 'Flèches / ZQSD : diriger' },
  { id: 'blocs', title: 'Blocs', desc: 'Sept formes tombent, complétez des lignes pour les effacer. Tous les dix rangs, ça accélère.', controls: '← → : déplacer · ↑ : tourner · ↓ : descendre · Espace : chute directe' },
  { id: 'demineur', title: 'Démineur', desc: 'Découvrez toutes les cases sans faire sauter de mine. Chaque chiffre indique le nombre de mines voisines.', controls: 'Flèches : curseur · Espace / Entrée : découvrir · F : drapeau' },
  { id: 'oiseau', title: 'L\'Oiseau', desc: 'Battez des ailes pour passer entre les colonnes au-dessus de la ville endormie. Une seule erreur suffit.', controls: 'Espace / ↑ : battre des ailes' },
  { id: 'racer', title: 'Turbo Hélios', desc: 'Course contre la montre sur la route du littoral : doublez, franchissez les points de contrôle, restez sur la route.', controls: '← → : tourner · ↑ / Espace : accélérer · ↓ : freiner' },
  { id: 'platformer', title: 'Super Gardien', desc: 'Le gardien de nuit récupère les clés du centre et saute par-dessus les mannequins… qui n\'avancent que lorsqu\'on leur tourne le dos.', controls: '← → : courir · Espace / ↑ : sauter' },
  { id: 'simon', title: 'Simon', desc: 'Mémorisez la séquence de couleurs et répétez-la. Elle s\'allonge à chaque tour.', controls: 'Flèches ou touches 1 à 4' },
  { id: 'claw', title: 'Machine à pinces', desc: 'Placez la pince au-dessus d\'une peluche et tentez votre chance. Un jeton, un essai.', controls: '← → : déplacer la pince · Espace : descendre' },
];

const TICK = 1 / 60;
const W = 256, H = 192;
const BTN = {
  ArrowUp: 'up', KeyW: 'up', Numpad8: 'up', ArrowDown: 'down', KeyS: 'down', Numpad2: 'down',
  ArrowLeft: 'left', KeyA: 'left', Numpad4: 'left', ArrowRight: 'right', KeyD: 'right', Numpad6: 'right',
  Space: 'a', Enter: 'a', NumpadEnter: 'a', KeyF: 'b', KeyX: 'b',
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// ───────────────────────── Records (mémoire de session) ─────────────────────────
const HIGH = {};
const DEFAULT_HIGH = {
  glouton: [9870, 'KEV'], invaders: [5230, 'KEV'], pong: [1600, 'GÉR'], breakout: [3480, 'KEV'], snake: [420, 'JUL'],
  blocs: [16420, 'KEV'], demineur: [2380, 'GÉR'], oiseau: [31, 'KEV'], racer: [7350, 'KEV'], platformer: [5900, 'KEV'],
  simon: [13, 'LUC'], claw: [0, '---'],
};
export function highScore(id) {
  if (!HIGH[id]) { const d = DEFAULT_HIGH[id] || [0, '---']; HIGH[id] = { score: d[0], name: d[1] }; }
  return HIGH[id];
}

const pad = (n, l = 6) => String(Math.max(0, Math.floor(n))).padStart(l, '0');

// ───────────────────────── Sprites bitmap (mis en cache) ─────────────────────────
const SPR = new Map();
function sprite(key, rows, pal) {
  let c = SPR.get(key);
  if (c) return c;
  const h = rows.length, w = rows[0].length;
  c = makeCanvas(w, h);
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const col = pal[rows[y][x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
  SPR.set(key, c);
  return c;
}
function mirrored(key, src) {
  let c = SPR.get(key);
  if (c) return c;
  c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  SPR.set(key, c);
  return c;
}
function canvasOnce(key, w, h, fn) {
  let c = SPR.get(key);
  if (c) return c;
  c = makeCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g, w, h);
  SPR.set(key, c);
  return c;
}

// ───────────────────────── Moteur commun ─────────────────────────
function runGame(S, spec, opt = {}) {
  const hs = highScore(spec.id);
  const keymap = spec.keymap ? { ...BTN, ...spec.keymap } : BTN;
  const real = {}, aiHeld = {};
  let pq = new Set(), rq = new Set(), cq = new Set(), acc = 0, rec = false;
  const G = {
    S, spec, hs, mode: spec.noTitle ? 'play' : 'title', modeT: 0, tick: 0, score: 0, demo: false, option: 0,
    embedded: !!opt.embedded, held: real, keys: new Set(), pressed: new Set(), reps: new Set(), codes: new Set(),
    rnd: Math.random, noEmit: false, overText: null,
    hit(b) { return this.pressed.has(b); },
    rep(b) { return this.reps.has(b); },
    down(b) { return !!this.held[b]; },
    khit(code) { return this.codes.has(code); },
    press(b) { this.pressed.add(b); this.reps.add(b); },
  };
  function start(demo) {
    G.demo = demo; G.score = 0; G.mode = demo ? 'demo' : 'play'; G.modeT = 0; G.overText = null; G.noEmit = false;
    for (const k in aiHeld) aiHeld[k] = false;
    spec.init(G);
  }
  G.start = start;
  G.gameOver = (txt) => {
    if (G.mode === 'demo') { G.mode = 'title'; G.modeT = 0; return; }
    if (G.mode !== 'play') return;
    G.mode = 'over'; G.modeT = 0; G.overText = txt || null;
    rec = !G.noEmit && G.score > hs.score;
    if (rec) { hs.score = G.score; hs.name = 'VOUS'; }
    if (!G.noEmit && !spec.noScore) S.emit?.('highscore', { game: spec.id, score: G.score });
  };
  if (spec.noTitle) spec.init(G);

  function tick() {
    G.pressed = pq; G.reps = rq; G.codes = cq;
    pq = new Set(); rq = new Set(); cq = new Set();
    G.tick++; G.modeT++;
    switch (G.mode) {
      case 'title': {
        const o = spec.options;
        if (o && (G.reps.has('up') || G.reps.has('down') || G.reps.has('left') || G.reps.has('right'))) {
          const d = G.reps.has('down') || G.reps.has('right') ? 1 : -1;
          G.option = (G.option + d + o.length) % o.length;
        }
        if (G.pressed.has('a')) start(false);
        else if (spec.ai && !G.embedded && G.modeT > 540) start(true);
        break;
      }
      case 'demo': {
        if (G.pressed.has('any')) { G.mode = 'title'; G.modeT = 0; break; }
        G.held = aiHeld; G.pressed = new Set(); G.reps = new Set(); G.codes = new Set();
        spec.ai(G);
        spec.step(G);
        G.held = real;
        if (G.mode === 'demo' && G.modeT > 60 * 35) { G.mode = 'title'; G.modeT = 0; }
        break;
      }
      case 'play': spec.step(G); break;
      case 'over':
        if (G.modeT > 50 && G.pressed.has('a')) start(false);
        else if (G.modeT > 60 * 15) { G.mode = 'title'; G.modeT = 0; }
        break;
    }
  }

  function drawTitle() {
    const g = S.g;
    if (spec.drawTitle) spec.drawTitle(G, g); else rect(g, 0, 0, W, H, '#000');
    const tt = spec.title.toUpperCase();
    const sc = textWidth(tt, 3) <= W - 12 ? 3 : 2;
    drawTextS(g, tt, W / 2, 26, spec.color || '#ff0', sc, 'center', '#000');
    if (spec.options) spec.options.forEach((o, i) => drawTextS(g, (i === G.option ? '▶ ' : '  ') + o, W / 2 - 36, 100 + i * 12, i === G.option ? '#fff' : '#888'));
    if ((G.tick >> 5) % 2 === 0) drawTextS(g, 'APPUYEZ SUR ENTRÉE', W / 2, 134, '#fff', 1, 'center');
    drawTextS(g, 'RECORD ' + pad(hs.score, 5) + '  ' + hs.name, W / 2, 152, '#ff5', 1, 'center');
    drawTextS(g, G.embedded ? '← RETOUR ARRIÈRE : MENU' : '© 1987 HÉLIOS SOFT', W / 2, H - 13, '#999', 1, 'center');
  }
  function drawOver() {
    const g = S.g;
    rect(g, 26, 58, W - 52, 72, 'rgba(0,0,0,0.86)');
    frame(g, 26, 58, W - 52, 72, spec.color || '#ff0');
    const t = G.overText || 'PARTIE TERMINÉE';
    drawText(g, t, W / 2, 66, '#fff', textWidth(t, 2) <= W - 60 ? 2 : 1, 'center');
    if (!G.noEmit && !spec.noScore) drawText(g, 'SCORE ' + G.score, W / 2, 90, '#ff5', 1, 'center');
    if (rec && (G.tick >> 4) & 1) drawText(g, 'NOUVEAU RECORD !', W / 2, 102, '#f6f', 1, 'center');
    if (G.modeT > 50) drawText(g, 'ENTRÉE : REJOUER', W / 2, 116, '#aaa', 1, 'center');
  }
  function draw() {
    const g = S.g;
    if (G.mode === 'title') { drawTitle(); return; }
    spec.draw(G, g);
    if (G.mode === 'demo') {
      rect(g, 0, H - 13, W, 13, 'rgba(0,0,0,0.65)');
      if ((G.tick >> 5) & 1) drawText(g, 'DÉMO — APPUYEZ SUR ENTRÉE', W / 2, H - 10, '#ff0', 1, 'center');
      else drawText(g, 'RECORD ' + hs.score + ' ' + hs.name, W / 2, H - 10, '#fff', 1, 'center');
    } else if (G.mode === 'over') drawOver();
  }

  return {
    title: spec.title, wantsInput: true, game: G,
    update() {
      acc += S.dt;
      let n = 0;
      while (acc >= TICK && n < 16) { tick(); acc -= TICK; n++; }
      if (n >= 16) acc = 0;
      draw();
    },
    key(code, down) {
      const b = keymap[code];
      if (down) {
        const repeat = G.keys.has(code);
        G.keys.add(code);
        if (!repeat) { pq.add('any'); cq.add(code); }
        if (b) { if (!repeat) pq.add(b); rq.add(b); real[b] = true; }
      } else {
        G.keys.delete(code);
        if (b) { let still = false; for (const k of G.keys) if (keymap[k] === b) still = true; real[b] = still; }
      }
    },
  };
}

function stars(g, t, n = 40, col = '#fff', seed = 1) {
  g.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = (hash(i * 7 + seed) * W + t * (0.2 + hash(i + seed) * 0.6)) % W;
    const y = hash(i * 13 + seed * 3) * H;
    if (hash(i * 31 + ((t / 20) | 0)) > 0.15) g.fillRect(x | 0, y | 0, 1, 1);
  }
}
function hud2(g, left, right, col = '#fff') {
  drawText(g, left, 4, 3, col);
  drawText(g, right, W - 4, 3, col, 1, 'right');
}

// ═════════════════════════ GLOUTON ═════════════════════════
const GL_MAP = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  'XXXXX#.##          ##.#XXXXX',
  '######.## ###--### ##.######',
  'TTTTTT.   #HHHHHH#   .TTTTTT',
  '######.## ######## ##.######',
  'XXXXX#.##          ##.#XXXXX',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];
const GL_OX = 16, GL_OY = 16;
const glpx = (c) => GL_OX + c * 8 + 4, glpy = (r) => GL_OY + r * 8 + 4;
const glWrap = (x) => ((x % 28) + 28) % 28;
const GL_DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
const GL_MODES = [[420, 'scatter'], [1200, 'chase'], [420, 'scatter'], [1200, 'chase'], [300, 'scatter'], [1200, 'chase'], [300, 'scatter'], [1e9, 'chase']];
const GL_FRUITS = [['cerise', 100], ['fraise', 300], ['orange', 500], ['orange', 500], ['pomme', 700], ['pomme', 700], ['raisin', 1000], ['raisin', 1000], ['cloche', 3000], ['cloche', 3000], ['clé', 5000]];
const GHOST_BODY = ['.....####.....', '...########...', '..##########..', '.############.', '.############.', '.############.', '##############', '##############', '##############', '##############', '##############', '##############'];
const GHOST_SK = [['##.###..###.##', '#...##..##...#'], ['####.####.####', '.##...##...##.']];
const glGhostSpr = (col, f) => sprite('gh' + col + f, GHOST_BODY.concat(GHOST_SK[f]), { '#': col });

function glMaze(col) {
  return canvasOnce('glmaze' + col, 224, 176, (g) => {
    const wall = (x, y) => { if (y < 0 || y >= 22 || x < 0 || x >= 28) return true; const ch = GL_MAP[y][x]; return ch === '#' || ch === 'X'; };
    for (let y = 0; y < 22; y++) for (let x = 0; x < 28; x++) {
      const ch = GL_MAP[y][x];
      if (ch === '#') {
        g.fillStyle = col === '#fff' ? '#557' : '#14145a'; g.fillRect(x * 8, y * 8, 8, 8);
        g.fillStyle = col;
        if (!wall(x, y - 1)) g.fillRect(x * 8, y * 8, 8, 1);
        if (!wall(x, y + 1)) g.fillRect(x * 8, y * 8 + 7, 8, 1);
        if (!wall(x - 1, y)) g.fillRect(x * 8, y * 8, 1, 8);
        if (!wall(x + 1, y)) g.fillRect(x * 8 + 7, y * 8, 1, 8);
      } else if (ch === '-') { g.fillStyle = '#fbd'; g.fillRect(x * 8, y * 8 + 3, 8, 2); }
    }
  });
}
function glOpen(G, tx, ty, ghost) {
  if (ty < 0 || ty >= 22) return false;
  const c = G.grid[ty][glWrap(tx)];
  if (c === '#' || c === 'X') return false;
  if (c === '-' || c === 'H') return !!ghost;
  return true;
}
function glInit(G) { G.level = 1; G.lives = 3; G.secretShown = false; G.secretT = -1; G.fruitLog = []; glLevel(G); }
function glLevel(G) {
  G.grid = GL_MAP.map((r) => r.split(''));
  G.pellets = 0;
  for (const r of G.grid) for (const c of r) if (c === '.' || c === 'o') G.pellets++;
  G.eaten = 0; G.fruit = null; G.clearT = 0;
  G.fruitLog.push(GL_FRUITS[Math.min(G.level - 1, GL_FRUITS.length - 1)][0]);
  if (G.fruitLog.length > 7) G.fruitLog.shift();
  glReset(G);
}
function glReset(G) {
  G.pac = { tx: 13, ty: 16, dx: -1, dy: 0, o: 0, want: null, moving: false, mouth: 0 };
  G.ghosts = [
    { kind: 0, c: '#f22', st: 'active', tx: 13, ty: 8, dx: -1, dy: 0, o: 0, fr: 0, corner: [26, -3], x: glpx(13), y: glpy(8) },
    { kind: 1, c: '#fae', st: 'house', x: glpx(13.5), y: glpy(10), rel: 60, fr: 0, corner: [1, -3], bob: 0 },
    { kind: 2, c: '#3ef', st: 'house', x: glpx(11.75), y: glpy(10), rel: 420, dots: 30, fr: 0, corner: [0, 23], bob: 1.5 },
  ];
  G.gmodeIdx = 0; G.gmodeT = 0; G.ready = 120; G.dying = 0; G.freeze = 0; G.popup = null; G.chain = 0; G.aiKey = null;
}
const glPacX = (G) => glpx(G.pac.tx) + G.pac.dx * G.pac.o;
const glPacY = (G) => glpy(G.pac.ty) + G.pac.dy * G.pac.o;

function glMovePac(G, sp) {
  const p = G.pac, w = p.want;
  if (w && p.o > 0 && w[0] === -p.dx && w[1] === -p.dy) { p.tx = glWrap(p.tx + p.dx); p.ty += p.dy; p.o = 8 - p.o; p.dx = w[0]; p.dy = w[1]; }
  if (p.o === 0) {
    if (w && glOpen(G, p.tx + w[0], p.ty + w[1])) { p.dx = w[0]; p.dy = w[1]; }
    if (!glOpen(G, p.tx + p.dx, p.ty + p.dy)) { p.moving = false; return; }
  }
  p.moving = true; p.o += sp;
  while (p.o >= 8) {
    p.o -= 8; p.tx = glWrap(p.tx + p.dx); p.ty += p.dy;
    if (w && (w[0] !== p.dx || w[1] !== p.dy) && glOpen(G, p.tx + w[0], p.ty + w[1])) { p.dx = w[0]; p.dy = w[1]; }
    if (!glOpen(G, p.tx + p.dx, p.ty + p.dy)) { p.o = 0; p.moving = false; break; }
  }
  if (p.moving) p.mouth += 0.28;
}
function glEat(G) {
  const p = G.pac;
  const tx = p.o < 4 ? p.tx : glWrap(p.tx + p.dx), ty = p.o < 4 ? p.ty : p.ty + p.dy;
  if (ty >= 0 && ty < 22) {
    const c = G.grid[ty][tx];
    if (c === '.' || c === 'o') {
      G.grid[ty][tx] = ' '; G.pellets--; G.eaten++; G.score += c === 'o' ? 50 : 10;
      for (const gh of G.ghosts) if (gh.st === 'house' && gh.dots) gh.dots--;
      if (G.eaten === 70 || G.eaten === 170) { const f = GL_FRUITS[Math.min(G.level - 1, GL_FRUITS.length - 1)]; G.fruit = { x: glpx(13.5), y: glpy(12), k: f[0], pts: f[1], t: 570 }; }
      if (c === 'o') glFright(G);
    }
  }
  if (G.fruit && Math.abs(glPacX(G) - G.fruit.x) < 7 && Math.abs(glPacY(G) - G.fruit.y) < 7) {
    G.score += G.fruit.pts; G.popup = { x: G.fruit.x, y: G.fruit.y, txt: String(G.fruit.pts), t: 90 }; G.fruit = null;
  }
}
function glFright(G) {
  const dur = Math.max(60, 420 - (G.level - 1) * 60);
  G.chain = 0;
  for (const gh of G.ghosts) {
    if (gh.st === 'eyes' || gh.st === 'entering') continue;
    gh.fr = dur;
    if (gh.st === 'active') gh.rev = true;
  }
}
function glTarget(G, gh) {
  if (GL_MODES[G.gmodeIdx][1] === 'scatter') return gh.corner;
  const p = G.pac;
  if (gh.kind === 0) return [p.tx, p.ty];
  if (gh.kind === 1) return [p.tx + p.dx * 4, p.ty + p.dy * 4];
  return (gh.tx - p.tx) ** 2 + (gh.ty - p.ty) ** 2 > 64 ? [p.tx, p.ty] : gh.corner;
}
function glChoose(G, gh) {
  const tgt = gh.st === 'eyes' ? [13, 8] : gh.fr > 0 ? null : glTarget(G, gh);
  let best = null, bd = Infinity, n = 0;
  const open = glChoose.open || (glChoose.open = []);
  for (const d of GL_DIRS) {
    if (d[0] === -gh.dx && d[1] === -gh.dy) continue;
    if (!glOpen(G, gh.tx + d[0], gh.ty + d[1], false)) continue;
    open[n++] = d;
    if (tgt) { const dd = (gh.tx + d[0] - tgt[0]) ** 2 + (gh.ty + d[1] - tgt[1]) ** 2; if (dd < bd) { bd = dd; best = d; } }
  }
  if (!tgt && n) best = open[(G.rnd() * n) | 0];
  if (!best) best = [-gh.dx, -gh.dy];
  gh.dx = best[0]; gh.dy = best[1];
}
function glReverse(G, gh) {
  if (gh.o > 0) { gh.tx = glWrap(gh.tx + gh.dx); gh.ty += gh.dy; gh.o = 8 - gh.o; gh.dx = -gh.dx; gh.dy = -gh.dy; }
  else { gh.dx = -gh.dx; gh.dy = -gh.dy; if (!glOpen(G, gh.tx + gh.dx, gh.ty + gh.dy)) glChoose(G, gh); }
}
function glGhostStep(G, gh, base) {
  if (gh.fr > 0) gh.fr--;
  switch (gh.st) {
    case 'house':
      gh.rel--; gh.bob += 0.12; gh.y = glpy(10) + Math.sin(gh.bob) * 2;
      if (gh.rel <= 0 || (gh.dots !== undefined && gh.dots <= 0)) gh.st = 'leaving';
      break;
    case 'leaving': {
      const tx = glpx(13);
      if (Math.abs(gh.x - tx) > 0.6) gh.x += Math.sign(tx - gh.x) * 0.6;
      else {
        gh.x = tx;
        if (gh.y > glpy(8)) gh.y = Math.max(glpy(8), gh.y - 0.6);
        else { gh.st = 'active'; gh.tx = 13; gh.ty = 8; gh.o = 0; gh.dx = -1; gh.dy = 0; }
      }
      break;
    }
    case 'entering':
      if (gh.y < glpy(10)) gh.y = Math.min(glpy(10), gh.y + 1.5);
      else { gh.st = 'house'; gh.rel = 30; gh.dots = undefined; gh.fr = 0; }
      break;
    default: {
      if (gh.rev) { gh.rev = false; glReverse(G, gh); }
      const cell = G.grid[gh.ty] ? G.grid[gh.ty][gh.tx] : ' ';
      const sp = gh.st === 'eyes' ? 2 : gh.fr > 0 ? 0.55 : cell === 'T' ? 0.5 : base;
      gh.o += sp;
      while (gh.o >= 8) {
        gh.o -= 8; gh.tx = glWrap(gh.tx + gh.dx); gh.ty += gh.dy;
        if (gh.st === 'eyes' && gh.tx === 13 && gh.ty === 8) { gh.st = 'entering'; gh.x = glpx(13); gh.y = glpy(8); gh.o = 0; return; }
        glChoose(G, gh);
      }
      gh.x = glpx(gh.tx) + gh.dx * gh.o; gh.y = glpy(gh.ty) + gh.dy * gh.o;
    }
  }
}
function glCollide(G) {
  const x = glPacX(G), y = glPacY(G);
  for (const gh of G.ghosts) {
    if (gh.st === 'eyes' || gh.st === 'entering') continue;
    if (Math.abs(gh.x - x) >= 6 || Math.abs(gh.y - y) >= 6) continue;
    if (gh.fr > 0) {
      if (gh.st !== 'active') continue;
      G.chain++;
      const pts = 200 * (1 << Math.min(3, G.chain - 1));
      G.score += pts; gh.st = 'eyes'; gh.fr = 0; G.freeze = 40; G.popup = { x: gh.x, y: gh.y, txt: String(pts), t: 40 };
    } else if (gh.st === 'active' || gh.st === 'leaving') { G.dying = 110; return; }
  }
}
function glStep(G) {
  if (G.secretT >= 0) { if (++G.secretT > 500) G.secretT = -1; return; }
  if (G.popup && --G.popup.t <= 0) G.popup = null;
  if (G.ready > 0) { G.ready--; return; }
  if (G.freeze > 0) { G.freeze--; return; }
  if (G.clearT > 0) { if (--G.clearT === 0) { G.level++; glLevel(G); } return; }
  if (G.dying > 0) { if (--G.dying === 0) { G.lives--; if (G.lives <= 0) G.gameOver(); else glReset(G); } return; }
  if (!G.demo) for (const d in DIRS) if (G.hit(d)) G.pac.want = DIRS[d];
  const fright = G.ghosts.some((g) => g.fr > 0);
  if (!fright) {
    if (++G.gmodeT >= GL_MODES[G.gmodeIdx][0]) {
      G.gmodeIdx = Math.min(GL_MODES.length - 1, G.gmodeIdx + 1); G.gmodeT = 0;
      for (const gh of G.ghosts) if (gh.st === 'active') gh.rev = true;
    }
  }
  const lv = Math.min(G.level, 6) - 1;
  glMovePac(G, [1.0, 1.06, 1.1, 1.14, 1.18, 1.2][lv] * (fright ? 1.08 : 1));
  glEat(G);
  const gs = [0.9, 0.98, 1.04, 1.08, 1.12, 1.15][lv];
  for (const gh of G.ghosts) glGhostStep(G, gh, gs);
  glCollide(G);
  if (G.fruit && --G.fruit.t <= 0) G.fruit = null;
  if (!G.demo && !G.secretShown && G.score >= 10000) {
    G.secretShown = true; G.secretT = 0;
    G.S.emit?.('highscore', { game: 'glouton', score: G.score });
  }
  if (G.pellets <= 0 && !G.dying) G.clearT = 150;
}
function glPacDraw(g, x, y, dx, dy, m, r = 6) {
  const a = dx || dy ? Math.atan2(dy, dx) : 0;
  g.fillStyle = '#ff0'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a + m, a + Math.PI * 2 - m); g.closePath(); g.fill();
}
function glFruitDraw(g, k, x, y) {
  if (k === 'cerise') { line2(g, x, y - 5, x - 3, y + 1, '#7b4'); line2(g, x, y - 5, x + 3, y + 2, '#7b4'); circle(g, x - 3, y + 2, 2.5, '#e22'); circle(g, x + 3, y + 3, 2.5, '#e22'); }
  else if (k === 'fraise') { poly(g, [x - 4, y - 2, x + 4, y - 2, x, y + 5], '#e22'); rect(g, x - 3, y - 4, 6, 2, '#4b4'); rect(g, x - 1, y, 1, 1, '#fd8'); rect(g, x + 1, y + 2, 1, 1, '#fd8'); }
  else if (k === 'orange') { circle(g, x, y + 1, 4, '#f92'); rect(g, x, y - 5, 2, 2, '#4b4'); }
  else if (k === 'pomme') { circle(g, x, y + 1, 4, '#d22'); rect(g, x, y - 5, 1, 3, '#741'); rect(g, x + 1, y - 5, 2, 1, '#4b4'); }
  else if (k === 'raisin') { for (let i = 0; i < 6; i++) circle(g, x - 2 + (i % 3) * 2, y - 2 + ((i / 3) | 0) * 3 + (i % 3 === 1 ? 1 : 0), 1.6, '#a4e'); }
  else if (k === 'cloche') { poly(g, [x - 4, y + 3, x - 3, y - 2, x, y - 5, x + 3, y - 2, x + 4, y + 3], '#fd3'); rect(g, x - 1, y + 3, 2, 2, '#fff'); }
  else { circle(g, x, y - 3, 3, '#fd3'); circle(g, x, y - 3, 1.2, '#000'); rect(g, x - 1, y, 2, 6, '#fd3'); rect(g, x + 1, y + 3, 2, 1, '#fd3'); rect(g, x + 1, y + 5, 2, 1, '#fd3'); }
}
function line2(g, x1, y1, x2, y2, c) { g.strokeStyle = c; g.lineWidth = 1; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function glEyes(g, x, y, dx, dy) {
  g.fillStyle = '#fff'; g.fillRect(x + 2 + dx, y + 3 + dy, 4, 5); g.fillRect(x + 8 + dx, y + 3 + dy, 4, 5);
  g.fillStyle = '#22f'; g.fillRect(x + 3 + dx * 2, y + 5 + dy * 2, 2, 2); g.fillRect(x + 9 + dx * 2, y + 5 + dy * 2, 2, 2);
}
function glGhostDraw(G, g, gh) {
  const x = Math.round(gh.x) - 7, y = Math.round(gh.y) - 7, f = (G.tick >> 3) & 1;
  if (gh.st === 'eyes' || gh.st === 'entering') { glEyes(g, x, y, gh.st === 'eyes' ? gh.dx : 0, gh.st === 'eyes' ? gh.dy : 1); return; }
  if (gh.fr > 0) {
    const fl = gh.fr < 120 && (gh.fr >> 3) & 1;
    g.drawImage(glGhostSpr(fl ? '#eee' : '#23d', f), x, y);
    g.fillStyle = fl ? '#f22' : '#fcb';
    g.fillRect(x + 4, y + 5, 2, 2); g.fillRect(x + 8, y + 5, 2, 2);
    for (let i = 0; i < 5; i++) g.fillRect(x + 2 + i * 2, y + 9 + (i & 1), 2, 1);
    return;
  }
  g.drawImage(glGhostSpr(gh.c, f), x, y);
  glEyes(g, x, y, gh.st === 'active' ? gh.dx : 0, gh.st === 'active' ? gh.dy : gh.st === 'leaving' ? -1 : 0);
}
function glSecret(G, g) {
  const t = G.secretT;
  rect(g, 0, 0, W, H, '#000');
  if (t < 60) { drawNoise(g, W, H, t * 0.37, 0.35 + 0.6 * hash(t)); return; }
  const lines = ['BRAVO.', 'ELLE EST EN BAS.', 'B-13.'];
  let n = Math.floor((t - 60) / 5);
  lines.forEach((l, i) => {
    const s = l.slice(0, Math.max(0, n)); n -= l.length + 5;
    if (!s) return;
    const x0 = W / 2 - Math.floor((textWidth(l, 2) - 2) / 2) + (hash(t * 3 + i) < 0.04 ? 2 : 0);
    drawText(g, s, x0, 56 + i * 30, i === 2 ? '#f22' : '#ddd', 2);
  });
  if (t > 420) drawNoise(g, W, H, t, Math.min(1, (t - 420) / 80));
}
const GL_BFS = { prev: new Int16Array(616), q: new Int16Array(616), danger: new Uint8Array(616) };
function glAI(G) {
  const p = G.pac;
  const sx = p.o === 0 ? p.tx : glWrap(p.tx + p.dx), sy = p.o === 0 ? p.ty : p.ty + p.dy;
  const key = sx + sy * 28;
  if (key === G.aiKey && G.tick % 20) return;
  G.aiKey = key;
  const { prev, q, danger } = GL_BFS;
  prev.fill(-1); danger.fill(0);
  for (const gh of G.ghosts) {
    if ((gh.st !== 'active' && gh.st !== 'leaving') || gh.fr > 0) continue;
    const gx = Math.round((gh.x - GL_OX - 4) / 8), gy = Math.round((gh.y - GL_OY - 4) / 8);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > 2) continue;
      const yy = gy + dy; if (yy < 0 || yy >= 22) continue;
      danger[yy * 28 + glWrap(gx + dx)] = 1;
    }
  }
  const s = sy * 28 + sx;
  let h = 0, t = 0, found = -1;
  prev[s] = s; q[t++] = s;
  while (h < t) {
    const c = q[h++], cx = c % 28, cy = (c / 28) | 0;
    const ch = G.grid[cy][cx];
    if (c !== s && (ch === '.' || ch === 'o')) { found = c; break; }
    for (const d of GL_DIRS) {
      const nx = glWrap(cx + d[0]), ny = cy + d[1];
      if (!glOpen(G, nx, ny)) continue;
      const nn = ny * 28 + nx;
      if (prev[nn] !== -1 || danger[nn]) continue;
      prev[nn] = c; q[t++] = nn;
    }
  }
  if (found < 0) {
    const opts = GL_DIRS.filter((d) => glOpen(G, sx + d[0], sy + d[1]));
    if (opts.length) p.want = opts[(G.rnd() * opts.length) | 0];
    return;
  }
  let c = found;
  while (prev[c] !== s) c = prev[c];
  let dx = (c % 28) - sx;
  const dy = ((c / 28) | 0) - sy;
  if (dx > 1) dx = -1; else if (dx < -1) dx = 1;
  p.want = [dx, dy];
}
const glouton = {
  id: 'glouton', title: 'Glouton', color: '#ff0', init: glInit, step: glStep, ai: glAI,
  draw(G, g) {
    if (G.secretT >= 0) { glSecret(G, g); return; }
    rect(g, 0, 0, W, H, '#000');
    const flash = G.clearT > 0 && G.clearT < 110 && ((G.clearT / 12) | 0) % 2 === 0;
    g.drawImage(glMaze(flash ? '#fff' : '#5a7aff'), GL_OX, GL_OY);
    g.fillStyle = '#fcb';
    const blink = (G.tick >> 3) & 1 || G.ready > 0;
    for (let y = 0; y < 22; y++) {
      const row = G.grid[y];
      for (let x = 0; x < 28; x++) {
        const c = row[x];
        if (c === '.') g.fillRect(GL_OX + x * 8 + 3, GL_OY + y * 8 + 3, 2, 2);
        else if (c === 'o' && blink) { g.fillRect(GL_OX + x * 8 + 1, GL_OY + y * 8 + 2, 6, 4); g.fillRect(GL_OX + x * 8 + 2, GL_OY + y * 8 + 1, 4, 6); }
      }
    }
    if (G.fruit) glFruitDraw(g, G.fruit.k, G.fruit.x, G.fruit.y);
    g.save(); g.beginPath(); g.rect(GL_OX, GL_OY, 224, 176); g.clip();
    if (!(G.dying > 0 && G.dying < 80) && G.clearT === 0) for (const gh of G.ghosts) glGhostDraw(G, g, gh);
    const px = glPacX(G), py = glPacY(G), p = G.pac;
    if (G.dying > 0 && G.dying < 80) { const k = 1 - Math.max(0, G.dying - 15) / 65; if (G.dying > 15) glPacDraw(g, px, py, 0, -1, Math.min(Math.PI, 0.2 + k * Math.PI)); }
    else if (!(G.freeze > 0 && G.popup)) {
      const m = p.moving ? Math.abs(Math.sin(p.mouth)) * 0.8 : 0.35;
      glPacDraw(g, px, py, p.dx, p.dy, m);
      if (p.ty === 10) { glPacDraw(g, px + 224, py, p.dx, p.dy, m); glPacDraw(g, px - 224, py, p.dx, p.dy, m); }
    }
    g.restore();
    if (G.popup) drawTextS(g, G.popup.txt, G.popup.x, G.popup.y - 3, '#3ff', 1, 'center');
    hud2(g, 'SCORE ' + G.score, 'RECORD ' + Math.max(G.hs.score, G.score));
    drawText(g, 'NIV ' + G.level, W / 2, 3, '#aaa', 1, 'center');
    for (let i = 0; i < G.lives - 1; i++) glPacDraw(g, 8, 182 - i * 13, -1, 0, 0.6, 5);
    G.fruitLog.forEach((k, i) => glFruitDraw(g, k, 248, 182 - i * 13));
    if (G.ready > 0) drawText(g, 'PRÊT !', GL_OX + 112, GL_OY + 12 * 8 + 1, '#ff0', 1, 'center');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#000');
    const x = ((G.tick * 1.1) % 420) - 60, y = 80;
    g.fillStyle = '#fcb';
    for (let i = 0; i < 24; i++) { const xx = 12 + i * 10; if (xx > x) g.fillRect(xx, y - 1, 2, 2); }
    glPacDraw(g, x, y, 1, 0, Math.abs(Math.sin(G.tick * 0.25)) * 0.8, 7);
    ['#f22', '#fae', '#3ef'].forEach((c, i) => { const gx = x - 26 - i * 17; g.drawImage(glGhostSpr(c, (G.tick >> 3) & 1), (gx | 0) - 7, y - 7); glEyes(g, (gx | 0) - 7, y - 7, 1, 0); });
    drawText(g, '. 10 PTS    ● 50 PTS', W / 2, 104, '#fcb', 1, 'center');
  },
};

// ═════════════════════════ ENVAHISSEURS ═════════════════════════
const INV_SPR = [
  [['...##...', '..####..', '.######.', '##.##.##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'], ['...##...', '..####..', '.######.', '##.##.##', '########', '.#.##.#.', '#......#', '.#....#.']],
  [['..#.....#..', '...#...#...', '..#######..', '.##.###.##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'], ['..#.....#..', '#..#...#..#', '#.#######.#', '###.###.###', '###########', '.#########.', '..#.....#..', '.#.......#.']],
  [['....####....', '.##########.', '############', '###..##..###', '############', '...##..##...', '..##.##.##..', '##........##'], ['....####....', '.##########.', '############', '###..##..###', '############', '..###..###..', '.##..##..##.', '..##....##..']],
];
const INV_COL = ['#f6f', '#5ff', '#6f6'];
const INV_PTS = [30, 20, 10];
const INV_SHIP = ['......#......', '.....###.....', '.....###.....', '.###########.', '#############', '#############', '#############', '#############'];
const INV_UFO = ['.....######.....', '...##########...', '..############..', '.##.##.##.##.##.', '################', '..###..##..###..', '...#........#...'];
const INV_BOOM = ['....#...#....', '.#...#.#...#.', '..#.......#..', '...#.....#...', '##.........##', '...#.....#...', '..#..#.#..#..', '.#..#...#..#.'];
const INV_SHIELD = ['...######...', '..########..', '.##########.', '############', '############', '############', '####....####', '###......###'];
function invWave(G) {
  G.al = [];
  const top = 34 + Math.min(G.level - 1, 5) * 6;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) {
    const type = r === 0 ? 0 : r < 3 ? 1 : 2, w = [8, 11, 12][type];
    G.al.push({ x: 30 + c * 18, y: top + r * 14, type, w, off: (12 - w) >> 1, alive: true });
  }
  G.dir = 1; G.stepT = 0; G.frame = 0; G.shot = null; G.bombs = []; G.bombT = 90; G.ufo = null; G.ufoT = 1100; G.waveT = 0; G.booms = [];
  G.shields = [0, 1, 2, 3].map((i) => ({ x: 34 + i * 56, y: 146, cells: INV_SHIELD.map((row) => row.split('').map((ch) => (ch === '#' ? 1 : 0))) }));
  G.ship = { x: 121, dead: 0, inv: 60 };
}
function invShieldHit(G, x, y, erode = true) {
  for (const sh of G.shields) {
    const cx = Math.floor((x - sh.x) / 2), cy = Math.floor((y - sh.y) / 2);
    if (cx < 0 || cy < 0 || cx >= 12 || cy >= 8 || !sh.cells[cy][cx]) continue;
    if (erode) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = cx + dx, yy = cy + dy;
      if (xx >= 0 && yy >= 0 && xx < 12 && yy < 8 && (dx === 0 && dy === 0 || G.rnd() < 0.6)) sh.cells[yy][xx] = 0;
    }
    return true;
  }
  return false;
}
function invStep(G) {
  for (const b of G.booms) b.t--;
  G.booms = G.booms.filter((b) => b.t > 0);
  if (G.waveT > 0) { if (--G.waveT === 0) { G.level++; invWave(G); } return; }
  const s = G.ship;
  if (s.dead > 0) {
    if (--s.dead === 0) { if (G.lives <= 0) { G.gameOver(); return; } s.x = 121; s.inv = 90; G.bombs = []; }
  } else {
    if (s.inv > 0) s.inv--;
    if (G.down('left')) s.x -= 1.3;
    if (G.down('right')) s.x += 1.3;
    s.x = clamp(s.x, 6, 237);
    if ((G.hit('a') || G.hit('up')) && !G.shot) G.shot = { x: s.x + 6, y: 164 };
  }
  if (G.shot) {
    G.shot.y -= 4.5;
    const sh = G.shot;
    let hit = sh.y < 14;
    if (!hit) for (const a of G.al) {
      if (!a.alive || sh.x < a.x + a.off || sh.x > a.x + a.off + a.w || sh.y > a.y + 8 || sh.y + 4 < a.y) continue;
      a.alive = false; G.score += INV_PTS[a.type]; G.booms.push({ x: a.x, y: a.y, t: 14 }); hit = true; break;
    }
    if (!hit && G.ufo && sh.x > G.ufo.x && sh.x < G.ufo.x + 16 && sh.y < 28 && sh.y > 18) {
      G.score += G.ufo.pts; G.booms.push({ x: G.ufo.x, y: 20, t: 40, txt: String(G.ufo.pts) }); G.ufo = null; hit = true;
    }
    if (!hit && (invShieldHit(G, sh.x, sh.y) || invShieldHit(G, sh.x, sh.y + 3))) hit = true;
    if (!hit) for (const b of G.bombs) if (Math.abs(b.x - sh.x) < 3 && Math.abs(b.y - sh.y) < 6) { b.dead = true; hit = true; break; }
    if (hit) G.shot = null;
  }
  const alive = G.al.filter((a) => a.alive);
  if (!alive.length) { G.waveT = 100; G.shot = null; return; }
  const interval = Math.max(2, Math.floor(alive.length * 0.55) + 3 - Math.min(G.level - 1, 4));
  if (++G.stepT >= interval) {
    G.stepT = 0; G.frame ^= 1;
    let minX = 999, maxX = -999;
    for (const a of alive) { minX = Math.min(minX, a.x + a.off); maxX = Math.max(maxX, a.x + a.off + a.w); }
    if ((G.dir > 0 && maxX + 3 > 250) || (G.dir < 0 && minX - 3 < 6)) { for (const a of alive) a.y += 6; G.dir = -G.dir; }
    else for (const a of alive) a.x += 3 * G.dir;
    for (const a of alive) {
      if (a.y + 8 >= 146) for (let yy = a.y; yy < a.y + 8; yy += 2) for (let xx = a.x; xx < a.x + 12; xx += 2) clearShieldAt(G, xx, yy);
      if (a.y + 8 >= 164 && !s.dead) { G.lives = 0; s.dead = 90; G.booms.push({ x: s.x, y: 166, t: 60 }); }
    }
  }
  if (--G.bombT <= 0 && G.bombs.length < 2 + Math.min(G.level, 3)) {
    const cols = {};
    for (const a of alive) { const k = Math.round(a.x); if (!cols[k] || cols[k].y < a.y) cols[k] = a; }
    const list = Object.values(cols), a = list[(G.rnd() * list.length) | 0];
    G.bombs.push({ x: a.x + 6, y: a.y + 8, t: 0 });
    G.bombT = Math.max(12, 30 + G.rnd() * 60 - G.level * 5);
  }
  for (const b of G.bombs) {
    b.y += 1.4 + G.level * 0.15; b.t++;
    if (invShieldHit(G, b.x, b.y + 6)) b.dead = true;
    else if (!s.dead && s.inv <= 0 && b.y + 6 > 164 && b.y < 174 && b.x > s.x && b.x < s.x + 13) {
      b.dead = true; s.dead = 90; G.lives--; G.booms.push({ x: s.x, y: 166, t: 60 });
    }
  }
  G.bombs = G.bombs.filter((b) => !b.dead && b.y < 180);
  if (--G.ufoT <= 0 && !G.ufo) { const l = G.rnd() < 0.5; G.ufo = { x: l ? -16 : 256, dir: l ? 1 : -1, pts: [50, 100, 150, 300][(G.rnd() * 4) | 0] }; G.ufoT = 1100 + G.rnd() * 700; }
  if (G.ufo) { G.ufo.x += G.ufo.dir * 0.9; if (G.ufo.x < -20 || G.ufo.x > 260) G.ufo = null; }
}
function clearShieldAt(G, x, y) {
  for (const sh of G.shields) { const cx = Math.floor((x - sh.x) / 2), cy = Math.floor((y - sh.y) / 2); if (cx >= 0 && cy >= 0 && cx < 12 && cy < 8) sh.cells[cy][cx] = 0; }
}
function invAI(G) {
  const s = G.ship;
  G.held.left = G.held.right = false;
  if (s.dead) return;
  const sx = s.x + 6;
  const threat = G.bombs.find((b) => b.y > 110 && Math.abs(b.x - sx) < 10);
  if (threat) { G.held[threat.x > sx ? 'left' : 'right'] = true; return; }
  if (G.aiT === undefined || !G.al[G.aiT] || !G.al[G.aiT].alive || G.tick % 180 === 0) {
    const al = G.al.map((a, i) => (a.alive ? i : -1)).filter((i) => i >= 0);
    G.aiT = al[(G.rnd() * al.length) | 0];
  }
  const a = G.al[G.aiT];
  if (!a) return;
  const tx = a.x + 6;
  if (Math.abs(tx - sx) > 2) G.held[tx > sx ? 'right' : 'left'] = true;
  else if (!G.shot) G.press('a');
}
const invaders = {
  id: 'invaders', title: 'Envahisseurs', color: '#6f6', ai: invAI, step: invStep,
  init(G) { G.level = 1; G.lives = 3; invWave(G); },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#000');
    stars(g, 0, 30, '#334', 5);
    for (const a of G.al) if (a.alive) g.drawImage(sprite('inv' + a.type + G.frame, INV_SPR[a.type][G.frame], { '#': INV_COL[a.type] }), Math.round(a.x + a.off), Math.round(a.y));
    for (const sh of G.shields) {
      g.fillStyle = '#4d4';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) if (sh.cells[y][x]) g.fillRect(sh.x + x * 2, sh.y + y * 2, 2, 2);
    }
    if (G.ufo) g.drawImage(sprite('ufo', INV_UFO, { '#': '#f44' }), Math.round(G.ufo.x), 20);
    const s = G.ship;
    if (!s.dead && (s.inv <= 0 || (G.tick >> 2) & 1)) g.drawImage(sprite('ship', INV_SHIP, { '#': '#6f6' }), Math.round(s.x), 166);
    if (G.shot) rect(g, G.shot.x, G.shot.y, 1, 4, '#fff');
    g.fillStyle = '#fff';
    for (const b of G.bombs) { const z = (b.t >> 2) & 1; g.fillRect(b.x - 1 + z, b.y, 1, 2); g.fillRect(b.x - z, b.y + 2, 1, 2); g.fillRect(b.x - 1 + z, b.y + 4, 1, 2); }
    for (const b of G.booms) {
      if (b.txt) drawText(g, b.txt, b.x + 8, b.y, '#f44', 1, 'center');
      else g.drawImage(sprite('boom', INV_BOOM, { '#': b.y > 160 ? '#6f6' : '#fff' }), Math.round(b.x), Math.round(b.y));
    }
    rect(g, 0, 177, W, 1, '#4d4');
    drawText(g, String(Math.max(0, G.lives)), 6, 181, '#fff');
    for (let i = 0; i < G.lives - 1; i++) g.drawImage(sprite('ship', INV_SHIP, { '#': '#6f6' }), 18 + i * 16, 181);
    hud2(g, 'SCORE ' + pad(G.score, 5), 'RECORD ' + pad(Math.max(G.hs.score, G.score), 5));
    drawText(g, 'VAGUE ' + G.level, W - 6, 181, '#888', 1, 'right');
    if (G.waveT > 0) drawTextS(g, 'VAGUE ' + (G.level + 1), W / 2, 90, '#fff', 2, 'center');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#000');
    stars(g, G.tick, 40, '#556', 5);
    const f = (G.tick >> 5) & 1;
    [[0, '= 30 PTS'], [1, '= 20 PTS'], [2, '= 10 PTS']].forEach(([t, s], i) => {
      g.drawImage(sprite('inv' + t + f, INV_SPR[t][f], { '#': INV_COL[t] }), 92, 62 + i * 12);
      drawText(g, s, 112, 62 + i * 12, '#fff');
    });
    g.drawImage(sprite('ufo', INV_UFO, { '#': '#f44' }), 88, 98); drawText(g, '= ? MYSTÈRE', 112, 98, '#fff');
  },
};

// ═════════════════════════ PONG ═════════════════════════
const PG = { ph: 24, x1: 10, x2: 242 };
function pongPredict(b, xt) {
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy, n = 0;
  if (!vx) return y;
  while ((xt - x) * Math.sign(vx) > 0 && n++ < 500) { x += vx; y += vy; if (y < 18) { y = 36 - y; vy = -vy; } if (y > 184) { y = 368 - y; vy = -vy; } }
  return y;
}
function pongAI(G, py, side, max) {
  const b = G.ball;
  let target = 94;
  if (Math.sign(b.vx) === side && G.serveT <= 0) target = pongPredict(b, side > 0 ? PG.x2 : PG.x1 + 4) + 2 + (side > 0 ? G.aiErr : -G.aiErr * 0.5);
  const d = target - (py + PG.ph / 2);
  return py + clamp(d, -max, max);
}
function pongHit(G, py, dir) {
  const b = G.ball;
  const rel = clamp(((b.y + 2) - (py + PG.ph / 2)) / (PG.ph / 2), -1, 1);
  const sp = Math.min(4.6, Math.hypot(b.vx, b.vy) * 1.07 + 0.05), a = rel * 1.0;
  b.vx = Math.cos(a) * sp * dir; b.vy = Math.sin(a) * sp;
  b.x = dir > 0 ? PG.x1 + 4 : PG.x2 - 4;
  G.aiErr = (G.rnd() - 0.5) * 26;
}
const pong = {
  id: 'pong', title: 'Pong', color: '#fff', options: ['1 JOUEUR', '2 JOUEURS'],
  init(G) {
    G.two = G.option === 1 && !G.demo; G.noEmit = G.two;
    G.p1 = 84; G.p2 = 84; G.s1 = 0; G.s2 = 0; G.ball = { x: 126, y: 94, vx: 0, vy: 0 }; G.serveT = 70; G.serveDir = G.rnd() < 0.5 ? -1 : 1; G.aiErr = 0;
  },
  step(G) {
    const b = G.ball;
    if (G.two) {
      if (G.keys.has('KeyW')) G.p1 -= 2.6; if (G.keys.has('KeyS')) G.p1 += 2.6;
      if (G.keys.has('ArrowUp')) G.p2 -= 2.6; if (G.keys.has('ArrowDown')) G.p2 += 2.6;
    } else {
      if (G.demo) G.p1 = pongAI(G, G.p1, -1, 2.3);
      else { if (G.down('up')) G.p1 -= 2.6; if (G.down('down')) G.p1 += 2.6; }
      G.p2 = pongAI(G, G.p2, 1, G.demo ? 2.3 : 2.0);
    }
    G.p1 = clamp(G.p1, 18, 188 - PG.ph); G.p2 = clamp(G.p2, 18, 188 - PG.ph);
    if (G.serveT > 0) {
      b.x = 126; b.y = 94;
      if (--G.serveT === 0) { const a = (G.rnd() - 0.5) * 0.9; b.vx = Math.cos(a) * 2 * G.serveDir; b.vy = Math.sin(a) * 2; }
      return;
    }
    b.x += b.vx; b.y += b.vy;
    if (b.y < 18) { b.y = 18; b.vy = Math.abs(b.vy); }
    if (b.y > 184) { b.y = 184; b.vy = -Math.abs(b.vy); }
    if (b.vx < 0 && b.x <= PG.x1 + 4 && b.x >= PG.x1 - 5 && b.y + 4 >= G.p1 && b.y <= G.p1 + PG.ph) pongHit(G, G.p1, 1);
    if (b.vx > 0 && b.x + 4 >= PG.x2 && b.x <= PG.x2 + 5 && b.y + 4 >= G.p2 && b.y <= G.p2 + PG.ph) pongHit(G, G.p2, -1);
    if (b.x < -10 || b.x > 266) {
      if (b.x < 0) G.s2++; else G.s1++;
      G.serveT = 50; G.serveDir = b.x < 0 ? -1 : 1; b.vx = b.vy = 0;
      if (!G.two) G.score = G.s1 * 100;
      if (G.s1 >= 7 || G.s2 >= 7) {
        if (!G.two) G.score = G.s1 * 100 + (G.s1 > G.s2 ? 1000 : 0);
        G.gameOver(G.two ? (G.s1 > G.s2 ? 'JOUEUR 1 GAGNE' : 'JOUEUR 2 GAGNE') : G.s1 > G.s2 ? 'VICTOIRE !' : 'DÉFAITE…');
      }
    }
  },
  ai() { },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#000');
    rect(g, 0, 14, W, 2, '#ccc'); rect(g, 0, 188, W, 2, '#ccc');
    g.fillStyle = '#777';
    for (let y = 18; y < 188; y += 10) g.fillRect(127, y, 2, 6);
    drawText(g, String(G.s1), 96, 24, '#ddd', 4, 'center');
    drawText(g, String(G.s2), 160, 24, '#ddd', 4, 'center');
    if (G.two) { drawText(g, 'J1', 20, 3, '#888'); drawText(g, 'J2', W - 20, 3, '#888', 1, 'right'); }
    else drawText(g, 'SCORE ' + G.score, 4, 3, '#888');
    rect(g, PG.x1, G.p1, 4, PG.ph, '#fff'); rect(g, PG.x2, G.p2, 4, PG.ph, '#fff');
    if (G.serveT <= 0 || (G.serveT >> 3) & 1) rect(g, G.ball.x, G.ball.y, 4, 4, '#fff');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#000');
    const t = G.tick, bx = 20 + Math.abs(((t * 1.6) % 432) - 216), by = 60 + Math.abs(((t * 1.1) % 80) - 40);
    rect(g, 10, by - 10, 4, 24, '#555'); rect(g, 242, by - 10, 4, 24, '#555'); rect(g, bx, by, 4, 4, '#888');
  },
};

// ═════════════════════════ CASSE-BRIQUES ═════════════════════════
const BR_COL = ['#f44', '#f94', '#fd4', '#4d4', '#4cf', '#66f'], BR_HI = ['#f99', '#fc9', '#ff9', '#9f9', '#9ef', '#99f'], BR_PTS = [60, 50, 40, 30, 20, 10];
function brLevel(G) {
  G.bricks = [];
  const lv = (G.level - 1) % 4, r = rng(G.level * 31 + 5);
  for (let row = 0; row < 6; row++) for (let c = 0; c < 12; c++) {
    let on = true;
    if (lv === 1) on = (row + c) % 2 === 0;
    else if (lv === 2) on = c >= row && c < 12 - row;
    else if (lv === 3) on = r() > 0.25;
    if (on) G.bricks.push({ x: 14 + c * 19, y: 28 + row * 9, row, hp: G.level > 2 && row < 2 ? 2 : 1 });
  }
  G.pad = { x: 112, w: 32 }; G.ball = { x: 0, y: 0, vx: 0, vy: 0, sp: 2.4 }; G.stuck = true; G.stuckT = 0; G.lvlT = 0;
}
function brHit(G, b) {
  for (let i = 0; i < G.bricks.length; i++) {
    const br = G.bricks[i];
    if (b.x < br.x + 18 && b.x + 3 > br.x && b.y < br.y + 7 && b.y + 3 > br.y) {
      if (--br.hp <= 0) { G.bricks.splice(i, 1); G.score += BR_PTS[br.row]; }
      b.sp = Math.min(4.2, b.sp + 0.02);
      return true;
    }
  }
  return false;
}
const breakout = {
  id: 'breakout', title: 'Casse-Briques', color: '#f94',
  init(G) { G.level = 1; G.lives = 3; brLevel(G); },
  step(G) {
    if (G.lvlT > 0) { if (--G.lvlT === 0) { G.level++; brLevel(G); } return; }
    const p = G.pad, b = G.ball;
    if (G.down('left')) p.x -= 3;
    if (G.down('right')) p.x += 3;
    p.x = clamp(p.x, 8, 248 - p.w);
    if (G.stuck) {
      b.x = p.x + p.w / 2 - 1; b.y = 172;
      if (G.hit('a') || G.hit('up') || ++G.stuckT > 300) {
        G.stuck = false;
        const a = (G.rnd() - 0.5) * 0.8;
        b.sp = 2.4 + Math.min(1.2, (G.level - 1) * 0.2); b.vx = Math.sin(a) * b.sp; b.vy = -Math.cos(a) * b.sp;
      }
      return;
    }
    const n = Math.ceil(b.sp / 1.5);
    for (let i = 0; i < n; i++) {
      const sc = b.sp / (Math.hypot(b.vx, b.vy) || 1);
      b.x += (b.vx * sc) / n;
      if (b.x < 8) { b.x = 8; b.vx = Math.abs(b.vx); }
      if (b.x + 3 > 248) { b.x = 245; b.vx = -Math.abs(b.vx); }
      if (brHit(G, b)) { b.x -= (b.vx * sc) / n; b.vx = -b.vx; }
      b.y += (b.vy * sc) / n;
      if (b.y < 16) { b.y = 16; b.vy = Math.abs(b.vy); }
      if (brHit(G, b)) { b.y -= (b.vy * sc) / n; b.vy = -b.vy; }
      if (b.vy > 0 && b.y + 3 >= 176 && b.y + 3 <= 181 && b.x + 3 >= p.x && b.x <= p.x + p.w) {
        const rel = clamp((b.x + 1.5 - (p.x + p.w / 2)) / (p.w / 2), -1, 1), a = rel * 1.05;
        b.sp = Math.min(4.2, b.sp + 0.03); b.vx = Math.sin(a) * b.sp; b.vy = -Math.cos(a) * b.sp; b.y = 173;
      }
    }
    if (b.y > 196) { if (--G.lives <= 0) { G.gameOver(); return; } G.stuck = true; G.stuckT = 0; }
    if (!G.bricks.length) G.lvlT = 90;
  },
  ai(G) {
    const p = G.pad, b = G.ball;
    const tx = b.x + 1.5 - p.w / 2 + Math.sin(G.tick * 0.02) * 8;
    G.held.left = tx < p.x - 2; G.held.right = tx > p.x + 2;
    if (G.stuck && G.stuckT > 40) G.press('a');
  },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#0a0a1e');
    g.fillStyle = '#12122c';
    for (let y = 16; y < H; y += 8) g.fillRect(8, y, 240, 1);
    rect(g, 4, 12, 4, 180, '#889'); rect(g, 248, 12, 4, 180, '#889'); rect(g, 4, 12, 248, 4, '#889');
    for (const br of G.bricks) {
      rect(g, br.x, br.y, 18, 7, br.hp > 1 ? '#bbb' : BR_COL[br.row]);
      rect(g, br.x, br.y, 18, 1, br.hp > 1 ? '#fff' : BR_HI[br.row]);
      rect(g, br.x, br.y + 6, 18, 1, 'rgba(0,0,0,0.35)');
    }
    const p = G.pad;
    rect(g, p.x, 176, p.w, 4, '#ccd'); rect(g, p.x, 176, p.w, 1, '#fff'); rect(g, p.x, 176, 3, 4, '#f44'); rect(g, p.x + p.w - 3, 176, 3, 4, '#f44');
    rect(g, G.ball.x, G.ball.y, 3, 3, '#fff');
    hud2(g, 'SCORE ' + pad(G.score, 5), 'RECORD ' + pad(Math.max(G.hs.score, G.score), 5));
    drawText(g, '♥'.repeat(Math.max(0, G.lives)), W / 2, 3, '#f55', 1, 'center');
    if (G.stuck && (G.tick >> 4) & 1) drawText(g, 'ESPACE : LANCER', W / 2, 140, '#fff', 1, 'center');
    if (G.lvlT > 0) drawTextS(g, 'NIVEAU ' + (G.level + 1), W / 2, 110, '#fff', 2, 'center');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#0a0a1e');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) if (hash(r * 12 + c + ((G.tick / 40) | 0)) > 0.2) rect(g, 14 + c * 19, 62 + r * 9, 18, 7, BR_COL[r + 1]);
  },
};

// ═════════════════════════ SERPENT ═════════════════════════
const SN = { ox: 8, oy: 22, cols: 30, rows: 20 };
function snFree(G, x, y) { return !G.snake.some((s) => s[0] === x && s[1] === y); }
function snFood(G) {
  for (let i = 0; i < 400; i++) { const x = (G.rnd() * SN.cols) | 0, y = (G.rnd() * SN.rows) | 0; if (snFree(G, x, y) && !(G.bonus && G.bonus.x === x && G.bonus.y === y)) { G.food = [x, y]; return; } }
}
const SN_BUF = { prev: new Int16Array(600), q: new Int16Array(600), block: new Uint8Array(600) };
function snAI(G) {
  if (G.q.length || G.dead) return;
  const { prev, q, block } = SN_BUF;
  block.fill(0); prev.fill(-1);
  G.snake.forEach((s, i) => { if (i < G.snake.length - 1) block[s[1] * 30 + s[0]] = 1; });
  const h = G.snake[0], s0 = h[1] * 30 + h[0], goal = G.food[1] * 30 + G.food[0];
  let hd = 0, tl = 0, found = false;
  prev[s0] = s0; q[tl++] = s0;
  while (hd < tl) {
    const c = q[hd++];
    if (c === goal) { found = true; break; }
    const cx = c % 30, cy = (c / 30) | 0;
    for (const d of GL_DIRS) {
      const nx = cx + d[0], ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx >= 30 || ny >= 20) continue;
      const n = ny * 30 + nx;
      if (block[n] || prev[n] !== -1) continue;
      prev[n] = c; q[tl++] = n;
    }
  }
  let dir = null;
  if (found) { let c = goal; while (prev[c] !== s0) c = prev[c]; dir = [(c % 30) - h[0], ((c / 30) | 0) - h[1]]; }
  else {
    let best = -1;
    for (const d of GL_DIRS) {
      const nx = h[0] + d[0], ny = h[1] + d[1];
      if (nx < 0 || ny < 0 || nx >= 30 || ny >= 20 || block[ny * 30 + nx]) continue;
      const sc = hash(nx * 7 + ny * 13 + G.tick);
      if (sc > best) { best = sc; dir = d; }
    }
  }
  if (!dir) return;
  for (const k in DIRS) if (DIRS[k][0] === dir[0] && DIRS[k][1] === dir[1]) G.press(k);
}
const snake = {
  id: 'snake', title: 'Serpent', color: '#6e6', ai: snAI,
  init(G) { G.snake = [[12, 10], [11, 10], [10, 10], [9, 10]]; G.dir = [1, 0]; G.q = []; G.every = 9; G.mt = 0; G.grow = 0; G.ate = 0; G.dead = 0; G.bonus = null; snFood(G); },
  step(G) {
    if (G.dead > 0) { if (--G.dead === 0) G.gameOver(); return; }
    for (const k of ['up', 'down', 'left', 'right']) {
      if (!G.hit(k)) continue;
      const v = DIRS[k], last = G.q.length ? G.q[G.q.length - 1] : G.dir;
      if ((v[0] !== -last[0] || v[1] !== -last[1]) && (v[0] !== last[0] || v[1] !== last[1]) && G.q.length < 3) G.q.push(v);
    }
    if (G.bonus && --G.bonus.t <= 0) G.bonus = null;
    if (++G.mt < G.every) return;
    G.mt = 0;
    if (G.q.length) G.dir = G.q.shift();
    const h = G.snake[0], nx = h[0] + G.dir[0], ny = h[1] + G.dir[1];
    if (nx < 0 || ny < 0 || nx >= SN.cols || ny >= SN.rows || G.snake.some((s, i) => s[0] === nx && s[1] === ny && (i < G.snake.length - 1 || G.grow > 0))) { G.dead = 70; return; }
    G.snake.unshift([nx, ny]);
    if (nx === G.food[0] && ny === G.food[1]) {
      G.score += 10; G.grow += 2; G.ate++;
      if (G.ate % 5 === 0) G.every = Math.max(4, G.every - 1);
      if (!G.bonus && G.rnd() < 0.3) { for (let i = 0; i < 50; i++) { const x = (G.rnd() * SN.cols) | 0, y = (G.rnd() * SN.rows) | 0; if (snFree(G, x, y)) { G.bonus = { x, y, t: 320 }; break; } } }
      snFood(G);
    }
    if (G.bonus && nx === G.bonus.x && ny === G.bonus.y) { G.score += 50; G.bonus = null; G.grow += 1; }
    if (G.grow > 0) G.grow--; else G.snake.pop();
  },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#0b1a0b');
    rect(g, SN.ox - 2, SN.oy - 2, SN.cols * 8 + 4, SN.rows * 8 + 4, '#3a6a3a');
    rect(g, SN.ox, SN.oy, SN.cols * 8, SN.rows * 8, '#122612');
    g.fillStyle = '#163016';
    for (let y = 0; y < SN.rows; y++) for (let x = (y & 1); x < SN.cols; x += 2) g.fillRect(SN.ox + x * 8, SN.oy + y * 8, 8, 8);
    const f = G.food;
    circle(g, SN.ox + f[0] * 8 + 4, SN.oy + f[1] * 8 + 4.5, 3.2, '#e33'); rect(g, SN.ox + f[0] * 8 + 4, SN.oy + f[1] * 8, 1, 2, '#741'); rect(g, SN.ox + f[0] * 8 + 5, SN.oy + f[1] * 8, 2, 1, '#4c4');
    if (G.bonus && (G.bonus.t > 90 || (G.tick >> 2) & 1)) { circle(g, SN.ox + G.bonus.x * 8 + 4, SN.oy + G.bonus.y * 8 + 4, 3.5, '#fc2'); rect(g, SN.ox + G.bonus.x * 8 + 3, SN.oy + G.bonus.y * 8 + 2, 2, 4, '#a70'); }
    const blinkDead = G.dead > 0 && (G.dead >> 3) & 1;
    G.snake.forEach((s, i) => {
      const x = SN.ox + s[0] * 8, y = SN.oy + s[1] * 8;
      rect(g, x, y, 8, 8, blinkDead ? '#fff' : i === 0 ? '#8f8' : i % 2 ? '#3c3' : '#4d4');
      rect(g, x, y + 7, 8, 1, 'rgba(0,0,0,0.3)');
    });
    const h = G.snake[0], hx = SN.ox + h[0] * 8, hy = SN.oy + h[1] * 8, d = G.dir;
    const ex = d[0] > 0 ? [5, 5] : d[0] < 0 ? [1, 1] : [1, 5], ey = d[1] > 0 ? [5, 5] : d[1] < 0 ? [1, 1] : [1, 5];
    rect(g, hx + ex[0], hy + ey[0], 2, 2, '#000'); rect(g, hx + ex[1], hy + ey[1], 2, 2, '#000');
    hud2(g, 'SCORE ' + pad(G.score, 4), 'RECORD ' + pad(Math.max(G.hs.score, G.score), 4));
    drawText(g, 'LONGUEUR ' + G.snake.length, W / 2, 3, '#8c8', 1, 'center');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#0b1a0b');
    for (let i = 0; i < 18; i++) { const x = ((G.tick * 1.2 - i * 8) % 300) - 20, y = 80 + Math.round(Math.sin((G.tick * 1.2 - i * 8) * 0.04) * 10 / 8) * 8; rect(g, x, y, 8, 8, i === 0 ? '#8f8' : i % 2 ? '#3c3' : '#4d4'); }
  },
};

// ═════════════════════════ BLOCS ═════════════════════════
const TET = [
  { N: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] }, { N: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { N: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] }, { N: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  { N: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, { N: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { N: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
];
const TET_ROT = TET.map((p) => { const r = [p.cells]; for (let k = 1; k < 4; k++) r.push(r[k - 1].map(([x, y]) => [p.N - 1 - y, x])); return r; });
const BL_COL = ['#2df', '#fd2', '#b5f', '#4d4', '#f44', '#47f', '#f92'], BL_LT = ['#9ff', '#ffa', '#dbf', '#afa', '#faa', '#9bf', '#fc9'], BL_DK = ['#088', '#985', '#638', '#272', '#822', '#239', '#a52'];
const BL_GRAV = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2];
const BL_X = 88, BL_Y = 16;
const BL_KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]];
const blCell = (k) => canvasOnce('blc' + k, 8, 8, (g) => { g.fillStyle = BL_COL[k]; g.fillRect(0, 0, 8, 8); g.fillStyle = BL_LT[k]; g.fillRect(0, 0, 8, 1); g.fillRect(0, 0, 1, 8); g.fillStyle = BL_DK[k]; g.fillRect(0, 7, 8, 1); g.fillRect(7, 0, 1, 8); });
function blFits(board, k, r, x, y) {
  for (const [cx, cy] of TET_ROT[k][r]) { const bx = x + cx, by = y + cy; if (bx < 0 || bx >= 10 || by >= 22) return false; if (by >= 0 && board[by * 10 + bx]) return false; }
  return true;
}
function blBag(G) { if (!G.bag.length) { G.bag = [0, 1, 2, 3, 4, 5, 6]; for (let i = 6; i > 0; i--) { const j = (G.rnd() * (i + 1)) | 0; [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]]; } } return G.bag.pop(); }
function blSpawn(G) {
  const k = G.next; G.next = blBag(G);
  G.cur = { k, r: 0, x: k === 1 ? 4 : 3, y: 0 }; G.lockT = 0; G.resets = 0; G.gT = 0; G.aiPlan = null;
  if (!blFits(G.board, k, 0, G.cur.x, G.cur.y)) { G.cur = null; G.gameOver(); }
}
function blTouch(G) { if (G.resets < 15) { G.lockT = 0; G.resets++; } }
function blLock(G) {
  const c = G.cur;
  let top = false;
  for (const [cx, cy] of TET_ROT[c.k][c.r]) { const by = c.y + cy; if (by >= 0) G.board[by * 10 + c.x + cx] = c.k + 1; if (by < 2) top = true; }
  G.cur = null;
  if (top) { G.gameOver(); return; }
  const rows = [];
  for (let y = 0; y < 22; y++) { let full = true; for (let x = 0; x < 10; x++) if (!G.board[y * 10 + x]) { full = false; break; } if (full) rows.push(y); }
  if (rows.length) {
    G.clearRows = rows; G.clearT = 20;
    G.score += [0, 40, 100, 300, 1200][rows.length] * G.level; G.lines += rows.length; G.level = 1 + Math.floor(G.lines / 10);
  } else blSpawn(G);
}
function blEval(board) {
  let holes = 0, agg = 0, bump = 0, prev = -1, lines = 0;
  for (let y = 0; y < 22; y++) { let f = true; for (let x = 0; x < 10; x++) if (!board[y * 10 + x]) { f = false; break; } if (f) lines++; }
  for (let x = 0; x < 10; x++) {
    let h = 0, seen = false;
    for (let y = 0; y < 22; y++) { if (board[y * 10 + x]) { if (!seen) { h = 22 - y; seen = true; } } else if (seen) holes++; }
    agg += h; if (prev >= 0) bump += Math.abs(h - prev); prev = h;
  }
  return -0.51 * agg + 0.76 * lines * 4 - 0.36 * holes * 2 - 0.18 * bump;
}
function blBest(G) {
  const c = G.cur, tmp = new Uint8Array(220);
  let best = { r: 0, x: c.x }, bs = -Infinity;
  for (let r = 0; r < 4; r++) for (let x = -2; x < 10; x++) {
    if (!blFits(G.board, c.k, r, x, 0)) continue;
    let y = 0; while (blFits(G.board, c.k, r, x, y + 1)) y++;
    tmp.set(G.board);
    for (const [cx, cy] of TET_ROT[c.k][r]) if (y + cy >= 0) tmp[(y + cy) * 10 + x + cx] = 1;
    const s = blEval(tmp);
    if (s > bs) { bs = s; best = { r, x }; }
  }
  return best;
}
const blocs = {
  id: 'blocs', title: 'Blocs', color: '#2df',
  init(G) { G.board = new Uint8Array(220); G.bag = []; G.next = blBag(G); G.lines = 0; G.level = 1; G.clearRows = null; G.clearT = 0; G.das = 0; blSpawn(G); },
  step(G) {
    if (G.clearT > 0) {
      if (--G.clearT === 0) {
        const nb = new Uint8Array(220); let ny = 21;
        for (let y = 21; y >= 0; y--) { if (G.clearRows.includes(y)) continue; nb.set(G.board.subarray(y * 10, y * 10 + 10), ny * 10); ny--; }
        G.board = nb; G.clearRows = null; blSpawn(G);
      }
      return;
    }
    const c = G.cur;
    if (!c) return;
    const rot = (d) => { const nr = (c.r + d) % 4; for (const [kx, ky] of BL_KICKS) if (blFits(G.board, c.k, nr, c.x + kx, c.y + ky)) { c.r = nr; c.x += kx; c.y += ky; blTouch(G); return; } };
    if (G.hit('up') || G.khit('KeyX')) rot(1);
    if (G.khit('KeyZ')) rot(3);
    const mv = (d) => { if (blFits(G.board, c.k, c.r, c.x + d, c.y)) { c.x += d; blTouch(G); } };
    const L = G.down('left'), R = G.down('right');
    if (G.hit('left')) { mv(-1); G.das = 0; }
    else if (G.hit('right')) { mv(1); G.das = 0; }
    else if (L !== R) { if (++G.das > 10 && (G.das - 10) % 2 === 0) mv(L ? -1 : 1); }
    else G.das = 0;
    if (G.hit('a')) { let d = 0; while (blFits(G.board, c.k, c.r, c.x, c.y + 1)) { c.y++; d++; } G.score += d * 2; blLock(G); return; }
    const soft = G.down('down'), grav = BL_GRAV[Math.min(G.level - 1, 19)];
    if (++G.gT >= (soft ? Math.min(2, grav) : grav)) {
      G.gT = 0;
      if (blFits(G.board, c.k, c.r, c.x, c.y + 1)) { c.y++; if (soft) G.score++; G.lockT = 0; }
    }
    if (!blFits(G.board, c.k, c.r, c.x, c.y + 1)) { if (++G.lockT >= 30) blLock(G); }
  },
  ai(G) {
    const c = G.cur;
    if (!c || G.clearT) return;
    if (!G.aiPlan) G.aiPlan = blBest(G);
    if (G.tick % 5) return;
    const p = G.aiPlan;
    if (c.r !== p.r) G.press('up');
    else if (c.x < p.x) G.press('right');
    else if (c.x > p.x) G.press('left');
    else G.press('a');
  },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#0a0a24');
    g.fillStyle = '#10103a';
    for (let y = 0; y < H; y += 16) for (let x = (y / 16) % 2 ? 0 : 16; x < W; x += 32) g.fillRect(x, y, 16, 16);
    rect(g, BL_X - 3, BL_Y - 3, 86, 166, '#99b'); rect(g, BL_X - 1, BL_Y - 1, 82, 162, '#223'); rect(g, BL_X, BL_Y, 80, 160, '#000');
    for (let y = 2; y < 22; y++) {
      const clearing = G.clearRows && G.clearRows.includes(y);
      for (let x = 0; x < 10; x++) {
        const v = G.board[y * 10 + x];
        if (clearing) { if ((G.clearT >> 2) & 1) rect(g, BL_X + x * 8, BL_Y + (y - 2) * 8, 8, 8, '#fff'); else if (v) g.drawImage(blCell(v - 1), BL_X + x * 8, BL_Y + (y - 2) * 8); }
        else if (v) g.drawImage(blCell(v - 1), BL_X + x * 8, BL_Y + (y - 2) * 8);
      }
    }
    const c = G.cur;
    if (c) {
      let gy = c.y; while (blFits(G.board, c.k, c.r, c.x, gy + 1)) gy++;
      g.strokeStyle = BL_DK[c.k]; g.lineWidth = 1;
      for (const [cx, cy] of TET_ROT[c.k][c.r]) if (gy + cy >= 2) g.strokeRect(BL_X + (c.x + cx) * 8 + 0.5, BL_Y + (gy + cy - 2) * 8 + 0.5, 7, 7);
      for (const [cx, cy] of TET_ROT[c.k][c.r]) if (c.y + cy >= 2) g.drawImage(blCell(c.k), BL_X + (c.x + cx) * 8, BL_Y + (c.y + cy - 2) * 8);
    }
    const panel = (x, y, w, h) => { rect(g, x, y, w, h, '#223'); frame(g, x, y, w, h, '#99b'); };
    panel(8, 20, 72, 30); drawText(g, 'SCORE', 14, 24, '#99b'); drawText(g, pad(G.score, 6), 14, 36, '#fff');
    panel(8, 56, 72, 30); drawText(g, 'LIGNES', 14, 60, '#99b'); drawText(g, String(G.lines), 14, 72, '#fff');
    panel(8, 92, 72, 30); drawText(g, 'NIVEAU', 14, 96, '#99b'); drawText(g, String(G.level), 14, 108, '#fff');
    panel(176, 20, 72, 46); drawText(g, 'SUIVANT', 182, 24, '#99b');
    const nk = G.next, nc = TET_ROT[nk][0], N = TET[nk].N;
    for (const [cx, cy] of nc) g.drawImage(blCell(nk), 212 - N * 4 + cx * 8, 40 + cy * 8 - (N === 2 ? -4 : 0));
    panel(176, 72, 72, 30); drawText(g, 'RECORD', 182, 76, '#99b'); drawText(g, pad(Math.max(G.hs.score, G.score), 6), 182, 88, '#ff5');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#0a0a24');
    for (let i = 0; i < 10; i++) {
      const k = i % 7, x = 16 + ((i * 53) % 220), y = ((G.tick * (0.4 + (i % 3) * 0.2) + i * 40) % 230) - 30;
      for (const [cx, cy] of TET_ROT[k][(i + ((G.tick / 60) | 0)) % 4]) g.drawImage(blCell(k), x + cx * 8, Math.round(y) + cy * 8);
    }
  },
};

// ═════════════════════════ DÉMINEUR ═════════════════════════
const DM = { cols: 16, rows: 10, cs: 13, ox: 24, oy: 50, mines: 22 };
const DM_NUM = ['', '#00e', '#080', '#e00', '#008', '#800', '#088', '#000', '#777'];
function dmNeighbors(i, fn) {
  const x = i % DM.cols, y = (i / DM.cols) | 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < DM.cols && ny < DM.rows) fn(ny * DM.cols + nx);
  }
}
function dmCount(G, i) { let n = 0; dmNeighbors(i, (j) => { n += G.mine[j]; }); return n; }
function dmPlace(G, safe) {
  const avoid = new Set([safe]); dmNeighbors(safe, (j) => avoid.add(j));
  let n = 0;
  while (n < DM.mines) { const i = (G.rnd() * DM.cols * DM.rows) | 0; if (!G.mine[i] && !avoid.has(i)) { G.mine[i] = 1; n++; } }
}
function dmReveal(G, i, user) {
  if (G.flag[i] || G.end) return;
  if (G.rev[i]) {
    if (!user) return;
    let f = 0; dmNeighbors(i, (j) => { f += G.flag[j]; });
    if (f && f === dmCount(G, i)) dmNeighbors(i, (j) => { if (!G.rev[j] && !G.flag[j]) dmReveal(G, j, false); });
    return;
  }
  if (G.first) { dmPlace(G, i); G.first = false; }
  if (G.mine[i]) {
    G.boom = i; G.end = 'lose'; G.endT = 0; G.score = G.revCount * 5;
    for (let j = 0; j < G.mine.length; j++) if (G.mine[j]) G.rev[j] = 1;
    return;
  }
  const st = [i];
  while (st.length) {
    const j = st.pop();
    if (G.rev[j] || G.flag[j]) continue;
    G.rev[j] = 1; G.revCount++;
    if (dmCount(G, j) === 0) dmNeighbors(j, (k) => { if (!G.rev[k] && !G.mine[k]) st.push(k); });
  }
  if (G.revCount === DM.cols * DM.rows - DM.mines) {
    G.end = 'win'; G.endT = 0; G.score = Math.max(100, 3000 - Math.floor(G.elapsed / 60) * 10);
    for (let j = 0; j < G.mine.length; j++) if (G.mine[j]) G.flag[j] = 1;
  }
}
const dmTile = () => canvasOnce('dmtile', 13, 13, (g) => { g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, 13, 13); g.fillStyle = '#fff'; g.fillRect(0, 0, 13, 2); g.fillRect(0, 0, 2, 13); g.fillStyle = '#808080'; g.fillRect(0, 11, 13, 2); g.fillRect(11, 0, 2, 13); g.fillStyle = '#c0c0c0'; g.fillRect(11, 0, 1, 1); g.fillRect(0, 11, 1, 1); });
function dmMine(g, x, y) { circle(g, x + 6.5, y + 6.5, 3.2, '#000'); rect(g, x + 6, y + 1, 1, 11, '#000'); rect(g, x + 1, y + 6, 11, 1, '#000'); rect(g, x + 5, y + 5, 1, 1, '#fff'); }
function dmFlag(g, x, y) { rect(g, x + 6, y + 3, 1, 7, '#000'); poly(g, [x + 7, y + 2, x + 7, y + 7, x + 2, y + 4.5], '#e00'); rect(g, x + 3, y + 10, 7, 1, '#000'); }
function dmSmiley(g, x, y, st) {
  rect(g, x - 11, y - 11, 22, 22, '#c0c0c0'); frame(g, x - 11, y - 11, 22, 22, '#808080'); rect(g, x - 11, y - 11, 21, 1, '#fff'); rect(g, x - 11, y - 11, 1, 21, '#fff');
  circle(g, x, y, 7.5, '#000'); circle(g, x, y, 6.5, '#ff0');
  if (st === 'lose') { g.fillStyle = '#000'; for (const ex of [-3, 3]) { g.fillRect(x + ex - 1, y - 3, 1, 1); g.fillRect(x + ex + 1, y - 3, 1, 1); g.fillRect(x + ex, y - 2, 1, 1); g.fillRect(x + ex - 1, y - 1, 1, 1); g.fillRect(x + ex + 1, y - 1, 1, 1); } rect(g, x - 2, y + 3, 5, 1, '#000'); rect(g, x - 3, y + 4, 1, 1, '#000'); rect(g, x + 3, y + 4, 1, 1, '#000'); }
  else if (st === 'win') { rect(g, x - 5, y - 3, 4, 2, '#000'); rect(g, x + 1, y - 3, 4, 2, '#000'); rect(g, x - 5, y - 3, 10, 1, '#000'); rect(g, x - 3, y + 3, 7, 1, '#000'); rect(g, x - 4, y + 2, 1, 1, '#000'); rect(g, x + 4, y + 2, 1, 1, '#000'); }
  else { rect(g, x - 3, y - 3, 2, 2, '#000'); rect(g, x + 2, y - 3, 2, 2, '#000'); if (st === 'o') circle(g, x + 0.5, y + 3, 1.6, '#000'); else { rect(g, x - 3, y + 3, 7, 1, '#000'); rect(g, x - 4, y + 2, 1, 1, '#000'); rect(g, x + 4, y + 2, 1, 1, '#000'); } }
}
const demineur = {
  id: 'demineur', title: 'Démineur', color: '#ccc',
  init(G) {
    const n = DM.cols * DM.rows;
    G.mine = new Uint8Array(n); G.rev = new Uint8Array(n); G.flag = new Uint8Array(n);
    G.first = true; G.cx = 8; G.cy = 5; G.elapsed = 0; G.end = null; G.endT = 0; G.boom = -1; G.revCount = 0; G.aiTarget = -1;
  },
  step(G) {
    if (G.end) { if (++G.endT > 100) G.gameOver(G.end === 'win' ? 'GAGNÉ !' : 'BOUM !'); return; }
    if (!G.first) G.elapsed++;
    if (G.rep('left')) G.cx = (G.cx + DM.cols - 1) % DM.cols;
    if (G.rep('right')) G.cx = (G.cx + 1) % DM.cols;
    if (G.rep('up')) G.cy = (G.cy + DM.rows - 1) % DM.rows;
    if (G.rep('down')) G.cy = (G.cy + 1) % DM.rows;
    const i = G.cy * DM.cols + G.cx;
    if (G.hit('a')) dmReveal(G, i, true);
    if (G.hit('b') && !G.rev[i]) G.flag[i] ^= 1;
  },
  ai(G) {
    if (G.end || G.tick % 4) return;
    if (G.aiTarget < 0 || G.rev[G.aiTarget]) {
      const opts = [];
      for (let i = 0; i < G.rev.length; i++) if (!G.rev[i] && !G.flag[i] && (G.first || !G.mine[i])) opts.push(i);
      G.aiTarget = opts.length ? opts[(G.rnd() * opts.length) | 0] : -1;
      if (G.aiTarget < 0) return;
    }
    const tx = G.aiTarget % DM.cols, ty = (G.aiTarget / DM.cols) | 0;
    if (tx < G.cx) G.press('left'); else if (tx > G.cx) G.press('right');
    else if (ty < G.cy) G.press('up'); else if (ty > G.cy) G.press('down');
    else G.press('a');
  },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#008080');
    rect(g, 14, 6, 228, 182, '#c0c0c0'); frame(g, 14, 6, 228, 182, '#000');
    rect(g, 15, 7, 226, 11, '#000080'); drawText(g, 'DÉMINEUR', W / 2, 9, '#fff', 1, 'center');
    rect(g, 18, 22, 220, 24, '#c0c0c0'); frame(g, 18, 22, 220, 24, '#808080');
    const flags = G.flag.reduce((a, b) => a + b, 0);
    rect(g, 24, 26, 40, 16, '#000'); drawText(g, pad(Math.max(0, DM.mines - flags), 3), 27, 27, '#f00', 2);
    rect(g, 192, 26, 40, 16, '#000'); drawText(g, pad(Math.min(999, Math.floor(G.elapsed / 60)), 3), 195, 27, '#f00', 2);
    dmSmiley(g, W / 2, 34, G.end === 'lose' ? 'lose' : G.end === 'win' ? 'win' : G.held.a ? 'o' : '');
    rect(g, DM.ox - 3, DM.oy - 3, DM.cols * DM.cs + 6, DM.rows * DM.cs + 6, '#808080');
    rect(g, DM.ox, DM.oy, DM.cols * DM.cs, DM.rows * DM.cs, '#bdbdbd');
    const tile = dmTile();
    for (let y = 0; y < DM.rows; y++) for (let x = 0; x < DM.cols; x++) {
      const i = y * DM.cols + x, px = DM.ox + x * DM.cs, py = DM.oy + y * DM.cs;
      if (!G.rev[i]) { g.drawImage(tile, px, py); if (G.flag[i]) dmFlag(g, px, py); continue; }
      rect(g, px, py, DM.cs, 1, '#7b7b7b'); rect(g, px, py, 1, DM.cs, '#7b7b7b');
      if (G.mine[i]) { if (i === G.boom) rect(g, px + 1, py + 1, DM.cs - 1, DM.cs - 1, '#f00'); dmMine(g, px, py); continue; }
      const n = dmCount(G, i);
      if (n) drawText(g, String(n), px + 4, py + 3, DM_NUM[n]);
    }
    if (!G.end && (G.tick >> 4) & 1) frame(g, DM.ox + G.cx * DM.cs - 1, DM.oy + G.cy * DM.cs - 1, DM.cs + 2, DM.cs + 2, '#e00', 2);
    else if (!G.end) frame(g, DM.ox + G.cx * DM.cs, DM.oy + G.cy * DM.cs, DM.cs, DM.cs, '#000');
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#008080');
    const tile = dmTile();
    for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) {
      const px = 89 + x * 13, py = 64 + y * 13;
      if (hash(x + y * 6 + ((G.tick / 50) | 0)) > 0.4) g.drawImage(tile, px, py);
      else { rect(g, px, py, 13, 13, '#bdbdbd'); const n = 1 + ((hash(x * 3 + y) * 3) | 0); drawText(g, String(n), px + 4, py + 3, DM_NUM[n]); }
    }
  },
};

// ═════════════════════════ L'OISEAU ═════════════════════════
const BIRD = [
  ['.....KKKKKK.....', '...KKYYYYWWK....', '..KYYYYYWWWWK...', '.KYYYYYYWWBWK...', 'KwwwwYYYWWBWK...', 'KwwwwwYYYWWKKKK.', 'KwwwwwYYYKOOOOOK', '.KwwwYYYKOKKKKK.', '..KYYYYYYKOOOOK.', '...KKYYYYYKKKK..', '.....KKKKKK.....'],
  ['.....KKKKKK.....', '...KKYYYYWWK....', '..KwwwYYWWWWK...', '.KwwwwwYWWBWK...', 'KwwwwwwYWWBWK...', 'KYwwwwYYYWWKKKK.', 'KYYYYYYYYKOOOOOK', '.KYYYYYYKOKKKKK.', '..KYYYYYYKOOOOK.', '...KKYYYYYKKKK..', '.....KKKKKK.....'],
];
const BIRD_PAL = { K: '#321', Y: '#fd3', W: '#fff', B: '#000', O: '#f82', w: '#ffb' };
const oiseauBg = () => canvasOnce('oiseaubg', 512, 60, (g) => {
  const r = rng(77);
  for (let x = 0; x < 512;) {
    const bw = 18 + ((r() * 30) | 0), bh = 14 + ((r() * 40) | 0);
    g.fillStyle = '#1a2240'; g.fillRect(x, 60 - bh, bw, bh);
    g.fillStyle = '#e8d070';
    for (let wy = 60 - bh + 4; wy < 56; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (r() < 0.25) g.fillRect(wx, wy, 2, 2);
    x += bw + 2;
  }
  g.fillStyle = '#2a3460'; g.fillRect(200, 22, 70, 38);
  g.fillStyle = '#f7c948'; g.fillRect(212, 26, 46, 7);
  g.fillStyle = '#2a3460'; g.fillRect(214, 28, 2, 3); g.fillRect(222, 28, 2, 3); g.fillRect(232, 28, 2, 3); g.fillRect(242, 28, 2, 3); g.fillRect(250, 28, 2, 3);
});
const oiseau = {
  id: 'oiseau', title: 'L\'Oiseau', color: '#fd3',
  init(G) { G.bird = { y: 90, vy: 0 }; G.pipes = []; G.started = false; G.deadT = 0; G.sp = 1.3; G.next = 40; G.gx = 0; G.bx = 0; },
  step(G) {
    const b = G.bird;
    if (G.deadT > 0) { G.deadT++; if (b.y < 167) { b.vy = Math.min(4.5, b.vy + 0.25); b.y = Math.min(167, b.y + b.vy); } if (G.deadT > 70) G.gameOver(); return; }
    const flap = G.hit('a') || G.hit('up');
    G.gx = (G.gx + G.sp) % 16; G.bx += G.sp * 0.25;
    if (!G.started) { b.y = 90 + Math.sin(G.tick * 0.1) * 4; if (flap) { G.started = true; b.vy = -2.6; } return; }
    if (flap) b.vy = -2.6;
    b.vy = Math.min(4.2, b.vy + 0.15); b.y += b.vy;
    if (b.y < 4) { b.y = 4; b.vy = 0; }
    G.next -= G.sp;
    if (G.next <= 0) { const gap = Math.max(46, 62 - G.score * 0.6), top = 22 + G.rnd() * (172 - 22 - gap - 22); G.pipes.push({ x: 262, top, bot: top + gap, passed: false }); G.next = 96; }
    for (const p of G.pipes) {
      p.x -= G.sp;
      if (!p.passed && p.x + 22 < 60) { p.passed = true; G.score++; if (G.score % 10 === 0) G.sp += 0.1; }
      if (65 > p.x && 55 < p.x + 22 && (b.y - 4 < p.top || b.y + 4 > p.bot)) G.deadT = 1;
    }
    G.pipes = G.pipes.filter((p) => p.x > -30);
    if (b.y + 5 >= 172) { b.y = 167; G.deadT = 1; }
  },
  ai(G) {
    const b = G.bird, p = G.pipes.find((q) => q.x + 22 > 50);
    const target = p ? (p.top + p.bot) / 2 + 8 : 90;
    if (b.y > target && b.vy > -0.4) G.press('a');
    if (!G.started && G.modeT > 40) G.press('a');
  },
  draw(G, g) {
    grad(g, 0, 0, W, 172, '#0b1430', '#2a3a70');
    stars(g, 0, 50, '#cde', 9);
    circle(g, 210, 34, 12, '#eee8c8'); circle(g, 215, 30, 10, '#18234a');
    const bg = oiseauBg(), ox = -(Math.floor(G.bx) % 512);
    g.drawImage(bg, ox, 112); g.drawImage(bg, ox + 512, 112);
    for (const p of G.pipes) {
      const x = Math.round(p.x);
      rect(g, x, 0, 22, p.top, '#3a3'); rect(g, x, p.bot, 22, 172 - p.bot, '#3a3');
      rect(g, x + 2, 0, 3, p.top, '#8e8'); rect(g, x + 2, p.bot, 3, 172 - p.bot, '#8e8');
      rect(g, x + 18, 0, 4, p.top, '#161'); rect(g, x + 18, p.bot, 4, 172 - p.bot, '#161');
      rect(g, x - 2, p.top - 8, 26, 8, '#4b4'); rect(g, x - 2, p.bot, 26, 8, '#4b4');
      frame(g, x - 2, p.top - 8, 26, 8, '#151'); frame(g, x - 2, p.bot, 26, 8, '#151');
    }
    rect(g, 0, 172, W, 20, '#c8a050'); rect(g, 0, 172, W, 2, '#6a4'); rect(g, 0, 174, W, 1, '#8b6');
    g.fillStyle = '#b08840';
    for (let x = -16; x < W + 16; x += 16) { const xx = Math.round(x - G.gx); g.fillRect(xx, 180, 8, 2); g.fillRect(xx + 4, 186, 8, 2); }
    const b = G.bird, f = G.deadT ? 0 : (G.tick >> 2) & 1;
    g.save(); g.translate(60, Math.round(b.y)); g.rotate(clamp(b.vy * 0.15, -0.5, 1.3)); g.drawImage(sprite('bird' + f, BIRD[f], BIRD_PAL), -8, -6); g.restore();
    drawTextS(g, String(G.score), W / 2, 12, '#fff', 3, 'center', '#000');
    if (!G.started && !G.deadT) drawTextS(g, 'ESPACE : VOLER', W / 2, 120, '#fff', 1, 'center');
    drawText(g, 'RECORD ' + Math.max(G.hs.score, G.score), W - 4, 3, '#ddd', 1, 'right');
  },
  drawTitle(G, g) {
    grad(g, 0, 0, W, H, '#0b1430', '#2a3a70');
    stars(g, G.tick, 50, '#cde', 9);
    const bg = oiseauBg(); g.drawImage(bg, -((G.tick * 0.3) % 512), 132); g.drawImage(bg, 512 - ((G.tick * 0.3) % 512), 132);
    g.drawImage(sprite('bird' + ((G.tick >> 2) & 1), BIRD[(G.tick >> 2) & 1], BIRD_PAL), 120, 78 + Math.round(Math.sin(G.tick * 0.08) * 5));
  },
};

// ═════════════════════════ TURBO HÉLIOS (course pseudo-3D) ═════════════════════════
const RT = { hor: 86, zn: 3, road: 150, len: 0 };
const RT_SECTIONS = [[400, 0], [300, 0.0006], [200, 0], [250, -0.0009], [150, 0], [300, 0.0011], [120, 0], [350, -0.0005], [250, 0.0008], [200, -0.0012], [300, 0], [200, 0.0007], [250, -0.0008], [180, 0]];
let RT_CURVE = null;
const RT_Z = new Float32Array(H), RT_P = new Float32Array(H), RT_CX = new Float32Array(H), RT_HALF = new Float32Array(H);
function rtSetup() {
  if (RT_CURVE) return;
  RT.len = RT_SECTIONS.reduce((a, s) => a + s[0], 0);
  const raw = new Float32Array(RT.len);
  let p = 0;
  for (const [l, c] of RT_SECTIONS) for (let i = 0; i < l; i++) raw[p++] = c;
  RT_CURVE = new Float32Array(RT.len);
  const win = 60;
  let acc = 0;
  for (let i = -win; i <= win; i++) acc += raw[(i + RT.len) % RT.len];
  for (let i = 0; i < RT.len; i++) { RT_CURVE[i] = acc / (2 * win + 1); acc += raw[(i + win + 1) % RT.len] - raw[(i - win + RT.len) % RT.len]; }
  for (let y = RT.hor + 1; y < H; y++) { RT_P[y] = (y - RT.hor) / (H - RT.hor); RT_Z[y] = RT.zn / RT_P[y]; }
}
const rtC = (s) => RT_CURVE[((Math.floor(s) % RT.len) + RT.len) % RT.len];
const rtSigned = (d) => { d = ((d % RT.len) + RT.len) % RT.len; return d > RT.len / 2 ? d - RT.len : d; };
const RT_CARCOL = ['#e33', '#36e', '#fd3', '#3c3', '#eee'];
function rtCarSprite(i) {
  return canvasOnce('rtcar' + i, 32, 20, (g) => {
    const c = RT_CARCOL[i % RT_CARCOL.length];
    g.fillStyle = '#111'; g.fillRect(1, 13, 7, 7); g.fillRect(24, 13, 7, 7);
    g.fillStyle = c; g.fillRect(2, 8, 28, 9); g.fillRect(6, 2, 20, 7);
    g.fillStyle = '#9cf'; g.fillRect(8, 3, 16, 5);
    g.fillStyle = '#f33'; g.fillRect(3, 10, 5, 2); g.fillRect(24, 10, 5, 2);
    g.fillStyle = '#222'; g.fillRect(11, 13, 10, 3);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, 15, 28, 2);
  });
}
function rtPlayerSprite(lean) {
  return canvasOnce('rtpl' + lean, 52, 28, (g) => {
    const o = lean * 2;
    g.fillStyle = '#111'; g.fillRect(1, 17, 10, 11); g.fillRect(41, 17, 10, 11);
    g.fillStyle = '#c11'; g.fillRect(3, 11, 46, 13);
    g.fillStyle = '#e22'; g.fillRect(9 + o, 3, 34, 9); g.fillRect(5, 11, 42, 3);
    g.fillStyle = '#7bd'; g.fillRect(12 + o, 4, 28, 6);
    g.fillStyle = '#fd3'; g.fillRect(5, 15, 8, 3); g.fillRect(39, 15, 8, 3);
    g.fillStyle = '#222'; g.fillRect(17, 18, 18, 4);
    g.fillStyle = '#fff'; g.fillRect(19, 19, 14, 2);
  });
}
const rtSkyline = () => canvasOnce('rtsky', 512, 34, (g) => {
  const r = rng(9);
  g.fillStyle = '#2a1840';
  g.beginPath(); g.moveTo(0, 34);
  for (let x = 0; x <= 512; x += 16) g.lineTo(x, 14 + Math.sin(x * 0.02) * 6 + r() * 6);
  g.lineTo(512, 34); g.fill();
  for (let x = 0; x < 512;) { const bw = 10 + ((r() * 18) | 0), bh = 6 + ((r() * 16) | 0); g.fillStyle = '#1a1030'; g.fillRect(x, 34 - bh, bw, bh); g.fillStyle = '#f8c060'; for (let i = 0; i < 3; i++) if (r() < 0.6) g.fillRect(x + 2 + ((r() * (bw - 4)) | 0), 34 - bh + 2 + ((r() * (bh - 4)) | 0), 1, 1); x += bw + 6 + ((r() * 30) | 0); }
});
function rtProp(g, type, x, y, s) {
  if (type === 0) { // palmier
    rect(g, x - s * 0.06, y - s * 1.1, Math.max(1, s * 0.12), s * 1.1, '#7a5230');
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.55; poly(g, [x, y - s * 1.1, x + Math.cos(a) * s * 0.55, y - s * 1.1 + Math.sin(a) * s * 0.3 + s * 0.12, x + Math.cos(a) * s * 0.5, y - s * 1.1 + Math.sin(a) * s * 0.3 + s * 0.2], '#2a8a3a'); }
  } else if (type === 1) { // lampadaire
    rect(g, x - Math.max(1, s * 0.03), y - s, Math.max(1, s * 0.06), s, '#556');
    rect(g, x - s * 0.15, y - s, s * 0.3, Math.max(1, s * 0.05), '#556');
    rect(g, x - s * 0.12, y - s + s * 0.05, s * 0.24, Math.max(1, s * 0.04), '#ffe9a0');
  } else { // panneau
    rect(g, x - s * 0.5, y - s * 0.9, s, s * 0.5, '#f7c948'); rect(g, x - s * 0.45, y - s * 0.86, s * 0.9, s * 0.42, '#1a3a8a');
    rect(g, x - s * 0.3, y - s * 0.4, Math.max(1, s * 0.05), s * 0.4, '#444'); rect(g, x + s * 0.25, y - s * 0.4, Math.max(1, s * 0.05), s * 0.4, '#444');
    if (s > 40) drawText(g, 'HÉLIOS', x, y - s * 0.7, '#fff', 1, 'center');
  }
}
const racer = {
  id: 'racer', title: 'Turbo Hélios', color: '#f63',
  init(G) {
    rtSetup();
    G.pos = 0; G.v = 0; G.px = 0; G.time = 60 * 60; G.cp = 1500; G.overtakes = 0; G.msg = null; G.crash = 0; G.bgx = 0; G.timeUp = false; G.endT = 0; G.steer = 0;
    const r = rng((G.rnd() * 1e6) | 0);
    G.cars = [];
    for (let i = 0; i < 14; i++) G.cars.push({ s: 120 + i * 240 + r() * 100, u: [-0.55, 0, 0.55][(r() * 3) | 0], v: 30 + r() * 25, col: i % 5, prev: undefined });
  },
  step(G) {
    const accel = G.down('up') || G.down('a'), brake = G.down('down');
    const steer = (G.down('left') ? -1 : 0) + (G.down('right') ? 1 : 0);
    G.steer = steer;
    if (G.timeUp) { G.v = Math.max(0, G.v - 30 * TICK); if (G.v <= 0 && ++G.endT > 60) { G.gameOver('TEMPS ÉCOULÉ'); return; } }
    else { if (accel) G.v += (G.v < 55 ? 20 : 8) * TICK; else G.v -= 6 * TICK; if (brake) G.v -= 35 * TICK; }
    if (Math.abs(G.px) > 1.05 && G.v > 22) G.v -= 30 * TICK;
    G.v = clamp(G.v, 0, 80);
    const vk = G.v / 80;
    G.px += steer * 2.2 * Math.min(1, vk * 1.5) * TICK;
    G.px -= rtC(G.pos + 10) * G.v * G.v * 0.1 * TICK;
    G.px = clamp(G.px, -2.2, 2.2);
    G.pos += G.v * TICK;
    G.bgx -= rtC(G.pos + 30) * G.v * 6 * TICK;
    if (!G.timeUp && --G.time <= 0) { G.time = 0; G.timeUp = true; G.endT = 0; }
    if (G.pos >= G.cp) { G.cp += 1500; if (!G.timeUp) { G.time += 25 * 60; G.msg = { t: 150, txt: 'POINT DE CONTRÔLE ! +25 S' }; } }
    if (G.msg && --G.msg.t <= 0) G.msg = null;
    for (const c of G.cars) {
      c.s += c.v * TICK;
      const ds = rtSigned(c.s - G.pos);
      if (c.prev !== undefined && Math.abs(ds) < 60) {
        if (c.prev > 0 && ds <= 0) G.overtakes++;
        else if (c.prev <= 0 && ds > 0) G.overtakes = Math.max(0, G.overtakes - 1);
      }
      c.prev = ds;
      if (ds > 0 && ds < 4.5 && Math.abs(c.u - G.px) < 0.42 && G.crash <= 0) { G.v = Math.min(G.v, c.v * 0.5); G.crash = 45; G.px += G.px >= c.u ? 0.25 : -0.25; }
    }
    if (G.crash > 0) G.crash--;
    G.score = Math.floor(G.pos / 10) + G.overtakes * 100;
  },
  ai(G) {
    G.held.up = true;
    let target = G.aiLane ?? 0;
    for (const c of G.cars) { const ds = rtSigned(c.s - G.pos); if (ds > 5 && ds < 70 && Math.abs(c.u - G.px) < 0.5) target = c.u > 0.2 ? -0.55 : c.u < -0.2 ? 0.55 : (G.rnd() < 0.5 ? -0.55 : 0.55); }
    G.aiLane = target;
    const want = target + rtC(G.pos + 20) * G.v * 0.9;
    G.held.left = G.px > want + 0.06; G.held.right = G.px < want - 0.06;
  },
  draw(G, g) {
    rtSetup();
    const hor = RT.hor;
    grad(g, 0, 0, W, hor, '#1a1046', '#e8643c');
    const sx = 128 + ((G.bgx * 0.3) % 300 + 300) % 300 - 150;
    circle(g, sx, 58, 22, '#ffcf4a');
    for (let i = 0; i < 4; i++) rect(g, sx - 24, 62 + i * 5, 48, 1 + i * 0.6, '#e8643c');
    const sky = rtSkyline(), ox = (((Math.floor(G.bgx) % 512) + 512) % 512) - 512;
    g.drawImage(sky, ox, hor - 33); g.drawImage(sky, ox + 512, hor - 33);
    let slope = 0, X = 0, prevZ = RT.zn;
    for (let y = H - 1; y > hor; y--) {
      const z = RT_Z[y], p = RT_P[y], dz = z - prevZ; prevZ = z;
      slope += rtC(G.pos + z) * dz; X += slope * dz;
      const half = p * RT.road, cx = 128 + (X - G.px) * half;
      RT_CX[y] = cx; RT_HALF[y] = half;
      const s = Math.floor((G.pos + z) / 6) & 1;
      g.fillStyle = s ? '#2a8a3a' : '#23952f'; g.fillRect(0, y, W, 1);
      const rw = Math.round(half * 1.14), l = Math.round(cx - rw);
      g.fillStyle = s ? '#d22' : '#eee'; g.fillRect(l, y, rw * 2, 1);
      const hw = Math.round(half);
      g.fillStyle = s ? '#5a5a64' : '#61616b'; g.fillRect(Math.round(cx - hw), y, hw * 2, 1);
      if (s) { const lw = Math.max(1, Math.round(half * 0.03)); g.fillStyle = '#ddd'; g.fillRect(Math.round(cx - half / 3 - lw / 2), y, lw, 1); g.fillRect(Math.round(cx + half / 3 - lw / 2), y, lw, 1); }
    }
    grad(g, 0, hor, W, 12, 'rgba(232,100,60,0.55)', 'rgba(232,100,60,0)');
    const spr = [];
    const rowFor = (dz) => { const y = Math.round(hor + (RT.zn / dz) * (H - hor)); return y > hor && y < H ? y : -1; };
    for (const c of G.cars) {
      const ds = rtSigned(c.s - G.pos);
      if (ds <= RT.zn || ds > 150) continue;
      const y = rowFor(ds); if (y < 0) continue;
      spr.push({ d: ds, f: () => { const w = Math.max(2, RT_HALF[y] * 0.36), h = w * 0.62, x = RT_CX[y] + c.u * RT_HALF[y]; g.drawImage(rtCarSprite(c.col), Math.round(x - w / 2), Math.round(y - h), Math.round(w), Math.max(1, Math.round(h))); } });
    }
    const k0 = Math.floor((G.pos + RT.zn) / 40) + 1, k1 = Math.floor((G.pos + 150) / 40);
    for (let k = k0; k <= k1; k++) {
      const ds = k * 40 - G.pos, y = rowFor(ds); if (y < 0) continue;
      const side = k % 2 ? 1 : -1, type = (hash(k) * 3) | 0;
      spr.push({ d: ds, f: () => rtProp(g, type, RT_CX[y] + side * RT_HALF[y] * 1.55, y, RT_HALF[y] * 0.9) });
    }
    spr.sort((a, b) => b.d - a.d);
    for (const s of spr) s.f();
    const shake = Math.abs(G.px) > 1.05 && G.v > 5 ? ((G.tick >> 1) & 1) : 0;
    if (!(G.crash > 0 && (G.crash >> 2) & 1)) g.drawImage(rtPlayerSprite(G.steer), 102, 162 + shake);
    rect(g, 0, 0, W, 16, 'rgba(0,0,0,0.55)');
    drawText(g, 'SCORE ' + pad(G.score, 5), 4, 4, '#fff');
    drawText(g, Math.round(G.v * 3.6) + ' KM/H', W - 4, 4, '#fff', 1, 'right');
    const secs = Math.ceil(G.time / 60);
    drawTextS(g, String(secs), W / 2, 20, secs <= 10 && (G.tick >> 4) & 1 ? '#f33' : '#ff5', 3, 'center');
    drawText(g, 'TEMPS', W / 2, 4, '#ff5', 1, 'center');
    rect(g, 98, 44, 60, 3, '#333'); rect(g, 98, 44, Math.round(60 * clamp(1 - (G.cp - G.pos) / 1500, 0, 1)), 3, '#3f6');
    if (G.msg && (G.tick >> 3) & 1) drawTextS(g, G.msg.txt, W / 2, 56, '#3ff', 1, 'center');
    if (G.timeUp) drawTextS(g, 'TEMPS ÉCOULÉ', W / 2, 70, '#f33', 2, 'center');
  },
  drawTitle(G, g) {
    rtSetup();
    grad(g, 0, 0, W, 110, '#1a1046', '#e8643c');
    circle(g, 128, 92, 30, '#ffcf4a');
    for (let i = 0; i < 5; i++) rect(g, 96, 92 + i * 5, 64, 1 + i * 0.6, '#e8643c');
    rect(g, 0, 110, W, 82, '#23952f');
    for (let y = 111; y < H; y++) { const p = (y - 110) / 82, half = p * 140, s = Math.floor((G.tick * 2 + 40 / p) / 8) & 1; rect(g, 128 - half * 1.12, y, half * 2.24, 1, s ? '#d22' : '#eee'); rect(g, 128 - half, y, half * 2, 1, '#5a5a64'); if (s) rect(g, 127, y, Math.max(1, half * 0.04), 1, '#ddd'); }
  },
};

// ═════════════════════════ SUPER GARDIEN (plateformes) ═════════════════════════
const PF_GUARD = [
  ['...NNNNN....', '..NNNNNNN...', '....SSSS....', '....SKSK....', '....SSSS....', '...BBBBBB...', '..BBBBBBBYY.', '..SBBBBBB...', '...BBBBBB...', '...GGGGGG...', '...PPPPPP...', '...PP..PP...', '...PP..PP...', '...PP..PP...', '..KKK..KKK..', '............'],
  ['...NNNNN....', '..NNNNNNN...', '....SSSS....', '....SKSK....', '....SSSS....', '...BBBBBB...', '..BBBBBBBYY.', '..SBBBBBB...', '...BBBBBB...', '...GGGGGG...', '...PPPPPP...', '..PPP..PP...', '.PP.....PP..', '.PP......PP.', 'KK.......KK.', '............'],
];
const PF_PAL = { N: '#1a2a6a', S: '#e8b896', K: '#111', B: '#3a5fa8', Y: '#ffe36a', G: '#c8a030', P: '#22283a' };
const PF_MAN = [
  ['...EEEE...', '..EEEEEE..', '..EEEEEE..', '...EEEE...', '....EE....', '.EEEEEEEE.', 'EEEEEEEEEE', 'EE.EEEE.EE', 'EE.EEEE.EE', 'EE.EEEE.EE', 'E..EEEE..E', '...EEEE...', '...DDDD...', '...EEEE...', '...EEEE...', '...EE.EE..', '...EE.EE..', '...EE.EE..', '...EE.EE..', '...EE.EE..', '...EE.EE..', '...EE.EE..', '..EEE.EEE.', '....GG....'],
  ['...EEEE...', '..EEEEEE..', '..EEEEEE..', '...EEEE...', '....EE....', '.EEEEEEEE.', 'EEEEEEEEEE', 'EE.EEEE.EE', '.EEEEEE.EE', '.EEEEEE..E', '..EEEEE...', '...EEEE...', '...DDDD...', '...EEEE...', '..EEEEEE..', '..EE..EE..', '..EE...EE.', '.EE....EE.', '.EE.....EE', 'EE......EE', 'EE.......E', 'E........E', 'EE.......E', '....GG....'],
];
const PF_MAN_PAL = { E: '#e8dcc8', D: '#b0a080', G: '#666' };
const PF_KEY = ['..YYY.......', '.Y...Y......', '.Y...YYYYYYY', '.Y...Y...Y.Y', '..YYY.......'];
function pfTile(v, top) {
  return canvasOnce('pft' + v + (top ? 't' : ''), 16, 16, (g) => {
    if (v === 1) {
      g.fillStyle = top ? '#8a7a64' : '#5a4e40'; g.fillRect(0, 0, 16, 16);
      if (top) { g.fillStyle = '#d8ccb0'; g.fillRect(0, 0, 8, 3); g.fillStyle = '#3a3a3a'; g.fillRect(8, 0, 8, 3); g.fillStyle = '#6a5c4a'; g.fillRect(0, 3, 16, 1); }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
    } else if (v === 2) {
      g.fillStyle = '#a0703a'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#6a4420'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
      g.fillRect(1, 7, 14, 2); g.fillStyle = '#c89050'; g.fillRect(2, 2, 12, 1); g.fillRect(2, 10, 12, 1);
    } else {
      g.fillStyle = '#8a96a8'; g.fillRect(0, 0, 16, 5); g.fillStyle = '#c8d0dc'; g.fillRect(0, 0, 16, 1); g.fillStyle = '#4a5260'; g.fillRect(0, 4, 16, 1); g.fillRect(2, 5, 2, 11); g.fillRect(12, 5, 2, 11);
    }
  });
}
const pfBg = () => canvasOnce('pfbg', 512, 150, (g) => {
  const r = rng(5);
  g.fillStyle = '#1d1830'; g.fillRect(0, 0, 512, 150);
  for (let x = 0; x < 512; x += 64) {
    g.fillStyle = '#28223e'; g.fillRect(x + 4, 30, 56, 100);
    g.fillStyle = r() < 0.5 ? '#3a3050' : '#2e2846'; g.fillRect(x + 10, 50, 44, 60);
    g.fillStyle = ['#f7c948', '#4fc3f7', '#ce93d8', '#ff7043'][(r() * 4) | 0]; g.fillRect(x + 12, 36, 40, 8);
    g.fillStyle = '#1d1830'; g.fillRect(x + 31, 50, 2, 60);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 12, 52, 8, 56);
  }
  g.fillStyle = '#141024'; g.fillRect(0, 0, 512, 14);
  g.fillStyle = '#ffe9a0'; for (let x = 20; x < 512; x += 80) g.fillRect(x, 13, 24, 2);
});
function pfGen(level) {
  const r = rng(level * 7919 + 13), w = 80 + level * 16, h = 12;
  const map = new Uint8Array(w * h), keys = [], mans = [], spots = [];
  let gy = 10;
  const ground = (x0, x1, y) => { for (let x = x0; x < x1; x++) for (let yy = y; yy < h; yy++) map[yy * w + x] = 1; };
  ground(0, 12, gy); spots.push([2, gy]);
  let x = 12;
  while (x < w - 16) {
    const k = r();
    if (k < 0.22) {
      const gw = 2 + ((r() * 2) | 0);
      keys.push([x + gw / 2 - 0.5, gy - 3]); x += gw;
      gy = clamp(gy + ((r() * 3) | 0) - 1, 8, 10);
      const len = 5 + ((r() * 4) | 0); ground(x, x + len, gy); spots.push([x + 1, gy]); x += len;
    } else if (k < 0.45) {
      const len = 9 + ((r() * 4) | 0); ground(x, x + len, gy);
      const p0 = x + 2 + ((r() * 2) | 0), pw = 3 + ((r() * 2) | 0), py = gy - 3;
      for (let i = 0; i < pw; i++) map[py * w + p0 + i] = 3;
      keys.push([p0 + (pw >> 1), py - 1]); spots.push([x + 1, gy]); x += len;
    } else if (k < 0.72) {
      const len = 10 + ((r() * 4) | 0); ground(x, x + len, gy);
      mans.push({ x: (x + len - 3) * 16, y: gy * 16 - 24, minX: x * 16, maxX: (x + len) * 16, frozen: true, ph: 0 });
      spots.push([x + 1, gy]); x += len;
    } else {
      const len = 7 + ((r() * 3) | 0); ground(x, x + len, gy);
      const cx = x + 3; map[(gy - 1) * w + cx] = 2;
      if (r() < 0.5) { map[(gy - 2) * w + cx] = 2; keys.push([cx, gy - 4]); } else keys.push([cx + 2, gy - 2]);
      spots.push([x + 1, gy]); x += len;
    }
  }
  ground(x, w, gy);
  const pick = [];
  for (let i = 0; i < 5 && keys.length; i++) pick.push(keys[Math.floor((i * keys.length) / 5)]);
  while (pick.length < 5) { const s = spots[pick.length % spots.length]; pick.push([s[0] + 2, s[1] - 2]); }
  return { map, w, keys: pick, mans, spots, door: { x: w - 6, y: gy - 2 } };
}
function pfSolid(G, tx, ty) {
  if (tx < 0 || tx >= G.mw) return true;
  if (ty < 0 || ty >= 12) return false;
  return G.map[ty * G.mw + tx] > 0;
}
function pfLevel(G) {
  const L = pfGen(G.level);
  G.map = L.map; G.mw = L.w; G.door = L.door; G.spots = L.spots;
  G.keyList = L.keys.map((k) => ({ x: k[0] * 16 + 3, y: k[1] * 16 + 2, got: false }));
  G.mans = L.mans; G.need = G.keyList.length; G.got = 0; G.timeLeft = 200 * 60; G.check = L.spots[0]; G.doneT = 0; G.msg = null;
  pfRespawn(G);
}
function pfRespawn(G) {
  const s = G.check;
  G.pl = { x: s[0] * 16 + 3, y: s[1] * 16 - 14, vx: 0, vy: 0, face: 1, onG: false, coyote: 0, jbuf: 0, dead: 0, inv: 90, ph: 0 };
  for (const m of G.mans) m.x = clamp(m.x, m.minX, m.maxX - 10);
}
function pfDie(G) { const P = G.pl; if (P.dead) return; P.dead = 80; P.vy = -4; G.lives--; }
const pfHit = (a, ax, ay, aw, ah) => a.x < ax + aw && a.x + 10 > ax && a.y < ay + ah && a.y + 14 > ay;
const platformer = {
  id: 'platformer', title: 'Super Gardien', color: '#ffe36a',
  init(G) { G.level = 1; G.lives = 3; pfLevel(G); },
  step(G) {
    const P = G.pl;
    if (G.msg && --G.msg.t <= 0) G.msg = null;
    if (G.doneT > 0) { if (--G.doneT === 0) { G.level++; pfLevel(G); } return; }
    if (P.dead > 0) {
      P.vy += 0.25; P.y += P.vy;
      if (--P.dead === 0) { if (G.lives <= 0) { G.gameOver(); return; } pfRespawn(G); }
      return;
    }
    if (P.inv > 0) P.inv--;
    const L = G.down('left'), R = G.down('right');
    const target = (R ? 1.7 : 0) - (L ? 1.7 : 0);
    P.vx += clamp(target - P.vx, -0.18, 0.18);
    if (R && !L) P.face = 1; else if (L && !R) P.face = -1;
    if (G.hit('a') || G.hit('up')) P.jbuf = 7; else if (P.jbuf > 0) P.jbuf--;
    if (P.onG) P.coyote = 6; else if (P.coyote > 0) P.coyote--;
    if (P.jbuf > 0 && P.coyote > 0) { P.vy = -5.4; P.jbuf = 0; P.coyote = 0; P.onG = false; }
    if (!(G.down('a') || G.down('up')) && P.vy < -2.2) P.vy = -2.2;
    P.vy = Math.min(5, P.vy + 0.28);
    P.x += P.vx;
    if (P.vx > 0) { const tx = Math.floor((P.x + 9.99) / 16); for (let ty = Math.floor(P.y / 16); ty <= Math.floor((P.y + 13.99) / 16); ty++) if (pfSolid(G, tx, ty)) { P.x = tx * 16 - 10; P.vx = 0; break; } }
    else if (P.vx < 0) { const tx = Math.floor(P.x / 16); for (let ty = Math.floor(P.y / 16); ty <= Math.floor((P.y + 13.99) / 16); ty++) if (pfSolid(G, tx, ty)) { P.x = (tx + 1) * 16; P.vx = 0; break; } }
    P.y += P.vy; P.onG = false;
    if (P.vy > 0) { const ty = Math.floor((P.y + 13.99) / 16); for (let tx = Math.floor(P.x / 16); tx <= Math.floor((P.x + 9.99) / 16); tx++) if (pfSolid(G, tx, ty)) { P.y = ty * 16 - 14; P.vy = 0; P.onG = true; break; } }
    else if (P.vy < 0) { const ty = Math.floor(P.y / 16); for (let tx = Math.floor(P.x / 16); tx <= Math.floor((P.x + 9.99) / 16); tx++) if (pfSolid(G, tx, ty)) { P.y = (ty + 1) * 16; P.vy = 0; break; } }
    if (Math.abs(P.vx) > 0.3 && P.onG) P.ph += Math.abs(P.vx) * 0.12;
    if (P.y > 12 * 16 + 16) { pfDie(G); return; }
    for (const s of G.spots) if (s[0] * 16 < P.x && s[0] > G.check[0] && P.onG) G.check = s;
    for (const m of G.mans) {
      const dx = (P.x + 5) - (m.x + 5);
      const facing = dx !== 0 && P.face === -Math.sign(dx);
      m.frozen = facing || Math.abs(dx) > 200;
      if (!m.frozen) { m.x = clamp(m.x + Math.sign(dx) * 0.55, m.minX, m.maxX - 10); m.ph += 0.15; }
      if (P.inv <= 0 && pfHit(P, m.x, m.y + 2, 10, 22)) { pfDie(G); return; }
    }
    for (const k of G.keyList) if (!k.got && pfHit(P, k.x - 2, k.y - 2, 14, 10)) { k.got = true; G.got++; G.score += 100; }
    const d = G.door;
    if (pfHit(P, d.x * 16, d.y * 16, 16, 32)) {
      if (G.got >= G.need) { G.score += 1000 + Math.floor(G.timeLeft / 60) * 10; G.doneT = 120; G.msg = { t: 120, txt: 'NIVEAU TERMINÉ !' }; }
      else if (!G.msg) G.msg = { t: 70, txt: 'IL MANQUE DES CLÉS !' };
    }
    if (--G.timeLeft <= 0) { G.timeLeft = 200 * 60; pfDie(G); }
  },
  ai(G) {
    const P = G.pl;
    G.held.right = true; G.held.left = false;
    const ahead = Math.floor((P.x + 22) / 16), foot = Math.floor((P.y + 14) / 16);
    const gap = !pfSolid(G, ahead, foot) && !pfSolid(G, ahead, foot + 1) && !pfSolid(G, ahead, foot + 2);
    const wall = pfSolid(G, Math.floor((P.x + 14) / 16), Math.floor((P.y + 6) / 16));
    const man = G.mans.some((m) => m.x - P.x > 0 && m.x - P.x < 36 && Math.abs(m.y + 10 - P.y) < 30);
    const key = G.keyList.some((k) => !k.got && k.x - P.x > 0 && k.x - P.x < 20 && k.y < P.y - 8);
    if ((gap || wall || man || key) && P.onG) G.press('a');
    G.held.a = !P.onG && P.vy < 0;
  },
  draw(G, g) {
    const P = G.pl, camX = clamp(Math.round(P.x - 110), 0, G.mw * 16 - W);
    const bg = pfBg(), bo = -(Math.floor(camX * 0.4) % 512);
    g.drawImage(bg, bo, 0); g.drawImage(bg, bo + 512, 0);
    rect(g, 0, 150, W, 42, '#141020');
    const t0 = Math.floor(camX / 16), t1 = Math.min(G.mw - 1, t0 + 17);
    for (let ty = 0; ty < 12; ty++) for (let tx = t0; tx <= t1; tx++) {
      const v = G.map[ty * G.mw + tx];
      if (v) g.drawImage(pfTile(v, v === 1 && (ty === 0 || !G.map[(ty - 1) * G.mw + tx])), tx * 16 - camX, ty * 16);
    }
    const d = G.door, dx = d.x * 16 - camX, dy = d.y * 16;
    rect(g, dx - 2, dy - 2, 20, 34, '#555'); rect(g, dx, dy, 16, 32, G.got >= G.need ? '#3a8a3a' : '#6a2a2a'); rect(g, dx + 11, dy + 16, 2, 2, '#ff5');
    drawText(g, 'SORTIE', dx + 8, dy - 12, G.got >= G.need ? '#6f6' : '#f66', 1, 'center');
    for (const k of G.keyList) if (!k.got) g.drawImage(sprite('pfkey', PF_KEY, { Y: '#ffd23a' }), k.x - camX - 1, k.y + Math.round(Math.sin(G.tick * 0.1 + k.x) * 2));
    for (const m of G.mans) {
      const spr = sprite('pfman' + (m.frozen ? 0 : ((m.ph | 0) & 1)), PF_MAN[m.frozen ? 0 : ((m.ph | 0) & 1)], PF_MAN_PAL);
      g.drawImage((m.x + 5) > (P.x + 5) ? mirrored('pfmanm' + (m.frozen ? 0 : ((m.ph | 0) & 1)), spr) : spr, Math.round(m.x - camX), Math.round(m.y));
    }
    if (!P.dead) {
      g.globalAlpha = 0.13;
      const bx = P.x - camX + (P.face > 0 ? 11 : -1), by = P.y + 7;
      poly(g, [bx, by, bx + P.face * 80, by - 22, bx + P.face * 80, by + 22], '#ffe9a0');
      g.globalAlpha = 1;
    }
    if (!(P.inv > 0 && (G.tick >> 2) & 1)) {
      const f = P.onG ? ((P.ph | 0) & 1) : 1;
      const spr = sprite('pfg' + f, PF_GUARD[f], PF_PAL);
      g.drawImage(P.face < 0 ? mirrored('pfgm' + f, spr) : spr, Math.round(P.x - camX - 1), Math.round(P.y - 2));
    }
    const vg = g.createRadialGradient(128, 96, 60, 128, 96, 190);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    rect(g, 0, 0, W, 13, 'rgba(0,0,0,0.6)');
    drawText(g, 'SCORE ' + pad(G.score, 5), 4, 3, '#fff');
    g.drawImage(sprite('pfkey', PF_KEY, { Y: '#ffd23a' }), 100, 4); drawText(g, G.got + '/' + G.need, 116, 3, '#ffd23a');
    drawText(g, 'T ' + Math.ceil(G.timeLeft / 60), 158, 3, '#aaa');
    drawText(g, '♥'.repeat(Math.max(0, G.lives)), W - 4, 3, '#f55', 1, 'right');
    if (G.msg) drawTextS(g, G.msg.txt, W / 2, 60, '#fff', 1, 'center');
  },
  drawTitle(G, g) {
    const bg = pfBg(); g.drawImage(bg, -((G.tick * 0.4) % 512), 0); g.drawImage(bg, 512 - ((G.tick * 0.4) % 512), 0);
    rect(g, 0, 0, W, H, 'rgba(10,8,20,0.55)');
    rect(g, 0, 150, W, 42, '#141020');
    for (let x = 0; x < W; x += 16) g.drawImage(pfTile(1, true), x, 176);
    const f = (G.tick >> 3) & 1, gx = ((G.tick * 0.8) % 300) - 30;
    g.drawImage(sprite('pfg' + f, PF_GUARD[f], PF_PAL), Math.round(gx), 162);
    g.drawImage(sprite('pfman0', PF_MAN[0], PF_MAN_PAL), 200, 152);
    drawTextS(g, 'NE LEUR TOURNEZ PAS LE DOS', W / 2, 70, '#e8dcc8', 1, 'center');
  },
};

// ═════════════════════════ SIMON ═════════════════════════
const SIMON_COL = [['#074', '#3f7'], ['#700', '#f44'], ['#760', '#ff4'], ['#037', '#4af']];
const simon = {
  id: 'simon', title: 'Simon', color: '#f44',
  keymap: { Digit1: 'p0', Digit2: 'p1', Digit3: 'p2', Digit4: 'p3', Numpad1: 'p0', Numpad2: 'p1', Numpad3: 'p2', Numpad4: 'p3' },
  init(G) { G.seq = [(G.rnd() * 4) | 0]; G.ph = 'wait'; G.pt = 50; G.idx = 0; G.lit = -1; G.litT = 0; },
  step(G) {
    if (G.litT > 0 && --G.litT === 0) G.lit = -1;
    switch (G.ph) {
      case 'wait': if (--G.pt <= 0) { G.ph = 'show'; G.idx = 0; G.pt = 0; } break;
      case 'show': {
        const on = Math.max(10, 26 - G.seq.length);
        if (G.pt === 0) { G.lit = G.seq[G.idx]; G.litT = on; }
        if (++G.pt >= on + 8) { G.pt = 0; if (++G.idx >= G.seq.length) { G.ph = 'input'; G.idx = 0; } }
        break;
      }
      case 'input': {
        G.pt++;
        let p = -1;
        const m = { up: 0, right: 1, down: 2, left: 3, p0: 0, p1: 1, p2: 2, p3: 3 };
        for (const k in m) if (G.hit(k)) p = m[k];
        if (p >= 0) {
          G.lit = p; G.litT = 12; G.pt = 0;
          if (p === G.seq[G.idx]) { if (++G.idx >= G.seq.length) { G.score = G.seq.length; G.seq.push((G.rnd() * 4) | 0); G.ph = 'wait'; G.pt = 45; } }
          else { G.ph = 'fail'; G.pt = 0; }
        } else if (G.pt > 330) { G.ph = 'fail'; G.pt = 0; }
        break;
      }
      case 'fail': if (++G.pt > 100) G.gameOver('ERREUR !'); break;
    }
  },
  ai(G) { if (G.ph === 'input' && G.pt % 18 === 17) G.press(['up', 'right', 'down', 'left'][G.seq[G.idx]]); },
  draw(G, g) {
    rect(g, 0, 0, W, H, '#14101c');
    const cx = 128, cy = 102;
    circle(g, cx, cy, 82, '#2a2a30'); circle(g, cx, cy, 79, '#0c0c10');
    const fail = G.ph === 'fail' && (G.pt >> 3) & 1;
    for (let i = 0; i < 4; i++) {
      const a0 = -Math.PI * 0.75 + i * Math.PI / 2 + 0.07, a1 = a0 + Math.PI / 2 - 0.14;
      g.fillStyle = fail ? '#f22' : SIMON_COL[i][G.lit === i ? 1 : 0];
      g.beginPath(); g.arc(cx, cy, 75, a0, a1); g.arc(cx, cy, 28, a1, a0, true); g.closePath(); g.fill();
      const am = (a0 + a1) / 2;
      drawText(g, String(i + 1), cx + Math.cos(am) * 52, cy + Math.sin(am) * 52 - 3, G.lit === i ? '#000' : '#bbb', 1, 'center');
    }
    circle(g, cx, cy, 24, '#2a2a30');
    drawText(g, 'SIMON', cx, cy - 8, '#ddd', 1, 'center');
    drawText(g, String(G.seq.length), cx, cy + 3, '#ff5', 1, 'center');
    const st = G.ph === 'show' || G.ph === 'wait' ? 'REGARDEZ…' : G.ph === 'input' ? 'À VOUS !' : 'ERREUR !';
    drawText(g, st, cx, 184, G.ph === 'fail' ? '#f44' : '#fff', 1, 'center');
    hud2(g, 'SÉRIE ' + G.score, 'RECORD ' + Math.max(G.hs.score, G.score));
  },
  drawTitle(G, g) {
    rect(g, 0, 0, W, H, '#14101c');
    const lit = ((G.tick / 20) | 0) % 4;
    for (let i = 0; i < 4; i++) {
      const a0 = -Math.PI * 0.75 + i * Math.PI / 2 + 0.07, a1 = a0 + Math.PI / 2 - 0.14;
      g.fillStyle = SIMON_COL[i][lit === i ? 1 : 0];
      g.beginPath(); g.arc(128, 96, 44, a0, a1); g.arc(128, 96, 16, a1, a0, true); g.closePath(); g.fill();
    }
  },
};

// ═════════════════════════ MACHINE À PINCES ═════════════════════════
const CLAW_KINDS = ['bear', 'bunny', 'duck', 'cat', 'bobby', 'heart', 'bear', 'bunny', 'duck', 'bear', 'cat', 'heart', 'bobby', 'bunny', 'bear', 'duck'];
function clawPrize(g, p) {
  const x = Math.round(p.x), y = Math.round(p.y);
  switch (p.k) {
    case 'bear': case 'bobby': {
      const c = p.k === 'bobby' ? '#a0622d' : '#c08850';
      ellipse(g, x, y - 5, 8, 6, c); circle(g, x, y - 13, 6, c); circle(g, x - 5, y - 18, 2.5, c); circle(g, x + 5, y - 18, 2.5, c);
      ellipse(g, x, y - 11, 3, 2.2, '#e8c090'); rect(g, x - 3, y - 15, 1, 2, '#000'); rect(g, x + 2, y - 15, 1, 2, '#000'); rect(g, x - 1, y - 12, 2, 1, '#000');
      if (p.k === 'bobby') { poly(g, [x - 4, y - 8, x, y - 6.5, x - 4, y - 5], '#e22'); poly(g, [x + 4, y - 8, x, y - 6.5, x + 4, y - 5], '#e22'); rect(g, x - 5, y - 4, 10, 4, '#3a5fa8'); }
      break;
    }
    case 'bunny': ellipse(g, x, y - 5, 7, 6, '#f4f0f4'); circle(g, x, y - 12, 5, '#f4f0f4'); ellipse(g, x - 2, y - 20, 1.6, 5, '#f4f0f4'); ellipse(g, x + 2, y - 20, 1.6, 5, '#f4f0f4'); ellipse(g, x - 2, y - 20, 0.7, 3.5, '#f9c'); ellipse(g, x + 2, y - 20, 0.7, 3.5, '#f9c'); rect(g, x - 2, y - 13, 1, 1, '#000'); rect(g, x + 2, y - 13, 1, 1, '#000'); rect(g, x, y - 11, 1, 1, '#f69'); break;
    case 'duck': ellipse(g, x, y - 5, 8, 5, '#ffd83a'); circle(g, x + 3, y - 12, 4.5, '#ffd83a'); poly(g, [x + 7, y - 12, x + 11, y - 11, x + 7, y - 10], '#f80'); rect(g, x + 4, y - 14, 1, 1, '#000'); break;
    case 'cat': ellipse(g, x, y - 5, 7, 6, '#999'); circle(g, x, y - 12, 5, '#999'); poly(g, [x - 5, y - 14, x - 4, y - 20, x - 1, y - 16], '#999'); poly(g, [x + 5, y - 14, x + 4, y - 20, x + 1, y - 16], '#999'); rect(g, x - 2, y - 13, 1, 1, '#2c2'); rect(g, x + 2, y - 13, 1, 1, '#2c2'); break;
    default: circle(g, x - 4, y - 10, 5, '#e33'); circle(g, x + 4, y - 10, 5, '#e33'); poly(g, [x - 9, y - 9, x + 9, y - 9, x, y + 1], '#e33'); rect(g, x - 4, y - 13, 2, 2, '#f99');
  }
}
function clawTop(G, x) {
  let top = 176;
  for (const p of G.prizes) if (Math.abs(p.x - x) < 10) top = Math.min(top, p.y - 18);
  return top;
}
function clawDraw(g, x, y, open) {
  rect(g, x - 1, 30, 2, y - 30, '#aaa');
  rect(g, x - 5, y - 2, 10, 5, '#ccc'); rect(g, x - 5, y + 2, 10, 1, '#777');
  const a = 0.15 + open * 0.65;
  g.strokeStyle = '#ddd'; g.lineWidth = 2; g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = x + s * (3 + Math.sin(a) * 7), ey = y + 3 + Math.cos(a) * 7;
    g.beginPath(); g.moveTo(x + s * 3, y + 3); g.lineTo(ex, ey); g.lineTo(ex - s * (2 + 3 * (1 - open)), ey + 5); g.stroke();
  }
  g.strokeStyle = '#999'; g.beginPath(); g.moveTo(x, y + 3); g.lineTo(x, y + 12); g.stroke();
  g.lineCap = 'butt';
}
const claw = {
  id: 'claw', title: 'Machine à pinces', color: '#f6c', noTitle: true, noScore: true,
  init(G) {
    const r = rng(4242);
    G.prizes = [];
    for (let i = 0; i < 16; i++) G.prizes.push({ x: 80 + (i % 8) * 20 + r() * 5, y: 176 - ((i / 8) | 0) * 13 - r() * 3, k: CLAW_KINDS[i] });
    G.prizes.sort((a, b) => a.y - b.y);
    G.cx = 140; G.cy = 34; G.open = 1; G.st = 'attract'; G.stT = 0; G.used = false; G.timer = 0; G.carry = null; G.falling = null; G.won = false; G.demoRun = false; G.attractT = 300; G.chute = null;
  },
  step(G) {
    G.stT++;
    switch (G.st) {
      case 'attract':
        G.open = 1;
        G.cx += (140 + Math.sin(G.tick * 0.012) * 70 - G.cx) * 0.05;
        if (!G.used && G.pressed.has('any')) { G.used = true; G.st = 'aim'; G.timer = 20 * 60; G.stT = 0; break; }
        if (--G.attractT <= 0) { G.attractT = 540; G.demoRun = true; G.st = 'drop'; G.target = clawTop(G, G.cx) - 14; }
        break;
      case 'aim':
        if (G.down('left')) G.cx -= 1.2;
        if (G.down('right')) G.cx += 1.2;
        G.cx = clamp(G.cx, 72, 236);
        if (--G.timer <= 0 || (G.stT > 10 && (G.hit('a') || G.hit('down')))) { G.st = 'drop'; G.demoRun = false; G.target = clawTop(G, G.cx) - 14; }
        break;
      case 'drop':
        G.cy += 1.4;
        if (G.cy >= G.target) { G.cy = G.target; G.st = 'close'; G.stT = 0; }
        break;
      case 'close':
        G.open = Math.max(0, 1 - G.stT / 25);
        if (G.stT > 32) {
          let cand = null, bd = 13;
          for (const p of G.prizes) { const d = Math.abs(p.x - G.cx); if (d < bd && p.y - 18 <= G.cy + 22) { bd = d; cand = p; } }
          G.won = false; G.slip = false;
          if (cand) {
            const a = 1 - bd / 13, chance = G.demoRun ? 0 : 0.08 + 0.32 * a, roll = G.rnd();
            if (roll < chance + 0.6) {
              G.carry = cand; G.prizes.splice(G.prizes.indexOf(cand), 1); cand.restY = cand.y; G.carryOff = cand.x - G.cx; G.carryDy = cand.y - G.cy;
              if (roll < chance) G.won = true; else { G.slip = true; G.slipY = G.cy - 15 - G.rnd() * 70; }
            }
          }
          G.st = 'lift'; G.stT = 0;
        }
        break;
      case 'lift':
        G.cy -= 1;
        if (G.carry && G.slip && G.cy < Math.max(40, G.slipY)) { G.falling = G.carry; G.falling.vy = 0; G.falling.target = G.carry.restY; G.carry = null; }
        if (G.cy <= 34) { G.cy = 34; G.st = 'return'; }
        break;
      case 'return':
        G.cx -= 1.3;
        if (G.cx <= 38) { G.cx = 38; G.st = 'release'; G.stT = 0; }
        break;
      case 'release':
        G.open = Math.min(1, G.stT / 15);
        if (G.carry && G.stT === 10) { G.falling = G.carry; G.falling.vy = 0; G.falling.target = 172; G.falling.chute = true; G.carry = null; }
        if (G.stT > 80) {
          if (G.demoRun) { G.st = 'attract'; G.demoRun = false; }
          else { G.st = G.won ? 'won' : 'lost'; G.stT = 0; }
        }
        break;
      case 'won': case 'lost':
        if (G.stT > 240) { G.st = 'attract'; G.stT = 0; G.chute = null; }
        break;
    }
    if (G.carry) { G.carry.x = G.cx + G.carryOff * 0.5 + Math.sin(G.tick * 0.15) * 1.2; G.carry.y = G.cy + G.carryDy; }
    const f = G.falling;
    if (f) {
      f.vy += 0.25; f.y += f.vy;
      if (f.y >= f.target) {
        f.y = f.target; G.falling = null;
        if (f.chute) { G.chute = f; if (G.won && G.used) G.S.emit?.('claw_win', { prize: 'peluche' }); }
        else { G.prizes.push(f); G.prizes.sort((a, b) => a.y - b.y); }
      }
    }
  },
  draw(G, g) {
    grad(g, 0, 0, W, H, '#4a0c5a', '#16001e');
    g.fillStyle = 'rgba(255,120,220,0.08)';
    for (let i = 0; i < 12; i++) g.fillRect((i * 37 + G.tick * 0.1) % W, (i * 53) % 150 + 20, 3, 3);
    rect(g, 14, 178, 228, 6, '#2a0a30');
    for (const p of G.prizes) clawPrize(g, p);
    if (G.falling) clawPrize(g, G.falling);
    rect(g, 14, 118, 46, 60, 'rgba(160,220,255,0.10)');
    rect(g, 58, 118, 2, 60, '#9cf'); rect(g, 14, 118, 46, 2, '#9cf');
    if (G.chute) clawPrize(g, G.chute);
    drawText(g, 'SORTIE', 37, 124, '#9cf', 1, 'center');
    rect(g, 14, 22, 228, 4, '#888'); rect(g, 14, 22, 228, 1, '#ccc');
    rect(g, G.cx - 8, 24, 16, 7, '#666'); rect(g, G.cx - 8, 24, 16, 1, '#aaa');
    clawDraw(g, Math.round(G.cx), Math.round(G.cy), G.open);
    if (G.carry) clawPrize(g, G.carry);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    poly(g, [40, 30, 70, 30, 30, 180, 0, 180], 'rgba(255,255,255,0.05)');
    rect(g, 0, 0, W, 18, '#c2185b'); rect(g, 0, 17, W, 1, '#f8a');
    rect(g, 0, 0, 10, H, '#c2185b'); rect(g, W - 10, 0, 10, H, '#c2185b'); rect(g, 0, 184, W, 8, '#c2185b');
    for (let i = 0; i < 16; i++) circle(g, 12 + i * 15.5, 9, 2, ((i + (G.tick >> 3)) % 3) ? '#ffd' : '#f6c');
    drawTextS(g, 'ATTRAPE-PELUCHE', W / 2, 5, '#fff', 1, 'center', '#601');
    if (G.st === 'attract') {
      rect(g, 60, 60, 136, 34, 'rgba(0,0,0,0.6)');
      drawText(g, (G.tick >> 6) & 1 ? 'APPUYEZ SUR ENTRÉE' : 'INSÉREZ UN JETON', W / 2, 66, '#ff5', 1, 'center');
      drawText(g, G.used ? 'MERCI ! À BIENTÔT' : '1 JETON = 1 ESSAI', W / 2, 80, '#fff', 1, 'center');
    } else if (G.st === 'aim') {
      drawTextS(g, 'TEMPS ' + Math.ceil(G.timer / 60), W / 2, 36, G.timer < 300 && (G.tick >> 3) & 1 ? '#f44' : '#fff', 1, 'center');
      drawTextS(g, '← → : DÉPLACER   ESPACE : DESCENDRE', W / 2, 172, '#fff', 1, 'center');
    } else if (G.st === 'won') {
      drawTextS(g, 'GAGNÉ !', W / 2, 64, (G.tick >> 3) & 1 ? '#ff5' : '#f6c', 3, 'center', '#601');
      drawTextS(g, 'Récupérez votre lot dans le bac', W / 2, 96, '#fff', 1, 'center');
    } else if (G.st === 'lost') {
      drawTextS(g, 'PERDU !', W / 2, 64, '#f66', 3, 'center', '#300');
      drawTextS(g, 'Réessayez avec un autre jeton', W / 2, 96, '#fff', 1, 'center');
    }
  },
};

// ───────────────────────── Registre ─────────────────────────
export const GAME_SPECS = { glouton, invaders, pong, breakout, snake, blocs, demineur, oiseau, racer, platformer, simon, claw };

// Crée un jeu sur l'état d'écran S. opt.embedded : intégré dans un ordinateur (pas de démo, aide « retour »).
export function createGame(S, id, opt = {}) {
  const spec = GAME_SPECS[id];
  return spec ? runGame(S, spec, opt) : null;
}

export const GAME_BUILDERS = Object.fromEntries(Object.keys(GAME_SPECS).map((id) => [id, (S) => runGame(S, GAME_SPECS[id])]));
