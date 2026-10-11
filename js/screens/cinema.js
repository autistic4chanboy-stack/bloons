// Films projetés au Ciné Hélios : un muet burlesque en noir et blanc (grain, rayures, intertitres)
// et une bobine sans titre, beaucoup moins drôle (« RANG M — SIÈGE 13 »).
import { drawText, drawTextS, textWidth } from './font.js';
import { rect, frame, circle, ellipse, poly, line, hash, clamp, lerp, smooth, corridor, filmOverlay, runScenes, scenesLength, drawNoise } from './util.js';
import { puppet, girl } from './vhs.js';

const W = 256, H = 192, TAU = Math.PI * 2;

export const FILMS = [
  { id: 'silent', title: 'Les Grands Magasins (1924)', desc: 'Film muet burlesque en noir et blanc : M. Hector, un chapeau trop grand, un chef de rayon colérique et un escalier roulant.' },
  { id: 'creepy', title: 'Bobine sans titre', desc: 'Pas de générique. Des couloirs de galerie marchande, vides, la nuit. Quelqu\'un en robe rouge, chaque plan un peu plus près.' },
];

// ───────────────────────── Outils ─────────────────────────
function cartouche(g, lines, lt, d) {
  rect(g, 0, 0, W, H, '#0c0b0a');
  const a = clamp(Math.min(lt * 3, (d - lt) * 3), 0, 1);
  g.globalAlpha = a;
  frame(g, 16, 18, W - 32, H - 36, '#d8d2c4', 1); frame(g, 20, 22, W - 40, H - 44, '#d8d2c4', 1);
  for (const [x, y] of [[20, 22], [W - 26, 22], [20, H - 28], [W - 26, H - 28]]) { rect(g, x, y, 6, 6, '#d8d2c4'); rect(g, x + 2, y + 2, 2, 2, '#0c0b0a'); }
  const sc = lines.every((l) => textWidth(l, 2) <= W - 52) ? 2 : 1, lh = sc === 2 ? 22 : 13;
  lines.forEach((l, i) => drawText(g, l, W / 2, H / 2 - (lines.length * lh) / 2 + i * lh + (sc === 2 ? 2 : 3), '#e8e2d4', sc, 'center'));
  g.globalAlpha = 1;
}
function iris(g, r) { if (r >= 200) return; g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, W, H); g.arc(W / 2, H / 2, Math.max(0, r), 0, TAU, true); g.fill(); }
const q16 = (t) => Math.floor(t * 16) / 16; // 16 images/s : démarche saccadée du muet

const HECTOR = { skin: '#d8d2c8', top: '#2a2826', sleeve: '#2a2826', bottom: '#6a6660', shoes: '#141210', hat: 'bowler', hatColor: '#141210', mous: '#141210', hair: '#141210' };
const CHEF = { skin: '#d0cac0', top: '#8a867e', sleeve: '#8a867e', bottom: '#4a4844', shoes: '#141210', hat: 'bowler', hatColor: '#2a2826', mous: '#e8e4dc', hair: '#e8e4dc' };
function hector(g, x, y, t, o = {}) {
  const w = o.run ? t * 18 : t * 9, sw = Math.sin(w);
  const pose = o.pose || { lL: [0.25 + sw * 0.35, 0.1], lR: [-0.25 - sw * 0.35, -0.1], aL: [0.3 - sw * 0.3, 0.3], aR: [-0.5, -0.8], dy: -Math.abs(sw) * (o.run ? 2 : 0.8) };
  const r = puppet(g, x, y, 2.3, pose, { ...HECTOR, face: o.face ?? 1, hat: o.noHat ? null : 'bowler' });
  if (!o.noCane) line(g, x + 12, y - 30, x + 16, y - 2, '#141210', 1.5);
  return r;
}
function chef(g, x, y, t, o = {}) {
  const w = t * (o.run ? 18 : 8), sw = Math.sin(w);
  puppet(g, x, y, 2.7, o.pose || { lL: [0.2 + sw * 0.4, 0.1], lR: [-0.2 - sw * 0.4, -0.1], aL: [o.fist ? -2.6 + Math.sin(t * 20) * 0.3 : 0.4 - sw * 0.3, 0.4], aR: [-0.4 + sw * 0.3, -0.3], dy: -Math.abs(sw) * 1.5 }, { ...CHEF, face: o.face ?? -1 });
  ellipse(g, x + (o.face ?? -1) * 1, y - 34, 9, 7, '#8a867e');
}
function grandBazar(g, t) {
  rect(g, 0, 0, W, H, '#a8a298');
  rect(g, 0, 0, W, 26, '#7a766e');
  for (let i = 0; i < 5; i++) { const x = 8 + i * 60; rect(g, x, 20, 14, 130, '#c8c2b6'); rect(g, x - 3, 20, 20, 6, '#e0dace'); rect(g, x - 3, 144, 20, 6, '#e0dace'); }
  drawText(g, 'AU GRAND BAZAR', W / 2, 8, '#e8e2d4', 1, 'center');
  rect(g, 0, 150, W, 42, '#6a665e');
  for (let x = 0; x < W; x += 16) rect(g, x, 150, 1, 42, '#5a564e');
}
function hatStand(g, x, y) {
  rect(g, x - 1, y - 46, 2, 46, '#3a3834'); rect(g, x - 10, y - 2, 20, 3, '#3a3834');
  for (const [dx, dy, k] of [[-8, -46, 0], [6, -38, 1], [-6, -28, 2]]) {
    if (k === 0) { ellipse(g, x + dx, y + dy, 7, 1.6, '#1a1816'); rect(g, x + dx - 5, y + dy - 12, 10, 12, '#1a1816'); }
    else if (k === 1) { ellipse(g, x + dx, y + dy, 7, 1.5, '#4a4844'); g.fillStyle = '#4a4844'; g.beginPath(); g.arc(x + dx, y + dy, 5, Math.PI, 0); g.fill(); }
    else { ellipse(g, x + dx, y + dy, 9, 2, '#e8e2d4'); rect(g, x + dx - 4, y + dy - 4, 8, 4, '#e8e2d4'); }
  }
}
function counter(g, x, y, w) { rect(g, x, y - 26, w, 26, '#4a4640'); rect(g, x, y - 28, w, 3, '#d8d2c4'); rect(g, x + 4, y - 22, w - 8, 14, '#5a564e'); }
function dummy(g, x, y, fall = 0) {
  g.save(); g.translate(x, y); g.rotate(fall * 1.45);
  puppet(g, 0, 0, 2.2, { aL: [-0.25, 0], aR: [0.25, 0] }, { skin: '#e0dace', top: '#3a3834', sleeve: '#3a3834', bottom: '#3a3834', noFace: true, shoes: '#3a3834' });
  g.restore();
}

// ═════════════════════════ LES GRANDS MAGASINS (muet) ═════════════════════════
function filmSilent(S) {
  const cart = (lines, d) => [d, (g, lt) => cartouche(g, lines, lt, d)];
  const scenes = [
    [6, (g, lt) => {
      rect(g, 0, 0, W, H, '#0c0b0a');
      frame(g, 12, 12, W - 24, H - 24, '#d8d2c4', 2);
      drawText(g, 'LES GRANDS', W / 2, 40, '#e8e2d4', 3, 'center');
      drawText(g, 'MAGASINS', W / 2, 70, '#e8e2d4', 3, 'center');
      drawText(g, 'une comédie en un acte', W / 2, 112, '#c8c2b4', 1, 'center');
      drawText(g, '— 1924 —', W / 2, 132, '#c8c2b4', 1, 'center');
    }],
    cart(['M. Hector entre', 'au Grand Bazar', 'pour s\'acheter', 'un chapeau.'], 5),
    [12, (g, lt) => {
      const t = q16(lt);
      grandBazar(g, t); hatStand(g, 150, 150);
      const fell = t > 8;
      dummy(g, 210, 150, fell ? smooth((t - 8) * 2) : 0);
      if (t < 4) hector(g, 10 + t * 32, 150, t);
      else if (t < 7) {
        const r = hector(g, 138, 150, t, { pose: { aL: [-2.8, 0.2], aR: [2.8, -0.2] }, noHat: true, noCane: true });
        ellipse(g, r.hx, r.hy - 2 + Math.min(1, t - 4) * 4, 8, 1.8, '#1a1816'); rect(g, r.hx - 6, r.hy - 14 + Math.min(1, t - 4) * 4, 12, 13, '#1a1816');
      } else {
        const x = 138 + (t - 7) * 30, r = hector(g, Math.min(x, 196), 150, t, { pose: { aL: [-1.6 + Math.sin(t * 9) * 0.5, 0], aR: [1.6 - Math.sin(t * 9) * 0.5, 0], lL: [Math.sin(t * 14) * 0.4, 0], lR: [-Math.sin(t * 14) * 0.4, 0] }, noHat: true, noCane: true });
        ellipse(g, r.hx, r.hy + 2, 8, 1.8, '#1a1816'); rect(g, r.hx - 6, r.hy - 10, 12, 13, '#1a1816');
      }
    }],
    cart(['Le chef de rayon', 'n\'aime pas', 'les maladroits !'], 5),
    [14, (g, lt) => {
      const t = q16(lt);
      grandBazar(g, t); counter(g, 120, 150, 50);
      if (t < 3) { hector(g, 70, 150, t, { pose: { aL: [0.3, 0.2], aR: [-0.3, -0.2] }, face: 1 }); chef(g, 230 - t * 10, 150, t, { fist: true }); }
      else if (t < 8) {
        const hx = 70 + (t - 3) * 50, cx = 210 - (t - 3) * 8 + Math.max(0, t - 5) * 30;
        hector(g, hx, hx > 118 && hx < 172 ? 160 : 150, t, { run: true, face: 1, pose: hx > 118 && hx < 172 ? { lL: [1.2, -1.4], lR: [-0.6, 1.2], aL: [1.2, 0], aR: [1.4, 0], lean: 1.1, dy: 6 } : undefined });
        chef(g, Math.min(cx, 236), 150, t, { run: true, fist: true });
      } else {
        const p = t - 8;
        hector(g, 250 + p * 10, 150, t, { run: true, face: 1 });
        chef(g, 160, 150, t, { pose: { lean: -1.2 * Math.min(1, p), aL: [-2.8, 0], aR: [2.8, 0], lL: [0.4, 0], lR: [-0.4, 0] } });
        for (let i = 0; i < 5; i++) { const bx = 130 + i * 12 + p * (i - 2) * 14, by = 110 - Math.sin(Math.min(p, 2) * 1.5) * (30 + i * 6) + Math.max(0, p - 2) ** 2 * 20; rect(g, bx, by, 12, 9, i % 2 ? '#e0dace' : '#5a564e'); }
      }
    }],
    cart(['Le progrès :', 'l\'escalier', 'roulant !'], 5),
    [14, (g, lt) => {
      const t = q16(lt);
      rect(g, 0, 0, W, H, '#a8a298'); rect(g, 0, 150, W, 42, '#6a665e');
      poly(g, [30, 160, 60, 160, 230, 40, 200, 40], '#4a4640');
      const off = (t * 20) % 12;
      for (let i = 0; i < 16; i++) { const k = (i * 12 + off) / 192; if (k > 1) continue; const x = lerp(46, 214, k), y = lerp(158, 42, k); rect(g, x - 14, y, 28, 2, '#d8d2c4'); }
      line(g, 26, 140, 196, 22, '#141210', 3); line(g, 64, 146, 234, 28, '#141210', 3);
      const hk = t < 9 ? 0.45 + Math.sin(t * 3) * 0.03 : 0.45 + (t - 9) * 0.12;
      hector(g, lerp(46, 214, Math.min(1, hk)), lerp(158, 42, Math.min(1, hk)), t, { run: true, face: 1 });
      const ck = Math.min(0.36, t * 0.04);
      chef(g, lerp(46, 214, ck), lerp(158, 42, ck), t, { face: 1, fist: true, pose: { aL: [-2.5 + Math.sin(t * 18) * 0.3, 0], aR: [0.3, 0.2] } });
    }],
    cart(['Tout est bien', 'qui finit bien.'], 4),
    [10, (g, lt) => {
      const t = q16(lt);
      grandBazar(g, t);
      const tip = (t % 3) < 1;
      const r = hector(g, 104, 150, t, { pose: { aL: [0.3, 0.2], aR: tip ? [-2.7, -0.6] : [-0.4, -0.3] }, face: 0, noHat: tip });
      if (tip) { ellipse(g, r.hx + 8, r.hy - 12, 6, 1.4, '#141210'); g.fillStyle = '#141210'; g.beginPath(); g.arc(r.hx + 8, r.hy - 12, 4.2, Math.PI, 0); g.fill(); }
      chef(g, 170, 150, t, { face: 0, pose: { aL: [0.6 + Math.sin(t * 14) * 0.2, 0.4], aR: [-0.6 - Math.sin(t * 14) * 0.2, -0.4], dy: Math.sin(t * 14) } });
      iris(g, t < 7 ? 220 : 220 - (t - 7) * 75);
    }],
    [4, (g, lt) => cartouche(g, ['FIN'], lt, 4)],
    [2.5, (g, lt) => {
      rect(g, 0, 0, W, H, '#f4f0e8');
      for (let i = 0; i < 6; i++) circle(g, hash(i + ((lt * 8) | 0)) * W, hash(i + 3) * H, 10 + hash(i) * 30, i % 2 ? '#2a2826' : '#c8c2b4');
    }],
  ];
  const total = scenesLength(scenes);
  return {
    title: 'Les Grands Magasins (1924)', duration: total,
    update() {
      const g = S.g;
      g.save();
      g.translate(0, Math.round(Math.sin(S.t * 13) * 0.6 + (hash((S.t * 16) | 0) > 0.85 ? 1 : 0)));
      runScenes(scenes, S.t, g, S);
      g.restore();
      g.globalAlpha = 1;
      filmOverlay(S);
    },
  };
}

// ═════════════════════════ BOBINE SANS TITRE ═════════════════════════
function leader(g, lt) {
  rect(g, 0, 0, W, H, '#8a8a8a');
  const n = 5 - Math.floor(lt), a = (lt % 1) * TAU;
  g.fillStyle = '#5a5a5a'; g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, 140, -Math.PI / 2, -Math.PI / 2 + a); g.fill();
  g.strokeStyle = '#e0e0e0'; g.lineWidth = 2;
  g.beginPath(); g.arc(W / 2, H / 2, 60, 0, TAU); g.stroke(); g.beginPath(); g.arc(W / 2, H / 2, 70, 0, TAU); g.stroke();
  line(g, 0, H / 2, W, H / 2, '#222'); line(g, W / 2, 0, W / 2, H, '#222');
  if (n > 0) drawText(g, String(n), W / 2, H / 2 - 20, '#111', 6, 'center');
}
function fountain(g, t, dark) {
  rect(g, 0, 0, W, H, '#14161a');
  rect(g, 0, 0, W, 60, '#0e1014'); for (let i = 0; i < 6; i++) rect(g, i * 46, 6, 30, 50, '#181c22');
  rect(g, 0, 120, W, 72, '#1c1e22');
  ellipse(g, 128, 140, 70, 16, '#2a2e34'); ellipse(g, 128, 136, 62, 12, '#101c24');
  rect(g, 124, 96, 8, 40, '#2a2e34'); ellipse(g, 128, 96, 20, 5, '#2a2e34');
  for (let i = 0; i < 4; i++) { g.globalAlpha = 0.35; line(g, 128, 92, 112 + i * 10 + Math.sin(t * 3 + i), 132, '#5a7080'); g.globalAlpha = 1; }
  for (let x = 0; x < W; x += 12) rect(g, x, 100, 2, 20, '#24282e');
  rect(g, 0, 98, W, 3, '#2a2e34');
  if (dark) { g.fillStyle = `rgba(0,0,0,${dark})`; g.fillRect(0, 0, W, H); }
}
function seats(g, t, turn) {
  rect(g, 0, 0, W, H, '#0a0606');
  rect(g, 20, 6, 216, 70, '#d8d4cc');
  g.globalAlpha = 0.15; rect(g, 20, 6, 216, 70, (t * 7 | 0) % 2 ? '#fff' : '#ccc'); g.globalAlpha = 1;
  const rows = [['K', 128, 1.0], ['L', 146, 1.25], ['M', 168, 1.55]];
  for (const [l, y, s] of rows) {
    const n = Math.round(18 / s * 1.2), sw = 236 / n;
    for (let i = 0; i < n; i++) { const x = 10 + i * sw; rect(g, x + 1, y - 16 * s, sw - 2, 16 * s, '#5a1414'); rect(g, x + 1, y - 16 * s, sw - 2, 3 * s, '#7a2020'); }
    rect(g, 0, y - 12 * s, 9, 10 * s, '#1a1010'); drawText(g, l, 4, y - 10 * s, '#c8a050', 1, 'center');
    if (l === 'M') {
      const x = 10 + 12 * sw + sw / 2;
      if (turn < 0.5) { circle(g, x, y - 18 * s, 6 * s, '#2a1608'); rect(g, x - 6 * s, y - 18 * s, 12 * s, 6 * s, '#2a1608'); }
      else { circle(g, x, y - 18 * s, 6 * s, '#d8cfc4'); g.fillStyle = '#2a1608'; g.beginPath(); g.arc(x, y - 19 * s, 6.4 * s, Math.PI, 0); g.fill(); ellipse(g, x - 2 * s, y - 18 * s, 1.2 * s, 1.6 * s, '#000'); ellipse(g, x + 2 * s, y - 18 * s, 1.2 * s, 1.6 * s, '#000'); }
      rect(g, x - 7 * s, y - 12 * s, 14 * s, 4 * s, '#c01818');
      drawText(g, '13', x, y + 4, '#c8a050', 1, 'center');
    }
  }
  rect(g, 0, 172, W, 20, '#000');
}
function filmCreepy(S) {
  const desat = (g, a = 0.35) => { g.fillStyle = `rgba(20,24,28,${a})`; g.fillRect(0, 0, W, H); };
  const flick = (t) => (hash((t * 9) | 0) > 0.88 ? 0.5 : 1);
  const scenes = [
    [6, (g, lt) => leader(g, lt)],
    [9, (g, lt) => {
      rect(g, 0, 0, W, H, '#101214');
      corridor(g, W, H, { gray: true, dark: 0.6 * flick(lt), lights: true, flicker: true, t: lt });
      desat(g);
      girl(g, 128, 104, 0.45, { face: false, bow: false });
    }],
    [1.5, (g) => rect(g, 0, 0, W, H, '#000')],
    [9, (g, lt) => { fountain(g, lt, 0.2 * (2 - flick(lt))); desat(g, 0.25); girl(g, 190, 150, 1.3, { face: false, bow: false }); }],
    [1.5, (g) => rect(g, 0, 0, W, H, '#000')],
    [9, (g, lt) => {
      rect(g, 0, 0, W, H, '#101214');
      corridor(g, W, H, { gray: true, dark: 0.55 * flick(lt * 1.6), lights: true, flicker: true, t: lt * 2 });
      desat(g, 0.4);
      girl(g, 128, 176, 3.2, { face: false, bow: false, armR: lt > 5 ? -2.2 : 0.3 });
    }],
    [5, (g, lt) => {
      rect(g, 0, 0, W, H, '#000');
      const j = hash((lt * 12) | 0) > 0.7 ? 1 : 0;
      drawText(g, 'RANG M', W / 2 + j, 72, '#e8e4dc', 3, 'center');
      drawText(g, 'SIÈGE 13', W / 2 - j, 104, '#e8e4dc', 3, 'center');
    }],
    [10, (g, lt) => { seats(g, lt, lt > 7 ? 1 : 0); desat(g, 0.2); }],
    [4, (g, lt) => {
      rect(g, 0, 0, W, H, '#060606');
      poly(g, [40, H, 70, 70, 186, 70, 216, H], '#a81010');
      rect(g, 104, 46, 48, 30, '#d8cfc4');
      rect(g, 96, 20, 64, 36, '#1a0c04'); rect(g, 92, 30, 14, 60, '#1a0c04'); rect(g, 150, 30, 14, 60, '#1a0c04');
      g.fillStyle = `rgba(0,0,0,${0.5 + lt * 0.12})`; g.fillRect(0, 0, W, H);
    }],
    [3, (g) => rect(g, 0, 0, W, H, '#000')],
    [1, (g, lt) => { rect(g, 0, 0, W, H, '#f4f0e8'); circle(g, 128, 96, 30 + lt * 120, '#c8b090'); }],
  ];
  const total = scenesLength(scenes);
  return {
    title: 'Bobine sans titre', duration: total,
    update() {
      const g = S.g;
      g.save();
      g.translate(0, Math.round(Math.sin(S.t * 11) * 0.6));
      runScenes(scenes, S.t, g, S);
      g.restore();
      g.globalAlpha = 1;
      filmOverlay(S, { dark: true });
    },
  };
}

export const CINEMA_BUILDERS = { silent: filmSilent, creepy: filmCreepy };
for (const f of FILMS) { try { f.duration = Math.round(CINEMA_BUILDERS[f.id]({ t: 0 }).duration); } catch (e) { /* */ } }
