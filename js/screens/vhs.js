// Cassettes VHS : petits films procéduraux animés (60 à 120 s, en boucle) avec surcouche magnétoscope
// (lignes de tracking, bruit, « PLAY ▶ », compteur). Trois cassettes sont des indices de l'histoire.
import { drawText, drawTextS, textWidth } from './font.js';
import {
  rect, frame, circle, ellipse, poly, line, grad, hsl, star, hash, clamp, lerp, smooth, makeCanvas,
  person, figure, corridor, vhsOverlay, drawNoise, subtitle, runScenes, scenesLength,
} from './util.js';

const W = 256, H = 192, TAU = Math.PI * 2;

// ───────────────────────── Liste (wiki) ─────────────────────────
export const VHS_TAPES = [
  { id: 'cartoon', title: 'Les Aventures de Pépito', desc: 'Dessin animé : Pépito le perroquet trouve un ballon rouge et s\'envole… jusqu\'au plouf final.' },
  { id: 'aerobic', title: 'Gym Tonic Matin', desc: 'Cours d\'aérobic des années 80 : justaucorps fluo, jambières et « ET UN, ET DEUX ! ».' },
  { id: 'cooking', title: 'La Cuisine de Mamie', desc: 'Mamie prépare des crêpes et les fait sauter. Recette comprise.' },
  { id: 'birthday', title: 'Anniversaire de Julie 1991', desc: 'Film de famille : les bougies, les cadeaux, les cris des enfants. Caméra à l\'épaule. Regardez jusqu\'au bout… ou pas.' },
  { id: 'nature', title: 'Les Loups des Vosges', desc: 'Documentaire animalier : la meute, la neige, le hurlement sous la lune.' },
  { id: 'kungfu', title: 'Le Poing du Dragon', desc: 'Film de kung-fu doublé en français : Lee affronte le Tigre Noir dans la cour du temple.' },
  { id: 'western', title: 'Le Shérif de Dodge', desc: 'Western : duel à midi devant le saloon, virevoltants et coucher de soleil.' },
  { id: 'scifi', title: 'Planète Rouge', desc: 'Science-fiction : une expédition se pose sur la planète rouge. Quelque chose l\'attend.' },
  { id: 'horror', title: 'La Nuit des Mannequins', desc: 'Film d\'horreur : les mannequins ne bougent que lorsque la caméra regarde ailleurs.' },
  { id: 'karaoke', title: 'Karaoké Party', desc: 'Paroles qui défilent et balle qui rebondit : « Au clair de la lune », « Frère Jacques », « À la claire fontaine ».' },
  { id: 'bobby_ad', title: 'Pub Royaume du Jouet 1987', desc: 'Publicité de l\'ouverture avec Bobby l\'Ourson, la mascotte. « Au Royaume du Jouet, Bobby t\'attend ! » Un numéro s\'affiche à la fin.' },
  { id: 'security_1987', title: 'CCTV 14/11/87', desc: 'Enregistrement noir et blanc d\'une caméra de surveillance, le soir de l\'inauguration. Indice de l\'histoire.', story: true },
  { id: 'gerard', title: 'Pour mon remplaçant', desc: 'Une cassette laissée par l\'ancien gardien, à regarder seul. Indice de l\'histoire.', story: true },
  { id: 'no_label', title: '(sans étiquette)', desc: 'Aucune étiquette, aucune jaquette. Gérard conseillait de ne pas la regarder.', story: true },
];

// ───────────────────────── Outils ─────────────────────────
function crossed(S, a, b) {
  const t1 = S.tapeT, t0 = S.tapePrev;
  if (t1 >= t0) return t1 >= a && t0 <= b;
  return t1 >= a || t0 <= b;
}
const sceneStart = (S, lt) => S.tapeT - lt;
const tri = (t) => 1 - Math.abs(((t % 2) + 2) % 2 - 1);

// Cadre de lecture : appelle les scènes, puis la surcouche VHS.
function tape(S, title, scenes, o = {}) {
  const total = scenesLength(scenes);
  let prev = 0;
  return {
    title, duration: total,
    update() {
      const T = S.t % total;
      S.tapeT = T; S.tapePrev = prev; S.tapeTotal = total;
      const g = S.g;
      g.save();
      runScenes(scenes, S.t, g, S);
      g.restore();
      g.globalAlpha = 1;
      if (o.post) o.post(S, T);
      vhsOverlay(S, T, { tracking: o.tracking ?? 0.4, osd: o.osd !== false });
      prev = T;
    },
  };
}

// Pantin articulé. Angles absolus en radians : 0 = vers le bas, +π/2 = vers la droite, π = vers le haut.
// p : { lean, head, dx, dy, aL:[bras, avant-bras], aR, lL:[cuisse, tibia], lR }
// st : { skin, top, bottom, shoes, hair, longHair, hat, hatColor, dress, apron, face (−1|0|1), mouth, beard, mous, glasses, band, forearm, belt }
function puppet(g, x, y, s, p = {}, st = {}) {
  const skin = st.skin || '#e8b896', top = st.top || '#3a5fa8', bot = st.bottom || '#2a2a3a', shoe = st.shoes || '#222';
  const L = (a, l) => [Math.sin(a) * l * s, Math.cos(a) * l * s];
  const hipX = x + (p.dx || 0) * s, hipY = y - 19 * s + (p.dy || 0) * s;
  const lean = p.lean || 0;
  const [tx, ty] = L(lean + Math.PI, 13);
  const nx = hipX + tx, ny = hipY + ty;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const seg = (x0, y0, a1, l1, a2, l2, c1, c2, w) => {
    const [ax, ay] = L(a1, l1), x1 = x0 + ax, y1 = y0 + ay;
    const [bx, by] = L(a2, l2), x2 = x1 + bx, y2 = y1 + by;
    g.lineWidth = w;
    g.strokeStyle = c1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = c2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    return [x2, y2];
  };
  const lw = Math.max(1.5, 3.2 * s), aw = Math.max(1.2, 2.5 * s);
  const legs = [p.lL || [0.12, 0.1], p.lR || [-0.12, -0.1]];
  for (const l of legs) {
    const [fx, fy] = seg(hipX, hipY, l[0], 9.5, l[1], 9.5, st.legs || bot, st.shin || st.legs || bot, lw);
    g.fillStyle = shoe; g.fillRect(fx - 2.2 * s, fy - 1.2 * s, 4.6 * s, 2.4 * s);
  }
  if (st.dress) poly(g, [hipX - 6 * s + tx * 0.25, hipY - 5 * s, hipX + 6 * s + tx * 0.25, hipY - 5 * s, hipX + 10 * s, hipY + 9 * s, hipX - 10 * s, hipY + 9 * s], st.dress);
  g.strokeStyle = top; g.lineWidth = Math.max(3, 8.5 * s); g.beginPath(); g.moveTo(hipX, hipY - 2 * s); g.lineTo(nx, ny + 2.5 * s); g.stroke();
  if (st.belt) rect(g, hipX - 4.5 * s, hipY - 3 * s, 9 * s, 1.6 * s, st.belt);
  if (st.apron) poly(g, [nx - 3.5 * s, ny + 4 * s, nx + 3.5 * s, ny + 4 * s, hipX + 6 * s, hipY + 7 * s, hipX - 6 * s, hipY + 7 * s], st.apron);
  if (st.badge) rect(g, nx + 1 * s, ny + 4 * s, 2 * s, 2 * s, st.badge);
  for (const a of [p.aL || [0.35, 0.2], p.aR || [-0.35, -0.2]]) {
    const [hx, hy] = seg(nx, ny + 2 * s, a[0], 7.5, a[1], 7, st.sleeve || top, st.forearm || st.sleeve || top, aw);
    circle(g, hx, hy, 1.5 * s, st.glove || skin);
  }
  const ha = lean + (p.head || 0);
  const hx = nx + Math.sin(ha) * 5.5 * s, hy = ny - Math.cos(ha) * 5.5 * s;
  if (st.longHair) { rect(g, hx - 5.4 * s, hy - 2 * s, 2.6 * s, 8.5 * s, st.hair); rect(g, hx + 2.8 * s, hy - 2 * s, 2.6 * s, 8.5 * s, st.hair); }
  circle(g, hx, hy, 4.7 * s, skin);
  const face = st.face || 0;
  if (st.hair) { g.fillStyle = st.hair; g.beginPath(); g.arc(hx + face * 0.6 * s, hy - 0.6 * s, 5 * s, Math.PI * 1.02, Math.PI * 1.98); g.fill(); if (face) rect(g, hx - face * 4.6 * s - 1 * s, hy - 2 * s, 2 * s, 4 * s, st.hair); }
  const e = Math.max(1, s * 0.9);
  if (st.noFace) { /* rien */ }
  else if (face === 0) {
    rect(g, hx - 2.2 * s, hy - 0.8 * s, e, e, '#222'); rect(g, hx + 1.3 * s, hy - 0.8 * s, e, e, '#222');
    if (st.glasses) { frame(g, hx - 3 * s, hy - 1.6 * s, 2.6 * s, 2.4 * s, st.glasses); frame(g, hx + 0.6 * s, hy - 1.6 * s, 2.6 * s, 2.4 * s, st.glasses); }
    if (st.mous) rect(g, hx - 2 * s, hy + 1.4 * s, 4 * s, 1.1 * s, st.mous);
    if (st.mouth) rect(g, hx - 1.3 * s, hy + 2.5 * s, 2.6 * s, Math.max(1, st.mouth * s), '#7a2a2a');
  } else {
    rect(g, hx + face * 2 * s, hy - 0.8 * s, e, e, '#222');
    rect(g, hx + face * 4.4 * s - (face < 0 ? 1.2 * s : 0), hy + 0.2 * s, 1.2 * s, 1.4 * s, skin);
    if (st.mous) rect(g, hx + face * 2.5 * s - 1.2 * s, hy + 1.6 * s, 2.6 * s, 1 * s, st.mous);
    if (st.mouth) rect(g, hx + face * 2.6 * s - 0.8 * s, hy + 2.6 * s, 1.8 * s, Math.max(1, st.mouth * s), '#7a2a2a');
  }
  if (st.band) rect(g, hx - 4.8 * s, hy - 3.2 * s, 9.6 * s, 1.5 * s, st.band);
  const hc = st.hatColor || '#333';
  switch (st.hat) {
    case 'cowboy': ellipse(g, hx, hy - 3.6 * s, 8.5 * s, 1.6 * s, hc); rect(g, hx - 4 * s, hy - 8 * s, 8 * s, 4.6 * s, hc); rect(g, hx - 4 * s, hy - 4.8 * s, 8 * s, 1 * s, '#000'); break;
    case 'bowler': ellipse(g, hx, hy - 3.6 * s, 6.5 * s, 1.3 * s, hc); g.fillStyle = hc; g.beginPath(); g.arc(hx, hy - 3.8 * s, 4.4 * s, Math.PI, 0); g.fill(); break;
    case 'chef': rect(g, hx - 4.5 * s, hy - 10 * s, 9 * s, 7 * s, '#f4f4f4'); circle(g, hx, hy - 10 * s, 4.5 * s, '#f4f4f4'); break;
    case 'bun': circle(g, hx, hy - 6 * s, 2.6 * s, st.hair || '#ccc'); break;
    case 'kepi': rect(g, hx - 4.5 * s, hy - 7.5 * s, 9 * s, 4 * s, hc); rect(g, hx - 1 * s + face * 3 * s, hy - 3.8 * s, 6 * s * Math.abs(face || 0.6), 1.2 * s, '#111'); break;
    case 'helmet': g.strokeStyle = '#eef'; g.lineWidth = Math.max(1, 1.2 * s); g.beginPath(); g.arc(hx, hy, 6.8 * s, 0, TAU); g.stroke(); g.fillStyle = 'rgba(160,200,255,0.25)'; g.fill(); break;
    case 'crown': poly(g, [hx - 4 * s, hy - 4 * s, hx - 4 * s, hy - 8 * s, hx - 2 * s, hy - 6 * s, hx, hy - 9 * s, hx + 2 * s, hy - 6 * s, hx + 4 * s, hy - 8 * s, hx + 4 * s, hy - 4 * s], hc); break;
  }
  return { hx, hy, nx, ny };
}

// Bobby l'Ourson (mascotte du Royaume du Jouet), vue de face.
// o : { look (−1..1 : regard/tête vers la gauche/droite, 0 = face caméra), armL, armR, bounce, gray, pupil, tilt, smile }
function bobby(g, x, y, s, o = {}) {
  const gr = o.gray;
  const fur = gr ? '#8a8a8a' : '#a0622d', lt = gr ? '#c4c4c4' : '#e3b47e', dk = gr ? '#3a3a3a' : '#4a2810';
  const tie = gr ? '#5a5a5a' : '#e02020', over = gr ? '#6a6a6a' : '#2a4aa8';
  const b = (o.bounce || 0) * s;
  ellipse(g, x - 6 * s, y - 2 * s, 6 * s, 3 * s, dk); ellipse(g, x + 6 * s, y - 2 * s, 6 * s, 3 * s, dk);
  rect(g, x - 10 * s, y - 16 * s, 8 * s, 14 * s, fur); rect(g, x + 2 * s, y - 16 * s, 8 * s, 14 * s, fur);
  ellipse(g, x, y - 28 * s + b, 14 * s, 15 * s, fur);
  ellipse(g, x, y - 26 * s + b, 8 * s, 9 * s, lt);
  rect(g, x - 11 * s, y - 24 * s + b, 22 * s, 11 * s, over);
  rect(g, x - 9 * s, y - 38 * s + b, 3 * s, 15 * s, over); rect(g, x + 6 * s, y - 38 * s + b, 3 * s, 15 * s, over);
  circle(g, x - 7.5 * s, y - 22 * s + b, 1.3 * s, gr ? '#ddd' : '#ffd23a'); circle(g, x + 7.5 * s, y - 22 * s + b, 1.3 * s, gr ? '#ddd' : '#ffd23a');
  g.lineCap = 'round';
  for (const [side, a] of [[-1, o.armL ?? -0.4], [1, o.armR ?? 0.4]]) {
    const sx = x + side * 12 * s, sy = y - 36 * s + b;
    const ex = sx + Math.sin(a) * 15 * s, ey = sy + Math.cos(a) * 15 * s;
    g.strokeStyle = fur; g.lineWidth = 7 * s; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    circle(g, ex, ey, 4 * s, lt);
  }
  const look = o.look || 0, hy = y - 52 * s + b, hx = x + look * 2 * s;
  g.save(); g.translate(hx, hy); g.rotate(o.tilt || 0);
  circle(g, -9.5 * s + look * 1.5 * s, -9 * s, 5 * s, fur); circle(g, 9.5 * s + look * 1.5 * s, -9 * s, 5 * s, fur);
  circle(g, -9.5 * s + look * 1.5 * s, -9 * s, 2.6 * s, lt); circle(g, 9.5 * s + look * 1.5 * s, -9 * s, 2.6 * s, lt);
  circle(g, 0, 0, 12.5 * s, fur);
  const fx = look * 5 * s;
  ellipse(g, fx, 4 * s, 6 * s, 4.6 * s, lt);
  ellipse(g, fx, 1.6 * s, 2.4 * s, 1.7 * s, dk);
  const pu = (o.pupil ?? 1.7) * s;
  for (const ex of [-4.5, 4.5]) {
    ellipse(g, fx + ex * s, -3 * s, 2.6 * s, 3 * s, '#fff');
    circle(g, fx + ex * s + look * 0.8 * s, -2.6 * s, pu, '#111');
  }
  if (o.smile !== false) { g.strokeStyle = dk; g.lineWidth = Math.max(1, s); g.beginPath(); g.arc(fx, 4.5 * s, 3 * s, 0.25, Math.PI - 0.25); g.stroke(); }
  g.restore();
  poly(g, [x - 6 * s, y - 42 * s + b, x, y - 40 * s + b, x - 6 * s, y - 38 * s + b], tie);
  poly(g, [x + 6 * s, y - 42 * s + b, x, y - 40 * s + b, x + 6 * s, y - 38 * s + b], tie);
  circle(g, x, y - 40 * s + b, 1.6 * s, tie);
}

// Lucie / petite fille en robe. o : { dress, walk (phase), armL, armR, gray, face (false = de dos), bow }
function girl(g, x, y, s, o = {}) {
  const gr = o.gray;
  const skin = gr ? '#bbb' : '#f0c8a8', dress = o.dress || (gr ? '#6e6e6e' : '#d01c1c'), hair = gr ? '#333' : '#5a3418';
  const w = o.walk !== undefined ? Math.sin(o.walk) * 2.2 * s : 0;
  rect(g, x - 2.6 * s, y - 9 * s, 1.8 * s, 9 * s + w, skin); rect(g, x + 0.8 * s, y - 9 * s, 1.8 * s, 9 * s - w, skin);
  rect(g, x - 3.2 * s, y - 1 * s + w, 2.6 * s, 1.4 * s, '#111'); rect(g, x + 0.6 * s, y - 1 * s - w, 2.6 * s, 1.4 * s, '#111');
  poly(g, [x - 3 * s, y - 20 * s, x + 3 * s, y - 20 * s, x + 6 * s, y - 8 * s, x - 6 * s, y - 8 * s], dress);
  g.lineCap = 'round'; g.lineWidth = Math.max(1, 1.5 * s);
  for (const [side, a] of [[-1, o.armL ?? -0.3], [1, o.armR ?? 0.3]]) {
    const sx = x + side * 3 * s, sy = y - 19 * s;
    g.strokeStyle = skin; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.sin(a) * 7 * s, sy + Math.cos(a) * 7 * s); g.stroke();
  }
  rect(g, x - 1 * s, y - 22 * s, 2 * s, 2.5 * s, skin);
  if (o.face === false) { circle(g, x, y - 25 * s, 4 * s, hair); rect(g, x - 4 * s, y - 25 * s, 8 * s, 6 * s, hair); }
  else {
    circle(g, x, y - 25.5 * s, 4 * s, skin);
    g.fillStyle = hair; g.beginPath(); g.arc(x, y - 26 * s, 4.3 * s, Math.PI, 0); g.fill();
    rect(g, x - 4.6 * s, y - 26 * s, 1.6 * s, 5 * s, hair); rect(g, x + 3 * s, y - 26 * s, 1.6 * s, 5 * s, hair);
    if (s >= 1) { rect(g, x - 1.8 * s, y - 25.8 * s, Math.max(1, 0.8 * s), Math.max(1, 0.8 * s), '#222'); rect(g, x + 1 * s, y - 25.8 * s, Math.max(1, 0.8 * s), Math.max(1, 0.8 * s), '#222'); }
  }
  if (o.bow !== false) { poly(g, [x + 1 * s, y - 30 * s, x + 4 * s, y - 31.5 * s, x + 4 * s, y - 28.5 * s], gr ? '#999' : '#ff3a5a'); }
}

// ─── Cartons communs ───
function vcrBlue(g) { rect(g, 0, 0, W, H, '#0018c8'); }
function snow(g, lt, S) { drawNoise(g, W, H, S.t); }
function warning(g, lt, k) {
  rect(g, 0, 0, W, H, '#000');
  const a = clamp(Math.min(lt * 2, (4 - lt) * 2), 0, 1);
  g.globalAlpha = a;
  frame(g, 14, 24, W - 28, H - 48, '#c00', 2);
  drawText(g, 'AVERTISSEMENT', W / 2, 36, '#f33', 2, 'center');
  const lines = ['Ce vidéogramme est destiné', 'à un usage strictement privé.', 'Toute reproduction, diffusion', 'ou location non autorisée', 'est interdite et constitue', 'un délit.'];
  lines.forEach((l, i) => drawText(g, l, W / 2, 66 + i * 12, '#fff', 1, 'center'));
  g.globalAlpha = 1;
}
function studio(name, c1, c2, kind = 0) {
  return (g, lt) => {
    grad(g, 0, 0, W, H, c1, '#000');
    const k = smooth(lt / 1.5);
    if (kind === 0) {
      circle(g, W / 2, 98 - k * 20, 26 * k, c2);
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12 + lt * 0.4; rect(g, W / 2 + Math.cos(a) * 38 * k - 1, 78 + Math.sin(a) * 38 * k - 1, 3, 3, c2); }
    } else if (kind === 1) {
      for (let i = 0; i < 5; i++) poly(g, [W / 2 - 40 + i * 20, 110, W / 2 - 30 + i * 20, 110 - (20 + (i % 2) * 14) * k, W / 2 - 20 + i * 20, 110], c2);
    } else {
      star(g, W / 2, 84, 30 * k, c2, 5);
      star(g, W / 2, 84, 16 * k, '#fff', 5);
    }
    if (lt > 0.8) drawTextS(g, name, W / 2, 126, '#fff', 2, 'center');
    if (lt > 1.6) drawText(g, 'présente', W / 2, 148, '#ccc', 1, 'center');
  };
}
function intro(name, c1, c2, kind) { return [[1.2, vcrBlue], [4, warning], [3.5, studio(name, c1, c2, kind)]]; }
function finCard(txt = 'FIN', col = '#fff', bg = '#000') {
  return (g, lt) => {
    rect(g, 0, 0, W, H, bg);
    const r = Math.max(0, 1 - lt / 1.2) * 200;
    if (r > 0) { g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, W, H); g.arc(W / 2, H / 2, r, 0, TAU, true); g.fill(); }
    if (lt > 1) drawTextS(g, txt, W / 2, H / 2 - 10, col, 3, 'center');
  };
}
function letterbox(g, h = 22) { rect(g, 0, 0, W, h, '#000'); rect(g, 0, H - h, W, h, '#000'); }
function shake(g, S, a) { g.translate(Math.round(Math.sin(S.t * 3.1) * a + Math.sin(S.t * 7.3) * a * 0.4), Math.round(Math.cos(S.t * 2.3) * a * 0.7 + Math.sin(S.t * 5.7) * a * 0.3)); }
function sub(S, text, col = '#ff0') { if (text) subtitle(S, text, col); }
function timed(lt, list) { let r = null; for (const [t0, v] of list) if (lt >= t0) r = v; return r; }
let SCAN = null;
function scanlines(g, a = 0.25) {
  if (!SCAN) { SCAN = makeCanvas(1, 2); const c = SCAN.getContext('2d'); c.fillStyle = 'rgba(0,0,0,1)'; c.fillRect(0, 1, 1, 1); }
  const p = g.createPattern(SCAN, 'repeat');
  g.globalAlpha = a; g.fillStyle = p; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
}
function trees(g, y, n, col, seed, sc = 1, off = 0) {
  for (let i = 0; i < n; i++) {
    const x = ((hash(i * 17 + seed) * (W + 60) + off) % (W + 60) + W + 60) % (W + 60) - 30, h = (18 + hash(i * 5 + seed) * 22) * sc;
    poly(g, [x, y - h, x - h * 0.35, y, x + h * 0.35, y], col);
  }
}

// ═════════════════════════ PÉPITO (dessin animé) ═════════════════════════
function pepito(g, x, y, s, o = {}) {
  const fl = o.flap ?? 0;
  ellipse(g, x - 9 * s, y + 4 * s, 7 * s, 2.5 * s, '#2a6ae0', 0.5);
  ellipse(g, x - 10 * s, y + 6 * s, 6 * s, 2 * s, '#e03030', 0.7);
  ellipse(g, x, y, 9 * s, 8 * s, '#2fb04a');
  ellipse(g, x + 2 * s, y + 2 * s, 5 * s, 5 * s, '#ffd84a');
  g.save(); g.translate(x - 2 * s, y - 2 * s); g.rotate(-0.4 - fl * 1.1);
  ellipse(g, -6 * s, 0, 8 * s, 3.5 * s, '#1e8a38'); ellipse(g, -10 * s, 0, 4 * s, 2.5 * s, '#e03030');
  g.restore();
  circle(g, x + 4 * s, y - 9 * s, 6.5 * s, '#2fb04a');
  poly(g, [x + 1 * s, y - 15 * s, x + 3 * s, y - 21 * s, x + 5 * s, y - 15 * s], '#e03030');
  poly(g, [x + 4 * s, y - 15 * s, x + 8 * s, y - 20 * s, x + 7 * s, y - 14 * s], '#ff7a2a');
  circle(g, x + 6 * s, y - 10 * s, 2.6 * s, '#fff'); circle(g, x + 6.8 * s, y - 10 * s, 1.3 * s, '#000');
  poly(g, [x + 9 * s, y - 9 * s, x + 14 * s, y - 7 * s, x + 11 * s, y - 3 * s, x + 9 * s, y - 5 * s], '#ffa020');
  rect(g, x - 2 * s, y + 7 * s, 1.5 * s, 4 * s, '#ff9a20'); rect(g, x + 2 * s, y + 7 * s, 1.5 * s, 4 * s, '#ff9a20');
}
function cartoonSky(g, lt, scroll = 0) {
  grad(g, 0, 0, W, 130, '#5ac8ff', '#c8f0ff');
  for (let i = 0; i < 4; i++) { const x = ((i * 90 - scroll * 0.3) % 360 + 360) % 360 - 50, y = 24 + i * 9; circle(g, x, y, 10, '#fff'); circle(g, x + 12, y - 3, 13, '#fff'); circle(g, x + 25, y, 9, '#fff'); }
}
function cartoonGround(g, scroll) {
  for (let i = 0; i < 6; i++) { const x = ((i * 70 - scroll * 0.6) % 420 + 420) % 420 - 60; ellipse(g, x, 136, 48, 28, '#58c058'); }
  rect(g, 0, 136, W, H - 136, '#3aa53a');
  for (let i = 0; i < 6; i++) { const x = ((i * 60 - scroll) % 400 + 400) % 400 - 40; rect(g, x + 8, 100, 8, 40, '#8a5a2a'); circle(g, x + 12, 96, 20, '#2a8a3a'); circle(g, x, 104, 14, '#36a046'); circle(g, x + 24, 104, 14, '#36a046'); }
}
function vhsCartoon(S) {
  const scenes = [
    ...intro('HÉLIOS VIDÉO JEUNESSE', '#30307a', '#ffd23a', 2),
    [5, (g, lt) => {
      rect(g, 0, 0, W, H, '#ffcf3a');
      for (let i = 0; i < 14; i++) { g.fillStyle = i % 2 ? '#ff9a2a' : '#ffcf3a'; g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, 220, i * TAU / 14 + lt * 0.5, (i + 1) * TAU / 14 + lt * 0.5); g.fill(); }
      pepito(g, W / 2, 112 + Math.sin(lt * 5) * 4, 2.2, { flap: tri(lt * 3) });
      drawTextS(g, 'LES AVENTURES', W / 2, 22, '#fff', 2, 'center', '#a33');
      drawTextS(g, 'DE PÉPITO', W / 2, 44, '#fff', 3, 'center', '#a33');
    }],
    [12, (g, lt, k, S) => {
      const sc = lt * 30;
      cartoonSky(g, lt, sc); cartoonGround(g, sc);
      const fly = lt < 8;
      const x = fly ? 30 + lt * 14 : 142, y = fly ? 60 + Math.sin(lt * 2) * 14 : 86;
      if (!fly) rect(g, 110, 96, 70, 4, '#7a4a1a');
      pepito(g, x, y, 1.6, { flap: fly ? tri(lt * 6) : 0 });
      sub(S, lt < 6 ? 'Pépito : Quelle belle journée pour voler !' : 'Pépito : Tiens ? Qu\'est-ce que c\'est que ça ?');
    }],
    [12, (g, lt, k, S) => {
      cartoonSky(g, lt, 360 + lt * 10);
      const up = Math.max(0, lt - 4) * 9;
      cartoonGround(g, 360 + lt * 10);
      const bx = 150 + Math.sin(lt * 1.3) * 6, by = 40 - up * 0.6;
      line(g, bx, by + 14, bx - 6, by + 42, '#555');
      ellipse(g, bx, by, 11, 13, '#e22'); circle(g, bx - 4, by - 5, 3, '#f88');
      pepito(g, bx - 8, by + 52, 1.4, { flap: lt > 4 ? 0 : tri(lt * 4) });
      if (lt < 4) sub(S, 'Pépito : Oh ! Un ballon rouge !');
      else sub(S, 'Pépito : Wouhou ! Je m\'envole sans battre des ailes !');
    }],
    [10, (g, lt, k, S) => {
      grad(g, 0, 0, W, H, '#3aa8ff', '#a8e4ff');
      for (let i = 0; i < 6; i++) { const y = ((i * 50 - lt * 30) % 300 + 300) % 300 - 40; circle(g, 30 + i * 40, y, 14, '#fff'); circle(g, 44 + i * 40, y + 4, 10, '#fff'); }
      const pop = lt > 4;
      const fy = pop ? 80 + Math.min(1, (lt - 4) / 5.5) ** 1.5 * 130 : 80;
      if (!pop) { ellipse(g, 128, 40, 11, 13, '#e22'); line(g, 128, 54, 124, 70, '#555'); }
      else if (lt < 4.6) { star(g, 128, 40, 16, '#ff0', 8); drawTextS(g, 'PAN !', 128, 22, '#fff', 3, 'center', '#a00'); }
      pepito(g, 120 + (pop ? Math.sin(lt * 20) * 3 : 0), fy, 1.6, { flap: pop ? tri(lt * 14) : 0 });
      sub(S, pop ? 'Pépito : Au secours ! Mes ailes, vite !' : 'Pépito : Attention à cette branche de sapin…');
    }],
    [10, (g, lt, k, S) => {
      grad(g, 0, 0, W, 100, '#5ac8ff', '#c8f0ff');
      ellipse(g, W / 2, 140, 160, 46, '#2a7ad0'); ellipse(g, W / 2, 132, 150, 34, '#3a9ae8');
      rect(g, 0, 100, W, 10, '#3aa53a');
      if (lt < 1.5) pepito(g, 128, -20 + lt * 100, 1.5, { flap: tri(lt * 14) });
      else if (lt < 3) { for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.1 + i * 0.1); circle(g, 128 + Math.cos(a) * (lt - 1.5) * 40, 128 + Math.sin(a) * (lt - 1.5) * 50 + (lt - 1.5) ** 2 * 30, 3, '#bfe8ff'); } drawTextS(g, 'PLOUF !', 128, 50, '#fff', 3, 'center', '#03a'); }
      else {
        pepito(g, 128, 126 + Math.sin(lt * 3) * 2, 1.5);
        ellipse(g, 136, 102 + Math.sin(lt * 3) * 2, 9, 4, '#ff8a3a'); poly(g, [126, 102, 120, 97, 120, 107], '#ff8a3a'); circle(g, 141, 101, 1.2, '#000');
        if (lt > 5) sub(S, 'Le poisson : Hé ! C\'est mon lac ici !');
        else sub(S, 'Pépito : Glou glou…');
      }
    }],
    [10, (g, lt, k, S) => {
      grad(g, 0, 0, W, 120, '#ff8a4a', '#ffd08a');
      circle(g, W / 2, 112, 30, '#ffe24a');
      rect(g, 0, 120, W, 72, '#3a8a3a');
      ellipse(g, 96, 130, 30, 10, '#888');
      pepito(g, 92, 112, 1.4, { flap: 0 });
      const tx = Math.min(170, 260 - lt * 20);
      ellipse(g, tx, 128, 14, 9, '#4a7a2a'); circle(g, tx - 14, 126, 5, '#8ac85a'); circle(g, tx - 16, 125, 1.2, '#000');
      for (let i = 0; i < 5; i++) rect(g, tx - 10 + i * 4, 120, 2, 2, '#2a5a1a');
      sub(S, lt < 5 ? 'Tita la tortue : Encore une aventure, Pépito ?' : 'Pépito : À la prochaine, les amis !');
    }],
    [5, finCard('FIN', '#ff0', '#ffcf3a')],
    [1.5, snow],
  ];
  return tape(S, 'Les Aventures de Pépito', scenes, { tracking: 0.3 });
}

// ═════════════════════════ GYM TONIC MATIN ═════════════════════════
const AERO_ST = { skin: '#f0c8a0', top: '#ff3aa0', bottom: '#2ad8e0', legs: '#2ad8e0', shin: '#f4f4f4', shoes: '#fff', hair: '#7a3a14', longHair: true, band: '#fff', belt: '#ffe04a', forearm: '#f0c8a0', sleeve: '#ff3aa0' };
const AERO_B1 = { ...AERO_ST, top: '#7a4aff', sleeve: '#7a4aff', bottom: '#ffe04a', legs: '#ffe04a', hair: '#ffd890', band: '#ff3aa0' };
const AERO_B2 = { ...AERO_ST, top: '#3aff8a', sleeve: '#3aff8a', bottom: '#ff7a3a', legs: '#ff7a3a', hair: '#2a1a0a', band: '#2ad8e0' };
function aeroPose(move, b) {
  const s1 = Math.sin(b * Math.PI), up = (b | 0) % 2;
  switch (move) {
    case 0: return { aL: [-Math.PI + 0.3 - 0.6 * (1 - Math.abs(s1)), 0], aR: [Math.PI - 0.3 + 0.6 * (1 - Math.abs(s1)), 0], lL: [0.15, 0.1], lR: [-0.15, -0.1] };
    case 1: return { dx: Math.sin(b * Math.PI / 2) * 8, aL: [-1.6, -0.5], aR: [1.6, 0.5], lL: [0.35 * (up ? 1 : 0.3), 0.2], lR: [-0.35 * (up ? 0.3 : 1), -0.2] };
    case 2: { const d = Math.abs(s1); return { dy: d * 6, lean: 0.05, aL: [-1.5, 0], aR: [1.5, 0], lL: [0.4 + d * 0.5, -0.2 - d * 0.4], lR: [-0.4 - d * 0.5, 0.2 + d * 0.4] }; }
    case 3: { const o = up; return { dy: -Math.abs(s1) * 4, aL: [o ? -2.6 : -0.4, 0], aR: [o ? 2.6 : 0.4, 0], lL: [o ? 0.45 : 0.08, 0], lR: [o ? -0.45 : -0.08, 0] }; }
    case 4: return { aL: [-1.57 + Math.sin(b * Math.PI * 2) * 1.2, 0.2], aR: [1.57 - Math.sin(b * Math.PI * 2) * 1.2, -0.2], lL: [0.18, 0.1], lR: [-0.18, -0.1] };
    default: { const l = up; return { aL: [-0.9, -1.2], aR: [0.9, 1.2], lL: l ? [1.4, -1.5] : [0.1, 0], lR: l ? [-0.1, 0] : [-1.4, 1.5], dy: -1 }; }
  }
}
const AERO_TXT = ['On s\'échauffe ! Les bras vers le ciel !', 'Pas chassés ! On bouge, on bouge !', 'Et on descend… et on remonte !', 'Sauts écartés ! Plus vite !', 'Moulinets des bras, on respire !', 'Genoux levés ! Allez, on ne lâche rien !', 'Souriez, c\'est le matin !', 'Encore huit ! Vous êtes formidables !'];
function aeroStudio(g, t) {
  grad(g, 0, 0, W, 130, '#1a0a3a', '#4a1a6a');
  for (let i = 0; i < 8; i++) { const x = 16 + i * 32; rect(g, x, 10, 2, 100, i % 2 ? '#ff3aa0' : '#2ad8e0'); }
  g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 4); rect(g, 0, 60, W, 2, '#ff3aa0'); rect(g, 0, 90, W, 2, '#2ad8e0'); g.globalAlpha = 1;
  rect(g, 0, 130, W, 62, '#c88a5a');
  for (let i = -8; i <= 8; i++) line(g, W / 2 + i * 10, 130, W / 2 + i * 40, H, '#a86a3a');
  for (const x of [14, 230]) { rect(g, x, 104, 14, 26, '#7a3a1a'); for (let i = 0; i < 5; i++) ellipse(g, x + 7 + Math.cos(i) * 6, 98 - i * 4, 7, 3, '#2a8a3a', i * 0.6); }
}
function vhsAerobic(S) {
  const bpm = 2.1;
  const scenes = [
    ...intro('VIDÉO FORME', '#5a0a4a', '#ff3aa0', 0),
    [5, (g, lt) => {
      grad(g, 0, 0, W, H, '#120030', '#ff3aa0');
      for (let i = 0; i < 12; i++) { const y = 120 + ((i * 6 + lt * 20) % 72); rect(g, 0, y, W, 1, '#2ad8e0'); }
      drawTextS(g, 'GYM TONIC', W / 2, 46 - Math.max(0, 1 - lt) * 60, '#ffe04a', 3, 'center', '#a0f');
      drawTextS(g, 'MATIN', W / 2, 78, '#2ad8e0', 3, 'center', '#a0f');
      if (lt > 2) drawText(g, 'LE COURS QUI RÉVEILLE !', W / 2, 112, '#fff', 1, 'center');
    }],
    [64, (g, lt, k, S) => {
      aeroStudio(g, lt);
      const b = lt * bpm, move = Math.floor(lt / 8) % 6;
      const pose = aeroPose(move, b);
      puppet(g, 70, 150, 1.6, aeroPose(move, b - 0.25), AERO_B1);
      puppet(g, 186, 150, 1.6, aeroPose(move, b - 0.25), AERO_B2);
      puppet(g, 128, 172, 2.4, pose, { ...AERO_ST, mouth: (lt * 6 | 0) % 2 + 1 });
      const n = (Math.floor(b) % 8) + 1;
      drawTextS(g, ['ET UN !', 'ET DEUX !', 'ET TROIS !', 'ET QUATRE !', 'ET CINQ !', 'ET SIX !', 'ET SEPT !', 'ET HUIT !'][n - 1], 8, 22, n % 2 ? '#ffe04a' : '#2ad8e0', 2);
      sub(S, AERO_TXT[Math.floor(lt / 8) % AERO_TXT.length], '#fff');
      rect(g, W - 66, 6, 30, 11, '#ff3aa0'); drawText(g, 'x' + (8 - (Math.floor(b) % 8)), W - 51, 8, '#fff', 1, 'center');
    }],
    [9, (g, lt, k, S) => {
      aeroStudio(g, lt);
      const st = Math.sin(lt * 0.8);
      puppet(g, 128, 172, 2.4, { lean: st * 0.35, aL: [-Math.PI + 0.2 + st * 0.4, 0], aR: [Math.PI - 0.2 + st * 0.4, 0], lL: [0.35, 0.1], lR: [-0.35, -0.1] }, AERO_ST);
      sub(S, 'Et on s\'étire… on respire profondément…', '#fff');
    }],
    [6, (g, lt) => {
      aeroStudio(g, lt);
      puppet(g, 128, 172, 2.4, { aL: [-0.4, 0], aR: [Math.PI - 0.4 + Math.sin(lt * 9) * 0.4, 0] }, { ...AERO_ST, mouth: 2 });
      drawTextS(g, 'À DEMAIN MATIN !', W / 2, 30, '#ffe04a', 2, 'center', '#a0f');
      drawText(g, 'Tous les matins à 7 h 30', W / 2, 54, '#fff', 1, 'center');
    }],
    [1.5, snow],
  ];
  return tape(S, 'Gym Tonic Matin', scenes);
}

// ═════════════════════════ LA CUISINE DE MAMIE ═════════════════════════
const MAMIE = { skin: '#f0c8a8', top: '#d86a9a', sleeve: '#d86a9a', bottom: '#d86a9a', hair: '#d8d8d8', hat: 'bun', glasses: '#555', apron: '#fff8e8', mouth: 1, shoes: '#5a3a2a' };
function kitchen(g) {
  rect(g, 0, 0, W, 140, '#f4e8c8');
  g.fillStyle = '#e8dab0';
  for (let y = 0; y < 100; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < W; x += 24) g.fillRect(x, y, 12, 12);
  rect(g, 170, 14, 64, 50, '#9ad4ff'); frame(g, 170, 14, 64, 50, '#fff', 3); rect(g, 200, 14, 3, 50, '#fff');
  poly(g, [166, 12, 190, 12, 178, 70, 166, 70], '#e85a5a'); poly(g, [214, 12, 238, 12, 238, 70, 226, 70], '#e85a5a');
  rect(g, 12, 30, 80, 4, '#8a5a2a');
  for (let i = 0; i < 5; i++) { rect(g, 16 + i * 15, 16, 10, 14, ['#c84', '#e64', '#8a4', '#ca6', '#a68'][i]); rect(g, 16 + i * 15, 14, 10, 3, '#fff'); }
  rect(g, 0, 128, W, 64, '#a86a3a'); rect(g, 0, 128, W, 4, '#c88a5a');
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = 0; x < W; x += 16) for (let y = 136; y < H; y += 16) if (((x + y) / 16) % 2 === 0) g.fillRect(x, y, 16, 16);
}
function bowl(g, x, y, fill, swirl = 0) {
  ellipse(g, x, y - 2, 20, 6, '#ddd'); poly(g, [x - 20, y - 2, x + 20, y - 2, x + 13, y + 12, x - 13, y + 12], '#e8e8f0');
  if (fill) { ellipse(g, x, y - 1, 17, 4.5, fill); if (swirl) for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(160,120,60,0.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y - 1, 12 - i * 4, 3 - i, 0, swirl + i, swirl + i + 2.5); g.stroke(); } }
}
function vhsCooking(S) {
  const C = (lt, k, text, fn) => (g, lt2, k2, S2) => { kitchen(g); fn(g, lt2); sub(S2, text, '#fff'); };
  const mamie = (g, lt, pose = {}) => puppet(g, 70, 150, 2.6, { aL: [-0.4, -0.3], aR: [0.5, 0.6], ...pose }, { ...MAMIE, mouth: (lt * 7 | 0) % 2 + 1 });
  const counter = (g) => { rect(g, 0, 128, W, 6, '#6a4a2a'); rect(g, 0, 134, W, 58, '#8a5a3a'); };
  const scenes = [
    ...intro('ÉDITIONS GOURMANDES', '#5a2a0a', '#ffd890', 1),
    [5, (g, lt) => {
      rect(g, 0, 0, W, H, '#fff');
      g.fillStyle = '#e84a4a';
      for (let y = 0; y < H; y += 16) for (let x = ((y / 16) % 2) * 16; x < W; x += 32) g.fillRect(x, y, 16, 16);
      rect(g, 26, 40, 204, 76, '#fff8e8'); frame(g, 26, 40, 204, 76, '#a33', 2);
      drawText(g, 'LA CUISINE', W / 2, 52, '#a33', 2, 'center');
      drawText(g, 'DE MAMIE', W / 2, 78, '#a33', 3, 'center');
    }],
    [8, C(0, 0, 'Bonjour mes petits ! Aujourd\'hui : les crêpes !', (g, lt) => { mamie(g, lt, { aR: [2.6 + Math.sin(lt * 8) * 0.3, 0.3] }); counter(g); bowl(g, 170, 124, null); })],
    [8, C(0, 0, '250 grammes de farine, dans le saladier…', (g, lt) => {
      mamie(g, lt, { aR: [1.55, 0.35] }); counter(g); bowl(g, 170, 124, lt > 2 ? '#fff' : null);
      rect(g, 140, 80 + Math.min(lt, 2) * 8, 18, 24, '#e8d8b0'); drawText(g, 'F', 149, 88 + Math.min(lt, 2) * 8, '#a33', 1, 'center');
      if (lt > 1.5 && lt < 5) for (let i = 0; i < 6; i++) rect(g, 156 + hash(i + (lt * 10 | 0)) * 8, 104 + i * 3, 2, 2, '#fff');
    })],
    [8, C(0, 0, '… quatre œufs…', (g, lt) => {
      mamie(g, lt, { aR: [1.5, 0.3] }); counter(g); bowl(g, 170, 124, '#fff2c8');
      for (let i = 0; i < 4; i++) if (lt < 1 + i * 1.5) ellipse(g, 200 + i * 10, 122, 4, 5, '#fff8f0');
      const e = Math.floor((lt - 1) / 1.5);
      if (e >= 0 && e < 4 && (lt - 1) % 1.5 < 0.8) { ellipse(g, 168, 104 + ((lt - 1) % 1.5) * 18, 4, 3, '#ffd23a'); }
    })],
    [8, C(0, 0, '… un demi-litre de lait, petit à petit.', (g, lt) => {
      mamie(g, lt, { aR: [1.6, 0.6] }); counter(g); bowl(g, 170, 124, '#fff4d8');
      g.save(); g.translate(150, 92); g.rotate(-0.9); rect(g, -8, -14, 16, 26, '#fff'); rect(g, -8, -14, 16, 8, '#3a8ae8'); g.restore();
      if (lt > 1) rect(g, 160, 96, 3, 26, '#fafafa');
    })],
    [8, C(0, 0, 'On fouette bien pour éviter les grumeaux !', (g, lt) => {
      mamie(g, lt, { aR: [1.25 + Math.sin(lt * 18) * 0.25, 0.7] }); counter(g); bowl(g, 170, 124, '#f0d898', lt * 12);
      line(g, 170 + Math.sin(lt * 18) * 6, 120, 156, 96, '#999', 2);
    })],
    [10, C(0, 0, 'Une louche dans la poêle bien chaude…', (g, lt) => {
      mamie(g, lt, { aR: [1.5, 0.3] }); counter(g);
      rect(g, 140, 126, 80, 4, '#333'); ellipse(g, 180, 122, 26, 6, '#222'); rect(g, 206, 120, 30, 3, '#222');
      if (lt > 2) ellipse(g, 180, 121, Math.min(22, (lt - 2) * 10), Math.min(5, (lt - 2) * 2.5), '#f0d070');
      for (let i = 0; i < 3; i++) { g.globalAlpha = 0.3; circle(g, 170 + i * 10 + Math.sin(lt * 2 + i) * 3, 110 - ((lt * 12 + i * 10) % 30), 3, '#fff'); g.globalAlpha = 1; }
    })],
    [10, C(0, 0, 'Et hop ! On la fait sauter !', (g, lt) => {
      const fl = lt > 2 && lt < 4.2, p = (lt - 2) / 2.2;
      mamie(g, lt, { aR: [fl ? 1.95 : 1.5, 0.3] }); counter(g);
      rect(g, 140, 126, 80, 4, '#333'); ellipse(g, 180, 122, 26, 6, '#222'); rect(g, 206, 120, 30, 3, '#222');
      if (fl) { const y = 120 - Math.sin(p * Math.PI) * 70; ellipse(g, 180, y, 22, Math.abs(Math.cos(p * Math.PI * 3)) * 5 + 1, '#e8b850'); }
      else ellipse(g, 180, 121, 22, 5, lt > 4.2 ? '#d8a040' : '#f0d070');
      if (lt > 4.5) drawTextS(g, 'HOP !', 180, 40, '#fff', 3, 'center', '#a33');
    })],
    [10, C(0, 0, 'Un peu de sucre, de la confiture… Bon appétit !', (g, lt) => {
      mamie(g, lt, { aR: [2.4 + Math.sin(lt * 6) * 0.3, 0.3] }); counter(g);
      ellipse(g, 180, 124, 28, 7, '#fff'); for (let i = 0; i < 6; i++) ellipse(g, 180, 120 - i * 3, 22, 5, i % 2 ? '#e8b850' : '#d8a040');
      ellipse(g, 180, 104, 8, 3, '#c0204a');
      for (let i = 0; i < 8; i++) rect(g, 166 + hash(i) * 28, 100 + hash(i + 9) * 8, 1, 1, '#fff');
    })],
    [5, finCard('BON APPÉTIT !', '#a33', '#fff8e8')],
    [1.5, snow],
  ];
  return tape(S, 'La Cuisine de Mamie', scenes);
}

// ═════════════════════════ ANNIVERSAIRE DE JULIE 1991 ═════════════════════════
const KIDS = [
  { top: '#3a8ae8', bottom: '#2a2a5a', hair: '#5a3418', skin: '#f0c8a8' }, { top: '#e8c83a', bottom: '#3a3a3a', hair: '#e8c070', skin: '#f4d0b0' },
  { top: '#3ac86a', bottom: '#5a3a2a', hair: '#2a1a0a', skin: '#c89070' }, { top: '#e85a3a', bottom: '#2a4a8a', hair: '#8a4a1a', skin: '#f0c8a8' },
];
const JULIE = { top: '#ff8ac8', sleeve: '#ff8ac8', bottom: '#ff8ac8', dress: '#ff8ac8', hair: '#c8803a', longHair: true, skin: '#f4d0b0', hat: 'crown', hatColor: '#ffd23a' };
function livingRoom(g, lt, dark = 0) {
  rect(g, 0, 0, W, 150, '#e8d0a0');
  g.fillStyle = '#dcc290';
  for (let x = 0; x < W; x += 20) g.fillRect(x, 0, 10, 150);
  rect(g, 186, 20, 56, 64, '#0a0e1a'); frame(g, 186, 20, 56, 64, '#fff', 3); rect(g, 212, 20, 3, 64, '#fff'); rect(g, 186, 50, 56, 3, '#fff');
  for (let i = 0; i < 10; i++) { const x = 20 + i * 16, y = 12 + Math.sin(i * 0.8) * 3; poly(g, [x, y, x + 12, y, x + 6, y + 10], ['#e33', '#3a8ae8', '#ffd23a', '#3ac86a'][i % 4]); }
  drawText(g, 'JOYEUX ANNIVERSAIRE JULIE', 92, 28, '#c33', 1, 'center');
  for (let i = 0; i < 4; i++) { const x = 16 + i * 14, y = 60 + Math.sin(lt * 1.5 + i) * 3; line(g, x, y + 10, x + 2, y + 40, '#888'); ellipse(g, x, y, 6, 8, ['#e33', '#3a8ae8', '#ffd23a', '#3ac86a'][i]); }
  rect(g, 0, 150, W, 42, '#8a5a3a');
  if (dark > 0) { g.fillStyle = `rgba(10,8,20,${dark})`; g.fillRect(0, 0, W, H); }
}
function camcorder(g, S) { drawTextS(g, '23.03.1991', 8, H - 18, '#ffa040'); }
function cake(g, x, y, lit, lt, scale = 1) {
  const s = scale;
  ellipse(g, x, y, 26 * s, 6 * s, '#fff');
  rect(g, x - 22 * s, y - 18 * s, 44 * s, 18 * s, '#fdd'); ellipse(g, x, y - 18 * s, 22 * s, 5 * s, '#fff0f0');
  for (let i = 0; i < 6; i++) circle(g, x - 18 * s + i * 7.2 * s, y - 8 * s, 1.6 * s, '#e33');
  for (let i = 0; i < 7; i++) {
    const cx = x - 15 * s + i * 5 * s, cy = y - 20 * s;
    rect(g, cx - 0.8 * s, cy - 7 * s, 1.8 * s, 7 * s, ['#3a8ae8', '#ffd23a', '#e33'][i % 3]);
    if (lit > i) { ellipse(g, cx, cy - 9.5 * s + Math.sin(lt * 13 + i) * 0.5, 1.6 * s, 2.8 * s, '#ffb030'); ellipse(g, cx, cy - 9 * s, 0.8 * s, 1.5 * s, '#fff8a0'); }
    else if (lit > -1) { g.globalAlpha = 0.4; circle(g, cx + Math.sin(lt * 3 + i) * 2, cy - 12 * s - ((lt * 8 + i * 3) % 12), 1.4 * s, '#ccc'); g.globalAlpha = 1; }
  }
}
function vhsBirthday(S) {
  const scenes = [
    [1.5, vcrBlue],
    [1, snow],
    [8, (g, lt, k, S) => {
      g.save(); shake(g, S, 3); livingRoom(g, lt);
      KIDS.forEach((st, i) => { const x = ((lt * (30 + i * 12) + i * 70) % 300) - 30; puppet(g, x, 168, 1.5, { aL: [-1.6, 0], aR: [1.6, 0], lL: [Math.sin(lt * 10 + i) * 0.5, 0], lR: [-Math.sin(lt * 10 + i) * 0.5, 0] }, { ...st, face: 1, mouth: 2 }); });
      g.restore(); camcorder(g, S);
      sub(S, lt < 4 ? 'Papa : Doucement les enfants !' : 'Papa : Julie ! Regarde la caméra !', '#fff');
    }],
    [10, (g, lt, k, S) => {
      g.save(); shake(g, S, 2.5); livingRoom(g, lt);
      rect(g, 30, 140, 196, 8, '#fff'); rect(g, 40, 148, 176, 30, '#c8a070');
      KIDS.forEach((st, i) => puppet(g, 52 + i * 50 + (i > 1 ? 50 : 0), 150, 1.6, { aL: [-0.6, -0.8], aR: [0.6 + (i === 0 ? Math.sin(lt * 8) * 0.8 : 0), 0.8] }, { ...st, mouth: (lt * 5 + i | 0) % 2 + 1 }));
      puppet(g, 128, 150, 1.8, { aL: [-0.8, 0], aR: [-2.6 + Math.sin(lt * 9) * 0.4, 0] }, { ...JULIE, mouth: 2 });
      g.restore(); camcorder(g, S);
      sub(S, lt < 5 ? 'Julie : Coucou ! J\'ai sept ans !' : 'Maman : Éteignez la lumière, ça arrive !', '#fff');
    }],
    [12, (g, lt, k, S) => {
      g.save(); shake(g, S, 2.2); livingRoom(g, lt, 0.72);
      const mx = Math.min(150, 250 - lt * 22);
      const glow = g.createRadialGradient(mx - 20, 110, 4, mx - 20, 110, 80);
      glow.addColorStop(0, 'rgba(255,190,90,0.55)'); glow.addColorStop(1, 'rgba(255,190,90,0)');
      g.fillStyle = glow; g.fillRect(0, 0, W, H);
      puppet(g, mx, 176, 2, { aL: [-1.3, -0.3], aR: [-1.1, -0.5] }, { top: '#4a3a5a', sleeve: '#4a3a5a', bottom: '#2a2a3a', hair: '#3a2010', longHair: true, skin: '#c8a090', face: -1 });
      cake(g, mx - 30, 120, 7, lt, 1);
      g.restore(); camcorder(g, S);
      sub(S, '♪ Joyeux anniversaire, Julie… joyeux anniversaire ! ♪', '#fff');
    }],
    [10, (g, lt, k, S) => {
      g.save(); shake(g, S, 1.8);
      const dark = lt < 3 ? 0.72 : Math.max(0.05, 0.72 - (lt - 3) * 0.4);
      rect(g, 0, 0, W, H, '#c8a070');
      cake(g, 128, 150, lt < 3 ? 7 : Math.max(0, 7 - (lt - 3) * 6), lt, 2.4);
      if (lt > 2 && lt < 4) { g.globalAlpha = 0.3; ellipse(g, 128, 60, 40, 10, '#fff'); g.globalAlpha = 1; }
      g.fillStyle = `rgba(10,8,20,${dark})`; g.fillRect(0, 0, W, H);
      g.restore(); camcorder(g, S);
      sub(S, lt < 3 ? 'Tous : Souffle ! Souffle !' : 'Tous : BRAVO JULIE !', '#fff');
    }],
    [10, (g, lt, k, S) => {
      g.save(); shake(g, S, 2.4); livingRoom(g, lt);
      puppet(g, 100, 176, 2.2, { aL: [-1.2, -0.5], aR: [1.2, 0.5] }, { ...JULIE, mouth: lt > 3 ? 3 : 1 });
      if (lt < 3) { rect(g, 108, 112, 40, 30, '#3a8ae8'); rect(g, 126, 112, 4, 30, '#ffd23a'); rect(g, 108, 124, 40, 4, '#ffd23a'); }
      else bobby(g, 128, 150, 0.7, { armL: -0.6, armR: 0.6 });
      g.restore(); camcorder(g, S);
      sub(S, lt < 3 ? 'Maman : Et maintenant, le gros cadeau…' : 'Julie : Un Bobby ! Du Royaume du Jouet !', '#fff');
    }],
    [11, (g, lt, k, S) => {
      g.save();
      const pan = smooth(lt / 4);
      g.translate(-pan * 150, 0); shake(g, S, 1.2);
      livingRoom(g, lt);
      rect(g, W, 0, 160, 150, '#e8d0a0'); g.fillStyle = '#dcc290'; for (let x = W; x < W + 160; x += 20) g.fillRect(x, 0, 10, 150);
      rect(g, W, 150, 160, 42, '#8a5a3a');
      rect(g, W + 40, 18, 88, 100, '#05070e'); frame(g, W + 40, 18, 88, 100, '#fff', 3); rect(g, W + 83, 18, 3, 100, '#fff'); rect(g, W + 40, 66, 88, 3, '#fff');
      for (let i = 0; i < 12; i++) rect(g, W + 46 + hash(i) * 76, 24 + hash(i + 3) * 36, 1, 1, '#556');
      const t0 = sceneStart(S, lt);
      if (lt < 5) S.figShown = false;
      if (!S.figShown && crossed(S, t0 + 10.86, t0 + 10.99)) { S.figShown = true; figure(g, W + 104, 118, 1.5, '#000', '#ddd'); circle(g, W + 97, 41, 3.5, '#000'); circle(g, W + 111, 41, 3.5, '#000'); }
      g.restore(); camcorder(g, S);
      if (lt < 6) sub(S, 'Les enfants : (rires) On joue à cache-cache !', '#fff');
    }],
    [0.6, (g) => rect(g, 0, 0, W, H, '#000')],
    [2.4, vcrBlue],
  ];
  return tape(S, 'Anniversaire de Julie 1991', scenes, { tracking: 0.55 });
}

// ═════════════════════════ LES LOUPS DES VOSGES ═════════════════════════
function wolf(g, x, y, s, ph, o = {}) {
  const c = o.col || '#6a6a72', d = o.dir || 1;
  g.save(); g.translate(x, y); g.scale(d, 1);
  const lg = (lx, a) => { g.strokeStyle = c; g.lineWidth = 2.4 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(lx * s, -8 * s); g.lineTo(lx * s + Math.sin(a) * 4 * s, -4 * s); g.lineTo(lx * s + Math.sin(a) * 3 * s, 0); g.stroke(); };
  const w = o.still ? 0 : ph;
  lg(-8, Math.sin(w) * 0.7); lg(7, -Math.sin(w) * 0.7);
  ellipse(g, 0, -11 * s, 11 * s, 5 * s, c);
  lg(-6, -Math.sin(w) * 0.7); lg(9, Math.sin(w) * 0.7);
  g.strokeStyle = c; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(-10 * s, -12 * s); g.quadraticCurveTo(-16 * s, -10 * s, -18 * s, -4 * s + (o.still ? 0 : Math.sin(ph * 0.5) * s)); g.stroke();
  const hu = o.howl ? -0.9 : 0;
  g.save(); g.translate(10 * s, -14 * s); g.rotate(hu);
  ellipse(g, 3 * s, -2 * s, 5 * s, 4 * s, c); poly(g, [5 * s, -4 * s, 13 * s, -1 * s, 5 * s, 1.5 * s], c);
  poly(g, [0, -5 * s, 2 * s, -10 * s, 4 * s, -5 * s], c); rect(g, 12 * s, -1.5 * s, 1.5 * s, 1.5 * s, '#111');
  rect(g, 5 * s, -3.5 * s, 1.2 * s, 1.2 * s, o.night ? '#ff6' : '#111');
  g.restore(); g.restore();
}
function vosges(g, lt, night = false) {
  grad(g, 0, 0, W, 120, night ? '#060a1a' : '#8ab4d8', night ? '#1a2a4a' : '#e0ecf4');
  if (night) { circle(g, 200, 34, 16, '#f4f0d0'); for (let i = 0; i < 30; i++) rect(g, hash(i) * W, hash(i + 5) * 90, 1, 1, '#ccd'); }
  poly(g, [0, 100, 40, 60, 80, 84, 130, 50, 180, 80, 220, 58, 256, 82, 256, 130, 0, 130], night ? '#18223a' : '#9aaac0');
  poly(g, [110, 62, 130, 50, 148, 62], night ? '#b0b8c8' : '#fff');
  trees(g, 128, 18, night ? '#0e1a24' : '#2a4a3a', 3, 0.8);
  rect(g, 0, 128, W, 64, night ? '#c8d0e0' : '#f4f8fc');
  trees(g, 150, 8, night ? '#0a141c' : '#1e3a2a', 9, 1.4, lt * 4);
}
function vhsNature(S) {
  const scenes = [
    ...intro('FILMS DU SAPIN', '#0a2a1a', '#8ac8a0', 1),
    [6, (g, lt) => { vosges(g, lt); g.fillStyle = `rgba(255,255,255,${0.4 - lt * 0.05})`; g.fillRect(0, 0, W, H); drawTextS(g, 'LES LOUPS', W / 2, 40, '#fff', 3, 'center', '#234'); drawTextS(g, 'DES VOSGES', W / 2, 72, '#fff', 2, 'center', '#234'); }],
    [12, (g, lt, k, S) => { const z = 1 + lt * 0.012; g.save(); g.translate(W / 2, H * 0.6); g.scale(z, z); g.translate(-W / 2, -H * 0.6); vosges(g, lt); g.restore(); sub(S, 'Les Vosges. Des forêts de sapins à perte de vue.', '#fff'); }],
    [12, (g, lt, k, S) => {
      vosges(g, lt);
      const x = -20 + lt * 22;
      for (let i = 0; i < 12; i++) { const px = x - 14 - i * 12; if (px > 0) ellipse(g, px, 166 + (i % 2) * 3, 2, 1, '#b8c4d4'); }
      wolf(g, x, 168, 1.8, lt * 7);
      sub(S, 'Après un siècle d\'absence, le loup est revenu.', '#fff');
    }],
    [12, (g, lt, k, S) => {
      vosges(g, lt);
      for (let i = 0; i < 4; i++) wolf(g, 270 - lt * 26 + i * 26, 164 + (i % 2) * 6, 1.3 + (i % 2) * 0.2, lt * 7 + i, { dir: -1, col: ['#6a6a72', '#7a7066', '#5a5a62', '#8a8478'][i] });
      sub(S, 'La meute se déplace surtout la nuit, en silence.', '#fff');
    }],
    [10, (g, lt, k, S) => {
      grad(g, 0, 0, W, H, '#6a8aa8', '#2a4a5a');
      trees(g, 120, 16, '#1e3a2a', 7, 1.2);
      rect(g, 0, 140, W, 52, '#3a6a8a'); for (let i = 0; i < 8; i++) rect(g, ((i * 40 + lt * 20) % 280) - 20, 150 + (i % 3) * 10, 18, 1, '#8ab8d8');
      rect(g, 0, 120, W, 22, '#4a5a3a');
      const run = lt > 6, dx = run ? (lt - 6) * 70 : 0;
      const dX = 120 + dx, dY = 136;
      ellipse(g, dX, dY - 14, 12, 6, '#a0703a');
      for (const lx of [-8, -5, 6, 9]) rect(g, dX + lx, dY - 10, 2, 10 + (run ? Math.sin(lt * 20 + lx) * 2 : 0), '#7a5028');
      const hd = run ? 0 : lt < 4 ? 0.9 : 0;
      g.save(); g.translate(dX + 10, dY - 18); g.rotate(hd); ellipse(g, 4, -2, 5, 3, '#a0703a'); poly(g, [2, -4, 0, -10, 4, -5], '#a0703a'); rect(g, 6, -3, 1, 1, '#111'); g.restore();
      sub(S, run ? 'Le chevreuil a senti leur présence.' : 'À la rivière, un chevreuil vient boire…', '#fff');
    }],
    [12, (g, lt, k, S) => {
      vosges(g, lt, true);
      poly(g, [60, 150, 90, 118, 150, 120, 170, 150], '#2a3040');
      wolf(g, 116, 120, 2, 0, { still: true, howl: lt > 3, night: true, col: '#4a4a58' });
      if (lt > 3.5 && lt < 9) drawTextS(g, 'AOUUUUUH…', 150, 70 + Math.sin(lt * 2) * 2, '#c8d0e8', 1);
      sub(S, lt < 3.5 ? 'Écoutez…' : 'Le chef de meute appelle les siens.', '#fff');
    }],
    [10, (g, lt, k, S) => {
      vosges(g, lt);
      ellipse(g, 60, 160, 30, 14, '#3a2a1a');
      for (let i = 0; i < 3; i++) { const jx = 110 + i * 34 + Math.sin(lt * 4 + i * 2) * 14, jy = 168 - Math.max(0, Math.sin(lt * 5 + i)) * 10; wolf(g, jx, jy, 0.9, lt * 9 + i, { dir: Math.sin(lt * 2 + i) > 0 ? 1 : -1, col: '#8a8478' }); }
      wolf(g, 50, 166, 1.6, 0, { still: true, col: '#6a6a72' });
      sub(S, 'Au printemps, les louveteaux découvrent la forêt.', '#fff');
    }],
    [5, finCard('FIN', '#fff')],
    [1.5, snow],
  ];
  return tape(S, 'Les Loups des Vosges', scenes);
}

// ═════════════════════════ LE POING DU DRAGON ═════════════════════════
const LEE = { skin: '#e8c090', top: '#f4f4f0', sleeve: '#f4f4f0', bottom: '#f4f4f0', belt: '#111', hair: '#111', band: '#d02020', shoes: '#222' };
const TIGRE = { skin: '#d8b080', top: '#18181c', sleeve: '#18181c', bottom: '#18181c', belt: '#d0a020', hair: '#111', mous: '#111', shoes: '#111' };
function temple(g, lt, sunset = 1) {
  grad(g, 0, 0, W, 120, sunset ? '#ff7a3a' : '#5a8ad8', sunset ? '#ffd08a' : '#c8e0f8');
  circle(g, 200, 70, 22, sunset ? '#ffe24a' : '#fff8d0');
  rect(g, 30, 50, 120, 70, '#8a2a1a'); poly(g, [16, 52, 90, 26, 164, 52], '#2a1a1a'); poly(g, [10, 54, 22, 46, 158, 46, 170, 54], '#3a2a2a');
  for (let i = 0; i < 4; i++) rect(g, 40 + i * 32, 60, 6, 60, '#d04a2a');
  rect(g, 0, 120, W, 72, '#c8a878');
  g.fillStyle = '#b89868'; for (let x = 0; x < W; x += 24) g.fillRect(x, 120, 1, 72);
}
function speedLines(g, lt, col = 'rgba(255,255,255,0.5)') { for (let i = 0; i < 14; i++) { const y = hash(i + ((lt * 12) | 0)) * H; rect(g, 0, y, W, 1, col); } }
function vhsKungfu(S) {
  const fight = (lt) => {
    const ph = Math.floor(lt / 1.2) % 4, k = (lt % 1.2) / 1.2, hit = k > 0.4 && k < 0.7;
    return { ph, k, hit };
  };
  const scenes = [
    ...intro('DRAGON VIDÉO', '#5a0a0a', '#ffd23a', 2),
    [5, (g, lt) => {
      rect(g, 0, 0, W, H, '#a00');
      g.strokeStyle = '#ffd23a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i <= 40; i++) { const x = 20 + i * 5.5, y = 100 + Math.sin(i * 0.45 + lt * 3) * 22; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); circle(g, 240, 100 + Math.sin(40 * 0.45 + lt * 3) * 22, 9, '#ffd23a');
      drawTextS(g, 'LE POING', W / 2, 26, '#ffd23a', 3, 'center', '#300');
      drawTextS(g, 'DU DRAGON', W / 2, 140, '#ffd23a', 3, 'center', '#300');
    }],
    [10, (g, lt, k, S) => {
      temple(g, lt);
      const m = Math.floor(lt / 1.5) % 4, kk = smooth((lt % 1.5) / 0.4);
      const poses = [{ aL: [-1.4, -0.2], aR: [1.57 * kk, 0], lL: [0.4, 0.1], lR: [-0.4, -0.1] }, { aL: [-0.5, -1.2], aR: [0.5, 1.2], lL: [1.5 * kk, 0], lR: [-0.2, 0] }, { aL: [-2.6, 0], aR: [2.6, 0], lL: [0.5, -0.3], lR: [-0.5, 0.3], dy: 4 }, { aL: [1.57 * kk, 0], aR: [-1.2, -0.4], lL: [0.4, 0.2], lR: [-0.6, -0.1] }];
      puppet(g, 128, 176, 2.4, poses[m], { ...LEE, face: 1 });
      sub(S, lt < 5 ? 'Maître Wu : Ta force vient de l\'intérieur, Lee.' : 'Maître Wu : Le dragon frappe une seule fois.', '#fff');
    }],
    [8, (g, lt, k, S) => {
      temple(g, lt);
      puppet(g, 80, 176, 2.2, { aL: [0.6, 0.6], aR: [-0.3, -0.3] }, { ...LEE, face: 1 });
      const x = Math.max(190, 280 - lt * 40);
      puppet(g, x, 176, 2.3, { aL: [-0.5, 1.6], aR: [0.5, -1.6], lL: [Math.sin(lt * 8) * 0.4, 0], lR: [-Math.sin(lt * 8) * 0.4, 0] }, { ...TIGRE, face: -1, mouth: lt > 3 ? (lt * 6 | 0) % 2 + 1 : 0 });
      sub(S, 'Le Tigre Noir : Ton école n\'a plus de maître, gamin !', '#fff');
    }],
    [18, (g, lt, k, S) => {
      temple(g, lt);
      const f = fight(lt);
      const lx = 96 + Math.sin(lt * 1.3) * 10, tx = 160 + Math.sin(lt * 1.3) * 10;
      const leeAtk = f.ph % 2 === 0, kk = smooth(f.k * 2);
      const atk = (kind) => kind === 0 ? { aL: [-1.4, -0.3], aR: [1.57 * kk, 0], lL: [0.5, 0.1], lR: [-0.4, -0.1] } : { aL: [-0.6, -1.2], aR: [0.6, 1.2], lL: [1.6 * kk, 0], lR: [-0.25, 0], lean: -0.2 * kk };
      const def = { aL: [-2.2, -0.8], aR: [2.6, 0.6], lean: -0.15, lL: [0.3, 0.1], lR: [-0.5, -0.2] };
      const jump = f.ph === 2 ? Math.sin(f.k * Math.PI) * 30 : 0;
      puppet(g, lx, 176 - jump, 2.2, leeAtk ? atk(f.ph >> 1) : def, { ...LEE, face: 1 });
      const tAtk = mirrorPose(leeAtk ? def : atk(f.ph >> 1));
      puppet(g, tx, 176, 2.2, tAtk, { ...TIGRE, face: -1 });
      if (f.hit) { star(g, (lx + tx) / 2, 130, 12, '#fff', 8); drawTextS(g, ['HIAAA !', 'TCHAK !', 'HAÏ !', 'POW !'][f.ph], (lx + tx) / 2, 92, '#ffd23a', 2, 'center', '#a00'); }
      if (f.ph === 2) speedLines(g, lt);
    }],
    [8, (g, lt, k, S) => {
      const who = Math.floor(lt / 2) % 2;
      rect(g, 0, 0, W, H, who ? '#d8b080' : '#e8c090');
      const ex = 128;
      for (const sx of [-50, 50]) { ellipse(g, ex + sx, 96, 26, 11, '#fff'); circle(g, ex + sx + (who ? -6 : 6), 96, 9, '#3a2010'); circle(g, ex + sx + (who ? -6 : 6), 96, 4, '#000'); rect(g, ex + sx - 30, 74, 60, 6, '#111'); }
      if (!who) rect(g, 0, 60, W, 8, '#d02020');
      letterbox(g, 46);
      sub(S, who ? 'Le Tigre Noir : …' : 'Lee : Le poing du dragon ne connaît pas la peur.', '#fff');
    }],
    [10, (g, lt, k, S) => {
      temple(g, lt);
      const ch = Math.min(1, lt / 3), kk = lt > 3 ? smooth((lt - 3) * 4) : 0;
      if (lt < 3.6) { g.globalAlpha = 0.25 + ch * 0.3; circle(g, 100, 130, 30 + ch * 20 + Math.sin(lt * 20) * 3, '#ffd23a'); g.globalAlpha = 1; }
      puppet(g, 100, 176, 2.3, { aL: [-1.2, -0.6], aR: [1.57 * kk + (1 - kk) * 0.4, 0], lL: [0.6, 0.1], lR: [-0.5, -0.1] }, { ...LEE, face: 1 });
      const fly = lt > 3.3 ? (lt - 3.3) : 0;
      g.save(); g.translate(170 + fly * 80, 176 - Math.sin(Math.min(fly, 1.5) * 2) * 40); g.rotate(fly * 2);
      puppet(g, 0, 0, 2.3, { aL: [-2.4, 0], aR: [2.4, 0], lL: [0.6, 0], lR: [-0.6, 0] }, { ...TIGRE, face: -1 });
      g.restore();
      if (lt > 3.2 && lt < 4.5) drawTextS(g, 'KRAAAK !', 150, 70, '#fff', 3, 'center', '#a00');
      if (lt > 3) speedLines(g, lt, 'rgba(255,230,120,0.4)');
    }],
    [8, (g, lt, k, S) => {
      temple(g, lt);
      const bow = Math.min(1, lt / 2) * 0.6;
      puppet(g, 128, 176, 2.4, { lean: bow, aL: [-0.3, -1.4], aR: [0.3, 1.4] }, { ...LEE });
      sub(S, 'Maître Wu (voix) : Tu es devenu le Dragon, Lee.', '#fff');
    }],
    [4, finCard('FIN', '#ffd23a', '#a00')],
    [1.5, snow],
  ];
  return tape(S, 'Le Poing du Dragon', scenes);
}
function mirrorPose(p) {
  const m = (a) => (a ? [-a[0], -a[1]] : a);
  return { ...p, lean: -(p.lean || 0), aL: m(p.aR), aR: m(p.aL), lL: m(p.lR), lR: m(p.lL) };
}

// ═════════════════════════ LE SHÉRIF DE DODGE ═════════════════════════
const SHERIF = { skin: '#e0b088', top: '#c8a060', sleeve: '#c8a060', bottom: '#4a3a2a', hat: 'cowboy', hatColor: '#e8e0c8', mous: '#5a3a1a', badge: '#ffd23a', belt: '#3a2a1a', shoes: '#3a2010' };
const JACK = { skin: '#d8a880', top: '#2a2a2a', sleeve: '#2a2a2a', bottom: '#3a3030', hat: 'cowboy', hatColor: '#111', mous: '#111', belt: '#111', shoes: '#111' };
function sepia(g, a = 0.18) { g.fillStyle = `rgba(150,100,40,${a})`; g.fillRect(0, 0, W, H); }
function westTown(g, lt) {
  grad(g, 0, 0, W, 100, '#f0c070', '#f8e0a8');
  circle(g, 200, 30, 14, '#fff4c0');
  poly(g, [0, 100, 30, 80, 70, 90, 120, 74, 170, 92, 220, 78, 256, 90, 256, 100], '#c89060');
  const bld = (x, w, h, c, name) => { rect(g, x, 100 - h + 40, w, h, c); rect(g, x - 2, 100 - h + 40, w + 4, 6, '#5a3a1a'); rect(g, x + w / 2 - 6, 116, 12, 24, '#3a2010'); if (name) { rect(g, x + 4, 100 - h + 48, w - 8, 10, '#e8d8b0'); drawText(g, name, x + w / 2, 100 - h + 50, '#5a2a0a', 1, 'center'); } };
  bld(4, 70, 70, '#a8703a', 'SALOON'); bld(82, 54, 60, '#8a5a2a', 'BANQUE'); bld(144, 46, 50, '#9a6a3a', null); bld(196, 58, 64, '#a07040', 'SHÉRIF');
  rect(g, 0, 140, W, 52, '#d8b078');
  g.fillStyle = '#c8a068'; for (let i = 0; i < 20; i++) g.fillRect(hash(i) * W, 145 + hash(i + 3) * 45, 6, 1);
}
function tumbleweed(g, x, y, r, rot) { g.strokeStyle = '#8a6a3a'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(x, y, r, r * 0.7, rot + i * 0.6, 0, TAU); g.stroke(); } }
function horse(g, x, y, s, ph, col = '#6a3a1a') {
  ellipse(g, x, y - 16 * s, 14 * s, 6 * s, col);
  for (const [lx, o] of [[-9, 0], [-6, 2], [8, 1], [11, 3]]) { const a = Math.sin(ph + o) * 0.5; line(g, x + lx * s, y - 12 * s, x + lx * s + Math.sin(a) * 5 * s, y, col, 2.4 * s); }
  g.save(); g.translate(x + 12 * s, y - 20 * s); g.rotate(-0.6); rect(g, 0, -3 * s, 12 * s, 6 * s, col); g.restore();
  ellipse(g, x + 21 * s, y - 28 * s, 6 * s, 3.2 * s, col, 0.4);
  line(g, x - 14 * s, y - 18 * s, x - 19 * s, y - 8 * s + Math.sin(ph) * 2 * s, '#2a1a0a', 2 * s);
}
function vhsWestern(S) {
  const scenes = [
    ...intro('SAGUARO FILMS', '#5a3a0a', '#e8a040', 1),
    [5, (g, lt) => {
      grad(g, 0, 0, W, H, '#f0a050', '#fff0c0');
      rect(g, 0, 140, W, 52, '#d8a068');
      for (const [x, h] of [[40, 50], [210, 64]]) { rect(g, x, 140 - h, 10, h, '#3a7a3a'); rect(g, x - 10, 140 - h * 0.7, 10, 6, '#3a7a3a'); rect(g, x - 10, 140 - h * 0.7 - 14, 6, 16, '#3a7a3a'); rect(g, x + 10, 140 - h * 0.5, 10, 6, '#3a7a3a'); rect(g, x + 14, 140 - h * 0.5 - 12, 6, 14, '#3a7a3a'); }
      drawTextS(g, 'LE SHÉRIF', W / 2, 36, '#7a2a0a', 3, 'center', '#ffe0a0');
      drawTextS(g, 'DE DODGE', W / 2, 70, '#7a2a0a', 3, 'center', '#ffe0a0');
      sepia(g, 0.1);
    }],
    [10, (g, lt, k, S) => { westTown(g, lt); tumbleweed(g, -20 + lt * 30, 170 - Math.abs(Math.sin(lt * 4)) * 8, 7, lt * 5); sepia(g); sub(S, 'Dodge, 1878.', '#fff'); }],
    [10, (g, lt, k, S) => {
      westTown(g, lt);
      const x = 280 - lt * 22;
      horse(g, x, 176, 1.8, lt * 10, '#2a1a10');
      puppet(g, x + 2, 172, 1.6, { aL: [0.6, 0.3], aR: [-0.6, -0.3], lL: [0.9, -0.3], lR: [-0.9, 0.3] }, { ...JACK, face: -1 });
      sepia(g); sub(S, 'Black Jack est revenu en ville…', '#fff');
    }],
    [8, (g, lt, k, S) => {
      westTown(g, lt);
      const x = Math.min(200, 226 - lt * 10);
      puppet(g, x, 176, 2.2, { aL: [0.3, 0.2], aR: [-0.25, -0.1], lL: [Math.sin(lt * 5) * 0.2, 0], lR: [-Math.sin(lt * 5) * 0.2, 0] }, { ...SHERIF, face: -1, mouth: lt > 3 ? (lt * 6 | 0) % 2 + 1 : 0 });
      sepia(g); sub(S, 'Le shérif : Cette ville est trop petite pour nous deux, Jack.', '#fff');
    }],
    [12, (g, lt, k, S) => {
      westTown(g, lt);
      rect(g, 120, 30, 16, 40, '#8a5a2a'); circle(g, 128, 44, 9, '#f4ecd8'); circle(g, 128, 44, 9.5, 'rgba(0,0,0,0)');
      const mn = lt < 9 ? -0.1 : 0;
      line(g, 128, 44, 128 + Math.sin(mn) * 7, 44 - Math.cos(mn) * 7, '#111', 1.5); line(g, 128, 44, 128, 39, '#111', 2);
      puppet(g, 40, 176, 1.7, { aL: [0.3, 0.1], aR: [-0.3, -0.1] }, { ...SHERIF, face: 1 });
      puppet(g, 216, 176, 1.7, { aL: [0.3, 0.1], aR: [-0.3, -0.1] }, { ...JACK, face: -1 });
      tumbleweed(g, 270 - lt * 26, 172 - Math.abs(Math.sin(lt * 4)) * 6, 6, -lt * 5);
      sepia(g); sub(S, lt < 9 ? 'À midi. Devant le saloon.' : '(Midi sonne.)', '#fff');
    }],
    [8, (g, lt, k, S) => {
      const sh = Math.floor(lt / 1.3) % 3;
      if (sh === 2) { rect(g, 0, 0, W, H, '#d8b078'); for (const [x, c] of [[70, '#4a3a2a'], [186, '#3a3030']]) { rect(g, x - 20, 40, 40, 100, c); rect(g, x - 10, 120, 20, 30, '#2a1a0a'); rect(g, x + 18, 90, 10, 18, '#e0b088'); } }
      else {
        rect(g, 0, 0, W, H, sh ? '#d8a880' : '#e0b088');
        for (const sx of [-46, 46]) { ellipse(g, 128 + sx, 96, 22, 8, '#f4f0e0'); circle(g, 128 + sx + (sh ? 8 : -8), 96, 6, sh ? '#222' : '#3a6a9a'); circle(g, 128 + sx + (sh ? 8 : -8), 96, 2.5, '#000'); rect(g, 128 + sx - 26, 80, 52, 4, sh ? '#111' : '#8a6a3a'); }
        rect(g, 0, 40, W, 26, sh ? '#111' : '#e8e0c8');
      }
      letterbox(g, 44); sepia(g);
    }],
    [6, (g, lt, k, S) => {
      westTown(g, lt);
      const shot = lt > 1.5;
      puppet(g, 40, 176, 1.7, { aL: [0.3, 0.1], aR: shot ? [-1.57, 0] : [-0.3, -0.1] }, { ...SHERIF, face: 1 });
      if (lt > 1.5 && lt < 1.8) { star(g, 60, 150, 8, '#fff8a0', 6); drawTextS(g, 'PAN !', 70, 110, '#fff', 3, 'center', '#a00'); }
      const hatFly = shot ? (lt - 1.5) : 0;
      puppet(g, 216, 176, 1.7, shot ? { aL: [-2.8, 0], aR: [2.8, 0] } : { aL: [0.3, 0.1], aR: [-0.3, -0.1] }, { ...JACK, face: -1, hat: shot ? null : 'cowboy' });
      if (shot) { ellipse(g, 216 + hatFly * 30, 140 - Math.sin(Math.min(hatFly, 1.6) * 2) * 40 + Math.max(0, hatFly - 1.6) * 40, 7, 1.5, '#111'); rect(g, 212 + hatFly * 30, 134 - Math.sin(Math.min(hatFly, 1.6) * 2) * 40 + Math.max(0, hatFly - 1.6) * 40, 8, 5, '#111'); }
      sepia(g); if (lt > 2.5) sub(S, 'Black Jack : D\'accord, d\'accord ! Je me rends !', '#fff');
    }],
    [10, (g, lt, k, S) => {
      grad(g, 0, 0, W, 130, '#e85a2a', '#ffc070'); circle(g, 128, 120, 34, '#ffe04a');
      rect(g, 0, 128, W, 64, '#8a5a2a');
      const x = 80 + lt * 9, s = Math.max(0.6, 1.8 - lt * 0.12);
      horse(g, x, 160 - lt * 2, s, lt * 6, '#1a0a05'); puppet(g, x + 2, 160 - lt * 2 - 2.9 * s, s * 0.9, { lL: [0.9, -0.3], lR: [-0.9, 0.3] }, { ...SHERIF, face: 1, top: '#1a0a05', sleeve: '#1a0a05', bottom: '#1a0a05', skin: '#1a0a05', hatColor: '#1a0a05', badge: null, noFace: true });
      sepia(g, 0.1); sub(S, 'Le shérif : Il y aura toujours un shérif à Dodge.', '#fff');
    }],
    [4, finCard('FIN', '#ffe0a0', '#5a2a0a')],
    [1.5, snow],
  ];
  return tape(S, 'Le Shérif de Dodge', scenes);
}

// ═════════════════════════ PLANÈTE ROUGE ═════════════════════════
const ASTRO = { skin: '#f0c8a8', top: '#eef0f4', sleeve: '#eef0f4', bottom: '#eef0f4', shoes: '#888', hat: 'helmet', glove: '#ccc', belt: '#c33' };
function spaceStars(g, t, sp = 1) {
  rect(g, 0, 0, W, H, '#02030a');
  for (let i = 0; i < 70; i++) { const z = 0.3 + hash(i) * 0.7, x = ((hash(i * 3) * W - t * 40 * z * sp) % W + W) % W, y = hash(i * 7) * H; rect(g, x, y, z > 0.8 ? 2 : 1, 1, z > 0.7 ? '#fff' : '#889'); }
}
function ship(g, x, y, s, flame = 0, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  if (flame) { poly(g, [-18 * s, -3 * s, -(26 + flame * 10) * s, 0, -18 * s, 3 * s], '#ffb030'); poly(g, [-18 * s, -1.5 * s, -(22 + flame * 6) * s, 0, -18 * s, 1.5 * s], '#fff8a0'); }
  poly(g, [-18 * s, -6 * s, 14 * s, -4 * s, 24 * s, 0, 14 * s, 4 * s, -18 * s, 6 * s], '#e8ecf0');
  rect(g, -14 * s, -1 * s, 26 * s, 2 * s, '#d02a2a');
  poly(g, [-14 * s, -6 * s, -20 * s, -14 * s, -6 * s, -6 * s], '#b8bcc8'); poly(g, [-14 * s, 6 * s, -20 * s, 14 * s, -6 * s, 6 * s], '#b8bcc8');
  ellipse(g, 12 * s, -2 * s, 5 * s, 2 * s, '#3ac8ff');
  g.restore();
}
function marsGround(g, lt) {
  grad(g, 0, 0, W, 110, '#2a0a10', '#c8604a');
  circle(g, 60, 30, 8, '#e8d0b0'); circle(g, 200, 20, 4, '#c8b0a0');
  poly(g, [0, 110, 50, 86, 100, 100, 160, 80, 210, 98, 256, 88, 256, 120, 0, 120], '#8a3020');
  rect(g, 0, 118, W, 74, '#b8503a');
  for (let i = 0; i < 14; i++) ellipse(g, hash(i) * W, 130 + hash(i + 4) * 60, 4 + hash(i + 8) * 8, 2 + hash(i + 2) * 3, '#8a3a2a');
}
function vhsScifi(S) {
  const scenes = [
    ...intro('COSMOS VIDÉO', '#0a0a3a', '#7ac8ff', 0),
    [6, (g, lt) => {
      rect(g, 0, 0, W, H, '#000');
      for (let i = 0; i < 60; i++) { const a = hash(i) * TAU, r0 = (hash(i + 3) * 40 + lt * 60 * (0.5 + hash(i + 9))) % 160; line(g, W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0, W / 2 + Math.cos(a) * (r0 + 6 + r0 * 0.1), H / 2 + Math.sin(a) * (r0 + 6 + r0 * 0.1), '#aac'); }
      if (lt > 2) { drawTextS(g, 'PLANÈTE', W / 2, 60, '#ff3a2a', 3, 'center', '#300'); drawTextS(g, 'ROUGE', W / 2, 92, '#ff3a2a', 3, 'center', '#300'); }
    }],
    [10, (g, lt, k, S) => { spaceStars(g, lt, 2); ship(g, 100 + Math.sin(lt) * 10, 96 + Math.sin(lt * 1.3) * 8, 2, 1 + Math.sin(lt * 20) * 0.3); sub(S, 'Commandant Morel : Journal de bord, jour 213.', '#fff'); }],
    [10, (g, lt, k, S) => {
      spaceStars(g, lt, 0.5);
      const r = 30 + lt * 9;
      circle(g, 190, 100, r, '#c8402a'); circle(g, 190 - r * 0.2, 100 - r * 0.25, r * 0.85, '#d8583a');
      for (let i = 0; i < 5; i++) ellipse(g, 190 + (hash(i) - 0.5) * r, 100 + (hash(i + 5) - 0.5) * r, r * 0.18, r * 0.06, '#a0301a');
      ship(g, 70 + lt * 4, 80, 1.2, 1);
      sub(S, 'Nous approchons de la planète rouge.', '#fff');
    }],
    [10, (g, lt, k, S) => {
      marsGround(g, lt);
      const y = Math.min(124, 20 + lt * 16);
      ship(g, 128, y, 1.8, y < 124 ? 1 : 0, -Math.PI / 2);
      if (y < 124 && y > 80) for (let i = 0; i < 10; i++) { g.globalAlpha = 0.5; circle(g, 128 + (hash(i + (lt * 10 | 0)) - 0.5) * 80, 128 + hash(i) * 10, 4 + hash(i + 3) * 6, '#d8886a'); g.globalAlpha = 1; }
      sub(S, lt < 6 ? 'Descente… contact dans dix secondes.' : 'L\'Aigle s\'est posé.', '#fff');
    }],
    [12, (g, lt, k, S) => {
      marsGround(g, lt);
      ship(g, 50, 124, 1.4, 0, -Math.PI / 2);
      const x = 90 + lt * 6, b = Math.abs(Math.sin(lt * 2.2)) * 6;
      if (lt > 6) { rect(g, 180, 104, 2, 30, '#ccc'); rect(g, 182, 104, 16, 10, '#2a5ae8'); rect(g, 182, 104, 16, 3, '#fff'); }
      puppet(g, Math.min(x, 172), 160 - b, 1.9, { aL: [-0.5 - (lt > 6 ? 1 : 0), -0.3], aR: [0.5, 0.3], lL: [Math.sin(lt * 4.4) * 0.4, 0], lR: [-Math.sin(lt * 4.4) * 0.4, 0] }, ASTRO);
      sub(S, lt < 6 ? 'Morel : Aucun signe de vie… pour l\'instant.' : 'Morel : Au nom de toute l\'humanité…', '#fff');
    }],
    [10, (g, lt, k, S) => {
      marsGround(g, lt);
      rect(g, 150, 50, 22, 70, '#050505'); rect(g, 150, 50, 2, 70, '#333');
      for (let i = 0; i < 4; i++) { const r = ((lt * 30 + i * 25) % 100); g.strokeStyle = `rgba(120,255,200,${1 - r / 100})`; g.lineWidth = 1; g.beginPath(); g.arc(161, 80, r, 0, TAU); g.stroke(); }
      puppet(g, 90, 160, 1.9, { aL: [-1.3, -0.2], aR: [0.4, 0.3] }, { ...ASTRO, face: 1 });
      sub(S, 'Morel : Il y a quelque chose… là-bas. Un signal.', '#fff');
    }],
    [10, (g, lt, k, S) => {
      rect(g, 0, 0, W, H, '#100404');
      if (lt < 5) {
        for (let i = 0; i < 6; i++) { const blink = hash(i + ((lt * 2) | 0)) > 0.15; if (blink) { const x = 40 + i * 34, y = 60 + (i % 3) * 22; ellipse(g, x, y, 5, 2.4, '#7aff6a'); ellipse(g, x + 12, y, 5, 2.4, '#7aff6a'); } }
        sub(S, 'Morel : Retour au vaisseau ! TOUT DE SUITE !', '#fff');
      } else {
        marsGround(g, lt);
        const y = 124 - (lt - 5) ** 2 * 10;
        ship(g, 128, y, 1.8, 1.4, -Math.PI / 2);
        for (let i = 0; i < 3; i++) if ((lt * 4 + i) % 2 < 0.3) line(g, 30 + i * 90, 190, 128, y, '#7aff6a', 2);
      }
    }],
    [6, (g, lt, k, S) => { spaceStars(g, lt, 3); ship(g, 128 + lt * 30, 96, 1.4, 1.5); sub(S, 'À suivre…', '#fff'); }],
    [4, finCard('FIN ?', '#ff3a2a')],
    [1.5, snow],
  ];
  return tape(S, 'Planète Rouge', scenes);
}

// ═════════════════════════ LA NUIT DES MANNEQUINS ═════════════════════════
function mannequin(g, x, y, s, pose, lit = 1) {
  const c = lit > 0.5 ? '#e8dcc8' : '#8a8274', d = lit > 0.5 ? '#b8ac98' : '#5a5448';
  const st = { skin: c, top: c, sleeve: c, bottom: c, legs: c, shoes: d, noFace: true };
  const p = [
    { aL: [-0.2, 0], aR: [0.2, 0] },
    { aL: [-1.4, -0.6], aR: [0.3, 0.2], head: 0.3 },
    { aL: [-2.6, 0], aR: [2.6, 0], head: -0.2 },
    { aL: [-1.57, 0], aR: [1.57, 0], lean: 0.12 },
  ][pose % 4];
  puppet(g, x, y, s, p, st);
}
function boutique(g, dark = 1, door = false) {
  rect(g, 0, 0, W, H, '#0e0c14');
  rect(g, 0, 0, W, 120, '#1a1624');
  for (let i = 0; i < 5; i++) rect(g, 10 + i * 52, 30, 40, 60, '#221c30');
  rect(g, 0, 120, W, 72, '#16121e');
  for (let i = -8; i <= 8; i++) line(g, W / 2 + i * 12, 120, W / 2 + i * 50, H, '#1e1a28');
  if (door) { rect(g, 108, 50, 40, 70, '#2a2a34'); rect(g, 112, 40, 32, 8, '#0a6a2a'); drawText(g, 'SORTIE', 128, 41, '#6f6', 1, 'center'); }
  g.fillStyle = `rgba(0,0,0,${0.25 * dark})`; g.fillRect(0, 0, W, H);
}
const HEROINE = { skin: '#f0c8a8', top: '#e8e0d0', sleeve: '#e8e0d0', bottom: '#3a4a6a', hair: '#e8c070', longHair: true };
function vhsHorror(S) {
  const flash = (g, lt, x0, y0, ang) => { g.globalAlpha = 0.2; poly(g, [x0, y0, x0 + Math.cos(ang - 0.25) * 200, y0 + Math.sin(ang - 0.25) * 200, x0 + Math.cos(ang + 0.25) * 200, y0 + Math.sin(ang + 0.25) * 200], '#fff8d0'); g.globalAlpha = 1; };
  const scenes = [
    ...intro('NUIT NOIRE VIDÉO', '#1a0000', '#a00', 2),
    [6, (g, lt) => {
      rect(g, 0, 0, W, H, '#000');
      mannequin(g, W / 2, 180, 3, 0, 0.3);
      drawTextS(g, 'LA NUIT', W / 2, 26, '#c00', 3, 'center', '#200');
      drawTextS(g, 'DES MANNEQUINS', W / 2, 58, '#c00', 2, 'center', '#200');
      for (let i = 0; i < 8; i++) { const x = 40 + i * 24, l = (lt * 6 + hash(i) * 10) % 14; rect(g, x, 72, 2, l, '#a00'); }
    }],
    [8, (g, lt, k, S) => {
      boutique(g);
      mannequin(g, 60, 150, 2, 0); mannequin(g, 128, 146, 2, 1); mannequin(g, 196, 150, 2, 3);
      for (const x of [60, 128, 196]) rect(g, x - 16, 150, 32, 6, '#2a2430');
      const hx = Math.min(80, -20 + lt * 30);
      puppet(g, hx, 182, 2.2, { aL: [0.3, 0.2], aR: [1.4, 0], lL: [Math.sin(lt * 5) * 0.3, 0], lR: [-Math.sin(lt * 5) * 0.3, 0] }, { ...HEROINE, face: 1 });
      flash(g, lt, hx + 16, 140, -0.2 + Math.sin(lt) * 0.2);
      sub(S, 'Claire : Il y a quelqu\'un ?', '#fff');
    }],
    [5, (g, lt, k, S) => {
      boutique(g, 1, true);
      flash(g, lt, 20, 190, -0.9);
      sub(S, '(Un bruit, derrière elle.)', '#ccc');
    }],
    [6, (g, lt, k, S) => {
      boutique(g);
      for (const x of [60, 128, 196]) rect(g, x - 16, 150, 32, 6, '#2a2430');
      mannequin(g, 92, 168, 2.5, 2); mannequin(g, 150, 172, 2.6, 3); mannequin(g, 210, 166, 2.4, 1);
      puppet(g, 40, 182, 2.2, { aL: [0.3, 0.2], aR: [1.2, 0] }, { ...HEROINE, face: 1, mouth: 3 });
      sub(S, 'Claire : Ils… ils ont bougé !', '#fff');
    }],
    [6, (g, lt, k, S) => {
      boutique(g, 1, true);
      const x = Math.min(124, 40 + lt * 40), push = lt > 2.2 ? Math.sin(lt * 14) * 2 : 0;
      puppet(g, x + push, 132, 1.4, { aL: [1.4, 0.2], aR: [1.3, 0.1], lean: 0.15 }, { ...HEROINE, face: 1, mouth: 2 });
      sub(S, lt < 2.2 ? '(Elle court vers la sortie.)' : 'Claire : C\'est fermé ! Ouvrez ! OUVREZ !', '#fff');
    }],
    [4, (g, lt, k, S) => {
      rect(g, 0, 0, W, H, '#0c0a10');
      puppet(g, 128, 300, 7, { aL: [0.3, 0], aR: [-0.3, 0] }, { ...HEROINE, face: lt < 2 ? 0 : -1, mouth: 2 });
      sub(S, '(Elle se retourne lentement.)', '#ccc');
    }],
    [5, (g, lt, k, S) => {
      boutique(g);
      puppet(g, 100, 182, 2.4, { aL: [-0.3, -0.2], aR: [0.3, 0.2] }, { ...HEROINE, face: -1 });
      mannequin(g, 150, 186, 2.8, 2); mannequin(g, 186, 184, 2.7, 3); mannequin(g, 66, 184, 2.6, 2);
      sub(S, '…', '#fff');
    }],
    [3, (g, lt) => {
      rect(g, 0, 0, W, H, (lt * 10 | 0) % 2 ? '#600' : '#000');
      drawTextS(g, 'AAAAAH !', W / 2, 80, '#fff', 3, 'center', '#a00');
    }],
    [5, (g, lt) => {
      rect(g, 0, 0, W, H, '#050406');
      ellipse(g, 128, 100, 56, 72, '#d8ccb8'); ellipse(g, 128, 104, 50, 64, '#e8dcc8');
      g.save(); g.translate(128, 100); g.rotate(Math.min(lt, 3) * 0.12); rect(g, -30, 2, 60, 1, '#c8bca8'); g.restore();
      if (lt > 3.5) { ellipse(g, 108, 90, 7, 3, '#000'); ellipse(g, 148, 90, 7, 3, '#000'); }
    }],
    [4, finCard('FIN ?', '#c00')],
    [1.5, snow],
  ];
  return tape(S, 'La Nuit des Mannequins', scenes, { tracking: 0.5 });
}

// ═════════════════════════ KARAOKÉ PARTY ═════════════════════════
const SONGS = [
  { t: 'AU CLAIR DE LA LUNE', tempo: 0.42, lines: ['Au clair de la lune,', 'Mon ami Pierrot,', 'Prête-moi ta plume', 'Pour écrire un mot.', 'Ma chandelle est morte,', 'Je n\'ai plus de feu.', 'Ouvre-moi ta porte', 'Pour l\'amour de Dieu.'] },
  { t: 'FRÈRE JACQUES', tempo: 0.4, lines: ['Frère Jacques,', 'Frère Jacques,', 'Dormez-vous ?', 'Dormez-vous ?', 'Sonnez les matines,', 'Sonnez les matines,', 'Ding, dang, dong !', 'Ding, dang, dong !'] },
  { t: 'À LA CLAIRE FONTAINE', tempo: 0.44, lines: ['À la claire fontaine', 'M\'en allant promener,', 'J\'ai trouvé l\'eau si belle', 'Que je m\'y suis baigné.', 'Il y a longtemps que je t\'aime,', 'Jamais je ne t\'oublierai.'] },
];
function syl(word) { const w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüç]/g, ''); const m = w.match(/[aeiouyàâäéèêëîïôöùûü]+/g); let n = m ? m.length : 1; if (n > 1 && /[^aeiouy]es?$|[^aeiouy]ent$/.test(w) && !/[éè]es?$/.test(w)) n--; return Math.max(1, n); }
const SONG_DATA = SONGS.map((s) => {
  let t = 3;
  const lines = s.lines.map((l) => {
    const words = l.split(' ');
    let c = 0;
    const wd = words.map((w) => { const b = syl(w); const o = { w, c0: c, c1: c + w.length, t0: t, t1: t + b * s.tempo }; c += w.length + 1; t += b * s.tempo; return o; });
    wd[wd.length - 1].t1 += s.tempo;
    const r = { text: l, words: wd, t0: wd[0].t0, t1: wd[wd.length - 1].t1 };
    t = r.t1 + s.tempo;
    return r;
  });
  return { ...s, lines, dur: t + 1.5 };
});
const LINE_CACHE = new Map();
function lineCanvas(text, col) {
  const key = text + '|' + col;
  let c = LINE_CACHE.get(key);
  if (!c) {
    const w = textWidth(text, 2) + 2;
    c = makeCanvas(w, 24); const g = c.getContext('2d');
    drawText(g, text, 2, 4, '#000', 2); drawText(g, text, 0, 2, col, 2);
    LINE_CACHE.set(key, c);
  }
  return c;
}
function karaokeLine(g, ln, t, y) {
  const white = lineCanvas(ln.text, '#fff'), col = lineCanvas(ln.text, '#ff3ad0');
  const sc = Math.min(1, (W - 8) / white.width), w = white.width * sc, x = (W - w) / 2;
  g.drawImage(white, 0, 0, white.width, 24, x, y, w, 24);
  let px = 0;
  for (const wd of ln.words) { if (t >= wd.t1) px = wd.c1 * 12; else if (t > wd.t0) px = (wd.c0 + (wd.c1 - wd.c0) * (t - wd.t0) / (wd.t1 - wd.t0)) * 12; }
  if (px > 0) g.drawImage(col, 0, 0, Math.min(col.width, px + 2), 24, x, y, Math.min(col.width, px + 2) * sc, 24);
  const cur = ln.words.find((wd) => t >= wd.t0 && t < wd.t1);
  if (cur) {
    const k = (t - cur.t0) / (cur.t1 - cur.t0), cx = x + ((cur.c0 + cur.c1) / 2) * 12 * sc;
    circle(g, cx, y - 6 - Math.sin(k * Math.PI) * 10, 3.5, '#ffe04a');
  }
}
function disco(g, t) {
  grad(g, 0, 0, W, H, '#14002a', '#3a0a5a');
  for (let i = 0; i < 5; i++) { const a = t * 0.8 + i * 1.3, x = W / 2 + Math.cos(a) * 140; g.globalAlpha = 0.12; poly(g, [W / 2, 0, x - 30, H, x + 30, H], hsl(i * 70 + t * 30, 80, 60)); g.globalAlpha = 1; }
  circle(g, W / 2, 20, 14, '#bbb');
  for (let i = 0; i < 16; i++) rect(g, W / 2 - 12 + (i % 4) * 6, 8 + Math.floor(i / 4) * 6, 5, 5, (i + (t * 6 | 0)) % 3 ? '#eee' : '#888');
  for (let i = 0; i < 20; i++) { const x = (hash(i) * W + t * 20 * (hash(i + 1) - 0.5)) % W; rect(g, (x + W) % W, hash(i + 4) * 120, 1, 1, '#fff'); }
}
function vhsKaraoke(S) {
  const songScene = (sd) => [sd.dur, (g, lt, k, S) => {
    disco(g, lt);
    if (lt < 3) { rect(g, 6, 54, 244, 50, 'rgba(0,0,0,0.6)'); drawTextS(g, sd.t, W / 2, 64, '#ffe04a', textWidth(sd.t, 2) < 240 ? 2 : 1, 'center'); drawText(g, '(chanson traditionnelle)', W / 2, 88, '#ccc', 1, 'center'); return; }
    let i = sd.lines.findIndex((l) => lt < l.t1 + sd.tempo);
    if (i < 0) i = sd.lines.length - 1;
    const a = i - (i % 2);
    rect(g, 0, 112, W, 64, 'rgba(0,0,0,0.55)');
    const pairStart = a === 0 ? 3 : sd.lines[a - 1].t1 + sd.tempo * 0.5, off = Math.round(clamp(1 - (lt - pairStart) / 0.35, 0, 1) * 56);
    g.save(); g.beginPath(); g.rect(0, 112, W, 64); g.clip();
    if (off && sd.lines[a - 2]) { karaokeLine(g, sd.lines[a - 2], lt, 120 + off - 56); karaokeLine(g, sd.lines[a - 1], lt, 148 + off - 56); }
    if (sd.lines[a]) karaokeLine(g, sd.lines[a], lt, 120 + off);
    if (sd.lines[a + 1]) karaokeLine(g, sd.lines[a + 1], lt, 148 + off);
    g.restore();
    drawText(g, '♪ ' + sd.t, 6, 98, '#fff');
  }];
  const scenes = [
    [1.2, vcrBlue],
    [4, (g, lt) => { disco(g, lt); drawTextS(g, 'KARAOKÉ', W / 2, 60, '#ff3ad0', 3, 'center', '#000'); drawTextS(g, 'PARTY', W / 2, 92, '#ffe04a', 3, 'center', '#000'); drawText(g, 'VOLUME 3', W / 2, 126, '#fff', 1, 'center'); }],
    ...SONG_DATA.map(songScene),
    [5, (g, lt) => { disco(g, lt); drawTextS(g, 'MERCI D\'AVOIR', W / 2, 70, '#fff', 2, 'center'); drawTextS(g, 'CHANTÉ !', W / 2, 96, '#ff3ad0', 2, 'center'); }],
    [1.5, snow],
  ];
  return tape(S, 'Karaoké Party', scenes, { tracking: 0.3 });
}

// ═════════════════════════ PUB ROYAUME DU JOUET 1987 ═════════════════════════
function castle(g, x, y, s) {
  rect(g, x - 40 * s, y - 30 * s, 80 * s, 30 * s, '#ffb300');
  for (const tx of [-40, 28]) { rect(g, x + tx * s, y - 48 * s, 12 * s, 48 * s, '#ff8f00'); poly(g, [x + (tx - 2) * s, y - 48 * s, x + (tx + 6) * s, y - 62 * s, x + (tx + 14) * s, y - 48 * s], '#e53935'); rect(g, x + (tx + 6) * s, y - 70 * s, 1 * s, 8 * s, '#333'); poly(g, [x + (tx + 7) * s, y - 70 * s, x + (tx + 13) * s, y - 67 * s, x + (tx + 7) * s, y - 64 * s], '#3a5fa8'); }
  for (let i = 0; i < 7; i++) rect(g, x + (-40 + i * 12) * s, y - 34 * s, 6 * s, 4 * s, '#ffb300');
  rect(g, x - 9 * s, y - 20 * s, 18 * s, 20 * s, '#7a3a0a'); g.fillStyle = '#7a3a0a'; g.beginPath(); g.arc(x, y - 20 * s, 9 * s, Math.PI, 0); g.fill();
}
function toy(g, k, x, y, t) {
  if (k === 0) { rect(g, x - 7, y - 20, 14, 14, '#9aa'); rect(g, x - 5, y - 28, 10, 8, '#bcc'); rect(g, x - 3, y - 25, 2, 2, '#f33'); rect(g, x + 1, y - 25, 2, 2, '#f33'); rect(g, x - 5, y - 6, 4, 6, '#788'); rect(g, x + 1, y - 6, 4, 6, '#788'); rect(g, x - 11, y - 18 + Math.sin(t * 8) * 2, 4, 10, '#9aa'); rect(g, x + 7, y - 18 - Math.sin(t * 8) * 2, 4, 10, '#9aa'); }
  else if (k === 1) { rect(g, x - 16, y - 12, 22, 10, '#e33'); rect(g, x + 2, y - 20, 10, 18, '#3a5fa8'); rect(g, x - 12, y - 18, 4, 6, '#333'); circle(g, x - 10, y - 2, 3, '#222'); circle(g, x, y - 2, 3, '#222'); circle(g, x + 8, y - 2, 3, '#222'); }
  else if (k === 2) { poly(g, [x - 6, y, x + 6, y, x + 4, y - 14, x - 4, y - 14], '#ff7ac0'); circle(g, x, y - 18, 5, '#f4d0b0'); g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(x, y - 19, 5.5, Math.PI, 0); g.fill(); }
  else if (k === 3) { circle(g, x, y - 8 - Math.abs(Math.sin(t * 5)) * 10, 8, '#e33'); rect(g, x - 8, y - 9 - Math.abs(Math.sin(t * 5)) * 10, 16, 2, '#fff'); }
  else { ellipse(g, x, y - 14, 12, 6, '#c8803a'); ellipse(g, x + 11, y - 20, 4, 6, '#c8803a'); g.strokeStyle = '#7a4a1a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y - 4, 14, Math.PI * 1.15, Math.PI * 1.85, true); g.stroke(); }
}
function adBg(g, t, c1 = '#ffd23a', c2 = '#ff8f00') {
  rect(g, 0, 0, W, H, c1);
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? c2 : c1; g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, 240, i * TAU / 16 + t * 0.6, (i + 1) * TAU / 16 + t * 0.6); g.fill(); }
}
function confetti(g, t) { for (let i = 0; i < 30; i++) rect(g, (hash(i) * W + Math.sin(t + i) * 10) % W, (hash(i + 7) * H + t * 40 * (0.5 + hash(i + 3))) % H, 3, 2, ['#e33', '#3a5fa8', '#3ac86a', '#fff', '#ff3ad0'][i % 5]); }
function adScenes(creepy) {
  const dance = (lt) => ({ armL: -0.6 + Math.sin(lt * 7) * 0.9, armR: 0.6 - Math.sin(lt * 7 + 1) * 0.9, bounce: -Math.abs(Math.sin(lt * 7)) * 3 });
  const list = [
    [4, (g, lt) => { adBg(g, lt); const s = smooth(lt / 1.5); castle(g, W / 2, 150, 1.6 * s + 0.01); if ((lt * 4 | 0) % 2) drawTextS(g, 'NOUVEAU !', 52, 20, '#e33', 2, 'center', '#fff'); drawTextS(g, 'ROYAUME DU JOUET', W / 2, 160, '#e33', 2, 'center', '#fff'); }],
    [8, (g, lt, k, S) => { adBg(g, lt, '#7ad0ff', '#4ab0ff'); castle(g, 200, 170, 1); bobby(g, 100, 182, 1.6, { ...dance(lt), look: 0.6 }); sub(S, 'Bobby : Bonjour les amis ! C\'est moi, Bobby !', '#fff'); }],
    [8, (g, lt, k, S) => {
      adBg(g, lt, '#ff9ad0', '#ff6ab0');
      for (let i = 0; i < 5; i++) toy(g, i, ((i * 70 + lt * 50) % 380) - 40, 150 + (i % 2) * 14, lt);
      confetti(g, lt);
      drawTextS(g, 'DES MILLIERS', W / 2, 30, '#fff', 2, 'center', '#a0f'); drawTextS(g, 'DE JOUETS !', W / 2, 52, '#fff', 2, 'center', '#a0f');
    }],
    [8, (g, lt, k, S) => {
      adBg(g, lt, '#7ad0ff', '#4ab0ff'); castle(g, 190, 176, 1.2);
      bobby(g, 70 + lt * 6, 182, 1.3, { ...dance(lt), look: 1 });
      KIDS.slice(0, 3).forEach((st, i) => puppet(g, 120 + i * 26 + lt * 6, 182, 1.4, { aL: [-2.6, 0], aR: [2.6, 0], lL: [Math.sin(lt * 10 + i) * 0.5, 0], lR: [-Math.sin(lt * 10 + i) * 0.5, 0] }, { ...st, face: 1, mouth: 2 }));
      sub(S, 'Les enfants : Viens jouer avec nous, Bobby !', '#fff');
    }],
    [6, (g, lt) => {
      adBg(g, lt, '#3a5fa8', '#2a4a88'); confetti(g, lt);
      drawTextS(g, 'CENTRE COMMERCIAL', W / 2, 40, '#ffd23a', 2, 'center', '#000');
      drawTextS(g, 'HÉLIOS', W / 2, 62, '#fff', 3, 'center', '#000');
      drawTextS(g, 'GRANDE OUVERTURE', W / 2, 104, '#fff', 2, 'center', '#000');
      drawTextS(g, 'LE 14 NOVEMBRE 1987 !', W / 2, 128, '#ffd23a', 2, 'center', '#000');
    }],
    [6, (g, lt, k, S) => {
      adBg(g, lt); bobby(g, 128, 182, 1.5, { ...dance(lt), look: 0.3 });
      rect(g, 8, 10, 120, 40, '#e33'); drawText(g, 'POUR L\'OUVERTURE :', 68, 16, '#fff', 1, 'center'); drawText(g, 'UNE PELUCHE BOBBY', 68, 28, '#ffd23a', 1, 'center'); drawText(g, 'OFFERTE !', 68, 38, '#fff', 1, 'center');
      sub(S, 'Pour tout achat, une peluche Bobby offerte !', '#fff');
    }],
    [creepy ? 12 : 7, (g, lt, k, S) => {
      adBg(g, lt, '#7ad0ff', '#4ab0ff'); castle(g, 206, 170, 0.9);
      let look = 0.8, pupil = 1.7, tilt = 0, d = dance(lt);
      if (creepy && lt > 3) {
        const p = smooth((lt - 3) / 6.5);
        look = 0.8 * (1 - p); pupil = 1.7 - p * 1.1; tilt = p * 0.12;
        d = { armL: lerp(d.armL, -0.3, p), armR: lerp(d.armR, 0.3, p), bounce: d.bounce * (1 - p) };
      }
      bobby(g, 104, 184, 1.75, { ...d, look, pupil, tilt });
      drawTextS(g, 'AU ROYAUME DU JOUET,', W / 2, 18, '#e33', 1, 'center', '#fff');
      drawTextS(g, 'BOBBY T\'ATTEND !', W / 2, 32, '#e33', 2, 'center', '#fff');
      if (!creepy || lt < 3) sub(S, '♪ Au Royaume du Jouet, Bobby t\'attend ! ♪', '#fff');
    }],
    [6, (g, lt, k, S) => {
      adBg(g, lt); castle(g, W / 2, 112, 1.1);
      drawTextS(g, 'ROYAUME DU JOUET', W / 2, 120, '#e33', 2, 'center', '#fff');
      rect(g, 40, 144, 176, 32, '#e33'); frame(g, 40, 144, 176, 32, '#fff', 2);
      drawText(g, '☎ 0 800 BOBBY', W / 2, 148, '#fff', 2, 'center');
      drawText(g, '(0 800 26 229 — appel gratuit)', W / 2, 166, '#ffd23a', 1, 'center');
      if (!S.numSent) { S.numSent = true; S.emit?.('discover', { kind: 'number', id: '080026229' }); }
    }],
  ];
  return list;
}
function vhsBobbyAd(S) {
  const scenes = [
    [1.2, vcrBlue],
    ...adScenes(false),
    [1.2, snow],
    [3, (g, lt) => { rect(g, 0, 0, W, H, '#000'); drawText(g, 'VERSION LONGUE', W / 2, 90, '#888', 1, 'center'); }],
    ...adScenes(true),
    [2, snow],
  ];
  return tape(S, 'Pub Royaume du Jouet 1987', scenes, { tracking: 0.45 });
}

// ═════════════════════════ CCTV 14/11/87 (indice) ═════════════════════════
const GRAYS = ['#3a3a3a', '#4a4a4a', '#5a5a5a', '#6a6a6a', '#7a7a7a', '#8a8a8a', '#9a9a9a', '#aaa'];
function cctvShop(g, light = 1) {
  rect(g, 0, 0, W, H, light > 0.5 ? '#5a5a5a' : '#1c1c1c');
  rect(g, 0, 0, W, 58, light > 0.5 ? '#6a6a6a' : '#222');
  for (let i = 0; i < 5; i++) { const x = 2 + i * 34; rect(g, x, 12, 31, 44, light > 0.5 ? '#4a4a4a' : '#1a1a1a'); for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) rect(g, x + 3 + k * 10, 15 + j * 13, 8, 10, light > 0.5 ? GRAYS[(i + j + k) % 6 + 1] : '#262626'); }
  rect(g, 187, 18, 34, 40, light > 0.5 ? '#3a3a3a' : '#141414');
  rect(g, 175, 1, 58, 16, light > 0.5 ? '#ddd' : '#4a4a4a');
  drawText(g, 'PERSONNEL', 204, 2, '#222', 1, 'center'); drawText(g, 'SOUS-SOL', 204, 10, '#222', 1, 'center');
  rect(g, 215, 38, 2, 3, '#888');
  if (light > 0.5) { for (let i = 0; i < 9; i++) line(g, 6 + i * 24, 3, 18 + i * 24, 8, '#999'); rect(g, 70, 2, 90, 9, '#ccc'); drawText(g, 'INAUGURATION', 115, 3, '#333', 1, 'center'); }
  for (let y = 60; y < H; y += 14) rect(g, 0, y, W, 1, light > 0.5 ? '#525252' : '#181818');
  for (let i = -6; i <= 6; i++) line(g, 128 + i * 24, 58, 128 + i * 60, H, light > 0.5 ? '#525252' : '#181818');
}
function cctvOsd(g, cam, clock, rec = true, t = 0) {
  drawTextS(g, cam, 6, 6, '#eee');
  drawTextS(g, '14/11/1987  ' + clock, 6, H - 18, '#eee');
  if (rec && (t * 1.5 | 0) % 2 === 0) { circle(g, W - 10, 23, 2.5, '#eee'); drawText(g, 'REC', W - 16, 20, '#eee', 1, 'right'); }
}
function clockStr(sec) { sec = Math.floor(sec); return String(Math.floor(sec / 3600) % 24).padStart(2, '0') + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
const CROWD = Array.from({ length: 16 }, (_, i) => ({ x: 20 + hash(i * 3) * 216, y: 80 + hash(i * 5) * 96, sp: 0.3 + hash(i) * 0.7, ph: hash(i * 7) * 10, s: 0.75 + hash(i * 11) * 0.35, sh: GRAYS[(i * 3) % 8], pa: GRAYS[(i * 5 + 1) % 4], balloon: hash(i * 13) > 0.75 }));
function crowd(g, t, n = 16, freeze = false, dark = false) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const c = CROWD[i];
    const x = c.x + (freeze ? 0 : Math.sin(t * 0.2 * c.sp + c.ph) * 22), y = c.y + (freeze ? 0 : Math.cos(t * 0.15 * c.sp + c.ph) * 8);
    list.push({ y, f: () => {
      if (dark) { figure(g, x, y, c.s * 0.75, '#0a0a0a'); return; }
      person(g, x, y, c.s, { skin: '#aaa', shirt: c.sh, pants: c.pa, hair: '#333', legs: freeze ? 0 : t * 4 * c.sp + c.ph });
      if (c.balloon) { line(g, x + 6 * c.s, y - 26 * c.s, x + 9 * c.s, y - 50 * c.s, '#999'); circle(g, x + 9 * c.s, y - 54 * c.s, 5 * c.s, '#bbb'); }
    } });
  }
  return list;
}
function vhsSecurity(S) {
  const BASE = 20 * 3600 + 44 * 60 + 10;
  const sceneShop = (offset, lit, extra) => (g, lt, k, S) => {
    const clock = BASE + offset + lt;
    cctvShop(g, lit);
    const items = crowd(g, clock * 0.25, 16, false);
    extra(g, lt, items, clock);
    items.sort((a, b) => a.y - b.y).forEach((it) => it.f());
    scanlines(g, 0.3);
    cctvOsd(g, 'CAM 03 — ROYAUME DU JOUET', clockStr(clock), true, S.t);
  };
  const pair = (g, items, x, y, walk) => {
    items.push({ y, f: () => { bobby(g, x, y, 0.55, { gray: true, armR: 0.9, armL: -0.4 + Math.sin(walk) * 0.2, look: 0.4 }); girl(g, x + 13, y, 1, { gray: true, walk, armL: -0.9 }); } });
  };
  const scenes = [
    [2, snow],
    [20, sceneShop(0, 1, (g, lt, items) => pair(g, items, 110 + Math.sin(lt * 0.3) * 20, 130, lt * 3))],
    [0.6, snow],
    [18, sceneShop(122, 1, (g, lt, items) => pair(g, items, 120 + lt * 3.5, 128 - lt * 1.6, lt * 3))],
    [3, (g, lt, k, S) => {
      const off = hash((lt * 8) | 0) > 0.5 && lt > 0.8;
      if (off) { rect(g, 0, 0, W, H, '#050505'); cctvOsd(g, 'CAM 03 — ROYAUME DU JOUET', clockStr(BASE + 169 + lt), true, S.t); }
      else sceneShop(169, 1, (g, lt, items) => pair(g, items, 183, 100, 0))(g, lt, k, S);
    }],
    [12, (g, lt, k, S) => {
      rect(g, 0, 0, W, H, '#020202');
      drawNoise(g, W, H, S.t, 0.06);
      cctvOsd(g, 'CAM 03 — ROYAUME DU JOUET', clockStr(BASE + 172 + lt), true, S.t);
    }],
    [16, (g, lt, k, S) => {
      const clock = BASE + 184 + lt;
      cctvShop(g, 0);
      const gl = g.createRadialGradient(150, 10, 2, 150, 10, 110);
      gl.addColorStop(0, 'rgba(200,200,200,0.35)'); gl.addColorStop(1, 'rgba(200,200,200,0)');
      g.fillStyle = gl; g.fillRect(0, 0, W, H);
      rect(g, 140, 4, 22, 5, '#bbb');
      const items = crowd(g, 0, 16, true, true);
      const p = smooth(clamp((lt - 2) / 10, 0, 1));
      const gx = lerp(128, 204, p), gy = lerp(140, 58, p), sc = lerp(1, 0.55, p);
      const doorOpen = lt > 11.5 && lt < 14.5;
      if (lt < 13) items.push({ y: gy, f: () => girl(g, gx, gy, sc, { gray: true, walk: lt * 4, face: false }) });
      items.sort((a, b) => a.y - b.y).forEach((it) => it.f());
      if (doorOpen) rect(g, 187, 18, 34, 40, '#050505');
      scanlines(g, 0.3);
      cctvOsd(g, 'CAM 03 — ROYAUME DU JOUET', clockStr(clock), true, S.t);
    }],
    [1, snow],
    [20, (g, lt, k, S) => {
      const clock = 21 * 3600 + 41 * 60 + 7 + lt;
      rect(g, 0, 0, W, H, '#262626');
      corridor(g, W, H, { gray: true, z: 0, door: true, dark: 0.75, lights: true, flicker: true, t: lt });
      rect(g, 116, 64, 24, 9, '#888'); drawText(g, 'B-13', 128, 65, '#111', 1, 'center');
      ellipse(g, 132, 150, 20, 6, '#3a3a3a');
      circle(g, 112, 146, 9, '#6a6a6a'); circle(g, 105, 139, 3.5, '#6a6a6a'); circle(g, 119, 139, 3.5, '#6a6a6a'); ellipse(g, 113, 149, 4, 3, '#999');
      rect(g, 108, 143, 2, 2, '#111'); rect(g, 115, 143, 2, 2, '#111');
      poly(g, [122, 146, 150, 142, 158, 152, 130, 158], '#6a6a6a'); poly(g, [126, 156, 120, 166, 128, 168, 134, 158], '#626262'); poly(g, [146, 154, 156, 164, 162, 160, 154, 150], '#626262');
      if (lt > 14) { const a = (lt - 14) * 0.7; g.globalAlpha = 0.18; poly(g, [0, H, 120 + Math.sin(a) * 80, 120, 170 + Math.sin(a) * 80, 150], '#fff'); g.globalAlpha = 1; }
      scanlines(g, 0.3);
      cctvOsd(g, 'CAM 07 — SOUS-SOL B', clockStr(clock), true, S.t);
      if (lt > 3 && !S.fragSent) { S.fragSent = true; S.emit?.('fragment', { id: 'vhs_security_1987' }); }
    }],
    [4, snow],
  ];
  return tape(S, 'CCTV 14/11/87', scenes, { tracking: 0.65 });
}

// ═════════════════════════ POUR MON REMPLAÇANT (Gérard) ═════════════════════════
const GERARD_LINES = [
  [0, 'Bon… ça tourne ? … Ça tourne.'],
  [5, 'Si tu regardes ça, petit, c\'est que tu es le nouveau. Moi, c\'est Gérard.'],
  [11, 'Vingt-cinq ans de nuits ici. Alors écoute-moi bien.'],
  [16, 'La lumière est ton amie.'],
  [20, 'Ne laisse jamais Bobby entrer.'],
  [24, 'Regarde les mannequins.'],
  [28, 'Le chat sait.'],
  [32, 'Si tu veux la vérité, cherche les cinq morceaux :'],
  [37, 'la cassette de 87, le vieux journal, l\'album, ma cassette…'],
  [43, '… et la broche de la petite.'],
  [48, 'Le code, c\'est l\'année.'],
  [52.5, null],
  [54, '… Tu entends ça ?'],
];
function securityOffice(g, t, late) {
  rect(g, 0, 0, W, H, '#2a2e36');
  rect(g, 0, 0, W, 24, '#22262c');
  for (let i = 0; i < 6; i++) {
    const mx = i < 3 ? 12 + i * 38 : 150 + (i - 3) * 34, my = 30;
    rect(g, mx, my, 32, 26, '#111'); rect(g, mx + 2, my + 2, 28, 22, '#4a5a4a');
    for (let k = 0; k < 4; k++) rect(g, mx + 3, my + 4 + k * 5, 26, 1, (k + ((t * 3 + i) | 0)) % 4 ? '#55655a' : '#6a7a6a');
    if (late && i === 4) { rect(g, mx + 2, my + 2, 28, 22, '#2a2a2a'); circle(g, mx + 16, my + 14, 9, '#a0622d'); circle(g, mx + 9, my + 6, 3, '#a0622d'); circle(g, mx + 23, my + 6, 3, '#a0622d'); rect(g, mx + 11, my + 11, 3, 3, '#fff'); rect(g, mx + 18, my + 11, 3, 3, '#fff'); }
  }
  rect(g, 196, 62, 52, 90, '#1e2228'); rect(g, 200, 66, 44, 86, late ? '#05060a' : '#2e3440'); rect(g, 236, 108, 3, 3, '#aa8');
  rect(g, 0, 150, W, 42, '#4a3a2a'); rect(g, 0, 150, W, 3, '#6a5a4a');
  rect(g, 20, 134, 10, 16, '#c8c0b0'); rect(g, 30, 138, 3, 6, '#c8c0b0');
  rect(g, 212, 128, 26, 22, '#333'); rect(g, 216, 124, 2, 6, '#888');
  const lg = g.createRadialGradient(60, 70, 10, 60, 70, 160); lg.addColorStop(0, 'rgba(255,220,150,0.15)'); lg.addColorStop(1, 'rgba(0,0,0,0.3)'); g.fillStyle = lg; g.fillRect(0, 0, W, H);
}
function gerardBust(g, x, y, talk, turn, blink) {
  const skin = '#d8a890', uni = '#24305a', hair = '#c8c8c8';
  poly(g, [x - 46, H, x - 40, y + 40, x - 18, y + 30, x + 18, y + 30, x + 40, y + 40, x + 46, H], uni);
  poly(g, [x - 10, y + 30, x, y + 46, x + 10, y + 30], '#d8d8e0');
  rect(g, x - 2, y + 34, 4, 26, '#111');
  poly(g, [x + 20, y + 48, x + 30, y + 48, x + 30, y + 56, x + 25, y + 60, x + 20, y + 56], '#c8a030'); rect(g, x + 23, y + 51, 4, 3, '#8a6a10');
  rect(g, x - 9, y + 18, 18, 14, skin);
  const tx = turn * 8;
  if (turn > 0.85) {
    ellipse(g, x + tx * 0.3, y, 19, 22, hair); ellipse(g, x + tx * 0.3, y - 6, 15, 14, '#b8b8b8'); ellipse(g, x - 16 + tx * 0.3, y + 2, 4, 7, skin);
    return;
  }
  ellipse(g, x, y, 18, 22, skin);
  ellipse(g, x - tx * 0.1, y - 16, 14, 7, '#e0b8a0');
  rect(g, x - 19 + tx, y - 8, 6, 16, hair); rect(g, x + 13 + tx * 0.5, y - 8, 6, 16, hair);
  ellipse(g, x - 18 + tx * 0.6, y + 2, 3.5, 6, skin); if (turn < 0.4) ellipse(g, x + 18, y + 2, 3.5, 6, skin);
  const fx = x - turn * 10;
  const ey = blink ? 1 : 3;
  if (turn < 0.5) { rect(g, fx - 9, y - 3, 6, ey, '#2a2a2a'); rect(g, fx + 4, y - 3, 6, ey, '#2a2a2a'); rect(g, fx - 11, y - 7, 9, 2, hair); rect(g, fx + 3, y - 7, 9, 2, hair); }
  else rect(g, fx - 9, y - 3, 6, ey, '#2a2a2a');
  frame(g, fx - 11, y - 5, 10, 7, '#555'); if (turn < 0.5) { frame(g, fx + 2, y - 5, 10, 7, '#555'); rect(g, fx - 1, y - 3, 3, 1, '#555'); }
  poly(g, [fx - 1, y - 2, fx + 3, y + 6, fx - 2, y + 6], '#c08a74');
  ellipse(g, fx, y + 9, 9, 3, hair);
  rect(g, fx - 4, y + 12, 8, 1 + talk * 3, '#5a2a2a');
}
function vhsGerard(S) {
  const scenes = [
    [1.5, snow],
    [3, (g, lt, k, S) => { g.save(); g.translate(Math.sin(lt * 9) * 6 * (1 - lt / 3), 0); securityOffice(g, lt, false); g.translate(104, 96); g.scale(1.3, 1.3); gerardBust(g, 0, 0, 0, 0.3 * (1 - lt / 3), false); g.restore(); g.fillStyle = `rgba(255,255,255,${0.4 * (1 - lt / 3)})`; g.fillRect(0, 0, W, H); drawTextS(g, '12.11.24  03:12', 8, H - 18, '#ffa040'); }],
    [60, (g, lt, k, S) => {
      securityOffice(g, lt, lt > 50);
      const line = timed(lt, GERARD_LINES);
      const startT = GERARD_LINES.filter((l) => l[0] <= lt).pop()[0];
      const speaking = line && lt - startT < Math.max(1.6, line.length * 0.07);
      const talk = speaking ? Math.abs(Math.sin(lt * 11) * Math.sin(lt * 3.3)) : 0;
      let turn = 0;
      if (lt > 52.5 && lt < 54) turn = 0.25 * smooth((lt - 52.5) / 0.5);
      else if (lt >= 54 && lt < 56) turn = 0.25;
      else if (lt >= 56) turn = smooth((lt - 56) / 1.4);
      const blink = (lt % 4.3) < 0.15;
      g.save(); g.translate(104 + Math.round(Math.sin(lt * 0.7) * 1.5), 96); g.scale(1.3, 1.3);
      gerardBust(g, 0, 0, talk, turn, blink);
      g.restore();
      drawTextS(g, '12.11.24  ' + clockStr(3 * 3600 + 12 * 60 + 9 + lt).slice(0, 5), 8, H - 18, '#ffa040');
      if (line) sub(S, 'Gérard : ' + line, '#fff');
      if (lt > 49 && !S.fragSent) { S.fragSent = true; S.emit?.('fragment', { id: 'vhs_gerard' }); }
    }],
    [0.4, (g) => { rect(g, 0, 0, W, H, '#000'); }],
    [2.5, snow],
    [3, vcrBlue],
  ];
  return tape(S, 'Pour mon remplaçant', scenes, { tracking: 0.5 });
}

// ═════════════════════════ (SANS ÉTIQUETTE) ═════════════════════════
function face(g, a = 1) {
  rect(g, 0, 0, W, H, '#000');
  ellipse(g, 128, 98, 46, 58, '#d8d4d0');
  ellipse(g, 110, 88, 10, 13, '#000'); ellipse(g, 146, 88, 10, 13, '#000');
  ellipse(g, 128, 128, 7, 11, '#100');
  rect(g, 82, 40, 92, 26, '#111'); rect(g, 80, 50, 14, 70, '#111'); rect(g, 162, 50, 14, 70, '#111');
  if (a < 1) { g.fillStyle = `rgba(0,0,0,${1 - a})`; g.fillRect(0, 0, W, H); }
}
function carved(g, lt) {
  rect(g, 0, 0, W, H, '#2a2622');
  g.fillStyle = '#332e28'; for (let i = 0; i < 40; i++) g.fillRect(0, hash(i) * H, W, 1);
  const digits = { 1: [[0.5, 0, 0.5, 1], [0.2, 0.2, 0.5, 0]], 9: [[1, 0.5, 0, 0.5], [0, 0.5, 0, 0], [0, 0, 1, 0], [1, 0, 1, 1]], 8: [[0, 0, 1, 0], [0, 0.5, 1, 0.5], [0, 1, 1, 1], [0, 0, 0, 1], [1, 0, 1, 1]], 7: [[0, 0, 1, 0], [1, 0, 0.3, 1]] };
  const p = clamp(lt / 6, 0, 1);
  let n = 0;
  '1987'.split('').forEach((d, i) => {
    const x0 = 40 + i * 48, y0 = 62, w = 30, h = 64;
    for (const [a, b, c, e] of digits[d]) {
      n++;
      const k = clamp(p * 14 - n, 0, 1);
      if (k <= 0) continue;
      g.strokeStyle = '#0c0a08'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0 + a * w + hash(n) * 2, y0 + b * h); g.lineTo(x0 + lerp(a, c, k) * w + hash(n + 1) * 3, y0 + lerp(b, e, k) * h); g.stroke();
      g.strokeStyle = '#6a5a4a'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + a * w + 2, y0 + b * h + 2); g.lineTo(x0 + lerp(a, c, k) * w + 2, y0 + lerp(b, e, k) * h + 2); g.stroke();
    }
  });
}
function vhsNoLabel(S) {
  const scenes = [
    [6, (g, lt, k, S) => { drawNoise(g, W, H, S.t); if (hash((S.t * 8) | 0) > 0.85) rect(g, 0, 0, W, H, '#000'); }],
    [20, (g, lt, k, S) => {
      rect(g, 0, 0, W, H, '#111');
      corridor(g, W, H, { gray: true, z: lt * 0.18, door: true, dark: 0.95 + 0.15 * Math.sin(lt * 7), lights: true, flicker: true, t: lt, sway: Math.sin(lt * 0.5) * 4 });
      if (lt > 10) drawText(g, 'B-13', 128, 66, '#bbb', 1, 'center');
      drawNoise(g, W, H, S.t, 0.16);
      if (hash((S.t * 6) | 0) > 0.93) { g.drawImage(S.canvas, 0, 0, W, H, 0, ((S.t * 50) % H) - H / 2, W, H); }
    }],
    [4, (g, lt, k, S) => {
      drawNoise(g, W, H, S.t);
      const t0 = sceneStart(S, lt);
      if (crossed(S, t0 + 1.5, t0 + 1.62)) face(g, 1);
    }],
    [16, (g, lt, k, S) => {
      const z = 1 + lt * 0.02;
      g.save(); g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-W / 2, -H / 2);
      rect(g, 0, 0, W, H, '#1a1a1a');
      rect(g, 70, 20, 116, 172, '#3a3c40'); frame(g, 70, 20, 116, 172, '#222', 3);
      for (let i = 0; i < 8; i++) rect(g, 74, 30 + i * 20, 108, 1, '#33353a');
      rect(g, 100, 50, 56, 22, '#2a2c30'); drawText(g, 'B-13', 128, 55, '#bbb', 2, 'center');
      rect(g, 166, 110, 8, 14, '#555');
      g.restore();
      drawNoise(g, W, H, S.t, 0.3);
      if (lt > 5 && lt < 13) { const msg = 'Tu restes avec moi ?'; const n = Math.min(msg.length, Math.floor((lt - 5) * 6)); drawTextS(g, msg.slice(0, n), W / 2 - textWidth(msg) / 2, H - 34, '#ddd'); }
    }],
    [2, (g, lt, k, S) => {
      drawNoise(g, W, H, S.t);
      const t0 = sceneStart(S, lt);
      if (crossed(S, t0 + 0.6, t0 + 0.7)) face(g, 1);
      if (crossed(S, t0 + 1.2, t0 + 1.26)) { face(g, 1); g.globalCompositeOperation = 'difference'; rect(g, 0, 0, W, H, '#fff'); g.globalCompositeOperation = 'source-over'; }
    }],
    [10, (g, lt) => carved(g, lt)],
    [6, (g, lt, k, S) => { carved(g, 10); drawNoise(g, W, H, S.t, clamp(lt / 3, 0, 1)); }],
  ];
  const t = tape(S, '(sans étiquette)', scenes, {
    tracking: 0.95, osd: false,
    post(S, T) {
      const g = S.g;
      if ((S.t * 2 | 0) % 2 === 0 && T < 3) drawTextS(g, 'PLAY ▶', 8, 8, '#fff');
      const carvedT = 6 + 20 + 4 + 16 + 2;
      const c = T >= carvedT ? '0:19:87' : '0:' + String(Math.floor(T / 60)).padStart(2, '0') + ':' + String(Math.floor(T % 60)).padStart(2, '0');
      drawTextS(g, c, W - 8, H - 18, '#fff', 1, 'right');
    },
  });
  return t;
}

// ───────────────────────── Registre ─────────────────────────
export const VHS_BUILDERS = {
  cartoon: vhsCartoon, aerobic: vhsAerobic, cooking: vhsCooking, birthday: vhsBirthday, nature: vhsNature,
  kungfu: vhsKungfu, western: vhsWestern, scifi: vhsScifi, horror: vhsHorror, karaoke: vhsKaraoke,
  bobby_ad: vhsBobbyAd, security_1987: vhsSecurity, gerard: vhsGerard, no_label: vhsNoLabel,
};

// Durées (pour le wiki) calculées à la demande, sans canvas.
for (const t of VHS_TAPES) {
  try { const fake = { t: 0, g: null, emit() { } }; const b = VHS_BUILDERS[t.id](fake); if (b && b.duration) t.duration = Math.round(b.duration); } catch (e) { /* pas de durée */ }
}

export { bobby, girl, puppet };
