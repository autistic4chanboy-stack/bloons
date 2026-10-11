// Utilitaires partagés par les écrans : aléa déterministe, bruit, dessin, surcouche VHS.
import { drawText, drawTextS, textWidth } from './font.js';

export function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}

export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(n) {
  n = (n | 0) * 374761393 + 668265263;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// --- Bruit partagé (quelques trames précalculées, tirées au hasard) ---
let noiseFrames = null;
export function noiseFrame(i) {
  if (!noiseFrames) {
    noiseFrames = [];
    const r = rng(1234);
    for (let f = 0; f < 4; f++) {
      const c = makeCanvas(320, 256);
      const g = c.getContext('2d');
      const id = g.createImageData(320, 256);
      const d = new Uint32Array(id.data.buffer);
      for (let k = 0; k < d.length; k++) { const v = (r() * r() * 2 * 255) | 0; const q = v > 255 ? 255 : v; d[k] = 0xff000000 | (q << 16) | (q << 8) | q; }
      g.putImageData(id, 0, 0);
      noiseFrames.push(c);
    }
  }
  return noiseFrames[((i % 4) + 4) % 4];
}

// Dessine du bruit plein écran (avec alpha éventuel).
export function drawNoise(g, w, h, t, alpha = 1, x = 0, y = 0) {
  const f = (t * 60) | 0;
  const c = noiseFrame(f);
  const ox = (hash(f) * (320 - Math.min(w, 320))) | 0, oy = (hash(f + 7) * (256 - Math.min(h, 256))) | 0;
  g.globalAlpha = alpha;
  g.drawImage(c, ox, oy, Math.min(w, 320), Math.min(h, 256), x, y, w, h);
  g.globalAlpha = 1;
}

// --- Primitives ---
export function circle(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); g.fill(); }
export function ellipse(g, x, y, rx, ry, color, rot = 0) { g.fillStyle = color; g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); g.fill(); }
export function rect(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
export function frame(g, x, y, w, h, color, lw = 1) { g.fillStyle = color; g.fillRect(x, y, w, lw); g.fillRect(x, y + h - lw, w, lw); g.fillRect(x, y, lw, h); g.fillRect(x + w - lw, y, lw, h); }
export function poly(g, pts, color) { g.fillStyle = color; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); }
export function line(g, x1, y1, x2, y2, color, lw = 1) { g.strokeStyle = color; g.lineWidth = lw; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
export function grad(g, x, y, w, h, c1, c2) { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(x, y, w, h); }
export function star(g, x, y, r, color, n = 5) { const p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n; const rr = i % 2 ? r * 0.45 : r; p.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } poly(g, p, color); }

export function hsl(h, s, l) { return `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`; }

// Personnage simple (vue de face). opts: {skin, shirt, pants, hair, hat, scale, arm (angle bras), legs (phase), mouth}
export function person(g, x, y, s = 1, o = {}) {
  const skin = o.skin || '#e8b896', shirt = o.shirt || '#3a5fa8', pants = o.pants || '#2a2a3a';
  const lp = o.legs ? Math.sin(o.legs) * 3 * s : 0;
  // jambes
  rect(g, x - 4 * s, y - 14 * s, 3 * s, 14 * s + lp, pants);
  rect(g, x + 1 * s, y - 14 * s, 3 * s, 14 * s - lp, pants);
  // corps
  rect(g, x - 6 * s, y - 28 * s, 12 * s, 15 * s, shirt);
  // bras
  const a1 = o.arm !== undefined ? o.arm : 0.15, a2 = o.arm2 !== undefined ? o.arm2 : -a1;
  g.save(); g.translate(x - 6 * s, y - 27 * s); g.rotate(a1); rect(g, -3 * s, 0, 3 * s, 12 * s, shirt); rect(g, -3 * s, 11 * s, 3 * s, 2 * s, skin); g.restore();
  g.save(); g.translate(x + 6 * s, y - 27 * s); g.rotate(a2); rect(g, 0, 0, 3 * s, 12 * s, shirt); rect(g, 0, 11 * s, 3 * s, 2 * s, skin); g.restore();
  // tête
  rect(g, x - 2 * s, y - 30 * s, 4 * s, 3 * s, skin);
  circle(g, x, y - 35 * s, 5.5 * s, skin);
  if (o.hair) { g.fillStyle = o.hair; g.beginPath(); g.arc(x, y - 36 * s, 5.8 * s, Math.PI, 0); g.fill(); }
  if (o.hat) { rect(g, x - 7 * s, y - 40 * s, 14 * s, 2 * s, o.hat); rect(g, x - 5 * s, y - 45 * s, 10 * s, 5 * s, o.hat); }
  if (!o.noFace) {
    rect(g, x - 3 * s, y - 37 * s, Math.max(1, s), Math.max(1, s), '#222');
    rect(g, x + 2 * s, y - 37 * s, Math.max(1, s), Math.max(1, s), '#222');
    if (o.mouth) rect(g, x - 2 * s, y - 33 * s, 4 * s, Math.max(1, s * (o.mouth > 1 ? 2 : 1)), '#7a2a2a');
  }
}

// Silhouette sombre et grande (la « présence »).
export function figure(g, x, y, s = 1, color = '#050505', eyes = null) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - 5 * s, y);
  g.lineTo(x - 7 * s, y - 30 * s);
  g.quadraticCurveTo(x - 8 * s, y - 38 * s, x - 4 * s, y - 40 * s);
  g.lineTo(x + 4 * s, y - 40 * s);
  g.quadraticCurveTo(x + 8 * s, y - 38 * s, x + 7 * s, y - 30 * s);
  g.lineTo(x + 5 * s, y);
  g.fill();
  ellipse(g, x, y - 45 * s, 4.5 * s, 6 * s, color);
  if (eyes) { rect(g, x - 2.5 * s, y - 46 * s, Math.max(1, s), Math.max(1, s * 0.7), eyes); rect(g, x + 1.5 * s, y - 46 * s, Math.max(1, s), Math.max(1, s * 0.7), eyes); }
}

// Couloir de galerie marchande en perspective. o: {gray, lights, z (avancée), door (texte de porte au fond), dark}
export function corridor(g, w, h, o = {}) {
  const cx = w / 2 + (o.sway || 0), cy = h * 0.45;
  const C = o.gray ? (v) => `rgb(${v},${v},${v})` : (v, tint = [1, 1, 1]) => `rgb(${(v * tint[0]) | 0},${(v * tint[1]) | 0},${(v * tint[2]) | 0})`;
  const dk = o.dark || 1;
  // sol / plafond
  grad(g, 0, 0, w, cy, C(30 * dk), C(10 * dk));
  grad(g, 0, cy, w, h - cy, C(12 * dk), C(45 * dk));
  const fw = w * 0.12, fh = h * 0.16; // taille du fond
  poly(g, [0, 0, cx - fw, cy - fh, cx - fw, cy + fh, 0, h], C(22 * dk));
  poly(g, [w, 0, cx + fw, cy - fh, cx + fw, cy + fh, w, h], C(26 * dk));
  // segments (vitrines / néons) qui défilent
  const z0 = o.z || 0;
  for (let i = 8; i >= 0; i--) {
    const zz = i + 1 - (z0 % 1);
    const k = 1 / (zz * 0.55 + 0.45);
    const kk = 1 / ((zz + 0.5) * 0.55 + 0.45);
    const xl = cx - fw - (cx - fw) * k * 0.95, xl2 = cx - fw - (cx - fw) * kk * 0.95;
    const yt = cy - fh - (cy - fh) * k * 0.9, yb = cy + fh + (h - cy - fh) * k * 0.9;
    const yt2 = cy - fh - (cy - fh) * kk * 0.9, yb2 = cy + fh + (h - cy - fh) * kk * 0.9;
    const shade = (60 - zz * 5) * dk;
    // vitrine gauche & droite
    const idx = Math.floor(i + z0);
    const lit = hash(idx * 13) > 0.5;
    poly(g, [xl, yt + (yb - yt) * 0.25, xl2, yt2 + (yb2 - yt2) * 0.25, xl2, yb2 - (yb2 - yt2) * 0.08, xl, yb - (yb - yt) * 0.08], C(Math.max(4, shade * (lit ? 1 : 0.5)), [0.85, 0.9, 1.1]));
    const xr = w - xl, xr2 = w - xl2;
    poly(g, [xr, yt + (yb - yt) * 0.25, xr2, yt2 + (yb2 - yt2) * 0.25, xr2, yb2 - (yb2 - yt2) * 0.08, xr, yb - (yb - yt) * 0.08], C(Math.max(4, shade * (hash(idx * 7 + 3) > 0.5 ? 1 : 0.5)), [1.1, 0.95, 0.85]));
    // néon plafond
    if (o.lights !== false && i % 2 === 0) {
      const flick = o.flicker ? (hash(idx * 31 + ((o.t || 0) * 8 | 0)) > 0.85 ? 0.2 : 1) : 1;
      const lw = (fw * 2) * (k * 3);
      rect(g, cx - lw / 2, yt + 2, lw, Math.max(1, k * 4), C(Math.min(255, (120 + 100 * k) * dk * flick)));
    }
    // dalles
    g.fillStyle = C(Math.max(0, 20 * dk - zz));
    g.fillRect(0, yb, w, 1);
  }
  // fond
  rect(g, cx - fw, cy - fh, fw * 2, fh * 2, C(8 * dk));
  if (o.door) {
    const dw = fw * 0.9, dh = fh * 1.6;
    rect(g, cx - dw / 2, cy + fh - dh, dw, dh, C(40 * dk, [1, 0.9, 0.8]));
    rect(g, cx + dw * 0.3, cy + fh - dh * 0.5, Math.max(1, dw * 0.08), Math.max(1, dw * 0.08), C(120 * dk));
  }
}

// --- Surcouche VHS : PLAY, compteur, lignes de tracking ---
export function vhsOverlay(S, t, o = {}) {
  const { g, w, h } = S;
  // déchirure horizontale (décalage de bandes)
  const tr = o.tracking !== undefined ? o.tracking : 0.5;
  const ph = S.t * 0.7;
  for (let i = 0; i < 2; i++) {
    const by = ((ph * (40 + i * 23) + i * 97) % (h + 30)) - 15;
    const bh = 3 + i * 2;
    const off = ((hash((S.t * 30 | 0) + i * 11) - 0.5) * 6 * tr) | 0;
    if (off) g.drawImage(S.canvas, 0, by, w, bh, off, by, w, bh);
    g.globalAlpha = 0.25 * tr;
    drawNoise(g, w, bh, S.t + i, 1, 0, by);
    g.globalAlpha = 1;
  }
  // bande de bruit en bas (tête de lecture)
  const nb = 4 + ((hash(S.t * 10 | 0) * 3) | 0);
  drawNoise(g, w, nb, S.t, 0.5 * tr + 0.15, 0, h - nb);
  // quelques points blancs
  for (let i = 0; i < 3; i++) {
    if (hash((S.t * 24 | 0) * 3 + i) > 0.6) rect(g, hash(i * 5 + (S.t * 24 | 0)) * w, hash(i * 9 + (S.t * 24 | 0) + 1) * h, 2 + hash(i) * 8, 1, 'rgba(255,255,255,0.6)');
  }
  // OSD
  if (o.osd !== false) {
    if ((S.t < 5 || (S.t % 30) < 3) && (S.t * 2 | 0) % 2 === 0 || S.t < 2) drawTextS(g, 'PLAY ▶', 8, 8, '#fff');
    const tc = Math.floor(t);
    const s = `${Math.floor(tc / 3600)}:${String(Math.floor(tc / 60) % 60).padStart(2, '0')}:${String(tc % 60).padStart(2, '0')}`;
    drawTextS(g, s, w - 8, h - 18, '#fff', 1, 'right');
    drawTextS(g, 'SP', w - 8, 8, '#fff', 1, 'right');
  }
}

// Grain de pellicule / scratches cinéma
export function filmOverlay(S, o = {}) {
  const { g, w, h } = S;
  const f = (S.t * 24) | 0;
  g.globalAlpha = 0.12; drawNoise(g, w, h, S.t); g.globalAlpha = 1;
  for (let i = 0; i < 3; i++) {
    if (hash(f * 7 + i) > 0.5) { const x = hash(f * 3 + i * 17) * w; rect(g, x, 0, 1, h, o.dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)'); }
  }
  if (hash(f + 99) > 0.9) circle(g, hash(f + 5) * w, hash(f + 6) * h, 1 + hash(f) * 3, 'rgba(0,0,0,0.6)');
  // flicker
  const fl = 0.06 * hash(f + 1234);
  if (fl > 0) { g.fillStyle = `rgba(0,0,0,${fl})`; g.fillRect(0, 0, w, h); }
  // vignette
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
}

// Panneau de texte centré multi-lignes (intertitres, sous-titres...)
export function centerLines(g, lines, cx, cy, color, scale = 1, lh = 11) {
  const y0 = cy - (lines.length * lh * scale) / 2;
  lines.forEach((l, i) => drawText(g, l, cx, y0 + i * lh * scale, color, scale, 'center'));
}

export function subtitle(S, text, color = '#ff0') {
  const { g, w, h } = S;
  const lines = wrapLines(text, Math.floor((w - 16) / 6));
  lines.forEach((l, i) => drawTextS(g, l, w / 2, h - 30 - (lines.length - 1 - i) * 10, color, 1, 'center'));
}

function wrapLines(text, n) {
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > n) { out.push(line.trim()); line = word; } else line += ' ' + word;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// Séquenceur de scènes : scenes = [[durée, fn(g, localT, k)], ...], renvoie la scène active.
export function runScenes(scenes, t, g, S) {
  let total = 0; for (const s of scenes) total += s[0];
  let lt = ((t % total) + total) % total;
  for (const s of scenes) {
    if (lt < s[0]) { s[1](g, lt, lt / s[0], S); return; }
    lt -= s[0];
  }
}
export function scenesLength(scenes) { let t = 0; for (const s of scenes) t += s[0]; return t; }

export { drawText, drawTextS, textWidth };
